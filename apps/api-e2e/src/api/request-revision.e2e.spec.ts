import { EmployeesService } from '../../../api/src/app/employees/employees.service';
import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = 2026;
const FROM = '2026-05-04T00:00:00.000Z';
const TO = '2026-05-08T00:00:00.000Z';

describe('Returned requests — owner revision and resubmission (#42)', () => {
  let ctx: TestContext;
  let owner: { id: string; token: string };
  let manager: { id: string; token: string };
  let other: { id: string; token: string };
  let hr: { id: string; token: string };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    async function person(
      personalNo: string,
      role: 'Employee' | 'Manager' | 'HRAdmin',
      managerId?: string,
    ) {
      const e = await seedEmployee(ctx.prisma, {
        personalNo,
        firstName: personalNo,
        lastName: 'Example',
        email: `${personalNo}@test.local`,
        role,
        managerId,
      });
      return { id: e.id, token: await login(ctx.http, e.email) };
    }
    manager = await person('manager', 'Manager');
    owner = await person('owner', 'Employee', manager.id);
    other = await person('other', 'Employee', manager.id);
    hr = await person('hr', 'HRAdmin');
    await seedLeaveAllowance(ctx.prisma, owner.id, YEAR, 5);
  });

  async function create(type = 'Vacation', substituteId?: string) {
    const r = await ctx.http
      .post(type === 'Vacation' ? '/api/requests/vacation' : '/api/requests')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        employeeId: owner.id,
        type,
        from: FROM,
        to: TO,
        substituteId,
        reason: 'Original',
      })
      .expect(201);
    return r.body;
  }
  async function returned(type = 'Vacation') {
    const r = await create(type);
    const response = await ctx.http
      .post(`/api/requests/${r.id}/return`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ actorId: manager.id, note: 'Bitte kürzen' })
      .expect(201);
    return response.body;
  }
  function values(r: { updatedAt: string }, extra = {}) {
    return {
      from: FROM,
      to: TO,
      reason: 'Korrigiert',
      expectedUpdatedAt: r.updatedAt,
      ...extra,
    };
  }
  function patch(id: string, token = owner.token) {
    return ctx.http
      .patch(`/api/requests/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }
  function submit(id: string, token = owner.token) {
    return ctx.http
      .post(`/api/requests/${id}/resubmit`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('manager return → save → resubmit retains ID/history, excludes self, recalculates halves and resets assignments', async () => {
    const r = await returned();
    expect(r).toMatchObject({
      workflowState: 'Draft',
      status: 'Submitted',
      employeeName: 'owner Example',
      decisionNote: 'Bitte kürzen',
    });
    const saved = await patch(r.id)
      .send(values(r, { halfDayStart: true }))
      .expect(200);
    expect(saved.body).toMatchObject({
      id: r.id,
      workflowState: 'Draft',
      currentApproverId: null,
      approverId: null,
      calculatedDays: 4.5,
    });
    expect(saved.body.updatedAt).not.toBe(r.updatedAt);
    // Old decision data cannot leak into the new approval cycle.
    await ctx.prisma.request.update({
      where: { id: r.id },
      data: {
        approverId: manager.id,
        hrConfirmedAt: new Date(),
        decidedAt: new Date(),
        cancelledAt: new Date(),
        substituteAcceptedAt: new Date(),
      },
    });
    const fresh = await ctx.http
      .get(`/api/requests/${r.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const result = await submit(r.id)
      .send(values(fresh.body, { halfDayStart: true }))
      .expect(201);
    expect(result.body).toMatchObject({
      id: r.id,
      workflowState: 'PendingManager',
      currentApproverId: manager.id,
      calculatedDays: 4.5,
      approverId: null,
      substituteAcceptedAt: null,
      hrConfirmedAt: null,
      cancelledAt: null,
      decidedAt: null,
      decisionNote: null,
    });
    expect(await ctx.prisma.request.count()).toBe(1);
    const events = await ctx.prisma.requestEvent.findMany({
      where: { requestId: r.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.kind)).toEqual([
      'Submitted',
      'Returned',
      'Resubmitted',
    ]);
    expect(events[1].note).toBe('Bitte kürzen');
    const listed = await ctx.http
      .get(`/api/requests?currentApproverId=${manager.id}`)
      .set('Authorization', `Bearer ${manager.token}`)
      .expect(200);
    expect(listed.body[0].employeeName).toBe('owner Example');
  });

  it('initializes a missing allowance inside the request transaction without blocking itself', async () => {
    await ctx.prisma.employeeLeaveAllowance.deleteMany();
    const r = await create();
    expect(r.calculatedDays).toBe(5);
    expect(await ctx.prisma.employeeLeaveAllowance.count()).toBe(1);
  });

  it('substitute decline → edit → resubmit restarts substitute approval and preserves the decline reason', async () => {
    const r = await create('Vacation', other.id);
    const declined = await ctx.http
      .post(`/api/requests/${r.id}/substitute/decline`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ actorId: other.id, note: 'Bin selbst weg' })
      .expect(201);
    expect(declined.body).toMatchObject({
      workflowState: 'Draft',
      decisionNote: 'Bin selbst weg',
    });
    const result = await submit(r.id)
      .send(values(declined.body, { substituteId: other.id, halfDayEnd: true }))
      .expect(201);
    expect(result.body).toMatchObject({
      id: r.id,
      workflowState: 'PendingSubstitute',
      currentApproverId: null,
      substituteId: other.id,
      substituteAcceptedAt: null,
      calculatedDays: 4.5,
    });
    await ctx.http
      .post(`/api/requests/${r.id}/substitute/accept`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ actorId: other.id })
      .expect(201);
    const events = await ctx.prisma.requestEvent.findMany({
      where: { requestId: r.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.kind)).toEqual([
      'Submitted',
      'SubstituteDeclined',
      'Resubmitted',
      'SubstituteAccepted',
    ]);
  });

  it('forbids other employees, manager and HR; ignores spoofed owner identity', async () => {
    const r = await returned();
    for (const actor of [other, manager, hr]) {
      await patch(r.id, actor.token)
        .send(values(r, { employeeId: owner.id }))
        .expect(403);
      await submit(r.id, actor.token)
        .send(values(r, { employeeId: owner.id }))
        .expect(403);
    }
    await ctx.http.patch(`/api/requests/${r.id}`).send(values(r)).expect(401);
    expect(await ctx.prisma.requestEvent.count()).toBe(2);
  });

  it.each([
    'Submitted',
    'PendingSubstitute',
    'PendingManager',
    'PendingHr',
    'Approved',
    'Rejected',
    'Cancelled',
  ] as const)(
    'refuses editing/resubmitting %s even with legacy status Submitted',
    async (state) => {
      const r = await returned();
      const current = await ctx.prisma.request.update({
        where: { id: r.id },
        data: { workflowState: state, status: 'Submitted' },
      });
      await patch(r.id)
        .send(values({ updatedAt: current.updatedAt.toISOString() }))
        .expect(409);
      await submit(r.id)
        .send(values({ updatedAt: current.updatedAt.toISOString() }))
        .expect(409);
    },
  );

  it('rechecks vacation balance on both save and resubmit; does not spend the allowance twice', async () => {
    const r = await returned();
    await seedLeaveAllowance(ctx.prisma, owner.id, YEAR, 0.5);
    await patch(r.id).send(values(r)).expect(409);
    await submit(r.id).send(values(r)).expect(409);
    const result = await submit(r.id)
      .send(values(r, { to: FROM, halfDayStart: true }))
      .expect(201);
    expect(result.body.calculatedDays).toBe(0.5);
  });

  it('excludes only its own overlap reservation, not another draft/active request', async () => {
    const r = await returned();
    await ctx.prisma.request.create({
      data: {
        employeeId: owner.id,
        type: 'HomeOffice',
        from: new Date(FROM),
        to: new Date(FROM),
        workflowState: 'Draft',
        status: 'Submitted',
      },
    });
    await patch(r.id).send(values(r)).expect(409);
    await submit(r.id).send(values(r)).expect(409);
    expect(
      (await ctx.prisma.request.findUniqueOrThrow({ where: { id: r.id } }))
        .workflowState,
    ).toBe('Draft');
  });

  it('revalidates dates, zero workdays, substitute and required version', async () => {
    const r = await returned();
    for (const extra of [
      { from: TO, to: FROM },
      { to: '2027-01-01T00:00:00.000Z' },
      { from: '2026-05-09T00:00:00.000Z', to: '2026-05-10T00:00:00.000Z' },
      { substituteId: owner.id },
      { substituteId: '00000000-0000-0000-0000-000000000001' },
      { from: 'invalid' },
      { expectedUpdatedAt: undefined },
    ]) {
      await submit(r.id).send(values(r, extra)).expect(400);
    }
    await ctx.prisma.employee.update({
      where: { id: other.id },
      data: { isActive: false },
    });
    await submit(r.id)
      .send(values(r, { substituteId: other.id }))
      .expect(400);
  });

  it('preserves SpecialLeave attachments and immutable type/owner', async () => {
    const r = await returned('SpecialLeave');
    const attachment = await ctx.prisma.requestAttachment.create({
      data: {
        requestId: r.id,
        fileName: 'synthetic.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        storageKey: 'synthetic-only',
        uploadedById: owner.id,
      },
    });
    const result = await submit(r.id)
      .send(values(r, { type: 'Vacation', employeeId: other.id }))
      .expect(201);
    expect(result.body).toMatchObject({
      id: r.id,
      type: 'SpecialLeave',
      employeeId: owner.id,
    });
    expect(
      await ctx.prisma.requestAttachment.findUnique({
        where: { id: attachment.id },
      }),
    ).toMatchObject({ requestId: r.id, storageKey: 'synthetic-only' });
  });

  it('revalidates TimeAdjustment overlap and off-hours approval', async () => {
    const r = await returned('TimeAdjustment');
    const from = '2026-05-04T04:00:00.000Z'; // before the frame in UTC/Berlin
    const to = '2026-05-04T08:00:00.000Z';
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: owner.id,
        clockIn: new Date(from),
        clockOut: new Date(to),
        source: 'Manual',
        status: 'Approved',
      },
    });
    await submit(r.id).send(values(r, { from, to })).expect(409);
    await ctx.prisma.timeEntry.deleteMany();
    await submit(r.id)
      .send(values(r, { from, to: from }))
      .expect(400);
    const result = await submit(r.id).send(values(r, { from, to })).expect(201);
    expect(result.body.requiresApproval).toBe(true);
  });

  it('rejects stale edits and simultaneous resubmissions with no duplicate event', async () => {
    const r = await returned();
    const changed = await patch(r.id)
      .send(values(r, { reason: 'First tab' }))
      .expect(200);
    await patch(r.id)
      .send(values(r, { reason: 'Stale tab' }))
      .expect(409);
    await submit(r.id).send(values(r)).expect(409);
    const results = await Promise.all([
      submit(r.id).send(values(changed.body)),
      submit(r.id).send(values(changed.body)),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(
      await ctx.prisma.requestEvent.count({
        where: { requestId: r.id, kind: 'Resubmitted' },
      }),
    ).toBe(1);
  });

  it('does not let an in-flight decision overwrite a returned and resubmitted version (ABA)', async () => {
    const r = await create();
    const employees = ctx.app.get(EmployeesService);
    const original = employees.getById.bind(employees);
    let release!: () => void;
    let arrived!: () => void;
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let delayOnce = true;
    const spy = jest
      .spyOn(employees, 'getById')
      .mockImplementation(async (id) => {
        const employee = await original(id);
        if (id === manager.id && delayOnce) {
          delayOnce = false;
          arrived();
          await barrier;
        }
        return employee;
      });
    const oldDecision = ctx.http
      .post(`/api/requests/${r.id}/manager-approve`)
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ actorId: manager.id })
      .then((res) => res);
    try {
      await waiting;
      const revised = await ctx.http
        .post(`/api/requests/${r.id}/return`)
        .set('Authorization', `Bearer ${hr.token}`)
        .send({ actorId: hr.id, note: 'Neue Angaben nötig' })
        .expect(201);
      await submit(r.id).send(values(revised.body)).expect(201);
      release();
      expect((await oldDecision).status).toBe(409);
      expect(
        (await ctx.prisma.request.findUniqueOrThrow({ where: { id: r.id } }))
          .workflowState,
      ).toBe('PendingManager');
      expect(
        await ctx.prisma.requestEvent.count({
          where: { requestId: r.id, kind: 'ManagerApproved' },
        }),
      ).toBe(0);
    } finally {
      release();
      spy.mockRestore();
    }
  });

  it('serializes competing drafts so parallel submissions cannot overspend vacation', async () => {
    const a = await returned();
    const b = await ctx.prisma.request.create({
      data: {
        employeeId: owner.id,
        type: 'Vacation',
        from: new Date('2026-05-11'),
        to: new Date('2026-05-15'),
        workflowState: 'Draft',
        calculatedDays: 5,
      },
    });
    const results = await Promise.all([
      submit(a.id).send(values(a)),
      submit(b.id).send(
        values(
          { updatedAt: b.updatedAt.toISOString() },
          { from: b.from.toISOString(), to: b.to.toISOString() },
        ),
      ),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(
      await ctx.prisma.request.count({
        where: { workflowState: 'PendingManager' },
      }),
    ).toBe(1);
  });
});
