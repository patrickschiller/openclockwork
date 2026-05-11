import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = new Date().getUTCFullYear();
const VOLLZEIT_DAILY_MIN = (40 / 5) * 60; // 480 min

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('Overtime — startDate + opening balance', () => {
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

  it('mid-year hire is not penalised for months before startDate', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const hrToken = await login(ctx.http, 'hannah@test.local');

    // Override the startDate: this employee joined yesterday → almost no Soll.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const newHire = await ctx.prisma.employee.update({
      where: { id: hr.id },
      data: { startDate: yesterday },
    });
    await seedLeaveAllowance(ctx.prisma, newHire.id, YEAR, 30);

    const acct = await ctx.http
      .get(`/api/accounts/${newHire.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);

    // No time entries yet, but Soll only counts since "yesterday" — so the
    // overtime deficit must be at most 1 working day's Soll, never months.
    expect(Math.abs(acct.body.overtimeMinutes)).toBeLessThanOrEqual(VOLLZEIT_DAILY_MIN);
  });

  it('opening balance carries straight into the overtime account', async () => {
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Migrant',
      lastName: 'Tester',
      email: 'migrant@test.local',
    });
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    // startDate = today, so YTD soll = ~0; opening balance = +600 min.
    const today = new Date();
    await ctx.prisma.employee.update({
      where: { id: e.id },
      data: {
        startDate: today,
        overtimeOpeningBalanceMinutes: 600,
      },
    });
    await seedLeaveAllowance(ctx.prisma, e.id, YEAR, 30);
    const hrToken = await login(ctx.http, 'hannah@test.local');

    const acct = await ctx.http
      .get(`/api/accounts/${e.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);

    // Today's Soll is at most 1 day; balance = 600 − sollToday.
    expect(acct.body.overtimeMinutes).toBeGreaterThanOrEqual(600 - VOLLZEIT_DAILY_MIN);
    expect(acct.body.overtimeMinutes).toBeLessThanOrEqual(600);
    expect(hr).toBeDefined();
  });

  it('future startDate ⇒ overtime equals the opening balance', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const future = utc(YEAR + 1, 1, 1);
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '2001',
      firstName: 'Future',
      lastName: 'Hire',
      email: 'future@test.local',
    });
    await ctx.prisma.employee.update({
      where: { id: e.id },
      data: { startDate: future, overtimeOpeningBalanceMinutes: 250 },
    });
    await seedLeaveAllowance(ctx.prisma, e.id, YEAR, 30);
    const hrToken = await login(ctx.http, 'hannah@test.local');

    const acct = await ctx.http
      .get(`/api/accounts/${e.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);

    expect(acct.body.overtimeMinutes).toBe(250);
    expect(hr).toBeDefined();
  });
});
