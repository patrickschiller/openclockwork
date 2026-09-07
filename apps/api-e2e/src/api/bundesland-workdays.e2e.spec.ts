import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = new Date().getUTCFullYear();
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
    await ctx.prisma.employee.update({
      where: { id: by.id },
      data: { bundesland: 'BY', holidayCalendar: 'DE-BY' },
    });
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
    expect(byAcct.body.overtimeMinutes).toBeGreaterThan(
      nwAcct.body.overtimeMinutes,
    );
    expect(hr).toBeDefined();
  });

  it('distributes the same weekly target over shorter Mo–Sa workdays', async () => {
    const employee = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Sat',
      lastName: 'Worker',
      email: 'sat@test.local',
      startDate: new Date(Date.UTC(YEAR, 0, 1)),
    });

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
    const employeeToken = await login(ctx.http, 'sat@test.local');

    await ctx.prisma.employee.update({
      where: { id: employee.id },
      data: { workScheduleId: standard.id },
    });
    const standardOption = await ctx.http
      .get('/api/timeentries/daily-block/option')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    await ctx.prisma.employee.update({
      where: { id: employee.id },
      data: { workScheduleId: monToSat.id },
    });
    const monToSatOption = await ctx.http
      .get('/api/timeentries/daily-block/option')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    expect(standardOption.body).toMatchObject({
      dailyNetMinutes: 480,
      workdayCount: 5,
    });
    expect(monToSatOption.body).toMatchObject({
      dailyNetMinutes: 400,
      workdayCount: 6,
    });
  });
});
