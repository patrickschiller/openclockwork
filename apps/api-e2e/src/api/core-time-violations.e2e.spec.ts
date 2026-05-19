import { createTestApp, login, seedEmployee, type TestContext } from '../support/test-app';

// Build a calendar-style Date in the *server's* local timezone, which is what
// `detectCoreTimeViolationsForDay` consumes via `Date#getHours()`.
function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0);
}

describe('Violations — gap-based core-time detection', () => {
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

  async function setupSchedule(employeeId: string) {
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Test Standard',
        frameStart: '07:00',
        frameEnd: '23:00',
        isDefault: true,
        coreTimes: {
          create: [
            { label: 'Vormittag', start: '10:00', end: '11:00', weekdays: 31 },
            { label: 'Nachmittag', start: '14:00', end: '15:00', weekdays: 31 },
          ],
        },
      },
    });
    await ctx.prisma.employee.update({
      where: { id: employeeId },
      data: { workScheduleId: schedule.id },
    });
  }

  async function seedHrAndAnna() {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const anna = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Anna',
      lastName: 'Mueller',
      email: 'anna@test.local',
    });
    await setupSchedule(anna.id);
    const token = await login(ctx.http, 'hannah@test.local');
    return { hr, anna, token };
  }

  it('no entries on a day ⇒ no violation (employee was off)', async () => {
    const { anna, token } = await seedHrAndAnna();
    // Nothing booked at all.
    const res = await ctx.http
      .get(`/api/violations?employeeId=${anna.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('attended only outside both core windows ⇒ both windows violated', async () => {
    const { anna, token } = await seedHrAndAnna();
    // Monday 2026-05-04: 07:00–09:30 and 15:30–18:00 (no overlap with cores).
    await ctx.prisma.timeEntry.createMany({
      data: [
        {
          employeeId: anna.id,
          clockIn: local(2026, 5, 4, 7, 0),
          clockOut: local(2026, 5, 4, 9, 30),
          status: 'Approved',
        },
        {
          employeeId: anna.id,
          clockIn: local(2026, 5, 4, 15, 30),
          clockOut: local(2026, 5, 4, 18, 0),
          status: 'Approved',
        },
      ],
    });

    const res = await ctx.http
      .get(`/api/violations?employeeId=${anna.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
    expect(
      (res.body as Array<{ windowLabel: string }>).map((v) => v.windowLabel).sort(),
    ).toEqual(['Nachmittag', 'Vormittag']);
  });

  it('attended through both core windows ⇒ no violation', async () => {
    const { anna, token } = await seedHrAndAnna();
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: anna.id,
        clockIn: local(2026, 5, 4, 9, 0),
        clockOut: local(2026, 5, 4, 17, 0),
        status: 'Approved',
      },
    });

    const res = await ctx.http
      .get(`/api/violations?employeeId=${anna.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('mid-day break inside a core window ⇒ MidDayGap', async () => {
    const { anna, token } = await seedHrAndAnna();
    // Single core 09–15 hypothetical → use the existing fixtures; here, take
    // morning + early afternoon with a gap straddling the Nachmittag core.
    await ctx.prisma.timeEntry.createMany({
      data: [
        {
          employeeId: anna.id,
          clockIn: local(2026, 5, 4, 8, 0),
          clockOut: local(2026, 5, 4, 14, 30),
          status: 'Approved',
        },
        {
          employeeId: anna.id,
          clockIn: local(2026, 5, 4, 14, 45),
          clockOut: local(2026, 5, 4, 17, 0),
          status: 'Approved',
        },
      ],
    });

    const res = await ctx.http
      .get(`/api/violations?employeeId=${anna.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      windowLabel: 'Nachmittag',
      kind: 'MidDayGap',
      deltaMinutes: 15,
    });
  });

  // The cases above build entries with `local()` so the entry and the
  // core window share the test process's timezone — self-consistent, but
  // blind to the production bug where entries are absolute UTC instants
  // and the server must reason in Europe/Berlin (pinned in test-setup).
  // These two cases store entries as explicit `Z` timestamps to exercise
  // exactly that mismatch. 2026-06-16 is a Tuesday in CEST (UTC+2), so
  // the 10:00–11:00 Berlin core window is 08:00Z–09:00Z.
  describe('timezone — entries are absolute UTC instants', () => {
    async function morningCoreSchedule(employeeId: string) {
      const schedule = await ctx.prisma.workSchedule.create({
        data: {
          name: 'TZ Morning Core',
          frameStart: '07:00',
          frameEnd: '23:00',
          isDefault: false,
          coreTimes: { create: [{ label: 'Vormittag', start: '10:00', end: '11:00', weekdays: 31 }] },
        },
      });
      await ctx.prisma.employee.update({
        where: { id: employeeId },
        data: { workScheduleId: schedule.id },
      });
    }

    it('a Berlin-morning shift covering the core is not flagged', async () => {
      const anna = await seedEmployee(ctx.prisma, {
        personalNo: '1001',
        firstName: 'Anna',
        lastName: 'Mueller',
        email: 'anna@test.local',
      });
      await morningCoreSchedule(anna.id);
      // Berlin 09:00–12:00 → covers the 10:00–11:00 core.
      await ctx.prisma.timeEntry.create({
        data: {
          employeeId: anna.id,
          clockIn: new Date('2026-06-16T07:00:00Z'),
          clockOut: new Date('2026-06-16T10:00:00Z'),
          status: 'Approved',
        },
      });

      const res = await ctx.http
        .get(`/api/violations?employeeId=${anna.id}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('a Berlin-morning shift missing the core is still flagged', async () => {
      const anna = await seedEmployee(ctx.prisma, {
        personalNo: '1002',
        firstName: 'Anna',
        lastName: 'Mueller',
        email: 'anna2@test.local',
      });
      await morningCoreSchedule(anna.id);
      // Berlin 09:00–09:30 only → the 10:00–11:00 core is fully uncovered.
      await ctx.prisma.timeEntry.create({
        data: {
          employeeId: anna.id,
          clockIn: new Date('2026-06-16T07:00:00Z'),
          clockOut: new Date('2026-06-16T07:30:00Z'),
          status: 'Approved',
        },
      });

      const res = await ctx.http
        .get(`/api/violations?employeeId=${anna.id}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ boundary: '10:00–11:00', deltaMinutes: 60 });
    });
  });

  // A core-time violation is only ever assessed retroactively: the
  // current day's windows may not have elapsed yet, so evaluating today
  // would flag every employee the moment they clock in in the morning.
  describe('retroactive — the current day is never evaluated', () => {
    function ymd(d: Date): { y: number; m: number; d: number } {
      return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
    }
    function at(date: Date, hour: number, minute: number): Date {
      const { y, m, d } = ymd(date);
      return new Date(y, m, d, hour, minute, 0);
    }
    function key(date: Date): string {
      const { y, m, d } = ymd(date);
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    it('skips today but still flags yesterday', async () => {
      const anna = await seedEmployee(ctx.prisma, {
        personalNo: '1003',
        firstName: 'Anna',
        lastName: 'Mueller',
        email: 'anna3@test.local',
      });
      // Core window applies on every weekday so the test is independent
      // of which day it runs.
      const schedule = await ctx.prisma.workSchedule.create({
        data: {
          name: 'Retro Morning Core',
          frameStart: '07:00',
          frameEnd: '23:00',
          isDefault: false,
          coreTimes: { create: [{ label: 'Vormittag', start: '10:00', end: '11:00', weekdays: 127 }] },
        },
      });
      await ctx.prisma.employee.update({
        where: { id: anna.id },
        data: { workScheduleId: schedule.id },
      });

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Both days: 09:00–09:30 only → the 10:00–11:00 core is fully missed.
      await ctx.prisma.timeEntry.createMany({
        data: [
          {
            employeeId: anna.id,
            clockIn: at(today, 9, 0),
            clockOut: at(today, 9, 30),
            status: 'Approved',
          },
          {
            employeeId: anna.id,
            clockIn: at(yesterday, 9, 0),
            clockOut: at(yesterday, 9, 30),
            status: 'Approved',
          },
        ],
      });

      const res = await ctx.http
        .get(`/api/violations?employeeId=${anna.id}`)
        .expect(200);

      // Only yesterday's violation surfaces — today is in progress.
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ date: key(yesterday), boundary: '10:00–11:00' });
    });
  });

  it('Vertrauensarbeitszeit employees never have core-time violations', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const erik = await seedEmployee(ctx.prisma, {
      personalNo: '1005',
      firstName: 'Erik',
      lastName: 'Lindgren',
      email: 'erik@test.local',
      timeModel: 'Vertrauensarbeitszeit',
    });
    await setupSchedule(erik.id);
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: erik.id,
        clockIn: local(2026, 5, 4, 7, 0),
        clockOut: local(2026, 5, 4, 9, 30),
        status: 'Approved',
      },
    });
    const token = await login(ctx.http, 'hannah@test.local');

    const res = await ctx.http
      .get(`/api/violations?employeeId=${erik.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual([]);
    expect(hr).toBeDefined();
  });
});
