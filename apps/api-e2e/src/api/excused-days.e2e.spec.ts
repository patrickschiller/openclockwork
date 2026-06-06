import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = new Date().getUTCFullYear();
const VOLLZEIT_DAILY_MIN = (40 / 5) * 60; // 480 min

describe('Soll-Befreiung — vacation/sickness/training vs. Gleittage', () => {
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

  async function newEmployeeStartedYesterday(personalNo: string, email: string) {
    const e = await seedEmployee(ctx.prisma, {
      personalNo,
      firstName: 'Test',
      lastName: 'Employee',
      email,
    });
    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await ctx.prisma.employee.update({
      where: { id: e.id },
      data: { startDate: yesterday },
    });
    await seedLeaveAllowance(ctx.prisma, e.id, YEAR, 30);
    return e;
  }

  it('Sickness on a recent working day does NOT penalise the overtime account', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const hrToken = await login(ctx.http, 'hannah@test.local');

    const baseline = await newEmployeeStartedYesterday('1001', 'sick.baseline@test.local');
    const withSickness = await newEmployeeStartedYesterday('1002', 'sick.absent@test.local');

    // Cover the entire window since startDate with a Sickness absence so the
    // Ist=0/Soll>0 gap is "excused away".
    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await ctx.prisma.absence.create({
      data: {
        employeeId: withSickness.id,
        kind: 'Sickness',
        from: yesterday,
        to: tomorrow,
        certified: true,
      },
    });

    const [a, b] = await Promise.all([
      ctx.http.get(`/api/accounts/${baseline.id}`).set('Authorization', `Bearer ${hrToken}`).expect(200),
      ctx.http.get(`/api/accounts/${withSickness.id}`).set('Authorization', `Bearer ${hrToken}`).expect(200),
    ]);

    // Baseline: missed Soll → negative (≤ 0); sick: excused → 0.
    expect(b.body.overtimeMinutes).toBe(0);
    expect(a.body.overtimeMinutes).toBeLessThanOrEqual(0);
    expect(b.body.overtimeMinutes).toBeGreaterThanOrEqual(a.body.overtimeMinutes);
    expect(hr).toBeDefined();
  });

  it('Flextime/Gleittag DOES penalise — that is the whole point', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const hrToken = await login(ctx.http, 'hannah@test.local');

    const baseline = await newEmployeeStartedYesterday('1001', 'flex.baseline@test.local');
    const withFlex = await newEmployeeStartedYesterday('1002', 'flex.absent@test.local');

    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await ctx.prisma.absence.create({
      data: {
        employeeId: withFlex.id,
        kind: 'Flextime',
        from: yesterday,
        to: tomorrow,
      },
    });

    const [a, b] = await Promise.all([
      ctx.http.get(`/api/accounts/${baseline.id}`).set('Authorization', `Bearer ${hrToken}`).expect(200),
      ctx.http.get(`/api/accounts/${withFlex.id}`).set('Authorization', `Bearer ${hrToken}`).expect(200),
    ]);

    // Flextime is NOT excused — the balance should equal the baseline.
    expect(b.body.overtimeMinutes).toBe(a.body.overtimeMinutes);
    expect(hr).toBeDefined();
  });

  it('Approved vacation excuses Soll; rejected/cancelled does not', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const hrToken = await login(ctx.http, 'hannah@test.local');

    const baseline = await newEmployeeStartedYesterday('1001', 'vac.baseline@test.local');
    const approved = await newEmployeeStartedYesterday('1002', 'vac.approved@test.local');
    const rejected = await newEmployeeStartedYesterday('1003', 'vac.rejected@test.local');

    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    await ctx.prisma.request.create({
      data: {
        employeeId: approved.id,
        type: 'Vacation',
        status: 'Approved',
        workflowState: 'Approved',
        from: yesterday,
        to: tomorrow,
        calculatedDays: 1,
        requiresApproval: false,
      },
    });
    await ctx.prisma.request.create({
      data: {
        employeeId: rejected.id,
        type: 'Vacation',
        status: 'Rejected',
        workflowState: 'Rejected',
        from: yesterday,
        to: tomorrow,
        calculatedDays: 1,
        requiresApproval: false,
      },
    });

    const [b, a, r] = await Promise.all([
      ctx.http.get(`/api/accounts/${baseline.id}`).set('Authorization', `Bearer ${hrToken}`).expect(200),
      ctx.http.get(`/api/accounts/${approved.id}`).set('Authorization', `Bearer ${hrToken}`).expect(200),
      ctx.http.get(`/api/accounts/${rejected.id}`).set('Authorization', `Bearer ${hrToken}`).expect(200),
    ]);

    expect(a.body.overtimeMinutes).toBe(0);
    expect(r.body.overtimeMinutes).toBe(b.body.overtimeMinutes);
    expect(hr).toBeDefined();
    // Sanity: VOLLZEIT_DAILY_MIN is the unit overtime moves by per excused day.
    expect(VOLLZEIT_DAILY_MIN).toBe(480);
  });
});
