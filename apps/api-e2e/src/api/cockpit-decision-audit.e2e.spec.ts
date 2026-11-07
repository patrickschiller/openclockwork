import type { Prisma, TimeEntry } from '@prisma/client';
import type { JwtUser } from '../../../api/src/app/auth/jwt.strategy';
import { EventsGateway } from '../../../api/src/app/events/events.gateway';
import type { RequestDto } from '../../../api/src/app/requests/requests.dto';
import { RequestsService } from '../../../api/src/app/requests/requests.service';
import { TimeEntriesService } from '../../../api/src/app/time-entries/time-entries.service';
import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const IN = '2026-05-04T06:00:00.000Z'; // Monday, 08:00 Europe/Berlin
const OUT = '2026-05-04T14:00:00.000Z'; // 16:00
const EARLY = '2026-05-04T04:00:00.000Z'; // 06:00, outside 07–18
const EXTENDED = '2026-05-04T15:00:00.000Z'; // 17:00
const RULES = [{ afterMinutes: 360, breakMinutes: 30 }];
const REASON = 'Synthetic employee requested help recording work';
type Person = { id: string; email: string; token: string };
type Body = Record<string, unknown>;
const DECISIONS = [
  'manager-approve',
  'manager-reject',
  'hr-confirm',
  'hr-reject',
  'approve',
  'reject',
] as const;
type Decision = (typeof DECISIONS)[number];

