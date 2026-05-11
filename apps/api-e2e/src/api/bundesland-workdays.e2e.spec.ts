import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = new Date().getUTCFullYear();
const VOLLZEIT_DAILY_MIN = (40 / 5) * 60; // 480 min

describe('Bundesland + workingDays — affect Soll calculation', () => {
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

  it('Bayern employee has fewer Soll-Stunden than NRW counterpart (Fronleichnam etc.)', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const nw = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'NRW',
      lastName: 'Tester',
      email: 'nw@test.local',
      startDate: new Date(Date.UTC(YEAR, 0, 1)),
    });
    const by = await seedEmployee(ctx.prisma, {
      personalNo: '1002',
      firstName: 'BY',
      lastName: 'Tester',
      email: 'by@test.local',
      startDate: new Date(Date.UTC(YEAR, 0, 1)),
    });
    await ctx.prisma.employee.update({ where: { id: by.id }, data: { bundesland: 'BY' } });
    await seedLeaveAllowance(ctx.prisma, nw.id, YEAR, 30);
    await seedLeaveAllowance(ctx.prisma, by.id, YEAR, 30);

    const hrToken = await login(ctx.http, 'hannah@test.local');
    const [nwAcct, byAcct] = await Promise.all([
      ctx.http
        .get(`/api/accounts/${nw.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(200),
      ctx.http
        .get(`/api/accounts/${by.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .expect(200),
    ]);
    // Both have no time entries, so overtime equals -sollMinutes. Bayern has
    // more holidays YTD ⇒ fewer Soll minutes ⇒ less negative overtime.
    expect(byAcct.body.overtimeMinutes).toBeGreaterThan(nwAcct.body.overtimeMinutes);
    expect(hr).toBeDefined();
  });

  it('Mo–Sa schedule (workingDays = 63) yields more Soll than Mo–Fr', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const employee = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Sat',
      lastName: 'Worker',
      email: 'sat@test.local',
      startDate: new Date(Date.UTC(YEAR, 0, 1)),
    });
    await seedLeaveAllowance(ctx.prisma, employee.id, YEAR, 30);

    const standard = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Mo–Fr',
        frameStart: '07:00',
        frameEnd: '23:00',
        workingDays: 31,
        isDefault: false,
      },
    });
    const monToSat = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Mo–Sa',
        frameStart: '07:00',
        frameEnd: '23:00',
        workingDays: 63, // Mo–Sa
        isDefault: false,
      },
    });
    const hrToken = await login(ctx.http, 'hannah@test.local');

    await ctx.prisma.employee.update({
      where: { id: employee.id },
      data: { workScheduleId: standard.id },
    });
    const stdAcct = await ctx.http
      .get(`/api/accounts/${employee.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);

    await ctx.prisma.employee.update({
      where: { id: employee.id },
      data: { workScheduleId: monToSat.id },
    });
    const satAcct = await ctx.http
      .get(`/api/accounts/${employee.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);

    // More working days ⇒ more Soll ⇒ more negative overtime (no entries).
    expect(satAcct.body.overtimeMinutes).toBeLessThan(stdAcct.body.overtimeMinutes);
    // Difference should be roughly the number of Saturdays YTD × VOLLZEIT_DAILY_MIN.
    const diff = stdAcct.body.overtimeMinutes - satAcct.body.overtimeMinutes;
    expect(diff).toBeGreaterThan(VOLLZEIT_DAILY_MIN); // at least one Saturday
    expect(hr).toBeDefined();
  });
});
