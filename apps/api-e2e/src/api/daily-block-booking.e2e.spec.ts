import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

function localDateValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function recentWeekday(allowedDays: number[]): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  while (!allowedDays.includes(date.getDay())) {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

describe('TimeEntries — direct daily-block booking', () => {
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
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Four-day schedule',
        frameStart: '07:00',
        frameEnd: '23:00',
        workingDays: 15, // Monday through Thursday
        isDefault: true,
      },
    });
    const employee = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Block',
      lastName: 'Booker',
      email: 'block@test.local',
      weeklyHours: 33,
      allowDailyBlockBooking: enabled,
      workScheduleId: schedule.id,
    });
    const token = await login(ctx.http, employee.email);
    return { employee, token };
  }

  it('requires an authenticated employee', async () => {
    await ctx.http.get('/api/timeentries/daily-block/option').expect(401);
    await ctx.http
      .post('/api/timeentries/daily-block')
      .send({
        date: localDateValue(recentWeekday([1, 2, 3, 4])),
        start: '08:00',
      })
      .expect(401);
  });

  it('returns the derived 8:15 daily target for a 33-hour four-day week', async () => {
    const { token } = await fixture();

    const response = await ctx.http
      .get('/api/timeentries/daily-block/option')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      enabled: true,
      dailyNetMinutes: 495,
      grossMinutes: 525,
      breakMinutes: 30,
      workdayCount: 4,
    });
  });

  it('creates one closed approved block without creating an approval request', async () => {
    const { employee, token } = await fixture();
    const date = localDateValue(recentWeekday([1, 2, 3, 4]));

    const response = await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', `Bearer ${token}`)
      .send({ date, start: '08:00' })
      .expect(201);

    expect(response.body).toMatchObject({
      employeeId: employee.id,
      source: 'DailyBlock',
      status: 'Approved',
      requiresApproval: false,
      summary: { grossMinutes: 525, breakMinutes: 30, netMinutes: 495 },
    });
    const clockIn = new Date(response.body.clockIn as string);
    const clockOut = new Date(response.body.clockOut as string);
    expect([clockIn.getHours(), clockIn.getMinutes()]).toEqual([8, 0]);
    expect([clockOut.getHours(), clockOut.getMinutes()]).toEqual([16, 45]);
    expect(
      await ctx.prisma.request.count({ where: { employeeId: employee.id } }),
    ).toBe(0);

    await ctx.http
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: employee.id,
        type: 'TimeAdjustment',
        from: response.body.clockIn,
        to: response.body.clockOut,
        reason: 'Must not duplicate the daily block',
      })
      .expect(409);

    await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', `Bearer ${token}`)
      .send({ date, start: '08:00' })
      .expect(409);
  });

  it('rejects disabled employees, non-working days, and blocks outside the frame', async () => {
    const disabled = await fixture(false);
    const workingDate = localDateValue(recentWeekday([1, 2, 3, 4]));
    await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', `Bearer ${disabled.token}`)
      .send({ date: workingDate, start: '08:00' })
      .expect(403);

    await ctx.reset();
    const enabled = await fixture(true);
    const friday = localDateValue(recentWeekday([5]));
    await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', `Bearer ${enabled.token}`)
      .send({ date: friday, start: '08:00' })
      .expect(400);
    await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', `Bearer ${enabled.token}`)
      .send({ date: workingDate, start: '20:00' })
      .expect(400);
  });

  it('rejects a day that already contains tracked time', async () => {
    const { employee, token } = await fixture();
    const day = recentWeekday([1, 2, 3, 4]);
    const clockIn = new Date(day);
    clockIn.setHours(9, 0, 0, 0);
    const clockOut = new Date(day);
    clockOut.setHours(10, 0, 0, 0);
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: employee.id,
        clockIn,
        clockOut,
        source: 'Pwa',
        status: 'Approved',
      },
    });

    const conflict = await ctx.http
      .post('/api/timeentries/daily-block')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: localDateValue(day), start: '08:00' })
      .expect(409);

    expect(conflict.body).toMatchObject({
      code: 'DAILY_BLOCK_TIME_ENTRY_CONFLICT',
      message: 'Selected day already contains a time entry',
    });
  });

  it('serializes a daily block against a simultaneous live clock-in', async () => {
    const { employee, token } = await fixture();
    await ctx.prisma.workSchedule.update({
      where: { id: employee.workScheduleId as string },
      data: { workingDays: 127 },
    });
    const today = localDateValue(new Date());

    const responses = await Promise.all([
      ctx.http
        .post('/api/timeentries/daily-block')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: today, start: '08:00' }),
      ctx.http
        .post('/api/timeentries/clock-in')
        .set('Authorization', `Bearer ${token}`)
        .send({ employeeId: '00000000-0000-4000-8000-000000000000' }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await ctx.prisma.timeEntry.count({
        where: { employeeId: employee.id },
      }),
    ).toBe(1);
  });
});
