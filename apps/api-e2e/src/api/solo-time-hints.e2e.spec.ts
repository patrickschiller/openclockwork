import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('Personal core and frame hints', () => {
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

  async function fixture(enabled = true) {
    const owner = await seedEmployee(ctx.prisma, {
      personalNo: 'HINT-OWNER',
      firstName: 'Personal',
      lastName: 'Hints',
      email: 'hints@test.local',
      role: 'HRAdmin',
    });
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode: 'Solo', ownerEmployeeId: owner.id },
      update: { mode: 'Solo', ownerEmployeeId: owner.id },
    });
    const policy = await ctx.prisma.soloPolicy.create({
      data: {
        employeeId: owner.id,
        effectiveFrom: new Date('2025-01-01'),
        coreTimeHintsEnabled: enabled,
        frameStart: '08:00',
        frameEnd: '18:00',
        coreTimes: [
          { start: '09:00', end: '15:00', weekdays: 31, label: 'Focus' },
        ],
      },
    });
    const auth = `Bearer ${await login(ctx.http, owner.email)}`;
    return { owner, policy, auth };
  }

  async function entry(
    employeeId: string,
    date: string,
    from: string,
    to: string,
    state: 'Approved' | 'Rejected' = 'Approved',
    voided = false,
  ) {
    return ctx.prisma.timeEntry.create({
      data: {
        employeeId,
        clockIn: new Date(`${date}T${from}:00`),
        clockOut: new Date(`${date}T${to}:00`),
        status: state,
        approvalMode: 'Solo',
        voidedAt: voided ? new Date() : null,
      },
    });
  }

  it('is all-off by default and does not invent gaps on empty days or for an empty core configuration', async () => {
    const { owner, policy, auth } = await fixture(false);
    await entry(owner.id, '2025-09-02', '10:00', '14:00');
    const disabled = await ctx.http
      .get('/api/installation/hints?from=2025-09-01&to=2025-09-05')
      .set('Authorization', auth)
      .expect(200);
    expect(disabled.body).toEqual({ enabled: false, hints: [] });
    await ctx.prisma.soloPolicy.update({
      where: { id: policy.id },
      data: {
        coreTimeHintsEnabled: true,
        coreTimes: [],
        frameStart: '00:00',
        frameEnd: '23:59',
      },
    });
    const empty = await ctx.http
      .get('/api/installation/hints?from=2025-09-01&to=2025-09-05')
      .set('Authorization', auth)
      .expect(200);
    expect(empty.body).toEqual({ enabled: true, hints: [] });
    expect(await ctx.prisma.request.count()).toBe(0);
  });

  it('reports the configured missing periods and actual work outside the preferred frame without changing approval', async () => {
    const { owner, auth } = await fixture();
    await entry(owner.id, '2025-09-02', '07:30', '08:30');
    await entry(owner.id, '2025-09-02', '10:00', '14:00');
    await entry(owner.id, '2025-09-02', '18:30', '19:00');
    const result = await ctx.http
      .get('/api/installation/hints?from=2025-09-02&to=2025-09-02')
      .set('Authorization', auth)
      .expect(200);
    expect(result.body.enabled).toBe(true);
    expect(result.body.hints).toEqual(
      expect.arrayContaining([
        {
          date: '2025-09-02',
          kind: 'BeforeFrame',
          boundary: '08:00–18:00',
          deltaMinutes: 30,
        },
        {
          date: '2025-09-02',
          kind: 'AfterFrame',
          boundary: '08:00–18:00',
          deltaMinutes: 30,
        },
        {
          date: '2025-09-02',
          kind: 'LateArrival',
          boundary: '09:00–15:00',
          deltaMinutes: 60,
          windowLabel: 'Focus',
        },
        {
          date: '2025-09-02',
          kind: 'EarlyDeparture',
          boundary: '09:00–15:00',
          deltaMinutes: 60,
          windowLabel: 'Focus',
        },
      ]),
    );
    expect(result.body.hints).toHaveLength(4);
    expect(
      await ctx.prisma.timeEntry.count({ where: { requiresApproval: true } }),
    ).toBe(0);
    expect(await ctx.prisma.request.count()).toBe(0);
  });

  it('uses the policy effective on each day and ignores later/future windows', async () => {
    const { owner, auth } = await fixture();
    await ctx.prisma.soloPolicy.create({
      data: {
        employeeId: owner.id,
        effectiveFrom: new Date('2025-09-03'),
        coreTimeHintsEnabled: true,
        coreTimes: [{ start: '10:00', end: '14:00', weekdays: 31 }],
      },
    });
    await ctx.prisma.soloPolicy.create({
      data: {
        employeeId: owner.id,
        effectiveFrom: new Date('2040-01-01'),
        coreTimeHintsEnabled: true,
        coreTimes: [{ start: '07:00', end: '20:00', weekdays: 127 }],
      },
    });
    await entry(owner.id, '2025-09-02', '10:00', '14:00');
    await entry(owner.id, '2025-09-04', '10:00', '14:00');
    const result = await ctx.http
      .get('/api/installation/hints?from=2025-09-02&to=2025-09-04')
      .set('Authorization', auth)
      .expect(200);
    expect(result.body.hints).toHaveLength(2);
    expect(
      result.body.hints.every(
        (hint: { date: string; boundary: string }) =>
          hint.date === '2025-09-02' && hint.boundary === '09:00–15:00',
      ),
    ).toBe(true);
  });

  it('suppresses free days, holidays, weekends, rejected/voided work and open timers', async () => {
    const { owner, policy, auth } = await fixture();
    await ctx.prisma.soloPolicy.update({
      where: { id: policy.id },
      data: { holidayDates: ['2025-09-03'] },
    });
    await ctx.prisma.personalDay.create({
      data: {
        employeeId: owner.id,
        kind: 'Free',
        from: new Date('2025-09-02'),
        to: new Date('2025-09-02'),
        halfDayStart: true,
      },
    });
    for (const date of ['2025-09-02', '2025-09-03', '2025-09-06'])
      await entry(owner.id, date, '10:00', '14:00');
    await entry(owner.id, '2025-09-04', '10:00', '14:00', 'Rejected');
    await entry(owner.id, '2025-09-05', '10:00', '14:00', 'Approved', true);
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: owner.id,
        clockIn: new Date('2025-09-01T10:00:00'),
        approvalMode: 'Solo',
      },
    });
    const result = await ctx.http
      .get('/api/installation/hints?from=2025-09-01&to=2025-09-07')
      .set('Authorization', auth)
      .expect(200);
    expect(result.body.hints).toEqual([]);
  });

  it('includes the local-day part of an overnight entry whose start precedes the period', async () => {
    const { owner, auth } = await fixture();
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: owner.id,
        clockIn: new Date('2025-09-01T23:00:00Z'),
        clockOut: new Date('2025-09-02T08:00:00Z'),
        status: 'Approved',
        approvalMode: 'Solo',
      },
    });
    const result = await ctx.http
      .get('/api/installation/hints?from=2025-09-02&to=2025-09-02')
      .set('Authorization', auth)
      .expect(200);
    expect(result.body.hints).toEqual(
      expect.arrayContaining([
        {
          date: '2025-09-02',
          kind: 'BeforeFrame',
          boundary: '08:00–18:00',
          deltaMinutes: 420,
        },
        {
          date: '2025-09-02',
          kind: 'EarlyDeparture',
          boundary: '09:00–15:00',
          deltaMinutes: 300,
          windowLabel: 'Focus',
        },
      ]),
    );
  });

  it('validates configured intervals, rejects conflicting windows and persists a valid policy version', async () => {
    const { auth } = await fixture();
    const state = await ctx.http
      .get('/api/installation')
      .set('Authorization', auth)
      .expect(200);
    const settings = {
      ...state.body.policy,
      revision: state.body.revision,
      effectiveFrom: '2040-01-01',
    };
    for (const invalid of [
      { frameStart: '18:00', frameEnd: '08:00' },
      { coreTimes: [{ start: '15:00', end: '09:00', weekdays: 31 }] },
      {
        coreTimes: [
          { start: '09:00', end: '12:00', weekdays: 31 },
          { start: '11:00', end: '13:00', weekdays: 1 },
        ],
      },
      { coreTimes: [{ start: '07:00', end: '09:00', weekdays: 31 }] },
    ])
      await ctx.http
        .patch('/api/installation/settings')
        .set('Authorization', auth)
        .send({ ...settings, ...invalid })
        .expect(400);
    const changed = await ctx.http
      .patch('/api/installation/settings')
      .set('Authorization', auth)
      .send({
        ...settings,
        frameStart: '07:00',
        frameEnd: '19:00',
        coreTimes: [
          { start: '10:00', end: '12:00', weekdays: 31, label: 'Deep work' },
        ],
      })
      .expect(200);
    expect(
      changed.body.futurePolicies.find(
        (policy: { effectiveFrom: string }) =>
          policy.effectiveFrom === '2040-01-01',
      ),
    ).toMatchObject({
      frameStart: '07:00',
      frameEnd: '19:00',
      coreTimes: [
        { start: '10:00', end: '12:00', weekdays: 31, label: 'Deep work' },
      ],
    });
  });
});
