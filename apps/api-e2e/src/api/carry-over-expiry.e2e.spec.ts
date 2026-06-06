import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const THIS_YEAR = new Date().getUTCFullYear();

describe('Leave-allowance carry-over expiry', () => {
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

  async function setupHR() {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    return login(ctx.http, 'hannah@test.local');
  }

  it('balance treats expired carry-over as 0 even before cleanup runs', async () => {
    const hrToken = await setupHR();
    const employee = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Test',
      lastName: 'Subject',
      email: 'subject@test.local',
    });
    await seedLeaveAllowance(ctx.prisma, employee.id, THIS_YEAR, 30);
    // Hand-write an expired carry-over: 5 days that expired yesterday.
    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await ctx.prisma.employeeLeaveAllowance.update({
      where: { employeeId_year: { employeeId: employee.id, year: THIS_YEAR } },
      data: { carryOverDays: 5, carryOverExpiresOn: yesterday },
    });

    const balance = await ctx.http
      .get(`/api/accounts/${employee.id}/vacation?year=${THIS_YEAR}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    // baseDays (30) + carryOver (treated as 0 because expired) = 30 total.
    expect(balance.body.carryOverDays).toBe(0);
    expect(balance.body.totalEntitlement).toBe(30);
  });

  it('admin endpoint zeroes expired rows + appends a reason; future expiries are untouched', async () => {
    const hrToken = await setupHR();
    const a = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Expired',
      lastName: 'Carryover',
      email: 'a@test.local',
    });
    const b = await seedEmployee(ctx.prisma, {
      personalNo: '1002',
      firstName: 'Future',
      lastName: 'Carryover',
      email: 'b@test.local',
    });
    await seedLeaveAllowance(ctx.prisma, a.id, THIS_YEAR, 30);
    await seedLeaveAllowance(ctx.prisma, b.id, THIS_YEAR, 30);

    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const nextYear = new Date(Date.UTC(THIS_YEAR + 1, 2, 31)); // March 31 next year

    await ctx.prisma.employeeLeaveAllowance.update({
      where: { employeeId_year: { employeeId: a.id, year: THIS_YEAR } },
      data: { carryOverDays: 3, carryOverExpiresOn: yesterday },
    });
    await ctx.prisma.employeeLeaveAllowance.update({
      where: { employeeId_year: { employeeId: b.id, year: THIS_YEAR } },
      data: { carryOverDays: 4, carryOverExpiresOn: nextYear },
    });

    const result = await ctx.http
      .post('/api/admin/leave-allowances/expire-carryovers')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(result.body.expired).toBe(1);
    expect(result.body.scanned).toBe(1);

    const after = await ctx.prisma.employeeLeaveAllowance.findMany({
      where: { employeeId: { in: [a.id, b.id] } },
      orderBy: { employeeId: 'asc' },
    });
    const expired = after.find((r) => r.employeeId === a.id)!;
    const future = after.find((r) => r.employeeId === b.id)!;
    expect(Number(expired.carryOverDays)).toBe(0);
    expect(expired.adjustmentReason).toMatch(/expired/);
    expect(Number(future.carryOverDays)).toBe(4);
    expect(future.adjustmentReason).toBeNull();
  });

  it('expire-carryovers is idempotent — a second call expires 0 more', async () => {
    const hrToken = await setupHR();
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Idempotent',
      lastName: 'Test',
      email: 'idem@test.local',
    });
    await seedLeaveAllowance(ctx.prisma, e.id, THIS_YEAR, 30);
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await ctx.prisma.employeeLeaveAllowance.update({
      where: { employeeId_year: { employeeId: e.id, year: THIS_YEAR } },
      data: { carryOverDays: 2, carryOverExpiresOn: yesterday },
    });

    const first = await ctx.http
      .post('/api/admin/leave-allowances/expire-carryovers')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    const second = await ctx.http
      .post('/api/admin/leave-allowances/expire-carryovers')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(first.body.expired).toBe(1);
    expect(second.body.expired).toBe(0);
  });

  it('cron endpoint accepts a valid X-Cron-Key and rejects everything else', async () => {
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Cron',
      lastName: 'Target',
      email: 'cron@test.local',
    });
    await seedLeaveAllowance(ctx.prisma, e.id, THIS_YEAR, 30);
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await ctx.prisma.employeeLeaveAllowance.update({
      where: { employeeId_year: { employeeId: e.id, year: THIS_YEAR } },
      data: { carryOverDays: 3, carryOverExpiresOn: yesterday },
    });

    await ctx.http.post('/api/cron/expire-carryovers').expect(401);
    await ctx.http
      .post('/api/cron/expire-carryovers')
      .set('X-Cron-Key', 'definitely-not-the-key')
      .expect(401);
    const ok = await ctx.http
      .post('/api/cron/expire-carryovers')
      .set('X-Cron-Key', 'e2e-cron-key')
      .expect(200);
    expect(ok.body.expired).toBe(1);
    const row = await ctx.prisma.employeeLeaveAllowance.findFirstOrThrow({
      where: { employeeId: e.id, year: THIS_YEAR },
    });
    expect(Number(row.carryOverDays)).toBe(0);
  });

  it('non-HR caller is rejected with 403', async () => {
    const employee = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Worker',
      lastName: 'Bee',
      email: 'worker@test.local',
    });
    const empToken = await login(ctx.http, 'worker@test.local');
    await ctx.http
      .post('/api/admin/leave-allowances/expire-carryovers')
      .set('Authorization', `Bearer ${empToken}`)
      .expect(403);
    expect(employee).toBeDefined();
  });
});
