import { randomUUID } from 'node:crypto';
import { calculateCaptureSummaries } from '../../../api/src/app/time-entries/capture-summary';
import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

const interval = {
  clockIn: '2025-09-02T08:00:00.000Z',
  clockOut: '2025-09-02T15:00:00.000Z',
};
const rules = [{ afterMinutes: 360, breakMinutes: 30 }];

describe('Solo working-time actions', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  async function fixture(breakRules = rules) {
    const owner = await seedEmployee(ctx.prisma, {
      personalNo: 'SOLO-1',
      firstName: 'Solo',
      lastName: 'Owner',
      email: 'time-owner@test.local',
      role: 'HRAdmin',
    });
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode: 'Solo', ownerEmployeeId: owner.id, setupCompleted: true },
      update: { mode: 'Solo', ownerEmployeeId: owner.id, setupCompleted: true },
    });
    const policy = await ctx.prisma.soloPolicy.create({
      data: {
        employeeId: owner.id,
        effectiveFrom: new Date('2020-01-01'),
        breakRules,
      },
    });
    const token = await login(ctx.http, owner.email);
    const auth = `Bearer ${token}`;
    return { owner, policy, auth };
  }

  it('records metadata, exact net time and private notes immediately without a request', async () => {
    const { owner, auth } = await fixture();
    const result = await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send({
        ...interval,
        activity: 'Customer implementation',
        note: 'Private review note',
        billable: true,
      })
      .expect(201);
    expect(result.body).toMatchObject({
      employeeId: owner.id,
      source: 'Manual',
      status: 'Approved',
      requiresApproval: false,
      approvalMode: 'Solo',
      revision: 0,
      billable: true,
      note: 'Private review note',
      summary: { grossMinutes: 420, breakMinutes: 30, netMinutes: 390 },
    });
    expect(result.body.captureGroupId).toBeTruthy();
    expect(await ctx.prisma.request.count()).toBe(0);
    const audit = await ctx.http
      .get(`/api/timeentries/${result.body.id}/audit`)
      .set('Authorization', auth)
      .expect(200);
    expect(audit.body).toHaveLength(1);
    expect(audit.body[0]).toMatchObject({
      action: 'ManualCreated',
      actorId: owner.id,
      before: null,
      after: { note: 'Private review note', summary: result.body.summary },
    });
  });

  it('requires offset-resolved positive past intervals and rejects overlaps while allowing adjacent work', async () => {
    const { auth } = await fixture([]);
    for (const data of [
      { clockIn: interval.clockOut, clockOut: interval.clockIn },
      { clockIn: interval.clockIn, clockOut: interval.clockIn },
      { clockIn: '2025-09-02T08:00:00', clockOut: interval.clockOut },
      { clockIn: interval.clockIn, clockOut: '2099-01-01T08:00:00Z' },
    ])
      await ctx.http
        .post('/api/timeentries/manual')
        .set('Authorization', auth)
        .send(data)
        .expect(400);
    await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send(interval)
      .expect(201);
    await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send({
        clockIn: '2025-09-02T14:00:00Z',
        clockOut: '2025-09-02T16:00:00Z',
      })
      .expect(409);
    await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send({ clockIn: interval.clockOut, clockOut: '2025-09-02T16:00:00Z' })
      .expect(201);
  });

  it('serializes concurrent manual inserts and does not create a losing audit row', async () => {
    const { auth } = await fixture();
    const responses = await Promise.all(
      [1, 2].map(() =>
        ctx.http
          .post('/api/timeentries/manual')
          .set('Authorization', auth)
          .send(interval),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    expect(await ctx.prisma.timeEntryAudit.count()).toBe(1);
  });

  it('protects corrections with revision, overlap detection, reasons and before/after summaries', async () => {
    const { auth } = await fixture();
    const created = await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send(interval)
      .expect(201);
    const id = created.body.id;
    await ctx.http
      .patch(`/api/timeentries/${id}/correct`)
      .set('Authorization', auth)
      .send({ ...interval, revision: 0, reason: '  ' })
      .expect(400);
    const responses = await Promise.all([
      ctx.http
        .patch(`/api/timeentries/${id}/correct`)
        .set('Authorization', auth)
        .send({
          ...interval,
          clockOut: '2025-09-02T16:00:00Z',
          revision: 0,
          reason: 'Forgot final hour',
        }),
      ctx.http
        .patch(`/api/timeentries/${id}/correct`)
        .set('Authorization', auth)
        .send({
          ...interval,
          clockOut: '2025-09-02T16:00:00Z',
          revision: 0,
          reason: 'Other browser tab',
        }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      responses.find((response) => response.status === 200)?.body,
    ).toMatchObject({
      revision: 1,
      status: 'Approved',
      summary: { grossMinutes: 480, breakMinutes: 30, netMinutes: 450 },
    });
    await ctx.http
      .patch(`/api/timeentries/${id}`)
      .set('Authorization', auth)
      .send({ activity: 'Stale change', revision: 0 })
      .expect(409);
    const audit = await ctx.http
      .get(`/api/timeentries/${id}/audit`)
      .set('Authorization', auth)
      .expect(200);
    expect(audit.body).toHaveLength(2);
    expect(
      audit.body.find(
        (event: { action: string }) => event.action === 'Corrected',
      ),
    ).toMatchObject({
      before: { revision: 0, summary: { netMinutes: 390 } },
      after: { revision: 1, summary: { netMinutes: 450 } },
    });
  });

  it('keeps a voided entry and audit, excludes its totals, and permits replacing the interval', async () => {
    const { owner, auth } = await fixture();
    const created = await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send(interval)
      .expect(201);
    const result = await ctx.http
      .post(`/api/timeentries/${created.body.id}/void`)
      .set('Authorization', auth)
      .send({ revision: 0, reason: 'Duplicate work imported' })
      .expect(201);
    expect(result.body).toMatchObject({ revision: 1, summary: null });
    expect(result.body.voidedAt).toBeTruthy();
    expect(await ctx.prisma.timeEntry.count()).toBe(1);
    const list = await ctx.http
      .get(`/api/timeentries?employeeId=${owner.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(list.body[0].summary).toBeNull();
    await ctx.http
      .patch(`/api/timeentries/${created.body.id}/correct`)
      .set('Authorization', auth)
      .send({ ...interval, revision: 1, reason: 'Attempt to reuse' })
      .expect(409);
    await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send(interval)
      .expect(201);
    expect(
      await ctx.prisma.timeEntryAudit.count({ where: { action: 'Voided' } }),
    ).toBe(1);
  });

  it('requires owner scope even when the owner has the HRAdmin role', async () => {
    const { auth } = await fixture();
    const former = await seedEmployee(ctx.prisma, {
      personalNo: 'OLD',
      firstName: 'Former',
      lastName: 'Employee',
      email: 'former@test.local',
    });
    await ctx.prisma.employee.update({
      where: { id: former.id },
      data: { isActive: false },
    });
    const entry = await ctx.prisma.timeEntry.create({
      data: {
        employeeId: former.id,
        clockIn: new Date(interval.clockIn),
        clockOut: new Date(interval.clockOut),
        status: 'Approved',
      },
    });
    await ctx.http
      .get(`/api/timeentries?employeeId=${former.id}`)
      .set('Authorization', auth)
      .expect(403);
    await ctx.http
      .get(`/api/timeentries/${entry.id}/audit`)
      .set('Authorization', auth)
      .expect(403);
    await ctx.http
      .patch(`/api/timeentries/${entry.id}/correct`)
      .set('Authorization', auth)
      .send({ ...interval, revision: 0, reason: 'Forbidden foreign change' })
      .expect(403);
    await ctx.http
      .post(`/api/timeentries/${entry.id}/void`)
      .set('Authorization', auth)
      .send({ revision: 0, reason: 'Forbidden foreign void' })
      .expect(403);
    await ctx.http
      .patch(`/api/timeentries/${entry.id}`)
      .set('Authorization', auth)
      .send({ activity: 'Foreign change' })
      .expect(403);
  });

  it('preserves group gross, break and net through repeated splits and range bookings', async () => {
    const { owner, auth } = await fixture();
    const project = await seedProject(ctx.prisma, {
      code: 'SOLO-PROJECT',
      assigneeIds: [owner.id],
    });
    const created = await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send({ ...interval, clockOut: '2025-09-02T15:00:00.750Z' })
      .expect(201);
    const first = await ctx.http
      .post(`/api/timeentries/${created.body.id}/split`)
      .set('Authorization', auth)
      .send({ at: '2025-09-02T13:00:00Z', revision: 0, projectId: project.id })
      .expect(201);
    expect(first.body.first.captureGroupId).toBe(
      first.body.second.captureGroupId,
    );
    const totalBefore = created.body.summary;
    const range = await ctx.http
      .post('/api/timeentries/book-project')
      .set('Authorization', auth)
      .send({
        employeeId: owner.id,
        from: '2025-09-02T09:00:00.500Z',
        to: '2025-09-02T14:00:00Z',
        revisions: [first.body.first, first.body.second].map((entry) => ({
          id: entry.id,
          revision: entry.revision,
        })),
        projectId: project.id,
      })
      .expect(201);
    expect(range.body.entries.length).toBeGreaterThan(2);
    const list = await ctx.http
      .get(`/api/timeentries?employeeId=${owner.id}`)
      .set('Authorization', auth)
      .expect(200);
    const total = list.body.reduce(
      (
        sum: { grossMinutes: number; breakMinutes: number; netMinutes: number },
        entry: {
          summary: {
            grossMinutes: number;
            breakMinutes: number;
            netMinutes: number;
          };
        },
      ) => ({
        grossMinutes: sum.grossMinutes + entry.summary.grossMinutes,
        breakMinutes: sum.breakMinutes + entry.summary.breakMinutes,
        netMinutes: sum.netMinutes + entry.summary.netMinutes,
      }),
      { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 },
    );
    for (const key of ['grossMinutes', 'breakMinutes', 'netMinutes'] as const)
      expect(total[key]).toBeCloseTo(totalBefore[key], 9);
    const subset = await ctx.http
      .get(
        `/api/timeentries?employeeId=${owner.id}&from=2025-09-02T13:30:00Z&to=2025-09-02T13:45:00Z`,
      )
      .set('Authorization', auth)
      .expect(200);
    expect(subset.body).toHaveLength(1);
    expect(subset.body[0].summary).toEqual(
      list.body.find((entry: { id: string }) => entry.id === subset.body[0].id)
        .summary,
    );
  });

  it('keeps break and approval snapshots across a live switch and a policy change', async () => {
    const { owner, policy, auth } = await fixture();
    const started = await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', auth)
      .send({
        note: 'Private starting note',
        latitude: 51,
        longitude: 7,
        accuracyMeters: 10,
      })
      .expect(201);
    expect(started.body).toMatchObject({
      approvalMode: 'Solo',
      requiresApproval: false,
      latitude: null,
      longitude: null,
    });
    await ctx.prisma.timeEntry.update({
      where: { id: started.body.id },
      data: { clockIn: new Date(Date.now() - 7 * 60 * 60_000) },
    });
    await ctx.prisma.soloPolicy.update({
      where: { id: policy.id },
      data: { breakRules: [] },
    });
    const switched = await ctx.http
      .post(`/api/timeentries/${started.body.id}/switch-project`)
      .set('Authorization', auth)
      .send({ revision: 0, activity: 'Second activity' })
      .expect(201);
    expect(switched.body.first.captureGroupId).toEqual(
      switched.body.second.captureGroupId,
    );
    await ctx.http
      .post('/api/timeentries/clock-out')
      .set('Authorization', auth)
      .send({ id: started.body.id, revision: 0 })
      .expect(409);
    const stopped = await ctx.http
      .post('/api/timeentries/clock-out')
      .set('Authorization', auth)
      .send({ id: switched.body.second.id, revision: 0 })
      .expect(201);
    expect(stopped.body).toMatchObject({
      status: 'Approved',
      requiresApproval: false,
    });
    const list = await ctx.http
      .get(`/api/timeentries?employeeId=${owner.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(
      list.body.reduce(
        (sum: number, entry: { summary: { breakMinutes: number } }) =>
          sum + entry.summary.breakMinutes,
        0,
      ),
    ).toBeCloseTo(30, 9);
    expect(
      list.body.reduce(
        (sum: number, entry: { summary: { netMinutes: number } }) =>
          sum + entry.summary.netMinutes,
        0,
      ),
    ).toBeCloseTo(390, 0);
  });

  it('serializes duplicate switches and requires timer identity and revision on stop', async () => {
    const { auth } = await fixture([]);
    const started = await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', auth)
      .send({})
      .expect(201);
    await ctx.http
      .post('/api/timeentries/clock-out')
      .set('Authorization', auth)
      .send({})
      .expect(400);
    const responses = await Promise.all(
      [1, 2].map(() =>
        ctx.http
          .post(`/api/timeentries/${started.body.id}/switch-project`)
          .set('Authorization', auth)
          .send({ revision: 0 }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await ctx.prisma.timeEntry.count({
        where: { clockOut: null, voidedAt: null },
      }),
    ).toBe(1);
  });

  it('can correct a forgotten running timer and void a running timer without blocking a new one', async () => {
    const { auth } = await fixture([]);
    const started = await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', auth)
      .send({})
      .expect(201);
    const corrected = await ctx.http
      .patch(`/api/timeentries/${started.body.id}/correct`)
      .set('Authorization', auth)
      .send({ ...interval, revision: 0, reason: 'Forgot to stop yesterday' })
      .expect(200);
    expect(corrected.body).toMatchObject({
      status: 'Approved',
      summary: { netMinutes: 420 },
    });
    const newTimer = await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', auth)
      .send({})
      .expect(201);
    await ctx.http
      .post(`/api/timeentries/${newTimer.body.id}/void`)
      .set('Authorization', auth)
      .send({ revision: 0, reason: 'Accidental click' })
      .expect(201);
    await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', auth)
      .send({})
      .expect(201);
  });

  it('uses project/order billable defaults and keeps archived historical bookings editable', async () => {
    const { owner, auth } = await fixture([]);
    const project = await ctx.prisma.project.create({
      data: {
        code: 'BILLABLE',
        name: 'Client work',
        defaultBillable: true,
        assignments: { create: { employeeId: owner.id } },
      },
    });
    const created = await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send({ ...interval, projectId: project.id })
      .expect(201);
    expect(created.body.billable).toBe(true);
    await ctx.prisma.project.update({
      where: { id: project.id },
      data: { isActive: false },
    });
    await ctx.http
      .patch(`/api/timeentries/${created.body.id}/correct`)
      .set('Authorization', auth)
      .send({
        ...interval,
        revision: 0,
        activity: 'Correct historical description',
        note: 'Private context',
        reason: 'Clarify the work',
      })
      .expect(200);
    await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send({
        clockIn: '2025-09-03T08:00:00Z',
        clockOut: '2025-09-03T09:00:00Z',
        projectId: project.id,
      })
      .expect(400);
  });

  it('resolves historical Solo break rules at the entry start and does not apply new defaults retroactively', async () => {
    const { owner, auth } = await fixture([]);
    await ctx.prisma.soloPolicy.create({
      data: {
        employeeId: owner.id,
        effectiveFrom: new Date('2025-09-03'),
        breakRules: rules,
      },
    });
    const past = await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send(interval)
      .expect(201);
    expect(past.body.summary.breakMinutes).toBe(0);
    const later = await ctx.http
      .post('/api/timeentries/manual')
      .set('Authorization', auth)
      .send({
        clockIn: '2025-09-03T08:00:00Z',
        clockOut: '2025-09-03T15:00:00Z',
      })
      .expect(201);
    expect(later.body.summary.breakMinutes).toBe(30);
  });

  it('uses personal target settings for daily blocks without requiring the Team employee feature', async () => {
    const { auth, policy } = await fixture([]);
    await ctx.prisma.soloPolicy.update({
      where: { id: policy.id },
      data: {
        targetEnabled: true,
        weeklyTargetMinutes: 840,
        workingDays: 127,
        dailyBlockEnabled: true,
      },
    });
    const option = await ctx.http
      .get('/api/timeentries/daily-block/option')
      .set('Authorization', auth)
      .expect(200);
    expect(option.body).toMatchObject({ enabled: true, dailyNetMinutes: 120 });
    const created = await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', auth)
      .send({ date: '2025-09-02', start: '00:01' })
      .expect(201);
    expect(created.body).toMatchObject({
      status: 'Approved',
      approvalMode: 'Solo',
      requiresApproval: false,
      summary: { grossMinutes: 120, netMinutes: 120 },
    });
    await ctx.http
      .post(`/api/timeentries/${created.body.id}/void`)
      .set('Authorization', auth)
      .send({ revision: 0, reason: 'Rebook at correct time' })
      .expect(201);
    await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', auth)
      .send({ date: '2025-09-02', start: '01:01' })
      .expect(201);
  });
});

describe('Capture duration allocation', () => {
  const employeeId = randomUUID();
  const captureGroupId = randomUUID();
  const part = (id: string, start: string, end: string | null) => ({
    id,
    employeeId,
    captureGroupId,
    clockIn: new Date(start),
    clockOut: end ? new Date(end) : null,
    breakRules: rules,
  });

  it('retains millisecond precision across fragments and excludes voided/rejected work', () => {
    const rows = [
      part('a', interval.clockIn, '2025-09-02T13:00:00.500Z'),
      part('b', '2025-09-02T13:00:00.500Z', '2025-09-02T15:00:00.750Z'),
    ];
    const sums = calculateCaptureSummaries([
      ...rows,
      {
        ...part('void', interval.clockIn, interval.clockOut),
        voidedAt: new Date(),
      },
      {
        ...part('rejected', interval.clockIn, interval.clockOut),
        status: 'Rejected',
      },
    ]);
    expect(sums.size).toBe(2);
    expect(
      [...sums.values()].reduce((sum, item) => sum + item.grossMinutes, 0),
    ).toBeCloseTo(420.0125, 10);
    expect(
      [...sums.values()].reduce((sum, item) => sum + item.breakMinutes, 0),
    ).toBeCloseTo(30, 10);
  });

  it('only includes running work when a caller explicitly asks for a provisional duration', () => {
    const row = part('open', interval.clockIn, null);
    expect(calculateCaptureSummaries([row]).size).toBe(0);
    expect(
      calculateCaptureSummaries([row], new Date(interval.clockOut)).get('open'),
    ).toEqual({ grossMinutes: 420, breakMinutes: 30, netMinutes: 390 });
  });
});
