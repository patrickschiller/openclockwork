import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

const settings = {
  revision: 0,
  effectiveFrom: '',
  targetEnabled: false,
  weeklyTargetMinutes: null,
  workingDays: 31,
  leaveEnabled: false,
  annualLeaveDays: 0,
  holidayCalendar: 'NONE',
  holidayDates: [],
  breakRules: [],
  coreTimeHintsEnabled: false,
  dailyBlockEnabled: false,
  gpsEnabled: false,
};
function localDay(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('Solo installation, personal policies and transition boundaries', () => {
  let ctx: TestContext;
  let ownerId: string;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    const owner = await seedEmployee(ctx.prisma, {
      personalNo: 'OWNER',
      firstName: 'Solo',
      lastName: 'Example',
      email: 'owner@solo.test',
      role: 'HRAdmin',
    });
    ownerId = owner.id;
    token = await login(ctx.http, owner.email);
  });
  async function enableSolo() {
    return ctx.http
      .post('/api/installation/mode')
      .set(auth())
      .send({ mode: 'Solo', revision: 0 })
      .expect(201);
  }

  it('keeps upgraded installations in Team until an explicit owner transition', async () => {
    const before = await ctx.http
      .get('/api/installation')
      .set(auth())
      .expect(200);
    expect(before.body).toMatchObject({ mode: 'Team', ownerEmployeeId: null });
    const solo = await enableSolo();
    expect(solo.body).toMatchObject({
      mode: 'Solo',
      ownerEmployeeId: ownerId,
      setupCompleted: false,
      capabilities: { solo: true, targets: false, leave: false, gps: false },
    });
    await ctx.http
      .post('/api/installation/complete-setup')
      .set(auth())
      .expect(201);
    expect(
      (await ctx.http.get('/api/installation').set(auth())).body.setupCompleted,
    ).toBe(true);
  });

  it('blocks conversion while other people or unresolved workflows exist, without mutation', async () => {
    await seedEmployee(ctx.prisma, {
      personalNo: 'OTHER',
      firstName: 'Team',
      lastName: 'Member',
      email: 'member@solo.test',
    });
    const preview = await ctx.http
      .post('/api/installation/mode-preview')
      .set(auth())
      .send({ mode: 'Solo' })
      .expect(201);
    expect(preview.body).toMatchObject({
      allowed: false,
      blockers: ['OTHER_ACTIVE_EMPLOYEES'],
    });
    await ctx.http
      .post('/api/installation/mode')
      .set(auth())
      .send({ mode: 'Solo', revision: 0 })
      .expect(409);
    expect(
      (await ctx.http.get('/api/installation').set(auth())).body.mode,
    ).toBe('Team');
  });

  it('returns a conflict for a concurrent serializable transition and commits only one mode event', async () => {
    let releaseLock!: () => void;
    let lockAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => {
      lockAcquired = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const blocker = ctx.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7261500)`;
      lockAcquired();
      await release;
    });
    await acquired;
    const requests = [1, 2].map(() =>
      ctx.http
        .post('/api/installation/mode')
        .set(auth())
        .send({ mode: 'Solo', revision: 0 })
        .then((response) => response),
    );
    let waiting = 0;
    try {
      for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
        const locks = await ctx.prisma.$queryRaw<
          Array<{ count: number }>
        >`SELECT COUNT(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND objid = 7261500 AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
        waiting = locks[0]?.count ?? 0;
        if (waiting < 2)
          await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      releaseLock();
      await blocker;
    }
    const responses = await Promise.all(requests);
    expect(waiting).toBe(2);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      responses.find((response) => response.status === 409)?.body.message,
    ).toMatch(/concurrently/);
    expect(
      await ctx.prisma.installationSettings.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ mode: 'Solo', ownerEmployeeId: ownerId, revision: 1 });
    expect(
      await ctx.prisma.installationEvent.count({
        where: { action: 'ModeChanged' },
      }),
    ).toBe(1);
    expect(
      await ctx.prisma.soloPolicy.count({ where: { employeeId: ownerId } }),
    ).toBe(1);
  });

  it('enforces a non-null positive weekly target in the database only when enabled', async () => {
    for (const weeklyTargetMinutes of [null, 0, -1, 10081]) {
      await expect(
        ctx.prisma.soloPolicy.create({
          data: {
            employeeId: ownerId,
            effectiveFrom: new Date('2026-01-01'),
            targetEnabled: true,
            weeklyTargetMinutes,
          },
        }),
      ).rejects.toThrow();
    }
    expect(await ctx.prisma.soloPolicy.count()).toBe(0);
    await ctx.prisma.soloPolicy.create({
      data: {
        employeeId: ownerId,
        effectiveFrom: new Date('2026-01-01'),
        targetEnabled: false,
        weeklyTargetMinutes: null,
      },
    });
    await ctx.prisma.soloPolicy.create({
      data: {
        employeeId: ownerId,
        effectiveFrom: new Date('2026-02-01'),
        targetEnabled: true,
        weeklyTargetMinutes: 1200,
      },
    });
    expect(await ctx.prisma.soloPolicy.count()).toBe(2);
  });

  it('switches live mode immediately but starts accounting tomorrow after completed overnight work', async () => {
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: ownerId,
        clockIn: new Date(`${localDay(-1)}T23:30:00`),
        clockOut: new Date(`${localDay()}T00:30:00`),
        status: 'Approved',
      },
    });
    const response = await enableSolo();
    expect(response.body.mode).toBe('Solo');
    const event = await ctx.prisma.installationEvent.findFirstOrThrow({
      where: { action: 'ModeChanged' },
    });
    expect(event.after).toMatchObject({
      mode: 'Solo',
      accountingEffectiveFrom: localDay(1),
    });
    const policy = await ctx.prisma.soloPolicy.findFirstOrThrow({
      where: { employeeId: ownerId },
    });
    expect(policy.effectiveFrom.toISOString().slice(0, 10)).toBe(localDay(1));
  });

  it('defers accounting for existing personal or approved legacy free days', async () => {
    await ctx.prisma.request.create({
      data: {
        employeeId: ownerId,
        type: 'Vacation',
        from: new Date(localDay()),
        to: new Date(localDay()),
        workflowState: 'Approved',
      },
    });
    await enableSolo();
    expect(
      (
        await ctx.prisma.installationEvent.findFirstOrThrow({
          where: { action: 'ModeChanged' },
        })
      ).after,
    ).toMatchObject({ accountingEffectiveFrom: localDay(1) });
  });

  it("does not postpone accounting for rejected, voided or another employee's work", async () => {
    const other = await seedEmployee(ctx.prisma, {
      personalNo: 'FORMER',
      firstName: 'Former',
      lastName: 'Employee',
      email: 'former-accounting@solo.test',
    });
    await ctx.prisma.employee.update({
      where: { id: other.id },
      data: { isActive: false },
    });
    const clockIn = new Date(`${localDay()}T00:00:00`),
      clockOut = new Date(`${localDay()}T00:01:00`);
    await ctx.prisma.timeEntry.createMany({
      data: [
        { employeeId: other.id, clockIn, clockOut, status: 'Approved' },
        { employeeId: ownerId, clockIn, clockOut, status: 'Rejected' },
        {
          employeeId: ownerId,
          clockIn,
          clockOut,
          status: 'Approved',
          voidedAt: new Date(),
        },
      ],
    });
    await enableSolo();
    expect(
      (
        await ctx.prisma.installationEvent.findFirstOrThrow({
          where: { action: 'ModeChanged' },
        })
      ).after,
    ).toMatchObject({ accountingEffectiveFrom: localDay() });
  });

  it('does not give free tracking an artificial overtime or holiday balance', async () => {
    await enableSolo();
    await ctx.http
      .post('/api/timeentries/manual')
      .set(auth())
      .send({
        clockIn: `${localDay(-1)}T09:00:00+02:00`,
        clockOut: `${localDay(-1)}T10:00:00+02:00`,
      })
      .expect(201);
    const summary = await ctx.http
      .get('/api/installation/summary')
      .set(auth())
      .query({ from: localDay(-1), to: localDay(-1) })
      .expect(200);
    expect(summary.body).toMatchObject({
      actualMinutes: 60,
      targetEnabled: false,
      targetMinutes: null,
      overtimeMinutes: null,
      leaveEnabled: false,
      vacationDaysRemaining: null,
    });
  });

  it('validates policy dates and requires revision concurrency control', async () => {
    await enableSolo();
    const state = (await ctx.http.get('/api/installation').set(auth())).body;
    const payload = {
      ...settings,
      revision: state.revision,
      effectiveFrom: localDay(1),
      targetEnabled: true,
      weeklyTargetMinutes: 1200,
    };
    await ctx.http
      .patch('/api/installation/settings')
      .set(auth())
      .send({ ...payload, effectiveFrom: localDay(-1) })
      .expect(400);
    await ctx.http
      .patch('/api/installation/settings')
      .set(auth())
      .send({ ...payload, weeklyTargetMinutes: 0 })
      .expect(400);
    await ctx.http
      .patch('/api/installation/settings')
      .set(auth())
      .send({ ...payload, holidayDates: ['2026-02-30'] })
      .expect(400);
    const saved = await ctx.http
      .patch('/api/installation/settings')
      .set(auth())
      .send(payload)
      .expect(200);
    expect(saved.body.futurePolicies).toHaveLength(1);
    expect(saved.body.capabilities.targets).toBe(false);
    await ctx.http
      .patch('/api/installation/settings')
      .set(auth())
      .send(payload)
      .expect(409);
  });

  it('preserves historical targets across effective policy versions', async () => {
    await enableSolo();
    // These periods belong to an already-Solo installation, not a Team period
    // before today's transition. Model that history explicitly.
    await ctx.prisma.installationEvent.updateMany({
      where: { actorId: ownerId, action: 'ModeChanged' },
      data: {
        occurredAt: new Date('2026-01-01T00:00:00Z'),
        after: {
          mode: 'Solo',
          ownerEmployeeId: ownerId,
          accountingEffectiveFrom: '2026-01-01',
        },
      },
    });
    await ctx.prisma.soloPolicy.createMany({
      data: [
        {
          employeeId: ownerId,
          effectiveFrom: new Date('2026-01-01'),
          targetEnabled: true,
          weeklyTargetMinutes: 2400,
          workingDays: 31,
        },
        {
          employeeId: ownerId,
          effectiveFrom: new Date('2026-02-01'),
          targetEnabled: true,
          weeklyTargetMinutes: 1200,
          workingDays: 31,
        },
      ],
    });
    const jan = await ctx.http
      .get('/api/installation/summary')
      .set(auth())
      .query({ from: '2026-01-05', to: '2026-01-09' })
      .expect(200);
    const feb = await ctx.http
      .get('/api/installation/summary')
      .set(auth())
      .query({ from: '2026-02-02', to: '2026-02-06' })
      .expect(200);
    expect(jan.body.targetMinutes).toBe(2400);
    expect(feb.body.targetMinutes).toBe(1200);
  });

  it('protects today after closed overnight work when changing calendar policies', async () => {
    await enableSolo();
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: ownerId,
        clockIn: new Date(`${localDay(-1)}T23:30:00`),
        clockOut: new Date(`${localDay()}T00:30:00`),
        source: 'Manual',
        status: 'Approved',
        requiresApproval: false,
      },
    });
    const state = (await ctx.http.get('/api/installation').set(auth())).body;
    await ctx.http
      .patch('/api/installation/settings')
      .set(auth())
      .send({
        ...settings,
        revision: state.revision,
        effectiveFrom: localDay(),
      })
      .expect(409);
    expect(
      (await ctx.http.get('/api/installation').set(auth())).body.revision,
    ).toBe(state.revision);
  });

  it("protects inherited approved leave when changing today's personal policy", async () => {
    await enableSolo();
    await ctx.prisma.request.create({
      data: {
        employeeId: ownerId,
        type: 'Vacation',
        from: new Date(localDay()),
        to: new Date(localDay()),
        workflowState: 'Approved',
      },
    });
    const state = (await ctx.http.get('/api/installation').set(auth())).body;
    await ctx.http
      .patch('/api/installation/settings')
      .set(auth())
      .send({
        ...settings,
        revision: state.revision,
        effectiveFrom: localDay(),
      })
      .expect(409);
  });

  it('creates, edits and cancels personal calendar days with audit and no request workflow', async () => {
    await enableSolo();
    const created = await ctx.http
      .post('/api/installation/days')
      .set(auth())
      .send({
        kind: 'Free',
        from: '2026-10-05',
        to: '2026-10-06',
        note: 'Private planning',
      })
      .expect(201);
    expect(await ctx.prisma.request.count()).toBe(0);
    await ctx.http
      .post('/api/installation/days')
      .set(auth())
      .send({ kind: 'Vacation', from: '2026-10-06', to: '2026-10-07' })
      .expect(409);
    const edited = await ctx.http
      .patch(`/api/installation/days/${created.body.id}`)
      .set(auth())
      .send({
        kind: 'Vacation',
        from: '2026-10-05',
        to: '2026-10-06',
        halfDayStart: true,
        revision: 0,
      })
      .expect(200);
    await ctx.http
      .delete(`/api/installation/days/${created.body.id}`)
      .set(auth())
      .send({ revision: 0 })
      .expect(409);
    await ctx.http
      .delete(`/api/installation/days/${created.body.id}`)
      .set(auth())
      .send({ revision: edited.body.revision })
      .expect(200);
    const audit = await ctx.http
      .get(`/api/installation/days/${created.body.id}/audit`)
      .set(auth())
      .expect(200);
    expect(audit.body.map((e: { action: string }) => e.action)).toEqual([
      'PersonalDayCreated',
      'PersonalDayChanged',
      'PersonalDayCancelled',
    ]);
  });

  it('rejects hidden Team routes and another historical identity while in Solo', async () => {
    const other = await seedEmployee(ctx.prisma, {
      personalNo: 'OLD',
      firstName: 'Former',
      lastName: 'Member',
      email: 'old@solo.test',
    });
    const oldToken = await login(ctx.http, other.email);
    await ctx.prisma.employee.update({
      where: { id: other.id },
      data: { isActive: false },
    });
    await enableSolo();
    await ctx.http.get('/api/employees').set(auth()).expect(403);
    await ctx.http.get(`/api/accounts/${other.id}`).set(auth()).expect(403);
    await ctx.http
      .put(`/api/employees/${ownerId}`)
      .set(auth())
      .send({ isActive: false })
      .expect(403);
    await ctx.http.post('/api/employees').set(auth()).send({}).expect(403);
    await ctx.http
      .get('/api/installation')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);
    expect(
      (await ctx.prisma.employee.findUniqueOrThrow({ where: { id: ownerId } }))
        .isActive,
    ).toBe(true);
  });

  it('keeps ids, bookings and settings through Solo to Team and back', async () => {
    await enableSolo();
    const entry = await ctx.http
      .post('/api/timeentries/manual')
      .set(auth())
      .send({
        clockIn: '2026-06-01T09:00:00Z',
        clockOut: '2026-06-01T10:00:00Z',
      })
      .expect(201);
    const before = (await ctx.http.get('/api/installation').set(auth())).body;
    const team = await ctx.http
      .post('/api/installation/mode')
      .set(auth())
      .send({ mode: 'Team', revision: before.revision })
      .expect(201);
    await ctx.http
      .post('/api/installation/mode')
      .set(auth())
      .send({ mode: 'Solo', revision: team.body.revision })
      .expect(201);
    const stored = await ctx.prisma.timeEntry.findUniqueOrThrow({
      where: { id: entry.body.id },
    });
    expect(stored).toMatchObject({
      employeeId: ownerId,
      approvalMode: 'Solo',
      status: 'Approved',
    });
    expect(await ctx.prisma.employee.count()).toBe(1);
  });

  it('requires open timers to be closed before a mode change', async () => {
    await enableSolo();
    await ctx.http
      .post('/api/timeentries/clock-in')
      .set(auth())
      .send({})
      .expect(201);
    const preview = await ctx.http
      .post('/api/installation/mode-preview')
      .set(auth())
      .send({ mode: 'Team' })
      .expect(201);
    expect(preview.body.blockers).toContain('OPEN_TIME_ENTRIES');
  });

  it('requires the current password and invalidates old access and refresh sessions', async () => {
    await enableSolo();
    const session = await ctx.http
      .post('/api/auth/login')
      .send({ email: 'owner@solo.test', password: 'test1234' })
      .expect(200);
    await ctx.http
      .post('/api/auth/password')
      .set(auth())
      .send({ currentPassword: 'wrong', newPassword: 'new-test-password-150' })
      .expect(401);
    await ctx.http
      .post('/api/auth/password')
      .set(auth())
      .send({
        currentPassword: 'test1234',
        newPassword: 'new-test-password-150',
      })
      .expect(200);
    await ctx.http.get('/api/auth/me').set(auth()).expect(401);
    await ctx.http
      .post('/api/auth/refresh')
      .send({ refreshToken: session.body.refreshToken })
      .expect(401);
    const fresh = await ctx.http
      .post('/api/auth/login')
      .send({ email: 'owner@solo.test', password: 'new-test-password-150' })
      .expect(200);
    await ctx.http
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${fresh.body.accessToken}`)
      .expect(200);
  });
});
