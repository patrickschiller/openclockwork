import type { Prisma } from '@prisma/client';
import type { JwtUser } from '../../../api/src/app/auth/jwt.strategy';
import { AbsencesService } from '../../../api/src/app/absences/absences.service';
import { EventsGateway } from '../../../api/src/app/events/events.gateway';
import { RequestNotificationService } from '../../../api/src/app/notifications/request-notification.service';
import { RequestsService } from '../../../api/src/app/requests/requests.service';
import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const FROM = '2026-05-04T00:00:00.000Z';
const TO = '2026-05-08T00:00:00.000Z';
const REASON = 'Recorded after employee contacted the team office';
const OPERATIONS = ['requests', 'absences'] as const;
type Operation = (typeof OPERATIONS)[number];
type Person = JwtUser & { token: string };

describe('Team proxy absence recording and application submission (#44)', () => {
  let ctx: TestContext;
  let manager: Person;
  let employee: Person;
  let substitute: Person;
  let foreignManager: Person;
  let foreignEmployee: Person;
  let hr: Person;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(() => jest.restoreAllMocks());
  beforeEach(async () => {
    await ctx.reset();
    async function person(
      name: string,
      role: Person['role'],
      managerId?: string,
    ): Promise<Person> {
      const row = await seedEmployee(ctx.prisma, {
        personalNo: name,
        firstName: name,
        lastName: 'Example',
        email: `${name}@test.local`,
        role,
        managerId,
      });
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        authVersion: row.authVersion,
        token: await login(ctx.http, row.email),
      };
    }
    manager = await person('manager', 'Manager');
    foreignManager = await person('foreign-manager', 'Manager');
    employee = await person('employee', 'Employee', manager.id);
    substitute = await person('substitute', 'Employee', manager.id);
    foreignEmployee = await person(
      'foreign-employee',
      'Employee',
      foreignManager.id,
    );
    hr = await person('hr', 'HRAdmin');
    await seedLeaveAllowance(ctx.prisma, employee.id, 2026, 5);
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode: 'Team', setupCompleted: true },
      update: { mode: 'Team', setupCompleted: true },
    });
  });

  function values(operation: Operation, extra: Record<string, unknown> = {}) {
    return operation === 'requests'
      ? { type: 'Vacation', from: FROM, to: TO, proxyReason: REASON, ...extra }
      : {
          kind: 'Sickness',
          from: '2026-05-04',
          to: '2026-05-08',
          proxyReason: REASON,
          ...extra,
        };
  }

  function post(operation: Operation, actor = manager, targetId = employee.id) {
    return ctx.http
      .post(`/api/team-cockpit/employees/${targetId}/${operation}`)
      .set('Authorization', `Bearer ${actor.token}`);
  }

  function createDirect(operation: Operation, actor: Person = manager) {
    return operation === 'requests'
      ? ctx.app.get(RequestsService).createProxy(
          employee.id,
          {
            type: 'Vacation',
            from: FROM,
            to: TO,
            proxyReason: REASON,
          },
          actor,
        )
      : ctx.app.get(AbsencesService).createProxy(
          employee.id,
          {
            kind: 'Sickness',
            from: '2026-05-04',
            to: '2026-05-08',
            proxyReason: REASON,
          },
          actor,
        );
  }

  it.each(OPERATIONS)(
    '%s requires authentication and an active assigned manager/HR, never self',
    async (operation) => {
      await ctx.http
        .post(`/api/team-cockpit/employees/${employee.id}/${operation}`)
        .send(values(operation))
        .expect(401);
      for (const [actor, target] of [
        [employee, employee.id],
        [substitute, employee.id],
        [foreignManager, employee.id],
        [manager, foreignEmployee.id],
        [manager, manager.id],
        [hr, hr.id],
      ] as const) {
        await post(operation, actor, target)
          .send(values(operation))
          .expect(403);
      }
      await ctx.prisma.employee.update({
        where: { id: employee.id },
        data: { isActive: false },
      });
      await post(operation).send(values(operation)).expect(403);
      await post(operation, hr).send(values(operation)).expect(403);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
      expect(await ctx.prisma.request.count()).toBe(0);
      expect(await ctx.prisma.absence.count()).toBe(0);
    },
  );

  it.each(OPERATIONS)(
    '%s uses route ownership and fresh authoritative actor identity in its audit',
    async (operation) => {
      const response = await post(operation)
        .send(
          values(operation, {
            employeeId: foreignEmployee.id,
            actorId: hr.id,
            actorRole: 'HRAdmin',
            status: 'Approved',
            workflowState: 'Approved',
            values: {
              employee: { id: foreignEmployee.id },
              actor: { id: hr.id },
            },
          }),
        )
        .expect(201);
      expect(response.body.employeeId).toBe(employee.id);
      const audit = await ctx.prisma.teamProxyAudit.findFirstOrThrow({
        where: { resourceId: response.body.id },
      });
      expect(audit).toMatchObject({
        actorId: manager.id,
        employeeId: employee.id,
        resourceKind: operation === 'requests' ? 'Request' : 'Absence',
        action:
          operation === 'requests' ? 'RequestSubmitted' : 'AbsenceRecorded',
        reason: REASON,
        values: {
          before: null,
          actor: { id: manager.id, role: 'Manager', firstName: 'manager' },
          employee: { id: employee.id, firstName: 'employee' },
          after: { employeeId: employee.id },
        },
      });
      expect(audit.occurredAt).toBeInstanceOf(Date);
      // Authoritative evidence remains unchanged when the employee's profile changes.
      await ctx.prisma.employee.update({
        where: { id: manager.id },
        data: { firstName: 'Renamed' },
      });
      expect(
        (
          await ctx.prisma.teamProxyAudit.findUniqueOrThrow({
            where: { id: audit.id },
          })
        ).values,
      ).toEqual(audit.values);
      if (operation === 'requests') {
        expect(response.body).toMatchObject({
          status: 'Submitted',
          workflowState: 'PendingManager',
          currentApproverId: manager.id,
        });
        expect(await ctx.prisma.requestEvent.findFirstOrThrow()).toMatchObject({
          kind: 'Submitted',
          actorId: manager.id,
          note: REASON,
        });
      }
    },
  );

  it.each(OPERATIONS)(
    'HR has organization-wide %s scope without approving its own submission',
    async (operation) => {
      await ctx.prisma.employee.update({
        where: { id: employee.id },
        data: { managerId: foreignManager.id },
      });
      const response = await post(operation, hr)
        .send(values(operation))
        .expect(201);
      const audit = await ctx.prisma.teamProxyAudit.findFirstOrThrow();
      expect(audit.actorId).toBe(hr.id);
      if (operation === 'requests') {
        expect(response.body).toMatchObject({
          workflowState: 'PendingManager',
          currentApproverId: foreignManager.id,
          hrConfirmedAt: null,
          approverId: null,
        });
      }
    },
  );

  it.each(OPERATIONS)(
    '%s requires a meaningful, bounded operational reason',
    async (operation) => {
      for (const proxyReason of [
        undefined,
        null,
        '',
        'four',
        '     ',
        'x'.repeat(1001),
      ]) {
        await post(operation)
          .send(values(operation, { proxyReason }))
          .expect(400);
      }
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
    },
  );

  it.each(OPERATIONS)(
    '%s rechecks role, session, assignment, active account and mode after the global lock',
    async (operation) => {
      const transitions: Array<
        (tx: Prisma.TransactionClient) => Promise<unknown>
      > = [
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
            where: { id: employee.id },
            data: { managerId: foreignManager.id },
          }),
        (tx) =>
          tx.employee.update({
            where: { id: manager.id },
            data: { isActive: false },
          }),
        (tx) =>
          tx.employee.update({
            where: { id: employee.id },
            data: { isActive: false },
          }),
        (tx) =>
          tx.installationSettings.update({
            where: { id: 1 },
            data: { mode: 'Solo', ownerEmployeeId: hr.id },
          }),
      ];
      for (const transition of transitions) {
        let pending!: Promise<unknown>;
        await ctx.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
          pending = createDirect(operation).catch(
            (error: { status: number }) => ({ status: error.status }),
          );
          await transition(tx);
        });
        expect(await pending).toEqual({ status: 403 });
        await ctx.prisma.employee.update({
          where: { id: manager.id },
          data: { role: 'Manager', isActive: true, authVersion: 0 },
        });
        await ctx.prisma.employee.update({
          where: { id: employee.id },
          data: { managerId: manager.id, isActive: true },
        });
        await ctx.prisma.installationSettings.update({
          where: { id: 1 },
          data: { mode: 'Team', ownerEmployeeId: null },
        });
      }
      expect(await ctx.prisma.request.count()).toBe(0);
      expect(await ctx.prisma.absence.count()).toBe(0);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
    },
  );

  it('submits Vacation through substitute → manager → HR with the actual proxy actor and normal notifications', async () => {
    const notifications = jest.spyOn(
      ctx.app.get(RequestNotificationService),
      'notifyTransitioned',
    );
    const created = await post('requests')
      .send(
        values('requests', {
          substituteId: substitute.id,
          halfDayStart: true,
          reason: 'Family trip',
        }),
      )
      .expect(201);
    expect(created.body).toMatchObject({
      employeeId: employee.id,
      calculatedDays: 4.5,
      workflowState: 'PendingSubstitute',
      currentApproverId: null,
      substituteId: substitute.id,
      reason: 'Family trip',
    });
    expect(notifications).toHaveBeenCalledWith(
      expect.objectContaining({ id: created.body.id }),
      'Submitted',
      manager.id,
    );
    const accepted = await ctx.http
      .post(`/api/requests/${created.body.id}/substitute/accept`)
      .set('Authorization', `Bearer ${substitute.token}`)
      .send({ actorId: hr.id })
      .expect(201);
    expect(accepted.body).toMatchObject({
      workflowState: 'PendingManager',
      currentApproverId: manager.id,
    });
    const approved = await ctx.http
      .post(`/api/requests/${created.body.id}/manager-approve`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ actorId: employee.id, requiresHrConfirmation: true })
      .expect(201);
    expect(approved.body.workflowState).toBe('PendingHr');
    await ctx.http
      .post(`/api/requests/${created.body.id}/hr-confirm`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ actorId: manager.id })
      .expect(201);
    const events = await ctx.prisma.requestEvent.findMany({
      where: { requestId: created.body.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((event) => [event.kind, event.actorId])).toEqual([
      ['Submitted', manager.id],
      ['SubstituteAccepted', substitute.id],
      ['ManagerApproved', manager.id],
      ['HrConfirmed', hr.id],
    ]);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(1);
  });

  it.each(['HomeOffice', 'SpecialLeave'])(
    'submits %s without implicit approval',
    async (type) => {
      const created = await post('requests')
        .send(values('requests', { type }))
        .expect(201);
      expect(created.body).toMatchObject({
        type,
        workflowState: 'PendingManager',
        approverId: null,
        currentApproverId: manager.id,
      });
    },
  );

  it('uses normal vacation allowance, holiday, overlap and half-day/substitute rules', async () => {
    await seedLeaveAllowance(ctx.prisma, employee.id, 2026, 4);
    await post('requests').send(values('requests')).expect(409);
    await ctx.prisma.employee.update({
      where: { id: employee.id },
      data: { holidayDates: ['2026-05-06'] },
    });
    const result = await post('requests')
      .send(values('requests', { halfDayStart: true }))
      .expect(201);
    expect(result.body.calculatedDays).toBe(3.5);
    await post('requests').send(values('requests')).expect(409);
    const ordinary = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ employeeId: employee.id, from: FROM, to: TO })
      .expect(409);
    expect(ordinary.body.message).toContain('overlaps');
    expect(await ctx.prisma.request.count()).toBe(1);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(1);
  });

  it.each([
    { type: 'TimeAdjustment' },
    { type: 'Sickness' },
    { from: '2026-02-30', to: '2026-03-02' },
    { to: '2026-05-03' },
    { from: '2026-12-31', to: '2027-01-04' },
    { type: 'HomeOffice', halfDayStart: true },
    { type: 'SpecialLeave', halfDayEnd: true },
    {
      type: 'HomeOffice',
      substituteId: '00000000-0000-4000-8000-000000000001',
    },
    { substituteId: 'not-a-uuid' },
    { from: '2026-05-09', to: '2026-05-10', halfDayStart: true },
  ])('rejects invalid proxy request values %j', async (extra) => {
    await post('requests').send(values('requests', extra)).expect(400);
    expect(await ctx.prisma.request.count()).toBe(0);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
  });

  it('rejects beneficiary, missing or inactive substitutes without trusting forged acceptance', async () => {
    await ctx.prisma.employee.update({
      where: { id: substitute.id },
      data: { isActive: false },
    });
    for (const substituteId of [
      employee.id,
      substitute.id,
      '00000000-0000-4000-8000-000000000001',
    ]) {
      await post('requests')
        .send(
          values('requests', {
            substituteId,
            substituteAcceptedAt: FROM,
            workflowState: 'Approved',
          }),
        )
        .expect(400);
    }
    expect(await ctx.prisma.requestEvent.count()).toBe(0);
  });

  it('does not accept a proxy correction target or change owner-only revision/resubmission', async () => {
    const created = await post('requests')
      .send(
        values('requests', {
          targetTimeEntryId: foreignEmployee.id,
          expectedTargetRevision: 99,
        }),
      )
      .expect(201);
    expect(created.body).toMatchObject({
      targetTimeEntryId: null,
      expectedTargetRevision: null,
    });
    const returned = await ctx.http
      .post(`/api/requests/${created.body.id}/return`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ note: 'Please shorten', actorId: manager.id })
      .expect(201);
    const edit = {
      from: FROM,
      to: FROM,
      expectedUpdatedAt: returned.body.updatedAt,
      employeeId: manager.id,
      halfDayEnd: true,
    };
    for (const actor of [manager, hr, substitute]) {
      await ctx.http
        .patch(`/api/requests/${created.body.id}`)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(edit)
        .expect(403);
      await ctx.http
        .post(`/api/requests/${created.body.id}/resubmit`)
        .set('Authorization', `Bearer ${actor.token}`)
        .send(edit)
        .expect(403);
    }
    const resubmitted = await ctx.http
      .post(`/api/requests/${created.body.id}/resubmit`)
      .set('Authorization', `Bearer ${employee.token}`)
      .send(edit)
      .expect(201);
    expect(resubmitted.body).toMatchObject({
      id: created.body.id,
      employeeId: employee.id,
      calculatedDays: 0.5,
      workflowState: 'PendingManager',
    });
    const events = await ctx.prisma.requestEvent.findMany({
      where: { requestId: created.body.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((event) => [event.kind, event.actorId])).toEqual([
      ['Submitted', manager.id],
      ['Returned', manager.id],
      ['Resubmitted', employee.id],
    ]);
    const audit = await ctx.prisma.teamProxyAudit.findFirstOrThrow();
    expect(audit.values).toMatchObject({
      after: { to: TO, calculatedDays: 5 },
    });
  });

  it.each(['Sickness', 'Training', 'Flextime'])(
    'records %s without workflow, medical note or fictitious certification',
    async (kind) => {
      const broadcast = jest
        .spyOn(ctx.app.get(EventsGateway), 'broadcast')
        .mockResolvedValue(undefined);
      const created = await post('absences')
        .send(values('absences', { kind }))
        .expect(201);
      expect(created.body).toMatchObject({
        employeeId: employee.id,
        kind,
        from: '2026-05-04',
        to: '2026-05-08',
        certified: false,
        note: null,
      });
      expect(created.body).not.toHaveProperty('workflowState');
      expect(await ctx.prisma.request.count()).toBe(0);
      expect(await ctx.prisma.requestEvent.count()).toBe(0);
      expect(broadcast).toHaveBeenCalledWith('absence:created', {
        id: created.body.id,
        employeeId: employee.id,
      });
      expect(JSON.stringify(broadcast.mock.calls)).not.toContain(REASON);
      const audit = await ctx.prisma.teamProxyAudit.findFirstOrThrow();
      expect(audit).toMatchObject({
        action: 'AbsenceRecorded',
        reason: REASON,
        values: { after: { kind, certified: false, note: null } },
      });
    },
  );

  it.each([
    { kind: 'Vacation' },
    { from: '2026-02-30', to: '2026-03-02' },
    { from: '2026-02-29', to: '2026-03-02' },
    { from: '2026-05-04T00:00:00.000Z' },
    { from: '2026-5-04' },
    { to: '2026-05-03' },
    { note: 'Private diagnosis' },
    { diagnosis: 'Private diagnosis' },
    { certified: true },
    { certified: false },
  ])(
    'rejects invalid dates, application kinds and medical proxy fields %j',
    async (extra) => {
      await post('absences').send(values('absences', extra)).expect(400);
      expect(await ctx.prisma.absence.count()).toBe(0);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
    },
  );

  it('serializes concurrent ordinary and proxy applications without double spending vacation', async () => {
    const [normal, proxy] = await Promise.all([
      ctx.http
        .post('/api/requests/vacation')
        .set('Authorization', `Bearer ${employee.token}`)
        .send({ employeeId: employee.id, from: FROM, to: TO }),
      post('requests').send(values('requests')),
    ]);
    expect([normal.status, proxy.status].sort()).toEqual([201, 409]);
    expect(await ctx.prisma.request.count()).toBe(1);
    expect(await ctx.prisma.requestEvent.count()).toBe(1);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(
      proxy.status === 201 ? 1 : 0,
    );
  });

  it('accepts a true leap-day recorded absence', async () => {
    const created = await post('absences')
      .send(values('absences', { from: '2028-02-29', to: '2028-02-29' }))
      .expect(201);
    expect(created.body).toMatchObject({
      from: '2028-02-29',
      to: '2028-02-29',
    });
  });

  it('serializes concurrent ordinary/proxy recording using the persisted calendar days', async () => {
    const [normal, proxy] = await Promise.all([
      ctx.http
        .post('/api/absences')
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          employeeId: employee.id,
          kind: 'Training',
          from: '2026-05-04T15:00:00.000Z',
          to: '2026-05-04T18:00:00.000Z',
        }),
      post('absences').send(values('absences', { to: '2026-05-04' })),
    ]);
    expect([normal.status, proxy.status].sort()).toEqual([201, 409]);
    expect(await ctx.prisma.absence.count()).toBe(1);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(
      proxy.status === 201 ? 1 : 0,
    );
  });

  it('serializes ordinary update with proxy creation and permits non-overlapping calendar days', async () => {
    const original = await ctx.http
      .post('/api/absences')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        employeeId: employee.id,
        kind: 'Training',
        from: '2026-05-11T10:00:00.000Z',
        to: '2026-05-11T12:00:00.000Z',
      })
      .expect(201);
    const [normal, proxy] = await Promise.all([
      ctx.http
        .put(`/api/absences/${original.body.id}`)
        .set('Authorization', `Bearer ${employee.token}`)
        .send({
          from: '2026-05-04T15:00:00.000Z',
          to: '2026-05-04T18:00:00.000Z',
        }),
      post('absences').send(values('absences', { to: '2026-05-04' })),
    ]);
    expect([normal.status, proxy.status].sort()).toEqual(
      proxy.status === 201 ? [201, 409] : [200, 409],
    );
    const rows = await ctx.prisma.absence.findMany({
      where: { employeeId: employee.id, from: new Date(FROM) },
    });
    expect(rows).toHaveLength(1);
    await post('absences')
      .send(values('absences', { from: '2026-05-05', to: '2026-05-05' }))
      .expect(201);
  });

  it('serializes normal removal with proxy recording without leaving overlapping rows', async () => {
    const original = await ctx.http
      .post('/api/absences')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ employeeId: employee.id, from: FROM, to: TO })
      .expect(201);
    const [removed, proxy] = await Promise.all([
      ctx.http
        .delete(`/api/absences/${original.body.id}`)
        .set('Authorization', `Bearer ${employee.token}`),
      post('absences').send(values('absences')),
    ]);
    expect(removed.status).toBe(204);
    expect([201, 409]).toContain(proxy.status);
    expect(await ctx.prisma.absence.count()).toBe(proxy.status === 201 ? 1 : 0);
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(
      proxy.status === 201 ? 1 : 0,
    );
  });

  it('preserves normal self/assigned-manager/HR policy for create/update/remove and emits safe invalidations', async () => {
    const broadcast = jest
      .spyOn(ctx.app.get(EventsGateway), 'broadcast')
      .mockResolvedValue(undefined);
    const normal = await ctx.http
      .post('/api/absences')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        employeeId: employee.id,
        kind: 'Sickness',
        from: FROM,
        to: FROM,
        certified: true,
        note: 'Original private note',
      })
      .expect(201);
    for (const actor of [substitute, foreignManager]) {
      await ctx.http
        .put(`/api/absences/${normal.body.id}`)
        .set('Authorization', `Bearer ${actor.token}`)
        .send({ certified: false })
        .expect(403);
      await ctx.http
        .delete(`/api/absences/${normal.body.id}`)
        .set('Authorization', `Bearer ${actor.token}`)
        .expect(403);
    }
    await ctx.http
      .put(`/api/absences/${normal.body.id}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ certified: false })
      .expect(200);
    await ctx.http
      .put(`/api/absences/${normal.body.id}`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ note: null })
      .expect(200);
    await ctx.http
      .delete(`/api/absences/${normal.body.id}`)
      .set('Authorization', `Bearer ${employee.token}`)
      .expect(204);
    expect(broadcast).toHaveBeenCalledWith('absence:updated', {
      id: normal.body.id,
      employeeId: employee.id,
      deleted: true,
    });
    expect(JSON.stringify(broadcast.mock.calls)).not.toContain(
      'Original private note',
    );
    expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
  });

  it('ordinary mutations recheck assignment and token freshness under the same global lock', async () => {
    const service = ctx.app.get(AbsencesService);
    const existing = await service.create(employee, {
      employeeId: employee.id,
      kind: 'Training',
      from: FROM,
      to: FROM,
    });
    for (const action of [
      () =>
        service.create(manager, { employeeId: employee.id, from: TO, to: TO }),
      () => service.update(manager, existing.id, { note: 'Must not be saved' }),
      () => service.remove(manager, existing.id),
    ]) {
      let pending!: Promise<unknown>;
      await ctx.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
        pending = action().catch((error: { status: number }) => ({
          status: error.status,
        }));
        await tx.employee.update({
          where: { id: employee.id },
          data: { managerId: foreignManager.id },
        });
      });
      expect(await pending).toEqual({ status: 403 });
      await ctx.prisma.employee.update({
        where: { id: employee.id },
        data: { managerId: manager.id },
      });
    }
    await ctx.prisma.employee.update({
      where: { id: manager.id },
      data: { authVersion: 1 },
    });
    await expect(
      service.update(manager, existing.id, { note: 'Stale token' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await ctx.prisma.absence.findUniqueOrThrow({
        where: { id: existing.id },
      }),
    ).toMatchObject({ note: null });
  });

  it.each(OPERATIONS)(
    '%s and its event/audit roll back atomically if audit persistence fails',
    async (operation) => {
      const original = ctx.prisma.$transaction.bind(ctx.prisma);
      const failAudit = async (
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        original(async (tx) => {
          const audit = jest
            .spyOn(tx.teamProxyAudit, 'create')
            .mockRejectedValueOnce(new Error('Audit storage unavailable'));
          try {
            return await callback(tx);
          } finally {
            audit.mockRestore();
          }
        });
      jest
        .spyOn(ctx.prisma, '$transaction')
        .mockImplementationOnce(
          failAudit as unknown as typeof ctx.prisma.$transaction,
        );
      const notifications = jest.spyOn(
        ctx.app.get(RequestNotificationService),
        'notifyTransitioned',
      );
      const broadcast = jest
        .spyOn(ctx.app.get(EventsGateway), 'broadcast')
        .mockResolvedValue(undefined);
      await expect(createDirect(operation)).rejects.toThrow(
        'Audit storage unavailable',
      );
      expect(await ctx.prisma.request.count()).toBe(0);
      expect(await ctx.prisma.requestEvent.count()).toBe(0);
      expect(await ctx.prisma.absence.count()).toBe(0);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
      expect(notifications).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    },
  );
});
