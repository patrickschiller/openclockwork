import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('Solo summaries preserve optional rules and calendar history', () => {
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
    const owner = await seedEmployee(ctx.prisma, {
      personalNo: 'SUMMARY',
      firstName: 'Solo',
      lastName: 'Summary',
      email: 'solo-summary@test.local',
      role: 'HRAdmin',
      holidayCalendar: 'NONE',
    });
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode: 'Solo', ownerEmployeeId: owner.id },
      update: { mode: 'Solo', ownerEmployeeId: owner.id },
    });
    const authorization = `Bearer ${await login(ctx.http, owner.email)}`;
    const policy = (
      effectiveFrom: string,
      values: Partial<Prisma.SoloPolicyUncheckedCreateInput> = {},
    ) =>
      ctx.prisma.soloPolicy.create({
        data: {
          employeeId: owner.id,
          effectiveFrom: new Date(effectiveFrom),
          targetEnabled: false,
          leaveEnabled: false,
          holidayCalendar: 'NONE',
          workingDays: 31,
          ...values,
        },
      });
    const entry = (
      from: string,
      to: string,
      values: Partial<Prisma.TimeEntryUncheckedCreateInput> = {},
    ) =>
      ctx.prisma.timeEntry.create({
        data: {
          employeeId: owner.id,
          clockIn: new Date(from),
          clockOut: new Date(to),
          captureGroupId: randomUUID(),
          status: 'Approved',
          breakRules: [],
          ...values,
        },
      });
    const day = (
      from: string,
      to = from,
      values: Partial<Prisma.PersonalDayUncheckedCreateInput> = {},
    ) =>
      ctx.prisma.personalDay.create({
        data: {
          employeeId: owner.id,
          kind: 'Vacation',
          from: new Date(from),
          to: new Date(to),
          ...values,
        },
      });
    const summary = async (from: string, to = from) =>
      (
        await ctx.http
          .get(`/api/installation/summary?from=${from}&to=${to}`)
          .set('Authorization', authorization)
          .expect(200)
      ).body;
    return { owner, authorization, policy, entry, day, summary };
  }

  it('does not turn work before activation or after deactivation into overtime', async () => {
    const { policy, entry, summary } = await fixture();
    await policy('2026-09-01');
    await policy('2026-09-09', {
      targetEnabled: true,
      weeklyTargetMinutes: 600,
    });
    await policy('2026-09-11', { targetEnabled: false });
    await entry('2026-09-07T06:00:00Z', '2026-09-07T16:00:00Z');
    await entry('2026-09-09T06:00:00Z', '2026-09-09T09:00:00Z');
    await entry('2026-09-10T06:00:00Z', '2026-09-10T08:00:00Z');
    await entry('2026-09-11T02:00:00Z', '2026-09-11T17:00:00Z');
    const combined = await summary('2026-09-07', '2026-09-11');
    expect(combined).toMatchObject({
      actualMinutes: 1800,
      targetActualMinutes: 300,
      targetMinutes: 240,
      overtimeMinutes: 60,
      targetEnabled: true,
    });
    expect(await summary('2026-09-07')).toMatchObject({
      actualMinutes: 600,
      targetEnabled: false,
      targetActualMinutes: null,
      targetMinutes: null,
      overtimeMinutes: null,
    });
    expect(await summary('2026-09-11')).toMatchObject({
      actualMinutes: 900,
      targetEnabled: false,
      overtimeMinutes: null,
    });
  });

  it('never applies a future/current policy to an earlier interval and preserves policy revisions', async () => {
    const { policy, entry, summary } = await fixture();
    await policy('2026-09-08', {
      targetEnabled: true,
      weeklyTargetMinutes: 600,
      leaveEnabled: true,
      annualLeaveDays: 20,
    });
    await policy('2026-09-10', {
      targetEnabled: true,
      weeklyTargetMinutes: 1200,
      leaveEnabled: true,
      annualLeaveDays: 25,
    });
    await entry('2026-09-07T08:00:00Z', '2026-09-07T09:00:00Z');
    expect(await summary('2026-09-07')).toMatchObject({
      actualMinutes: 60,
      targetMinutes: null,
      overtimeMinutes: null,
      leaveEnabled: false,
      vacationDaysTotal: null,
    });
    expect(await summary('2026-09-08')).toMatchObject({
      targetMinutes: 120,
      vacationDaysTotal: 20,
    });
    expect(await summary('2026-09-10')).toMatchObject({
      targetMinutes: 240,
      vacationDaysTotal: 25,
    });
  });

  it('splits net duration at local midnight and keeps DST and sub-minute precision consistent with reports', async () => {
    const { policy, entry, summary, authorization } = await fixture();
    await policy('2026-03-29', {
      targetEnabled: true,
      weeklyTargetMinutes: 420,
      workingDays: 127,
    });
    await entry('2026-03-28T22:30:00Z', '2026-03-29T02:30:00Z');
    expect(await summary('2026-03-29')).toMatchObject({
      actualMinutes: 210,
      targetActualMinutes: 210,
      targetMinutes: 60,
      overtimeMinutes: 150,
    });
    await policy('2026-09-01');
    await policy('2026-09-08', {
      targetEnabled: true,
      weeklyTargetMinutes: 150,
    });
    await entry('2026-09-07T21:30:00Z', '2026-09-07T22:30:00Z');
    await entry('2026-09-08T08:00:00Z', '2026-09-08T08:00:30Z');
    const values = await summary('2026-09-07', '2026-09-08');
    expect(values).toMatchObject({
      actualMinutes: 60.5,
      targetActualMinutes: 30.5,
      targetMinutes: 30,
      overtimeMinutes: 0.5,
    });
    const report = await ctx.http
      .get('/api/reports/solo?from=2026-09-07&to=2026-09-08')
      .set('Authorization', authorization)
      .expect(200);
    expect(values.actualMinutes).toBe(report.body.totals.netMinutes);
  });

  it('retains legacy vacation/absence history without double counting overlapping sources', async () => {
    const { owner, policy, day, summary } = await fixture();
    await policy('2026-05-04', {
      targetEnabled: true,
      weeklyTargetMinutes: 2400,
      leaveEnabled: true,
      annualLeaveDays: 20,
      leaveAllowanceYear: 2026,
    });
    // A personal free day recorded while its leave account was off is not
    // retroactively turned into vacation consumption when the account starts.
    await day('2026-03-02');
    await ctx.prisma.request.createMany({
      data: [
        {
          employeeId: owner.id,
          type: 'Vacation',
          workflowState: 'Approved',
          status: 'Approved',
          from: new Date('2026-04-01'),
          to: new Date('2026-04-01'),
          calculatedDays: 1,
        },
        {
          employeeId: owner.id,
          type: 'Vacation',
          workflowState: 'Approved',
          status: 'Approved',
          from: new Date('2026-05-04'),
          to: new Date('2026-05-05'),
          halfDayStart: true,
          calculatedDays: 1.5,
        },
        {
          employeeId: owner.id,
          type: 'Vacation',
          workflowState: 'Approved',
          status: 'Approved',
          from: new Date('2026-05-04'),
          to: new Date('2026-05-05'),
          halfDayStart: true,
          calculatedDays: 1.5,
        },
        {
          employeeId: owner.id,
          type: 'Vacation',
          workflowState: 'Cancelled',
          status: 'Cancelled',
          from: new Date('2026-05-08'),
          to: new Date('2026-05-08'),
          calculatedDays: 1,
        },
      ],
    });
    await day('2026-05-04', '2026-05-05', { halfDayStart: true });
    await ctx.prisma.absence.createMany({
      data: [
        {
          employeeId: owner.id,
          kind: 'Sickness',
          from: new Date('2026-05-06'),
          to: new Date('2026-05-06'),
        },
        {
          employeeId: owner.id,
          kind: 'Training',
          from: new Date('2026-05-07'),
          to: new Date('2026-05-07'),
        },
        {
          employeeId: owner.id,
          kind: 'Flextime',
          from: new Date('2026-05-08'),
          to: new Date('2026-05-08'),
        },
      ],
    });
    const values = await summary('2026-05-04', '2026-05-08');
    expect(values).toMatchObject({
      targetMinutes: 720,
      overtimeMinutes: -720,
      vacationDaysTotal: 20,
      vacationDaysUsed: 2.5,
      vacationDaysRemaining: 17.5,
    });
  });

  it('preserves a legacy stored leave total even when the old working calendar is unavailable', async () => {
    const { owner, policy, summary } = await fixture();
    await policy('2026-01-01', {
      leaveEnabled: true,
      annualLeaveDays: 20,
      workingDays: 31,
    });
    await ctx.prisma.request.create({
      data: {
        employeeId: owner.id,
        type: 'Vacation',
        workflowState: 'Approved',
        status: 'Approved',
        from: new Date('2026-05-09'),
        to: new Date('2026-05-09'),
        calculatedDays: 1,
      },
    });
    expect(await summary('2026-05-09')).toMatchObject({
      vacationDaysUsed: 1,
      vacationDaysRemaining: 19,
    });
  });

  it('expires only unconsumed carry-over as of the requested date, keeping year-specific adjustments', async () => {
    const { policy, day, summary } = await fixture();
    await policy('2026-01-01', {
      leaveEnabled: true,
      annualLeaveDays: 20,
      carryOverDays: 5,
      carryOverExpiresOn: new Date('2026-03-31'),
      leaveAdjustmentDays: 2,
      leaveAdjustmentReason: 'Explicit opening correction',
      leaveAllowanceYear: 2026,
    });
    await day('2026-01-05', '2026-01-06');
    await day('2026-03-31');
    expect(await summary('2026-01-01', '2026-01-04')).toMatchObject({
      vacationDaysTotal: 27,
      vacationDaysUsed: 0,
      vacationDaysCarryOverExpired: 0,
    });
    expect(await summary('2026-03-31')).toMatchObject({
      vacationDaysTotal: 27,
      vacationDaysUsed: 3,
      vacationDaysRemaining: 24,
      vacationDaysCarryOver: 5,
      vacationDaysCarryOverExpired: 0,
    });
    expect(await summary('2026-04-01')).toMatchObject({
      vacationDaysTotal: 25,
      vacationDaysUsed: 3,
      vacationDaysRemaining: 22,
      vacationDaysCarryOver: 3,
      vacationDaysCarryOverUsed: 3,
      vacationDaysCarryOverExpired: 2,
    });
    expect(await summary('2027-01-01')).toMatchObject({
      vacationDaysTotal: 20,
      vacationDaysUsed: 0,
      vacationDaysCarryOver: 0,
      vacationDaysAdjustment: 0,
    });
  });

  it('allocates half days across the year boundary once and keeps the requested year balance separate', async () => {
    const { owner, policy, day, summary } = await fixture();
    await policy('2026-01-01', {
      leaveEnabled: true,
      annualLeaveDays: 20,
      carryOverDays: 3,
      leaveAdjustmentDays: 1,
      leaveAllowanceYear: 2026,
    });
    await day('2026-12-31', '2027-01-04', {
      halfDayStart: true,
      halfDayEnd: true,
    });
    await ctx.prisma.request.create({
      data: {
        employeeId: owner.id,
        type: 'Vacation',
        workflowState: 'Approved',
        status: 'Approved',
        from: new Date('2026-12-31'),
        to: new Date('2027-01-04'),
        halfDayStart: true,
        halfDayEnd: true,
        calculatedDays: 2,
      },
    });
    expect(await summary('2026-12-31')).toMatchObject({
      vacationAllowanceYear: 2026,
      vacationDaysTotal: 24,
      vacationDaysUsed: 0.5,
      vacationDaysRemaining: 23.5,
    });
    expect(await summary('2026-12-31', '2027-01-04')).toMatchObject({
      vacationAllowanceYear: 2027,
      vacationDaysTotal: 20,
      vacationDaysUsed: 1.5,
      vacationDaysRemaining: 18.5,
    });
  });

  it('does not accrue Solo targets while the installation explicitly operated in Team mode', async () => {
    const { owner, policy, entry, summary } = await fixture();
    await policy('2026-09-07', {
      targetEnabled: true,
      weeklyTargetMinutes: 600,
    });
    await ctx.prisma.installationEvent.createMany({
      data: [
        {
          actorId: owner.id,
          action: 'ModeChanged',
          before: { mode: 'Solo', ownerEmployeeId: owner.id },
          after: { mode: 'Team', ownerEmployeeId: owner.id },
          occurredAt: new Date('2026-09-08T22:00:00Z'),
        },
        {
          actorId: owner.id,
          action: 'ModeChanged',
          before: { mode: 'Team', ownerEmployeeId: owner.id },
          after: { mode: 'Solo', ownerEmployeeId: owner.id },
          occurredAt: new Date('2026-09-10T22:00:00Z'),
        },
      ],
    });
    for (const date of ['07', '08', '09', '10', '11'])
      await entry(`2026-09-${date}T06:00:00Z`, `2026-09-${date}T08:00:00Z`);
    expect(await summary('2026-09-07', '2026-09-11')).toMatchObject({
      actualMinutes: 600,
      targetActualMinutes: 360,
      targetMinutes: 360,
      overtimeMinutes: 0,
    });
    expect(await summary('2026-09-09')).toMatchObject({
      actualMinutes: 120,
      targetEnabled: false,
      targetMinutes: null,
      overtimeMinutes: null,
    });
  });

  it('honors a deferred accounting date so an immediate access-mode switch does not rewrite today', async () => {
    const { owner, policy, entry, summary } = await fixture();
    await policy('2026-09-07', {
      targetEnabled: true,
      weeklyTargetMinutes: 600,
    });
    await ctx.prisma.installationEvent.createMany({
      data: [
        {
          actorId: owner.id,
          action: 'ModeChanged',
          before: { mode: 'Solo', ownerEmployeeId: owner.id },
          after: {
            mode: 'Team',
            ownerEmployeeId: owner.id,
            accountingEffectiveFrom: '2026-09-10',
          },
          occurredAt: new Date('2026-09-09T12:00:00Z'),
        },
        {
          actorId: owner.id,
          action: 'ModeChanged',
          before: { mode: 'Team', ownerEmployeeId: owner.id },
          after: {
            mode: 'Solo',
            ownerEmployeeId: owner.id,
            accountingEffectiveFrom: '2026-09-11',
          },
          occurredAt: new Date('2026-09-11T06:00:00Z'),
        },
      ],
    });
    await entry('2026-09-09T06:00:00Z', '2026-09-09T08:00:00Z');
    await entry('2026-09-10T06:00:00Z', '2026-09-10T08:00:00Z');
    expect(await summary('2026-09-09')).toMatchObject({
      actualMinutes: 120,
      targetActualMinutes: 120,
      targetMinutes: 120,
      overtimeMinutes: 0,
    });
    expect(await summary('2026-09-10')).toMatchObject({
      actualMinutes: 120,
      targetActualMinutes: null,
      targetMinutes: null,
      overtimeMinutes: null,
    });
    expect(await summary('2026-09-11')).toMatchObject({
      targetEnabled: true,
      targetMinutes: 120,
    });
  });

  it('validates period boundaries and ignores voided, rejected, open and foreign work', async () => {
    const { owner, authorization, policy, entry, summary } = await fixture();
    await policy('2026-09-01');
    await entry('2026-09-07T08:00:00Z', '2026-09-07T09:00:00Z');
    await entry('2026-09-07T09:00:00Z', '2026-09-07T10:00:00Z', {
      voidedAt: new Date(),
    });
    await entry('2026-09-07T10:00:00Z', '2026-09-07T11:00:00Z', {
      status: 'Rejected',
    });
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: owner.id,
        clockIn: new Date('2026-09-07T12:00:00Z'),
        status: 'Open',
      },
    });
    const other = await seedEmployee(ctx.prisma, {
      personalNo: 'FOREIGN',
      firstName: 'Old',
      lastName: 'Employee',
      email: 'summary-foreign@test.local',
    });
    await entry('2026-09-07T08:00:00Z', '2026-09-07T16:00:00Z', {
      employeeId: other.id,
    });
    expect(await summary('2026-09-07')).toMatchObject({
      actualMinutes: 60,
      targetEnabled: false,
      leaveEnabled: false,
    });
    for (const query of [
      'from=2026-02-31&to=2026-03-01',
      'from=2026-09-08&to=2026-09-07',
      'from=2025-01-01&to=2026-01-02',
    ])
      await ctx.http
        .get(`/api/installation/summary?${query}`)
        .set('Authorization', authorization)
        .expect(400);
  });
});
