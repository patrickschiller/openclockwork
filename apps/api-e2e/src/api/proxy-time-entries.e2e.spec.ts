import type { Prisma } from '@prisma/client';
import type { JwtUser } from '../../../api/src/app/auth/jwt.strategy';
import { EventsGateway } from '../../../api/src/app/events/events.gateway';
import { TimeEntriesService } from '../../../api/src/app/time-entries/time-entries.service';
import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

describe('Team proxy time capture (#44)', () => {
  let ctx: TestContext;
  type Person = { id: string; email: string; token: string };
  type Operation = 'clock-in' | 'manual';
  let manager: Person,
    otherManager: Person,
    worker: Person,
    foreign: Person,
    hr: Person;
  const reason = 'Employee requested assistance';
  const breakRules = [{ afterMinutes: 300, breakMinutes: 20 }];
  const instant = (hour: number, minute = 0) =>
    new Date(2026, 4, 4, hour, minute).toISOString();
  const manual = () => ({ clockIn: instant(9), clockOut: instant(17), reason });

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    async function person(
      name: string,
      role: 'Employee' | 'Manager' | 'HRAdmin',
      managerId?: string,
    ) {
      const employee = await seedEmployee(ctx.prisma, {
        personalNo: name,
        firstName: name,
        lastName: 'Synthetic',
        email: `${name}@test.local`,
        role,
        managerId,
      });
      return {
        id: employee.id,
        email: employee.email,
        token: await login(ctx.http, employee.email),
      };
    }
    manager = await person('manager', 'Manager');
    otherManager = await person('other-manager', 'Manager');
    worker = await person('worker', 'Employee', manager.id);
    foreign = await person('foreign', 'Employee', otherManager.id);
    hr = await person('hr', 'HRAdmin', manager.id);
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Beneficiary frame',
        frameStart: '07:00',
        frameEnd: '20:00',
        breakRules,
      },
    });
    await ctx.prisma.employee.update({
      where: { id: worker.id },
      data: { workScheduleId: schedule.id },
    });
    // The actor's narrower frame and policy must not leak to their beneficiary.
    const actorSchedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Actor frame',
        frameStart: '10:00',
        frameEnd: '12:00',
        breakRules: [],
      },
    });
    await ctx.prisma.employee.update({
      where: { id: manager.id },
      data: { workScheduleId: actorSchedule.id },
    });
  });

  function proxy(
    operation: Operation,
    actor = manager,
    employeeId = worker.id,
    extra = {},
  ) {
    return ctx.http
      .post(`/api/team-cockpit/employees/${employeeId}/${operation}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ ...(operation === 'manual' ? manual() : { reason }), ...extra });
  }
  async function jwt(person: Person): Promise<JwtUser> {
    const employee = await ctx.prisma.employee.findUniqueOrThrow({
      where: { id: person.id },
    });
    return {
      id: employee.id,
      email: employee.email,
      role: employee.role,
      authVersion: employee.authVersion,
    };
  }
  async function assertNoWrites() {
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    expect(await ctx.prisma.timeEntryAudit.count()).toBe(0);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
  }
  function decide(
    id: string,
    actor: Person,
    revision: number,
    stage: 'Manager' | 'HR',
  ) {
    return ctx.http
      .post(`/api/timeentries/${id}/approval`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ revision, stage, outcome: 'Approve' });
  }

  it('starts NOW for the beneficiary, ignores forged identity/time/GPS/approval, writes both authoritative audits, and permits their ordinary stop and next start', async () => {
    const project = await seedProject(ctx.prisma, {
      code: 'WORKER',
      assigneeIds: [worker.id],
      serviceOrders: [{ orderNo: '001', title: 'Synthetic order' }],
    });
    await ctx.prisma.serviceOrder.update({
      where: { id: project.serviceOrders[0].id },
      data: { defaultBillable: true },
    });
    const before = Date.now();
    const created = (
      await proxy('clock-in', manager, worker.id, {
        projectId: project.id,
        serviceOrderId: project.serviceOrders[0].id,
        activity: 'Assisted start',
        note: 'Requested by employee',
        reason: `  ${reason}  `,
        employeeId: foreign.id,
        actorId: hr.id,
        clockIn: instant(6),
        clockOut: instant(18),
        latitude: 51,
        longitude: 7,
        accuracyMeters: 2,
        status: 'Approved',
        requiresApproval: false,
        approvalMode: 'Solo',
        frameApproverId: hr.id,
      }).expect(201)
    ).body;
    expect(Date.parse(created.clockIn)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(created.clockIn)).toBeLessThanOrEqual(Date.now());
    expect(created).toMatchObject({
      employeeId: worker.id,
      clockOut: null,
      status: 'Open',
      approvalMode: 'Team',
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      projectId: project.id,
      serviceOrderId: project.serviceOrders[0].id,
      billable: true,
    });
    const row = await ctx.prisma.timeEntry.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.breakRules).toEqual(breakRules);
    expect(row.frameApproverId).toBeNull();
    expect(row.frameApprovedRevision).toBeNull();
    expect(await ctx.prisma.timeEntryAudit.findMany()).toMatchObject([
      {
        actorId: manager.id,
        action: 'ProxyClockedIn',
        reason,
        after: { clockIn: created.clockIn, clockOut: null, breakRules },
      },
    ]);
    const audits = await ctx.prisma.teamProxyAudit.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: manager.id,
      employeeId: worker.id,
      resourceKind: 'TimeEntry',
      resourceId: created.id,
      action: 'ProxyClockedIn',
      reason,
      values: {
        actor: { id: manager.id, role: 'Manager' },
        employee: { id: worker.id },
        clockIn: created.clockIn,
        status: 'Open',
        note: 'Requested by employee',
        activity: 'Assisted start',
        billable: true,
        breakRules,
      },
    });
    expect(audits[0].occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    await decide(created.id, manager, 0, 'Manager').expect(409);
    await decide(created.id, hr, 0, 'HR').expect(409);
    const stopped = await ctx.http
      .post('/api/timeentries/clock-out')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ id: created.id, revision: 0 })
      .expect(201);
    expect(stopped.body.id).toBe(created.id);
    expect(stopped.body.clockOut).not.toBeNull();
    expect(
      (
        await ctx.prisma.timeEntry.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).breakRules,
    ).toEqual(breakRules);
    await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({})
      .expect(201);
  });

  it('creates in-frame closed Team work using the beneficiary schedule and server break snapshot without laundering caller approval fields', async () => {
    const created = (
      await proxy('manual', manager, worker.id, {
        status: 'Rejected',
        requiresApproval: true,
        approvalMode: 'Solo',
        frameApproverId: hr.id,
        frameApprovedRevision: 99,
        revision: 99,
      }).expect(201)
    ).body;
    expect(created).toMatchObject({
      employeeId: worker.id,
      source: 'Manual',
      status: 'Approved',
      approvalMode: 'Team',
      requiresApproval: false,
      revision: 0,
      summary: { grossMinutes: 480, breakMinutes: 20, netMinutes: 460 },
    });
    const row = await ctx.prisma.timeEntry.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row).toMatchObject({
      breakRules,
      frameApproverId: null,
      frameApprovedRevision: null,
      captureGroupId: null,
    });
    expect(await ctx.prisma.timeEntryAudit.findMany()).toMatchObject([
      { actorId: manager.id, action: 'ProxyManualCreated', reason },
    ]);
    expect(await ctx.prisma.teamProxyAudit.findMany()).toMatchObject([
      {
        actorId: manager.id,
        employeeId: worker.id,
        action: 'ProxyManualCreated',
        values: {
          clockIn: manual().clockIn,
          clockOut: manual().clockOut,
          status: 'Approved',
          breakRules,
          summary: { netMinutes: 460 },
        },
      },
    ]);
  });

  it('supports project/order/activity/billable/note for closed work and freezes the configured break policy', async () => {
    const project = await seedProject(ctx.prisma, {
      code: 'MANUAL',
      assigneeIds: [worker.id],
      serviceOrders: [{ orderNo: '001', title: 'Synthetic order' }],
    });
    const created = (
      await proxy('manual', manager, worker.id, {
        projectId: project.id,
        serviceOrderId: project.serviceOrders[0].id,
        activity: 'Assisted manual',
        billable: true,
        note: 'Synthetic record',
      }).expect(201)
    ).body;
    expect(created).toMatchObject({
      projectId: project.id,
      serviceOrderId: project.serviceOrders[0].id,
      activity: 'Assisted manual',
      billable: true,
      note: 'Synthetic record',
    });
    const employee = await ctx.prisma.employee.findUniqueOrThrow({
      where: { id: worker.id },
    });
    if (!employee.workScheduleId)
      throw new Error('Expected synthetic schedule');
    await ctx.prisma.workSchedule.update({
      where: { id: employee.workScheduleId },
      data: { breakRules: [] },
    });
    expect(
      (
        await ctx.prisma.timeEntry.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).breakRules,
    ).toEqual(breakRules);
  });

  it.each<Operation>(['clock-in', 'manual'])(
    'uses the explicit HR role organization-wide but never for HR self capture (%s)',
    async (operation) => {
      await proxy(operation, hr, foreign.id).expect(201);
      await proxy(operation, hr, hr.id).expect(403);
      expect(await ctx.prisma.teamProxyAudit.findMany()).toMatchObject([
        { actorId: hr.id, employeeId: foreign.id },
      ]);
    },
  );

  it.each<Operation>(['clock-in', 'manual'])(
    'denies employees, foreign managers, self and inactive beneficiaries without any mutation (%s)',
    async (operation) => {
      await proxy(operation, worker, foreign.id).expect(403);
      await proxy(operation, otherManager, worker.id).expect(403);
      await proxy(operation, manager, manager.id).expect(403);
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { isActive: false },
      });
      await proxy(operation).expect(403);
      await proxy(operation, hr).expect(403);
      await assertNoWrites();
    },
  );

  it.each<Operation>(['clock-in', 'manual'])(
    'rejects missing/blank/short/long reasons and explicit break overrides (%s)',
    async (operation) => {
      for (const extra of [
        { reason: undefined },
        { reason: '' },
        { reason: '     ' },
        { reason: ' four ' },
        { reason: 'x'.repeat(1001) },
        { breakRules: [] },
        { breakRules: null },
        { breakMinutes: 0 },
        { breakOverride: 0 },
      ])
        await proxy(operation, manager, worker.id, extra).expect(400);
      await assertNoWrites();
    },
  );

  it('rejects future/reversed/empty/ambiguous manual intervals', async () => {
    for (const extra of [
      { clockOut: new Date(Date.now() + 60_000).toISOString() },
      { clockIn: instant(17), clockOut: instant(9) },
      { clockIn: instant(9), clockOut: instant(9) },
      { clockIn: 'not-a-date' },
      { clockIn: '2026-05-04T09:00:00' },
    ])
      await proxy('manual', manager, worker.id, extra).expect(400);
    await assertNoWrites();
  });

  it.each<Operation>(['clock-in', 'manual'])(
    'validates beneficiary project assignment, order membership and active booking targets (%s)',
    async (operation) => {
      const actorProject = await seedProject(ctx.prisma, {
        code: 'ACTOR',
        assigneeIds: [manager.id],
      });
      await proxy(operation, manager, worker.id, {
        projectId: actorProject.id,
      }).expect(403);
      const project = await seedProject(ctx.prisma, {
        code: 'BENEFICIARY',
        assigneeIds: [worker.id],
        serviceOrders: [
          { orderNo: '001', title: 'Active' },
          { orderNo: '002', title: 'Inactive', isActive: false },
        ],
      });
      const other = await seedProject(ctx.prisma, {
        code: 'OTHER',
        assigneeIds: [worker.id],
        serviceOrders: [{ orderNo: '001', title: 'Wrong project' }],
      });
      await proxy(operation, manager, worker.id, {
        projectId: project.id,
      }).expect(400);
      await proxy(operation, manager, worker.id, {
        projectId: project.id,
        serviceOrderId: other.serviceOrders[0].id,
      }).expect(404);
      const inactive = project.serviceOrders.find((order) => !order.isActive);
      if (!inactive) throw new Error('Expected inactive synthetic order');
      await proxy(operation, manager, worker.id, {
        projectId: project.id,
        serviceOrderId: inactive.id,
      }).expect(400);
      await proxy(operation, manager, worker.id, {
        serviceOrderId: other.serviceOrders[0].id,
      }).expect(400);
      await ctx.prisma.project.update({
        where: { id: project.id },
        data: { isActive: false },
      });
      await proxy(operation, manager, worker.id, {
        projectId: project.id,
      }).expect(400);
      await assertNoWrites();
    },
  );

  it('rejects closed overlap at NOW even in Team mode', async () => {
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: worker.id,
        clockIn: new Date(Date.now() - 60_000),
        clockOut: new Date(Date.now() + 60_000),
        status: 'Approved',
        approvalMode: 'Team',
      },
    });
    await proxy('clock-in').expect(409);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    expect(await ctx.prisma.timeEntryAudit.count()).toBe(0);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
  });

  it.each<Operation>(['clock-in', 'manual'])(
    'rejects an existing open timer (%s)',
    async (operation) => {
      await ctx.prisma.timeEntry.create({
        data: {
          employeeId: worker.id,
          clockIn: new Date(),
          status: 'Open',
          approvalMode: 'Team',
        },
      });
      await proxy(operation).expect(409);
      expect(await ctx.prisma.timeEntry.count()).toBe(1);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
    },
  );

  it('rejects overlap with closed manual work and allows touching endpoints', async () => {
    await proxy('manual').expect(201);
    await proxy('manual', manager, worker.id, {
      clockIn: instant(16),
      clockOut: instant(18),
    }).expect(409);
    await proxy('manual', manager, worker.id, {
      clockIn: instant(17),
      clockOut: instant(18),
    }).expect(201);
    expect(await ctx.prisma.timeEntry.count()).toBe(2);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(2);
  });

  it.each<Operation>(['clock-in', 'manual'])(
    'preserves the one-daily-block rule even for disjoint intervals (%s)',
    async (operation) => {
      const date = operation === 'manual' ? new Date(2026, 4, 4) : new Date();
      const bookingDate = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
      );
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      await ctx.prisma.timeEntry.create({
        data: {
          employeeId: worker.id,
          bookingDate,
          source: 'DailyBlock',
          clockIn: start,
          clockOut: new Date(start.getTime() + 1000),
          status: 'Approved',
          approvalMode: 'Team',
        },
      });
      await proxy(operation).expect(409);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
    },
  );

  it.each<Operation>(['clock-in', 'manual'])(
    'serializes duplicate proxy writes with one entry and one audit pair (%s)',
    async (operation) => {
      const replies = await Promise.all([proxy(operation), proxy(operation)]);
      expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
      expect(await ctx.prisma.timeEntry.count()).toBe(1);
      expect(await ctx.prisma.timeEntryAudit.count()).toBe(1);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(1);
    },
  );

  it('serializes proxy and ordinary clock-in against the same employee lock and DB uniqueness invariant', async () => {
    const replies = await Promise.all([
      proxy('clock-in'),
      ctx.http
        .post('/api/timeentries/clock-in')
        .set('Authorization', `Bearer ${worker.token}`)
        .send({}),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    const count = replies[0].status === 201 ? 1 : 0;
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(count);
    expect(await ctx.prisma.timeEntryAudit.count()).toBe(count);
  });

  it.each(['manager', 'hr'] as const)(
    'routes outside-frame proxy work through manager then HR even when created by %s',
    async (creator) => {
      const actor = creator === 'hr' ? hr : manager;
      const created = (
        await proxy('manual', actor, worker.id, {
          clockIn: instant(5),
          clockOut: instant(6),
        }).expect(201)
      ).body;
      expect(created).toMatchObject({
        status: 'Pending',
        requiresApproval: true,
        approvalMode: 'Team',
        revision: 0,
      });
      expect(
        await ctx.prisma.timeEntry.findUniqueOrThrow({
          where: { id: created.id },
        }),
      ).toMatchObject({ frameApproverId: null, frameApprovedRevision: null });
      await decide(created.id, hr, 0, 'HR').expect(409);
      await decide(created.id, worker, 0, 'Manager').expect(403);
      expect(
        (await decide(created.id, manager, 0, 'Manager').expect(201)).body,
      ).toMatchObject({ state: 'PendingHr', entry: { status: 'Pending' } });
      expect(
        (await decide(created.id, hr, 1, 'HR').expect(201)).body,
      ).toMatchObject({
        state: 'Approved',
        entry: { status: 'Approved', requiresApproval: true },
      });
    },
  );

  it('does not implicitly approve an open proxy entry and final employee clock-out enters manager→HR review', async () => {
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Outside now',
        frameStart: '12:00',
        frameEnd: '12:01',
        breakRules,
      },
    });
    await ctx.prisma.employee.update({
      where: { id: worker.id },
      data: { workScheduleId: schedule.id },
    });
    const created = (await proxy('clock-in').expect(201)).body;
    expect(created.status).toBe('Open');
    await decide(created.id, manager, 0, 'Manager').expect(409);
    // Deterministically model the persisted open interval crossing a day boundary;
    // no production clock or client timestamp is substituted by the operation.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    await ctx.prisma.timeEntry.update({
      where: { id: created.id },
      data: { clockIn: yesterday },
    });
    const stopped = await ctx.http
      .post('/api/timeentries/clock-out')
      .set('Authorization', `Bearer ${worker.token}`)
      .send({ id: created.id, revision: 0 })
      .expect(201);
    expect(stopped.body).toMatchObject({
      status: 'Pending',
      requiresApproval: true,
    });
    await decide(created.id, hr, 1, 'HR').expect(409);
    await decide(created.id, manager, 1, 'Manager').expect(201);
    await decide(created.id, hr, 2, 'HR').expect(201);
  });

  it('never bypasses HR-beneficiary self-review or opens owner-only Team manual/correction rights', async () => {
    const created = (
      await proxy('manual', manager, hr.id, {
        clockIn: instant(0),
        clockOut: instant(1),
      }).expect(201)
    ).body;
    await decide(created.id, manager, 0, 'Manager').expect(201);
    await decide(created.id, hr, 1, 'HR').expect(403);
    for (const actor of [worker, manager, hr])
      await ctx.http
        .post('/api/timeentries/manual')
        .set('Authorization', `Bearer ${actor.token}`)
        .send(manual())
        .expect(403);
    await ctx.http
      .patch(`/api/timeentries/${created.id}/correct`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ ...manual(), revision: 1 })
      .expect(403);
  });

  async function queuedMutation(
    operation: Operation,
    mutate: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    const identity = await jwt(manager);
    const service = ctx.app.get(TimeEntriesService);
    let pending!: Promise<unknown>;
    await ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
      pending = (
        operation === 'clock-in'
          ? service.proxyClockIn(worker.id, { reason }, identity)
          : service.proxyManual(worker.id, manual(), identity)
      ).catch((error: { status: number }) => ({ status: error.status }));
      await mutate(tx);
    });
    return pending;
  }

  it.each<Operation>(['clock-in', 'manual'])(
    'rechecks live role/authVersion/team assignment/mode/activity after waiting for booking locks (%s)',
    async (operation) => {
      const identity = await jwt(manager);
      const changes: Array<(tx: Prisma.TransactionClient) => Promise<unknown>> =
        [
          (tx) =>
            tx.employee.update({
              where: { id: manager.id },
              data: { role: 'Employee' },
            }),
          (tx) =>
            tx.employee.update({
              where: { id: manager.id },
              data: { authVersion: { increment: 1 } },
            }),
          (tx) =>
            tx.employee.update({
              where: { id: worker.id },
              data: { managerId: otherManager.id },
            }),
          (tx) =>
            tx.employee.update({
              where: { id: worker.id },
              data: { isActive: false },
            }),
          (tx) =>
            tx.employee.update({
              where: { id: manager.id },
              data: { isActive: false },
            }),
          (tx) =>
            tx.installationSettings.upsert({
              where: { id: 1 },
              create: { mode: 'Solo', ownerEmployeeId: manager.id },
              update: { mode: 'Solo', ownerEmployeeId: manager.id },
            }),
        ];
      for (const change of changes) {
        await ctx.prisma.employee.update({
          where: { id: manager.id },
          data: {
            role: 'Manager',
            isActive: true,
            authVersion: identity.authVersion,
          },
        });
        await ctx.prisma.employee.update({
          where: { id: worker.id },
          data: { managerId: manager.id, isActive: true },
        });
        await ctx.prisma.installationSettings.deleteMany();
        expect(await queuedMutation(operation, change)).toEqual({
          status: 403,
        });
        await assertNoWrites();
      }
    },
  );

  it('rechecks beneficiary project assignments and the fresh schedule under locks', async () => {
    const project = await seedProject(ctx.prisma, {
      code: 'REVOKED',
      assigneeIds: [worker.id],
    });
    const service = ctx.app.get(TimeEntriesService);
    const identity = await jwt(manager);
    let pending!: Promise<unknown>;
    await ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
      pending = service
        .proxyManual(
          worker.id,
          { ...manual(), projectId: project.id },
          identity,
        )
        .catch((error: { status: number }) => ({ status: error.status }));
      await tx.projectAssignment.deleteMany({
        where: { employeeId: worker.id, projectId: project.id },
      });
    });
    expect(await pending).toEqual({ status: 403 });
    await assertNoWrites();
    const newSchedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'New narrow frame',
        frameStart: '10:00',
        frameEnd: '12:00',
        breakRules: [{ afterMinutes: 60, breakMinutes: 10 }],
      },
    });
    const result = await queuedMutation('manual', (tx) =>
      tx.employee.update({
        where: { id: worker.id },
        data: { workScheduleId: newSchedule.id },
      }),
    );
    expect(result).toMatchObject({
      status: 'Pending',
      requiresApproval: true,
      summary: { breakMinutes: 10 },
    });
    expect(await ctx.prisma.teamProxyAudit.findMany()).toMatchObject([
      { values: { breakRules: [{ afterMinutes: 60, breakMinutes: 10 }] } },
    ]);
  });

  it.each(['TimeEntryAudit', 'TeamProxyAudit'])(
    'rolls back the entry AND both audits and emits no event when %s storage fails',
    async (table) => {
      const broadcast = jest.spyOn(ctx.app.get(EventsGateway), 'broadcast');
      await ctx.prisma.$executeRawUnsafe(
        `CREATE FUNCTION "test_reject_proxy_time_audit"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit storage failure'; END; $$`,
      );
      try {
        await ctx.prisma.$executeRawUnsafe(
          `CREATE TRIGGER "test_reject_proxy_time_audit" BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION "test_reject_proxy_time_audit"()`,
        );
        for (const operation of ['clock-in', 'manual'] as const) {
          broadcast.mockClear();
          await proxy(operation).expect(500);
          await assertNoWrites();
          expect(broadcast).not.toHaveBeenCalled();
        }
      } finally {
        await ctx.prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS "test_reject_proxy_time_audit" ON "${table}"`,
        );
        await ctx.prisma.$executeRawUnsafe(
          'DROP FUNCTION IF EXISTS "test_reject_proxy_time_audit"()',
        );
        broadcast.mockRestore();
      }
    },
  );
});
