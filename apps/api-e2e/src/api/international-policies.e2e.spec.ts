import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

function dateOnly(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('International calendars and configurable break policies', () => {
  let ctx: TestContext;
  let hrToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    await seedEmployee(ctx.prisma, {
      personalNo: '9000',
      firstName: 'Admin',
      lastName: 'Example',
      email: 'admin@test.local',
      role: 'HRAdmin',
    });
    hrToken = await login(ctx.http, 'admin@test.local');
  });

  async function createEmployee(extra: Record<string, unknown> = {}) {
    const response = await ctx.http
      .post('/api/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        personalNo: '1001',
        firstName: 'Alex',
        lastName: 'Example',
        email: 'alex@test.local',
        password: 'test1234',
        role: 'Employee',
        timeModel: 'Vollzeit',
        weeklyHours: 40,
        annualLeaveDays: 20,
        startDate: '2020-01-01',
        allowDailyBlockBooking: true,
        ...extra,
      })
      .expect(201);
    return response.body;
  }

  const schedulePayload = {
    name: 'Configured policy',
    frameStart: '00:00',
    frameEnd: '23:59',
    workingDays: 127,
    coreTimes: [],
  };

  it('creates employees and schedules with neutral defaults', async () => {
    const employee = await createEmployee();
    expect(employee).toMatchObject({
      holidayCalendar: 'NONE',
      holidayDates: [],
      bundesland: null,
    });
    const schedule = await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${hrToken}`)
      .send(schedulePayload)
      .expect(201);
    expect(schedule.body.breakRules).toEqual([]);
    const token = await login(ctx.http, employee.email);
    const option = await ctx.http
      .get('/api/timeentries/daily-block/option')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(option.body).toMatchObject({
      dailyNetMinutes: 480,
      grossMinutes: 480,
      breakMinutes: 0,
    });
  });

  it('accepts legacy state aliases and can explicitly clear the German preset', async () => {
    const employee = await createEmployee({ bundesland: 'BY' });
    expect(employee).toMatchObject({
      holidayCalendar: 'DE-BY',
      bundesland: 'BY',
    });
    const updated = await ctx.http
      .put(`/api/employees/${employee.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ bundesland: 'NW' })
      .expect(200);
    expect(updated.body.holidayCalendar).toBe('DE-NW');
    await ctx.http
      .put(`/api/employees/${employee.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ bundesland: 'NW', holidayCalendar: 'NONE' })
      .expect(400);
    const cleared = await ctx.http
      .put(`/api/employees/${employee.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ holidayCalendar: 'NONE' })
      .expect(200);
    expect(cleared.body).toMatchObject({
      holidayCalendar: 'NONE',
      bundesland: null,
    });
  });

  it('uses custom holidays for leave and daily blocks, with strict date validation', async () => {
    const day = new Date();
    day.setDate(day.getDate() - 7);
    while (day.getDay() !== 1) day.setDate(day.getDate() - 1);
    const holiday = dateOnly(day);
    const friday = new Date(day);
    friday.setDate(friday.getDate() + 4);
    const employee = await createEmployee({ holidayDates: [holiday] });
    for (const invalid of [
      { holidayCalendar: null },
      { holidayCalendar: 'UNKNOWN' },
      { holidayDates: null },
      { holidayDates: [null] },
      { holidayDates: [holiday, holiday] },
    ]) {
      await ctx.http
        .put(`/api/employees/${employee.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send(invalid)
        .expect(400);
    }
    const token = await login(ctx.http, employee.email);
    await seedLeaveAllowance(ctx.prisma, employee.id, day.getFullYear(), 20);

    await ctx.http
      .put(`/api/employees/${employee.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ holidayDates: ['2026-02-30'] })
      .expect(400);
    await ctx.http
      .put(`/api/employees/${employee.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ holidayDates: ['2026-07-01T00:00:00Z'] })
      .expect(400);

    const blocked = await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: holiday, start: '08:00' })
      .expect(400);
    expect(blocked.body.code).toBe('DAILY_BLOCK_PUBLIC_HOLIDAY');
    const vacation = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: employee.id,
        from: `${holiday}T00:00:00.000Z`,
        to: `${dateOnly(friday)}T00:00:00.000Z`,
      })
      .expect(201);
    expect(vacation.body.calculatedDays).toBe(4);
  });

  it('preserves a live entry policy across schedule changes and uses its snapshot in every summary', async () => {
    const rules = [{ afterMinutes: 300, breakMinutes: 20 }];
    const schedule = await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ ...schedulePayload, breakRules: rules })
      .expect(201);
    const employee = await createEmployee({ workScheduleId: schedule.body.id });
    const token = await login(ctx.http, employee.email);
    const opened = await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const clockIn = new Date(Date.now() - 480 * 60_000);
    await ctx.prisma.timeEntry.update({
      where: { id: opened.body.id },
      data: { clockIn },
    });
    await ctx.http
      .put(`/api/work-schedules/${schedule.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ ...schedulePayload, breakRules: [] })
      .expect(200);

    const closed = await ctx.http
      .post('/api/timeentries/clock-out')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    expect(closed.body.summary).toMatchObject({
      grossMinutes: 480,
      breakMinutes: 20,
      netMinutes: 460,
    });
    const persisted = await ctx.prisma.timeEntry.update({
      where: { id: opened.body.id },
      data: { status: 'Approved' },
    });
    expect(persisted.breakRules).toEqual(rules);
    const list = await ctx.http
      .get(`/api/timeentries?employeeId=${employee.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body[0].summary).toEqual(closed.body.summary);

    const report = await ctx.http
      .get(
        `/api/reports/working-times?from=${dateOnly(clockIn)}&to=${dateOnly(new Date())}&employeeId=${employee.id}`,
      )
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(report.body.totals).toEqual(closed.body.summary);
    const exported = await ctx.http
      .get('/api/erp/timeentries')
      .set('X-API-Key', process.env.ERP_API_KEY ?? 'e2e-erp-key')
      .expect(200);
    expect(
      exported.body.find((row: { id: string }) => row.id === opened.body.id)
        ?.netMinutes,
    ).toBe(460);

    const before = await ctx.http
      .get(`/api/accounts/${employee.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await ctx.http
      .put(`/api/work-schedules/${schedule.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        ...schedulePayload,
        breakRules: [{ afterMinutes: 300, breakMinutes: 90 }],
      })
      .expect(200);
    const after = await ctx.http
      .get(`/api/accounts/${employee.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.overtimeMinutes).toBe(before.body.overtimeMinutes);
  });

  it('keeps omitted policies on updates and rejects deductions exceeding attendance thresholds', async () => {
    const rules = [{ afterMinutes: 300, breakMinutes: 20 }];
    const schedule = await ctx.http
      .post('/api/work-schedules')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ ...schedulePayload, breakRules: rules })
      .expect(201);
    const unchanged = await ctx.http
      .put(`/api/work-schedules/${schedule.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send(schedulePayload)
      .expect(200);
    expect(unchanged.body.breakRules).toEqual(rules);
    await ctx.http
      .put(`/api/work-schedules/${schedule.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        ...schedulePayload,
        breakRules: [{ afterMinutes: 10, breakMinutes: 20 }],
      })
      .expect(400);
  });
});
