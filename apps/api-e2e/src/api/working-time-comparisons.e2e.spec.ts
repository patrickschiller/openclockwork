import { ReportsService } from '../../../api/src/app/reports/reports.service';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { WorkingTimeReportDto } from '../../../api/src/app/reports/reports.dto';
import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

/** These fixtures intentionally create confirmed snapshots, never legacy defaults. */
describe('Scoped working-time period comparisons', () => {
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

  async function fixture() {
    const employee = (
      personalNo: string,
      role: 'HRAdmin' | 'Manager' | 'Employee' = 'Employee',
      managerId?: string,
    ) =>
      seedEmployee(ctx.prisma, {
        personalNo,
        firstName: personalNo,
        lastName: 'Comparison',
        email: `${personalNo.toLowerCase()}@test.local`,
        holidayCalendar: 'NONE',
        role,
        managerId,
      });
    const hr = await employee('HR', 'HRAdmin');
    const manager = await employee('MANAGER', 'Manager');
    const direct = await employee('DIRECT', 'Employee', manager.id);
    const foreign = await employee('FOREIGN');
    const authorization = `Bearer ${await login(ctx.http, hr.email)}`;
    const snapshot = (
      employeeId: string,
      values: Partial<Prisma.EmployeeContractPeriodUncheckedCreateInput> = {},
    ) =>
      ctx.prisma.employeeContractPeriod.create({
        data: {
          employeeId,
          effectiveFrom: new Date('2026-01-01'),
          employmentStart: new Date('2020-01-01'),
          weeklyHours: 40,
          timeModel: 'Vollzeit',
          workingDays: 31,
          holidayCalendar: 'NONE',
          holidayDates: [],
          confirmationNote: 'Synthetic HR-confirmed contractual facts',
          confirmedById: hr.id,
          ...values,
        },
      });
    const entry = (
      employeeId: string,
      from: string,
      to: string | null,
      values: Partial<Prisma.TimeEntryUncheckedCreateInput> = {},
    ) =>
      ctx.prisma.timeEntry.create({
        data: {
          employeeId,
          clockIn: new Date(from),
          clockOut: to ? new Date(to) : null,
          status: 'Approved',
          breakRules: [],
          ...values,
        },
      });
    const report = async (from: string, to = from, employeeId?: string) =>
      (
        await ctx.http
          .get(
            `/api/reports/working-times?from=${from}&to=${to}${employeeId ? `&employeeId=${employeeId}` : ''}`,
          )
          .set('Authorization', authorization)
          .expect(200)
      ).body as WorkingTimeReportDto;
    return {
      hr,
      manager,
      direct,
      foreign,
      authorization,
      snapshot,
      entry,
      report,
    };
  }

  it('derives full-time, part-time, workmask and inclusive contract-change targets, including zero actuals', async () => {
    const { hr, manager, direct, foreign, snapshot, report } = await fixture();
    await snapshot(hr.id);
    await snapshot(manager.id, { weeklyHours: 33, workingDays: 15 });
    await snapshot(foreign.id, { weeklyHours: 20, timeModel: 'Teilzeit' });
    await snapshot(direct.id, { effectiveTo: new Date('2026-08-11') });
    await snapshot(direct.id, {
      effectiveFrom: new Date('2026-08-12'),
      weeklyHours: 20,
      timeModel: 'Teilzeit',
    });
    const result = await report('2026-08-10', '2026-08-16');
    expect(result).toMatchObject({
      timeZone: 'Europe/Berlin',
      timeDefinition: 'net_working_time',
      excessThresholdMinutes: 600,
      rows: [],
      totals: { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 },
    });
    expect(result.comparisons).toHaveLength(4);
    for (const [employeeId, target] of [
      [hr.id, 2400],
      [manager.id, 1980],
      [direct.id, 1680],
      [foreign.id, 1200],
    ] as const) {
      expect(
        result.comparisons.find((row) => row.employeeId === employeeId),
      ).toMatchObject({
        targetMinutes: target,
        actualMinutes: 0,
        differenceMinutes: -target,
        targetStatus: 'Known',
        unknownDates: [],
        reason: null,
        indicator: 'Negative',
        openEntryCount: 0,
      });
    }
  });

  it('uses employment bounds only inside confirmed coverage; never invents a prehire/legacy/weekend baseline', async () => {
    const { direct, foreign, snapshot, report } = await fixture();
    await snapshot(direct.id, {
      effectiveFrom: new Date('2026-08-01'),
      effectiveTo: new Date('2026-08-31'),
      employmentStart: new Date('2026-08-11'),
      employmentEnd: new Date('2026-08-12'),
    });
    expect(
      (await report('2026-08-10', '2026-08-14', direct.id)).comparisons[0],
    ).toMatchObject({
      targetMinutes: 960,
      targetStatus: 'Known',
      unknownDates: [],
    });
    expect(
      (await report('2026-08-10', '2026-08-10', direct.id)).comparisons[0]
        .targetMinutes,
    ).toBe(0);
    expect(
      (await report('2026-08-13', '2026-08-14', direct.id)).comparisons[0]
        .targetMinutes,
    ).toBe(0);
    // An old employee without history is unknown, even when the live start date
    // or weekend would otherwise suggest that their target is zero.
    await ctx.prisma.employee.update({
      where: { id: foreign.id },
      data: { startDate: new Date('2027-01-01') },
    });
    expect(
      (await report('2026-08-15', '2026-08-16', foreign.id)).comparisons[0],
    ).toMatchObject({
      targetMinutes: null,
      differenceMinutes: null,
      targetStatus: 'Unknown',
      unknownDates: ['2026-08-15', '2026-08-16'],
      reason: 'CONTRACT_HISTORY_GAP',
      indicator: 'Unknown',
    });
    await snapshot(foreign.id, { effectiveFrom: new Date('2026-08-18') });
    expect(
      (await report('2026-08-17', '2026-08-18', foreign.id)).comparisons[0],
    ).toMatchObject({
      targetMinutes: null,
      differenceMinutes: null,
      unknownDates: ['2026-08-17'],
    });
  });

  it('nulls the whole target/difference on any daily gap but retains actual minutes and known date coverage', async () => {
    const { direct, snapshot, entry, report } = await fixture();
    await snapshot(direct.id, { effectiveTo: new Date('2026-08-11') });
    await snapshot(direct.id, { effectiveFrom: new Date('2026-08-13') });
    await entry(direct.id, '2026-08-12T06:00:00Z', '2026-08-12T08:00:00Z');
    const result = await report('2026-08-10', '2026-08-14', direct.id);
    expect(result.comparisons[0]).toMatchObject({
      targetMinutes: null,
      actualMinutes: 120,
      differenceMinutes: null,
      targetStatus: 'Unknown',
      unknownDates: ['2026-08-12'],
      reason: 'CONTRACT_HISTORY_GAP',
      indicator: 'Unknown',
    });
    expect(result.totals.netMinutes).toBe(120);
    expect(
      (await report('2026-08-10', '2026-08-11', direct.id)).comparisons[0]
        .targetMinutes,
    ).toBe(960);
  });

  it('keeps historical schedule, hours, employment and holiday facts immutable when current employee defaults change', async () => {
    const { direct, snapshot, report } = await fixture();
    const confirmed = await snapshot(direct.id, {
      weeklyHours: 33,
      workingDays: 15,
      holidayDates: ['2026-08-11'],
      scheduleLabel: 'Historic four-day week',
    });
    const before = (await report('2026-08-10', '2026-08-14', direct.id))
      .comparisons[0];
    expect(before.targetMinutes).toBe(1485);
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Changed live schedule',
        workingDays: 127,
        frameStart: '00:00',
        frameEnd: '23:59',
      },
    });
    await ctx.prisma.employee.update({
      where: { id: direct.id },
      data: {
        weeklyHours: 10,
        timeModel: 'Teilzeit',
        startDate: new Date('2027-01-01'),
        workScheduleId: schedule.id,
        holidayCalendar: 'DE-BY',
        holidayDates: ['2026-08-10', '2026-08-12', '2026-08-13'],
      },
    });
    expect(
      (await report('2026-08-10', '2026-08-14', direct.id)).comparisons[0],
    ).toEqual(before);
    expect(
      await ctx.prisma.employeeContractPeriod.findUnique({
        where: { id: confirmed.id },
      }),
    ).toEqual(confirmed);
  });

  it('uses snapshot preset/custom holidays and only recorded sickness/training as non-request excusals', async () => {
    const { direct, snapshot, report } = await fixture();
    await snapshot(direct.id, {
      holidayCalendar: 'DE-BY',
      holidayDates: ['2026-01-07'],
    });
    await ctx.prisma.absence.createMany({
      data: [
        {
          employeeId: direct.id,
          kind: 'Training',
          from: new Date('2026-01-08'),
          to: new Date('2026-01-08'),
        },
        {
          employeeId: direct.id,
          kind: 'Sickness',
          from: new Date('2026-01-09'),
          to: new Date('2026-01-09'),
        },
        {
          employeeId: direct.id,
          kind: 'Flextime',
          from: new Date('2026-01-05'),
          to: new Date('2026-01-05'),
        },
      ],
    });
    // Jan 6 is a Bavarian preset holiday; Jan 7 is a custom snapshot holiday.
    expect(
      (await report('2026-01-05', '2026-01-09', direct.id)).comparisons[0],
    ).toMatchObject({ targetMinutes: 480, actualMinutes: 0 });
  });

  it('reduces targets only for approved leave, unions duplicate half-days and never double-credits work', async () => {
    const { direct, snapshot, entry, report } = await fixture();
    await snapshot(direct.id);
    const leave = (
      from: string,
      to = from,
      values: Partial<Prisma.RequestUncheckedCreateInput> = {},
    ) =>
      ctx.prisma.request.create({
        data: {
          employeeId: direct.id,
          type: 'Vacation',
          status: 'Approved',
          workflowState: 'Approved',
          from: new Date(from),
          to: new Date(to),
          ...values,
        },
      });
    await leave('2026-08-10', undefined, {
      halfDayStart: true,
      halfDayEnd: true,
    });
    await leave('2026-08-10', undefined, {
      type: 'SpecialLeave',
      halfDayStart: true,
    });
    await leave('2026-08-10', undefined, { type: 'HomeOffice' });
    await leave('2026-08-11');
    await leave('2026-08-12', undefined, { type: 'SpecialLeave' });
    await leave('2026-08-13', undefined, {
      status: 'Submitted',
      workflowState: 'PendingManager',
    });
    await leave('2026-08-13', undefined, { cancelledAt: new Date() });
    await leave('2026-08-14', undefined, {
      status: 'Rejected',
      workflowState: 'Rejected',
    });
    await leave('2026-08-14', undefined, { type: 'HomeOffice' });
    await leave('2026-08-17', '2026-08-19', {
      halfDayStart: true,
      halfDayEnd: true,
    });
    await ctx.prisma.absence.createMany({
      data: [
        {
          employeeId: direct.id,
          kind: 'Flextime',
          from: new Date('2026-08-13'),
          to: new Date('2026-08-13'),
        },
        {
          employeeId: direct.id,
          kind: 'Training',
          from: new Date('2026-08-11'),
          to: new Date('2026-08-11'),
        },
      ],
    });
    await entry(direct.id, '2026-08-11T06:00:00Z', '2026-08-11T07:00:00Z');
    const result = await report('2026-08-10', '2026-08-21', direct.id);
    // 240 + 0 + 0 + 480 + 480 + 240 + 0 + 240 + 480 + 480.
    expect(result.comparisons[0]).toMatchObject({
      targetMinutes: 2640,
      actualMinutes: 60,
      differenceMinutes: -2580,
    });
    expect(result.totals.netMinutes).toBe(60);
    expect(
      (await report('2026-08-11', '2026-08-11', direct.id)).comparisons[0],
    ).toMatchObject({
      targetMinutes: 0,
      actualMinutes: 60,
      differenceMinutes: 60,
    });
  });

  it('includes only closed Pending/Approved entries and counts open timers separately', async () => {
    const { direct, snapshot, entry, report } = await fixture();
    await snapshot(direct.id);
    const accepted = await entry(
      direct.id,
      '2026-08-10T06:00:00Z',
      '2026-08-10T14:00:00Z',
      {
        breakRules: [{ afterMinutes: 360, breakMinutes: 30 }],
      },
    );
    const pending = await entry(
      direct.id,
      '2026-08-10T15:00:00Z',
      '2026-08-10T16:00:00Z',
      { status: 'Pending' },
    );
    for (const values of [
      { status: 'Open' as const },
      { status: 'Rejected' as const },
      { voidedAt: new Date() },
    ]) {
      await entry(
        direct.id,
        '2026-08-10T17:00:00Z',
        '2026-08-10T18:00:00Z',
        values,
      );
    }
    // The database intentionally permits only one non-voided running row per
    // employee (including rejected legacy rows), so test exclusion separately.
    const oldOpen = await entry(direct.id, '2026-08-09T12:00:00Z', null, {
      status: 'Open',
    });
    expect(
      (await report('2026-08-10', '2026-08-10', direct.id)).comparisons[0]
        .openEntryCount,
    ).toBe(1);
    await ctx.prisma.timeEntry.update({
      where: { id: oldOpen.id },
      data: { voidedAt: new Date() },
    });
    const rejectedOpen = await entry(direct.id, '2026-08-10T12:00:00Z', null, {
      status: 'Rejected',
    });
    expect(
      (await report('2026-08-10', '2026-08-10', direct.id)).comparisons[0]
        .openEntryCount,
    ).toBe(0);
    await ctx.prisma.timeEntry.update({
      where: { id: rejectedOpen.id },
      data: { voidedAt: new Date() },
    });
    const futureOpen = await entry(direct.id, '2026-08-11T12:00:00Z', null, {
      status: 'Open',
    });
    expect(
      (await report('2026-08-10', '2026-08-10', direct.id)).comparisons[0]
        .openEntryCount,
    ).toBe(0);
    await ctx.prisma.timeEntry.update({
      where: { id: futureOpen.id },
      data: { voidedAt: new Date() },
    });
    await entry(direct.id, '2026-08-10T12:00:00Z', null, { status: 'Open' });
    const result = await report('2026-08-10', '2026-08-10', direct.id);
    expect(result.rows.map((row) => row.id)).toEqual([accepted.id, pending.id]);
    expect(result.totals).toEqual({
      grossMinutes: 540,
      breakMinutes: 30,
      netMinutes: 510,
    });
    expect(result.comparisons[0]).toMatchObject({
      targetMinutes: 480,
      actualMinutes: 510,
      differenceMinutes: 30,
      indicator: 'Positive',
      openEntryCount: 1,
    });
  });

  it('allocates complete capture-group breaks before local clipping and excludes invalid/foreign siblings', async () => {
    const { direct, foreign, snapshot, entry, report } = await fixture();
    await snapshot(direct.id);
    const captureGroupId = randomUUID();
    const group = {
      captureGroupId,
      breakRules: [{ afterMinutes: 360, breakMinutes: 30 }],
    };
    // First four-hour member is half inside the requested Berlin local day.
    const first = await entry(
      direct.id,
      '2026-08-09T20:00:00Z',
      '2026-08-10T00:00:00Z',
      group,
    );
    await entry(
      direct.id,
      '2026-08-11T06:00:00Z',
      '2026-08-11T10:00:00Z',
      group,
    );
    await entry(direct.id, '2026-08-12T06:00:00Z', '2026-08-12T10:00:00Z', {
      ...group,
      status: 'Rejected',
    });
    await entry(direct.id, '2026-08-13T06:00:00Z', '2026-08-13T10:00:00Z', {
      ...group,
      voidedAt: new Date(),
    });
    await entry(direct.id, '2026-08-14T06:00:00Z', '2026-08-14T10:00:00Z', {
      ...group,
      status: 'Open',
    });
    await entry(
      foreign.id,
      '2026-08-10T06:00:00Z',
      '2026-08-10T10:00:00Z',
      group,
    );
    const clipped = await report('2026-08-10', '2026-08-10', direct.id);
    expect(clipped.rows).toHaveLength(1);
    expect(clipped.rows[0]).toMatchObject({
      id: first.id,
      date: '2026-08-10',
      clockIn: '2026-08-09T22:00:00.000Z',
      clockOut: '2026-08-10T00:00:00.000Z',
      grossMinutes: 120,
      breakMinutes: 7.5,
      netMinutes: 112.5,
    });
    expect(clipped.totals).toEqual({
      grossMinutes: 120,
      breakMinutes: 7.5,
      netMinutes: 112.5,
    });
    expect(clipped.comparisons[0].actualMinutes).toBe(112.5);
    const full = await report('2026-08-09', '2026-08-11', direct.id);
    expect(full.rows).toHaveLength(3);
    expect(full.totals).toEqual({
      grossMinutes: 480,
      breakMinutes: 30,
      netMinutes: 450,
    });
    expect(full.comparisons[0].actualMinutes).toBe(450);
  });

  it.each([
    [
      'spring-forward',
      '2026-03-28T22:30:00Z',
      '2026-03-29T02:30:00Z',
      '2026-03-29',
      210,
      '2026-03-28T23:00:00.000Z',
    ],
    [
      'fall-back',
      '2026-10-24T21:30:00Z',
      '2026-10-25T03:30:00Z',
      '2026-10-25',
      330,
      '2026-10-24T22:00:00.000Z',
    ],
  ] as const)(
    'clips across local midnight and %s without pretending every local day is 24 hours',
    async (_label, from, to, date, minutes, expectedStart) => {
      const { direct, snapshot, entry, report } = await fixture();
      await snapshot(direct.id, { workingDays: 127, weeklyHours: 7 });
      await entry(direct.id, from, to, { captureGroupId: randomUUID() });
      const result = await report(date, date, direct.id);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        date,
        clockIn: expectedStart,
        clockOut: new Date(to).toISOString(),
        grossMinutes: minutes,
        netMinutes: minutes,
      });
      expect(result.totals.netMinutes).toBe(minutes);
      expect(result.comparisons[0]).toMatchObject({
        targetMinutes: 60,
        actualMinutes: minutes,
        differenceMinutes: Number(minutes) - 60,
      });
    },
  );

  it('splits a whole local day through both DST transitions using elapsed minutes, with seconds retained', async () => {
    const { direct, snapshot, entry, report } = await fixture();
    await snapshot(direct.id, { weeklyHours: 0 });
    await entry(direct.id, '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z');
    await entry(direct.id, '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z');
    expect(
      (await report('2026-03-29', '2026-03-29', direct.id)).totals.netMinutes,
    ).toBe(1380);
    expect(
      (await report('2026-10-25', '2026-10-25', direct.id)).totals.netMinutes,
    ).toBe(1500);
    await entry(direct.id, '2026-08-10T07:00:01Z', '2026-08-10T15:00:59Z', {
      breakRules: [{ afterMinutes: 360, breakMinutes: 30 }],
    });
    const seconds = await report('2026-08-10', '2026-08-10', direct.id);
    expect(seconds.rows[0].grossMinutes).toBeCloseTo(480 + 58 / 60, 8);
    expect(seconds.comparisons[0].actualMinutes).toBeCloseTo(450 + 58 / 60, 8);
    expect(seconds.comparisons[0].actualMinutes).toBe(
      seconds.totals.netMinutes,
    );
  });

  it('uses selected-period indicator boundaries, not opening or carried balances', async () => {
    const { direct, snapshot, entry, report } = await fixture();
    await snapshot(direct.id, { weeklyHours: 0 });
    await ctx.prisma.employee.update({
      where: { id: direct.id },
      data: { overtimeOpeningBalanceMinutes: -9999 },
    });
    for (const [date, minutes, indicator] of [
      ['2026-08-10', 0, 'Balanced'],
      ['2026-08-11', 599, 'Positive'],
      ['2026-08-12', 600, 'Excess'],
      ['2026-08-13', 601, 'Excess'],
    ] as const) {
      if (minutes)
        await entry(
          direct.id,
          `${date}T06:00:00Z`,
          new Date(
            new Date(`${date}T06:00:00Z`).getTime() + minutes * 60_000,
          ).toISOString(),
        );
      expect(
        (await report(date, date, direct.id)).comparisons[0],
      ).toMatchObject({
        targetMinutes: 0,
        actualMinutes: minutes,
        differenceMinutes: minutes,
        indicator,
      });
    }
  });

  it('scopes manager lists/reports to self and direct reports and forbids foreign IDs even without entries', async () => {
    const { hr, manager, direct, foreign, authorization } = await fixture();
    const indirect = await seedEmployee(ctx.prisma, {
      personalNo: 'INDIRECT',
      firstName: 'Indirect',
      lastName: 'Report',
      email: 'indirect@test.local',
      managerId: direct.id,
    });
    const managerAuth = `Bearer ${await login(ctx.http, manager.email)}`;
    const employees = await ctx.http
      .get('/api/reports/working-times/employees')
      .set('Authorization', managerAuth)
      .expect(200);
    expect(
      new Set(employees.body.map((employee: { id: string }) => employee.id)),
    ).toEqual(new Set([manager.id, direct.id]));
    const result = await ctx.http
      .get('/api/reports/working-times?from=2026-08-10&to=2026-08-10')
      .set('Authorization', managerAuth)
      .expect(200);
    expect(
      new Set(
        result.body.comparisons.map(
          (row: { employeeId: string }) => row.employeeId,
        ),
      ),
    ).toEqual(new Set([manager.id, direct.id]));
    for (const forbidden of [hr.id, foreign.id, indirect.id, randomUUID()]) {
      for (const filter of [
        `employeeId=${forbidden}`,
        `employeeIds=${direct.id}&employeeIds=${forbidden}`,
      ]) {
        await ctx.http
          .get(
            `/api/reports/working-times?from=2026-08-10&to=2026-08-10&${filter}`,
          )
          .set('Authorization', managerAuth)
          .expect(403);
      }
    }
    const hrEmployees = await ctx.http
      .get('/api/reports/working-times/employees')
      .set('Authorization', authorization)
      .expect(200);
    expect(hrEmployees.body).toHaveLength(5);
    await ctx.http
      .get(
        `/api/reports/working-times?from=2026-08-10&to=2026-08-10&employeeId=${foreign.id}`,
      )
      .set('Authorization', authorization)
      .expect(200);
    // A manager's scope follows the current server relationship immediately.
    await ctx.prisma.employee.update({
      where: { id: direct.id },
      data: { managerId: null },
    });
    await ctx.http
      .get(
        `/api/reports/working-times?from=2026-08-10&to=2026-08-10&employeeId=${direct.id}`,
      )
      .set('Authorization', managerAuth)
      .expect(403);
  });

  it('uses fresh active actor roles for existing tokens; employees are denied and PDF remains HR-only', async () => {
    const { hr, manager, direct, authorization } = await fixture();
    const managerAuth = `Bearer ${await login(ctx.http, manager.email)}`;
    const employeeAuth = `Bearer ${await login(ctx.http, direct.email)}`;
    const reportUrl =
      '/api/reports/working-times?from=2026-08-10&to=2026-08-10';
    const employeesUrl = '/api/reports/working-times/employees';
    const pdfUrl =
      '/api/reports/working-times.pdf?from=2026-08-10&to=2026-08-10';
    for (const url of [reportUrl, employeesUrl, pdfUrl]) {
      await ctx.http.get(url).expect(401);
      await ctx.http.get(url).set('Authorization', employeeAuth).expect(403);
    }
    await ctx.http.get(pdfUrl).set('Authorization', managerAuth).expect(403);
    await ctx.http.get(pdfUrl).set('Authorization', authorization).expect(200);
    await ctx.prisma.employee.update({
      where: { id: hr.id },
      data: { role: 'Employee' },
    });
    await ctx.prisma.employee.update({
      where: { id: manager.id },
      data: { role: 'Employee' },
    });
    for (const url of [reportUrl, employeesUrl, pdfUrl]) {
      await ctx.http.get(url).set('Authorization', authorization).expect(403);
      await ctx.http.get(url).set('Authorization', managerAuth).expect(403);
    }
    await ctx.prisma.employee.update({
      where: { id: direct.id },
      data: { role: 'Manager' },
    });
    await ctx.http
      .get(reportUrl)
      .set('Authorization', employeeAuth)
      .expect(200);
    await ctx.prisma.employee.update({
      where: { id: direct.id },
      data: { isActive: false },
    });
    for (const url of [reportUrl, employeesUrl, pdfUrl]) {
      await ctx.http.get(url).set('Authorization', employeeAuth).expect(401);
    }
  });
  it('does not expose archived Team report data after an in-flight switch to Solo', async () => {
    const { hr, direct, snapshot, entry } = await fixture();
    await snapshot(direct.id);
    await entry(direct.id, '2026-08-10T06:00:00Z', '2026-08-10T14:00:00Z');
    await ctx.prisma.installationSettings.create({
      data: {
        id: 1,
        mode: 'Solo',
        ownerEmployeeId: hr.id,
        setupCompleted: true,
      },
    });
    const service = ctx.app.get(ReportsService);
    await expect(service.workingTimeEmployees(hr.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.workingTimes(hr.id, { from: '2026-08-10', to: '2026-08-10' }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('keeps physical location snapshots only on original booking edges, not synthetic midnight clips', async () => {
    const { direct, entry, authorization } = await fixture();
    await entry(direct.id, '2026-08-09T21:00:00Z', '2026-08-10T00:00:00Z', {
      terminalLocationLabel: 'Synthetic entrance',
      latitude: 0,
      longitude: 0,
      accuracyMeters: 5,
      clockOutTerminalLocationLabel: 'Synthetic exit',
      clockOutLatitude: 1,
      clockOutLongitude: 1,
      clockOutAccuracyMeters: 6,
    });
    const response = await ctx.http
      .get(
        `/api/reports/working-times?from=2026-08-09&to=2026-08-10&employeeId=${direct.id}&includeLocations=true`,
      )
      .set('Authorization', authorization)
      .expect(200);
    expect(response.body.rows).toHaveLength(2);
    expect(response.body.rows[0]).toMatchObject({
      date: '2026-08-09',
      clockInLocation: {
        label: 'Synthetic entrance',
        latitude: 0,
        longitude: 0,
        accuracyMeters: 5,
      },
      clockOutLocation: null,
    });
    expect(response.body.rows[1]).toMatchObject({
      date: '2026-08-10',
      clockInLocation: null,
      clockOutLocation: {
        label: 'Synthetic exit',
        latitude: 1,
        longitude: 1,
        accuracyMeters: 6,
      },
    });
    const clipped = await ctx.http
      .get(
        `/api/reports/working-times?from=2026-08-10&to=2026-08-10&employeeId=${direct.id}&includeLocations=true`,
      )
      .set('Authorization', authorization)
      .expect(200);
    expect(clipped.body.rows).toHaveLength(1);
    expect(clipped.body.rows[0].clockInLocation).toBeNull();
    expect(clipped.body.totals.netMinutes).toBe(120);
  });
});