describe('Cockpit displayed decisions and current-scope time audit (#44)', () => {
  let ctx: TestContext;
  let worker: Person, manager: Person, otherManager: Person;
  let foreign: Person, hr: Person;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  beforeEach(async () => {
    await ctx.reset();
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Synthetic cockpit frame',
        frameStart: '07:00',
        frameEnd: '18:00',
        breakRules: RULES,
      },
    });
    async function person(
      name: string,
      role: 'Employee' | 'Manager' | 'HRAdmin',
      managerId?: string,
    ): Promise<Person> {
      const employee = await seedEmployee(ctx.prisma, {
        personalNo: name,
        firstName: name,
        lastName: 'Synthetic',
        email: `${name}@test.local`,
        role,
        managerId,
        workScheduleId: schedule.id,
      });
      return {
        id: employee.id,
        email: employee.email,
        token: await login(ctx.http, employee.email),
      };
    }
    manager = await person('cockpit-manager', 'Manager');
    otherManager = await person('cockpit-other-manager', 'Manager');
    worker = await person('cockpit-worker', 'Employee', manager.id);
    foreign = await person('cockpit-foreign', 'Employee', otherManager.id);
    hr = await person('cockpit-hr', 'HRAdmin');
    await ctx.prisma.installationSettings.create({
      data: { id: 1, mode: 'Team', setupCompleted: true },
    });
  });

  function entry(
    employeeId = worker.id,
    approvalMode: 'Team' | 'Solo' = 'Team',
  ): Promise<TimeEntry> {
    return ctx.prisma.timeEntry.create({
      data: {
        employeeId,
        clockIn: new Date(IN),
        clockOut: new Date(OUT),
        source: 'Pwa',
        status: 'Approved',
        approvalMode,
        activity: 'Keep the original metadata',
        breakRules: RULES,
      },
    });
  }
  async function correction(row: TimeEntry, from = IN): Promise<RequestDto> {
    return (
      await ctx.http
        .post('/api/requests')
        .set('Authorization', `Bearer ${worker.token}`)
        .send({
          employeeId: worker.id,
          type: 'TimeAdjustment',
          targetTimeEntryId: row.id,
          expectedTargetRevision: row.revision,
          from,
          to: EXTENDED,
          reason: 'Synthetic correction proposed by the beneficiary',
        })
        .expect(201)
    ).body as RequestDto;
  }
  function decide(
    request: RequestDto,
    route: string,
    who = route.startsWith('hr-') ? hr : manager,
    extra: Body = {},
  ) {
    return ctx.http
      .post(`/api/requests/${request.id}/${route}`)
      .set('Authorization', `Bearer ${who.token}`)
      .send({
        actorId: who.id,
        note: 'Synthetic reviewed decision',
        expectedUpdatedAt: request.updatedAt,
        ...extra,
      });
  }
  async function decisionFixture(route: Decision) {
    const row = await entry();
    const original = await correction(row, EARLY);
    const displayed = route.startsWith('hr-')
      ? ((await decide(original, 'manager-approve').expect(201))
          .body as RequestDto)
      : original;
    return { row, original, displayed };
  }
  async function state(requestId: string) {
    return {
      request: await ctx.prisma.request.findUniqueOrThrow({
        where: { id: requestId },
      }),
      entries: await ctx.prisma.timeEntry.findMany({ orderBy: { id: 'asc' } }),
      events: await ctx.prisma.requestEvent.findMany({
        where: { requestId },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
      audits: await ctx.prisma.timeEntryAudit.findMany({
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
    };
  }
  function audit(id: string, who = worker) {
    return ctx.http
      .get(`/api/timeentries/${id}/audit`)
      .set('Authorization', `Bearer ${who.token}`);
  }
  async function identity(who: Person): Promise<JwtUser> {
    const actor = await ctx.prisma.employee.findUniqueOrThrow({
      where: { id: who.id },
    });
    return {
      id: actor.id,
      email: actor.email,
      role: actor.role,
      authVersion: actor.authVersion,
    };
  }
  async function proxyEntry(): Promise<TimeEntry> {
    const created = await ctx.http
      .post(`/api/team-cockpit/employees/${worker.id}/manual`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({
        clockIn: IN,
        clockOut: OUT,
        reason: REASON,
        actorId: hr.id,
        employeeId: foreign.id,
      })
      .expect(201);
    return ctx.prisma.timeEntry.findUniqueOrThrow({
      where: { id: created.body.id },
    });
  }

  it.each(['manager-approve', 'manager-reject', 'approve', 'reject'] as const)(
    '%s refuses the displayed pre-return version after an ABA resubmission, then accepts the reviewed new version',
    async (route) => {
      const row = await entry();
      const displayed = await correction(row, EARLY);
      const returned = (await decide(displayed, 'return').expect(201))
        .body as RequestDto;
      const saved = await ctx.http
        .patch(`/api/requests/${displayed.id}`)
        .set('Authorization', `Bearer ${worker.token}`)
        .send({
          from: IN,
          to: EXTENDED,
          reason: 'Changed to in-frame work; this must be reviewed again',
          expectedUpdatedAt: returned.updatedAt,
        })
        .expect(200);
      const resubmitted = await ctx.http
        .post(`/api/requests/${displayed.id}/resubmit`)
        .set('Authorization', `Bearer ${worker.token}`)
        .send({
          from: IN,
          to: EXTENDED,
          reason: saved.body.reason,
          expectedUpdatedAt: saved.body.updatedAt,
        })
        .expect(201);
      const fresh = resubmitted.body as RequestDto;
      expect(fresh).toMatchObject({
        id: displayed.id,
        workflowState: 'PendingManager',
        currentApproverId: manager.id,
        targetTimeEntryId: row.id,
        expectedTargetRevision: displayed.expectedTargetRevision,
        targetTimeEntryBefore: displayed.targetTimeEntryBefore,
        requiresApproval: false,
        from: IN,
      });
      expect(displayed.workflowState).toBe(fresh.workflowState);
      expect(fresh.updatedAt).not.toBe(displayed.updatedAt);
      expect(await ctx.prisma.request.count()).toBe(1);
      const before = await state(displayed.id);
      // Stripping expectedUpdatedAt would approve changed values: ID, pending
      // state and target revision all match the original displayed request.
      await decide(displayed, route).expect(409);
      expect(await state(displayed.id)).toEqual(before);
      const approve = route === 'approve' || route === 'manager-approve';
      const result = await decide(fresh, route, manager, {
        actorId: hr.id, // JWT, not the body, is the actual decision actor.
      }).expect(201);
      expect(result.body.workflowState).toBe(approve ? 'Approved' : 'Rejected');
      const after = await state(displayed.id);
      expect(after.entries).toHaveLength(1);
      expect(after.events.map((event) => event.kind)).toEqual([
        'Submitted',
        'Returned',
        'Resubmitted',
        approve ? 'ManagerApproved' : 'ManagerRejected',
      ]);
      expect(after.events.at(-1)?.actorId).toBe(manager.id);
      if (approve) {
        expect(after.entries[0]).toMatchObject({
          id: row.id,
          revision: 1,
          clockIn: new Date(IN),
          clockOut: new Date(EXTENDED),
          activity: row.activity,
        });
        expect(after.audits).toHaveLength(1);
        expect(after.audits[0]).toMatchObject({
          requestId: displayed.id,
          timeEntryId: row.id,
          actorId: manager.id,
          action: 'FrameRequestCorrected',
          reason: fresh.reason,
          before: displayed.targetTimeEntryBefore,
          after: { id: row.id, revision: 1, clockIn: IN, clockOut: EXTENDED },
        });
      } else {
        expect(after.entries).toEqual([row]);
        expect(after.audits).toEqual([]);
      }
    },
  );

  it.each(['hr-confirm', 'hr-reject'] as const)(
    '%s rejects a stale displayed version after the manager stage without changing target/history, and accepts the current HR version',
    async (route) => {
      const { row, original, displayed } = await decisionFixture(route);
      expect(displayed.workflowState).toBe('PendingHr');
      expect(displayed.updatedAt).not.toBe(original.updatedAt);
      const before = await state(displayed.id);
      await decide(original, route).expect(409);
      expect(await state(displayed.id)).toEqual(before);
      const confirmed = route === 'hr-confirm';
      const response = await decide(displayed, route, hr, {
        actorId: manager.id,
      }).expect(201);
      expect(response.body.workflowState).toBe(
        confirmed ? 'Approved' : 'Rejected',
      );
      const after = await state(displayed.id);
      expect(after.entries).toHaveLength(1);
      expect(after.events.map((event) => event.kind)).toEqual([
        'Submitted',
        'ManagerApproved',
        confirmed ? 'HrConfirmed' : 'HrRejected',
      ]);
      expect(after.events.at(-1)?.actorId).toBe(hr.id);
      if (confirmed) {
        expect(after.entries[0]).toMatchObject({
          id: row.id,
          revision: 1,
          clockIn: new Date(EARLY),
          clockOut: new Date(EXTENDED),
          activity: row.activity,
          breakRules: RULES,
        });
        expect(after.audits).toHaveLength(1);
        expect(after.audits[0]).toMatchObject({
          requestId: displayed.id,
          timeEntryId: row.id,
          actorId: hr.id,
          action: 'FrameRequestCorrected',
          reason: original.reason,
          before: original.targetTimeEntryBefore,
          after: {
            id: row.id,
            revision: 1,
            clockIn: EARLY,
            clockOut: EXTENDED,
          },
        });
      } else {
        expect(after.entries).toEqual([row]);
        expect(after.audits).toEqual([]);
      }
    },
  );

  it.each(DECISIONS)(
    '%s authorizes the JWT actor before disclosing a stale-version conflict',
    async (route) => {
      const { displayed } = await decisionFixture(route);
      const before = await state(displayed.id);
      for (const who of [otherManager, foreign]) {
        for (const expectedUpdatedAt of [displayed.updatedAt, IN]) {
          await decide(displayed, route, who, {
            actorId: route.startsWith('hr-') ? hr.id : manager.id,
            expectedUpdatedAt,
          }).expect(403);
        }
      }
      expect(await state(displayed.id)).toEqual(before);
    },
  );

  it.each(DECISIONS)(
    '%s validates an optional displayed timestamp while preserving omitted-version legacy clients',
    async (route) => {
      const { displayed } = await decisionFixture(route);
      const before = await state(displayed.id);
      await decide(displayed, route, undefined, {
        expectedUpdatedAt: 'not-a-timestamp',
      }).expect(400);
      expect(await state(displayed.id)).toEqual(before);
      await decide(displayed, route, undefined, {
        expectedUpdatedAt: undefined,
      }).expect(201);
      const after = await state(displayed.id);
      expect(after.events).toHaveLength(before.events.length + 1);
      expect(after.entries).toHaveLength(1);
    },
  );

  it.each(['return', 'cancel', 'substitute/accept', 'substitute/decline'])(
    '%s also honors an optional displayed version on the normal workflow API',
    async (route) => {
      await seedLeaveAllowance(ctx.prisma, worker.id, 2026);
      const created = await ctx.http
        .post('/api/requests/vacation')
        .set('Authorization', `Bearer ${worker.token}`)
        .send({
          employeeId: worker.id,
          from: '2026-05-04T00:00:00.000Z',
          to: '2026-05-04T00:00:00.000Z',
          ...(route.startsWith('substitute/')
            ? { substituteId: foreign.id }
            : {}),
        })
        .expect(201);
      const request = created.body as RequestDto;
      const who = route.startsWith('substitute/')
        ? foreign
        : route === 'cancel'
          ? worker
          : manager;
      const before = await state(request.id);
      await decide(request, route, who, { expectedUpdatedAt: IN }).expect(409);
      expect(await state(request.id)).toEqual(before);
      await decide(request, route, who).expect(201);
      expect((await state(request.id)).events).toHaveLength(2);
    },
  );

  type EmployeeLock = {
    lockEmployee(
      tx: Prisma.TransactionClient,
      employeeId: string,
    ): Promise<void>;
  };
  function employeeLock() {
    const service = ctx.app.get(RequestsService);
    const lockable = service as unknown as EmployeeLock;
    return { lockable, realLock: lockable.lockEmployee.bind(service) };
  }

  it.each([
    { stage: 'Manager', conflicting: false },
    { stage: 'Manager', conflicting: true },
    { stage: 'HR', conflicting: false },
    { stage: 'HR', conflicting: true },
  ])(
    'serializes simultaneous $stage decisions for one displayed version (opposing decision: $conflicting)',
    async ({ stage, conflicting }) => {
      const row = await entry();
      let displayed = await correction(row, stage === 'HR' ? EARLY : IN);
      if (stage === 'HR')
        displayed = (await decide(displayed, 'manager-approve').expect(201))
          .body as RequestDto;
      const before = await state(displayed.id);
      const approveRoute = stage === 'HR' ? 'hr-confirm' : 'manager-approve';
      const rejectRoute = stage === 'HR' ? 'hr-reject' : 'manager-reject';
      const { lockable, realLock } = employeeLock();
      let entered = 0;
      let bothEntered!: () => void;
      let release!: () => void;
      const atLocks = new Promise<void>((resolve) => {
        bothEntered = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Both HTTP handlers must have read the same version and passed initial
      // authority checks before either can finish. No scheduling assumption.
      const spy = jest
        .spyOn(lockable, 'lockEmployee')
        .mockImplementation(async (tx, id) => {
          if (++entered === 2) bothEntered();
          await released;
          await realLock(tx, id);
        });
      const pending = [
        decide(displayed, approveRoute).then((response) => response),
        decide(displayed, conflicting ? rejectRoute : approveRoute).then(
          (response) => response,
        ),
      ];
      try {
        await Promise.race([
          atLocks,
          ...pending.map((reply) =>
            reply.then(() => {
              throw new Error(
                'Decision completed before both reached the lock',
              );
            }),
          ),
        ]);
        release();
        const replies = await Promise.all(pending);
        expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
        const winner = replies.find((reply) => reply.status === 201);
        if (!winner)
          throw new Error('Exactly one successful decision is required');
        const approved = winner.body.workflowState === 'Approved';
        expect(['Approved', 'Rejected']).toContain(winner.body.workflowState);
        if (!conflicting) expect(approved).toBe(true);
        const after = await state(displayed.id);
        expect(after.request.workflowState).toBe(winner.body.workflowState);
        expect(after.events).toHaveLength(before.events.length + 1);
        expect(after.entries).toHaveLength(1);
        expect(after.entries[0]).toMatchObject({
          id: row.id,
          revision: approved ? 1 : 0,
          clockIn: approved ? new Date(displayed.from) : row.clockIn,
          clockOut: approved ? new Date(displayed.to) : row.clockOut,
          activity: row.activity,
        });
        expect(after.audits).toHaveLength(approved ? 1 : 0);
        if (approved)
          expect(after.audits[0]).toMatchObject({
            requestId: displayed.id,
            timeEntryId: row.id,
            actorId: stage === 'HR' ? hr.id : manager.id,
            before: displayed.targetTimeEntryBefore,
            after: { id: row.id, revision: 1 },
          });
      } finally {
        release();
        await Promise.allSettled(pending);
        spy.mockRestore();
      }
    },
  );

  // The HTTP handler has passed its initial checks before authority changes.
  // The held PostgreSQL advisory lock is the barrier, never sleeps/retries.
  async function queuedDecision(
    request: RequestDto,
    route: string,
    mutate: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    const { lockable, realLock } = employeeLock();
    let entered!: () => void;
    const atLock = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const spy = jest
      .spyOn(lockable, 'lockEmployee')
      .mockImplementation((tx, id) => {
        entered();
        return realLock(tx, id);
      });
    let pending!: Promise<{ status: number }>;
    try {
      await ctx.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
        pending = decide(request, route).then((response) => response);
        await Promise.race([
          atLock,
          pending.then(() => {
            throw new Error(
              'Decision completed without reaching the authority lock',
            );
          }),
        ]);
        await mutate(tx);
      });
      return await pending;
    } finally {
      spy.mockRestore();
      if (pending) await pending;
    }
  }

  it.each(
    ['approve', 'reject', 'manager-reject', 'return'].flatMap((route) =>
      ['assignment', 'role', 'Solo'].map((change) => ({ route, change })),
    ),
  )(
    '$route rechecks changed $change authority after waiting for the global/employee lock',
    async ({ route, change }) => {
      const row = await entry();
      // Exercise the old generic branch as well as non-final workflow actions.
      const request =
        route === 'approve' || route === 'reject'
          ? ((
              await ctx.http
                .post('/api/requests')
                .set('Authorization', `Bearer ${worker.token}`)
                .send({
                  employeeId: worker.id,
                  type: 'HomeOffice',
                  from: IN,
                  to: OUT,
                })
                .expect(201)
            ).body as RequestDto)
          : await correction(row, EARLY);
      const before = await state(request.id);
      const broadcast = jest.spyOn(ctx.app.get(EventsGateway), 'broadcast');
      const response = await queuedDecision(request, route, (tx) => {
        if (change === 'assignment')
          return tx.employee.update({
            where: { id: worker.id },
            data: { managerId: otherManager.id },
          });
        if (change === 'role')
          return tx.employee.update({
            where: { id: manager.id },
            data: { role: 'Employee' },
          });
        return tx.installationSettings.update({
          where: { id: 1 },
          data: { mode: 'Solo', ownerEmployeeId: hr.id },
        });
      });
      expect(response.status).toBe(403);
      expect(await state(request.id)).toEqual(before);
      expect(broadcast).not.toHaveBeenCalled();
    },
  );

  it.each(['role', 'Solo'])(
    'HR rejection also rechecks changed %s after waiting for the lock',
    async (change) => {
      const { displayed } = await decisionFixture('hr-reject');
      const before = await state(displayed.id);
      const broadcast = jest.spyOn(ctx.app.get(EventsGateway), 'broadcast');
      const response = await queuedDecision(displayed, 'hr-reject', (tx) =>
        change === 'role'
          ? tx.employee.update({
              where: { id: hr.id },
              data: { role: 'Employee' },
            })
          : tx.installationSettings.update({
              where: { id: 1 },
              data: { mode: 'Solo', ownerEmployeeId: hr.id },
            }),
      );
      expect(response.status).toBe(403);
      expect(await state(displayed.id)).toEqual(before);
      expect(broadcast).not.toHaveBeenCalled();
    },
  );

  it('shows proxy creation and linked correction history to the beneficiary/current manager/HR with the true actors and before/after values', async () => {
    const row = await proxyEntry();
    const request = await correction(row, EARLY);
    const pendingHr = (await decide(request, 'manager-approve').expect(201))
      .body as RequestDto;
    await decide(pendingHr, 'hr-confirm', hr, { actorId: manager.id }).expect(
      201,
    );
    const expected = [
      {
        timeEntryId: row.id,
        requestId: null,
        actorId: manager.id,
        actorName: 'cockpit-manager Synthetic',
        action: 'ProxyManualCreated',
        reason: REASON,
        before: null,
        after: { clockIn: IN, clockOut: OUT, revision: 0, breakRules: RULES },
      },
      {
        timeEntryId: row.id,
        requestId: request.id,
        actorId: hr.id,
        actorName: 'cockpit-hr Synthetic',
        action: 'FrameRequestCorrected',
        reason: request.reason,
        before: request.targetTimeEntryBefore,
        after: { id: row.id, clockIn: EARLY, clockOut: EXTENDED, revision: 1 },
      },
    ];
    const ownHistory = (await audit(row.id).expect(200)).body;
    expect(ownHistory).toHaveLength(2);
    expect(ownHistory).toMatchObject(expected);
    for (const event of ownHistory) {
      expect(Number.isFinite(Date.parse(event.occurredAt))).toBe(true);
      expect(event.id).toEqual(expect.any(String));
    }
    for (const who of [manager, hr])
      expect((await audit(row.id, who).expect(200)).body).toEqual(ownHistory);
    for (const who of [otherManager, foreign]) {
      const denied = await audit(row.id, who).expect(403);
      expect(denied.body).not.toHaveProperty('before');
      expect(denied.body).not.toHaveProperty('after');
    }
    await ctx.http.get(`/api/timeentries/${row.id}/audit`).expect(401);
  });

  it('uses current assignment, not historic proxy authorship or a captured manager identity, to authorize audit reads', async () => {
    const row = await proxyEntry();
    const captured = await identity(manager);
    const history = (await audit(row.id, manager).expect(200)).body;
    await ctx.prisma.employee.update({
      where: { id: worker.id },
      data: { managerId: otherManager.id },
    });
    await audit(row.id, manager).expect(403);
    await expect(
      ctx.app.get(TimeEntriesService).audit(row.id, captured),
    ).rejects.toMatchObject({ status: 403 });
    for (const who of [worker, otherManager, hr])
      expect((await audit(row.id, who).expect(200)).body).toEqual(history);
    await audit(row.id, foreign).expect(403);
  });

  it.each(['Manager', 'HRAdmin'] as const)(
    'denies a demoted %s even when their JWT/captured identity says otherwise',
    async (role) => {
      const row = await proxyEntry();
      const who = role === 'Manager' ? manager : hr;
      const captured = await identity(who);
      await audit(row.id, who).expect(200);
      await ctx.prisma.employee.update({
        where: { id: who.id },
        data: { role: 'Employee' },
      });
      await audit(row.id, who).expect(403);
      await expect(
        ctx.app.get(TimeEntriesService).audit(row.id, captured),
      ).rejects.toMatchObject({ status: 403 });
      const forged = { ...(await identity(foreign)), role: 'HRAdmin' as const };
      await expect(
        ctx.app.get(TimeEntriesService).audit(row.id, forged),
      ).rejects.toMatchObject({ status: 403 });
      expect((await audit(row.id).expect(200)).body).toHaveLength(1);
    },
  );

  it.each(['revoked', 'inactive'])(
    'rejects a %s audit session at HTTP (401) and at the captured-identity handler (403)',
    async (change) => {
      const row = await proxyEntry();
      const captured = await identity(manager);
      await ctx.prisma.employee.update({
        where: { id: manager.id },
        data:
          change === 'revoked'
            ? { authVersion: { increment: 1 } }
            : { isActive: false },
      });
      await audit(row.id, manager).expect(401);
      await expect(
        ctx.app.get(TimeEntriesService).audit(row.id, captured),
      ).rejects.toMatchObject({ status: 403 });
      expect((await audit(row.id, hr).expect(200)).body).toHaveLength(1);
    },
  );

  it('keeps Team audit-read rights separate from owner-only manual creation/correction', async () => {
    const row = await proxyEntry();
    const before = await ctx.prisma.timeEntryAudit.findMany();
    for (const who of [manager, hr, worker]) {
      await audit(row.id, who).expect(200);
      await ctx.http
        .post('/api/timeentries/manual')
        .set('Authorization', `Bearer ${who.token}`)
        .send({
          employeeId: worker.id,
          clockIn: IN,
          clockOut: OUT,
          reason: REASON,
        })
        .expect(403);
      await ctx.http
        .patch(`/api/timeentries/${row.id}/correct`)
        .set('Authorization', `Bearer ${who.token}`)
        .send({ revision: 0, clockIn: IN, clockOut: EXTENDED, reason: REASON })
        .expect(403);
    }
    expect(await ctx.prisma.timeEntry.findMany()).toEqual([row]);
    expect(await ctx.prisma.timeEntryAudit.findMany()).toEqual(before);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(1);
  });

  it('in installed Solo an HR owner reads only their own audit; historic Team/HR scope cannot expose foreign entries', async () => {
    const foreignRow = await proxyEntry();
    const ownRow = await entry(hr.id, 'Solo');
    await audit(foreignRow.id, hr).expect(200);
    await ctx.prisma.installationSettings.update({
      where: { id: 1 },
      data: { mode: 'Solo', ownerEmployeeId: hr.id },
    });
    await ctx.http
      .patch(`/api/timeentries/${ownRow.id}/correct`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ revision: 0, clockIn: IN, clockOut: EXTENDED, reason: REASON })
      .expect(200);
    const history = (await audit(ownRow.id, hr).expect(200)).body;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      timeEntryId: ownRow.id,
      actorId: hr.id,
      action: 'Corrected',
      reason: REASON,
      before: { clockIn: IN, clockOut: OUT },
      after: { clockIn: IN, clockOut: EXTENDED, approvalMode: 'Solo' },
    });
    await audit(foreignRow.id, hr).expect(403);
    await expect(
      ctx.app.get(TimeEntriesService).audit(foreignRow.id, await identity(hr)),
    ).rejects.toMatchObject({ status: 403 });
    for (const who of [worker, manager, otherManager])
      await audit(foreignRow.id, who).expect(403);
    await audit(ownRow.id, manager).expect(403);
    expect(await ctx.prisma.timeEntry.count()).toBe(2);
  });
});
