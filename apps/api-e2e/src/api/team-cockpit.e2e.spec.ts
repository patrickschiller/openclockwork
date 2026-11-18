import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { JwtUser } from '../../../api/src/app/auth/jwt.strategy';
import type {
  CockpitAttendanceDto,
  CockpitHistoryDto,
  CockpitHistoryItemDto,
  TeamCockpitDto,
} from '../../../api/src/app/team-cockpit/team-cockpit.dto';
import { TeamCockpitService } from '../../../api/src/app/team-cockpit/team-cockpit.service';
import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

// Monday 10:30 CEST. Only the read-service clock is controlled, not business logic.
const NOW = new Date('2026-05-04T08:30:00.000Z');
const TODAY = '2026-05-04';
const MEDICAL_NOTE = 'Synthetic confidential medical detail — never disclose';
type Person = Awaited<ReturnType<typeof seedEmployee>> & { token: string };
type ReadKind =
  | 'overview'
  | 'history'
  | 'approval-requests'
  | 'booking-targets';
const READ_KINDS: ReadKind[] = [
  'overview',
  'history',
  'approval-requests',
  'booking-targets',
];

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Expected synthetic fixture value');
  return value;
}

describe('Team cockpit read APIs (#44)', () => {
  let ctx: TestContext;
  let service: TeamCockpitService;
  let clock: jest.SpyInstance<Date, []>;
  let manager: Person,
    otherManager: Person,
    worker: Person,
    foreign: Person,
    hr: Person;
  let scheduleId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    service = ctx.app.get(TeamCockpitService);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    clock = jest
      .spyOn(ctx.app.get(TeamCockpitService), 'now')
      .mockReturnValue(NOW);
    manager = await person('manager', 'Manager');
    otherManager = await person('other-manager', 'Manager');
    worker = await person('worker', 'Employee', manager.id);
    foreign = await person('foreign', 'Employee', otherManager.id);
    hr = await person('hr', 'HRAdmin');
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Synthetic beneficiary core',
        frameStart: '07:00',
        frameEnd: '20:00',
        workingDays: 31,
        coreTimes: {
          create: [
            { label: 'Morning', start: '10:00', end: '11:00', weekdays: 31 },
            { label: 'Afternoon', start: '14:00', end: '15:00', weekdays: 31 },
          ],
        },
      },
    });
    scheduleId = schedule.id;
    await ctx.prisma.employee.update({
      where: { id: worker.id },
      data: { workScheduleId: scheduleId },
    });
    await contract(worker.id);
  });
  afterEach(() => {
    clock.mockRestore();
  });

  async function person(
    name: string,
    role: 'Manager' | 'HRAdmin' | 'Employee' = 'Employee',
    managerId?: string,
  ): Promise<Person> {
    const row = await seedEmployee(ctx.prisma, {
      personalNo: name,
      firstName: name,
      lastName: 'Synthetic',
      email: `${name}@test.local`,
      holidayCalendar: 'NONE',
      role,
      managerId,
    });
    return { ...row, token: await login(ctx.http, row.email) };
  }
  function identity(actor: Person): JwtUser {
    return {
      id: actor.id,
      email: actor.email,
      role: actor.role,
      authVersion: actor.authVersion,
    };
  }
  function contract(
    employeeId: string,
    values: Partial<Prisma.EmployeeContractPeriodUncheckedCreateInput> = {},
  ) {
    return ctx.prisma.employeeContractPeriod.create({
      data: {
        employeeId,
        effectiveFrom: new Date('2026-01-01'),
        employmentStart: new Date('2020-01-01'),
        weeklyHours: 40,
        timeModel: 'Vollzeit',
        workingDays: 31,
        holidayCalendar: 'NONE',
        holidayDates: [],
        confirmationNote: 'Synthetic confirmed contractual facts',
        confirmedById: hr.id,
        ...values,
      },
    });
  }
  function changeContract(
    values: Prisma.EmployeeContractPeriodUpdateManyMutationInput,
  ) {
    return ctx.prisma.employeeContractPeriod.updateMany({
      where: { employeeId: worker.id },
      data: values,
    });
  }
  function entry(values: Partial<Prisma.TimeEntryUncheckedCreateInput> = {}) {
    return ctx.prisma.timeEntry.create({
      data: {
        employeeId: worker.id,
        clockIn: new Date('2026-05-04T06:00:00Z'),
        clockOut: new Date('2026-05-04T07:00:00Z'),
        status: 'Approved',
        breakRules: [],
        ...values,
      },
    });
  }
  function application(
    values: Partial<Prisma.RequestUncheckedCreateInput> = {},
  ) {
    return ctx.prisma.request.create({
      data: {
        employeeId: worker.id,
        type: 'Vacation',
        from: new Date(TODAY),
        to: new Date(TODAY),
        status: 'Approved',
        workflowState: 'Approved',
        calculatedDays: 1,
        ...values,
      },
    });
  }
  function absence(values: Partial<Prisma.AbsenceUncheckedCreateInput> = {}) {
    return ctx.prisma.absence.create({
      data: {
        employeeId: worker.id,
        kind: 'Sickness',
        from: new Date(TODAY),
        to: new Date(TODAY),
        note: MEDICAL_NOTE,
        certified: true,
        ...values,
      },
    });
  }
  function url(kind: ReadKind, employeeId = worker.id): string {
    switch (kind) {
      case 'overview':
        return '/api/team-cockpit';
      case 'history':
        return `/api/team-cockpit/employees/${employeeId}/history?from=${TODAY}&to=${TODAY}`;
      case 'approval-requests':
        return '/api/team-cockpit/approval-requests';
      case 'booking-targets':
        return `/api/team-cockpit/employees/${employeeId}/booking-targets`;
    }
  }
  function get(path: string, actor = manager) {
    return ctx.http.get(path).set('Authorization', `Bearer ${actor.token}`);
  }
  async function overview(actor = manager): Promise<TeamCockpitDto> {
    return (await get(url('overview'), actor).expect(200)).body;
  }
  async function attendance(): Promise<CockpitAttendanceDto> {
    const row = (await overview()).employees.find(
      (employee) => employee.id === worker.id,
    );
    expect(row).toBeDefined();
    return required(row);
  }
  async function history(
    query: Record<string, string | number> = {},
    actor = manager,
    employeeId = worker.id,
  ): Promise<CockpitHistoryDto> {
    return (
      await get(`/api/team-cockpit/employees/${employeeId}/history`, actor)
        .query({ from: TODAY, to: TODAY, ...query })
        .expect(200)
    ).body;
  }
  function item(result: CockpitHistoryDto, id: string): CockpitHistoryItemDto {
    const row = result.items.find((record) => record.id === id);
    expect(row).toBeDefined();
    return required(row);
  }

  describe('current scope and authentication', () => {
    it('lists active current direct reports only, excludes self, and ignores forged query scope', async () => {
      const inactive = await person('inactive', 'Employee', manager.id);
      const indirect = await person('indirect', 'Employee', worker.id);
      await ctx.prisma.employee.update({
        where: { id: inactive.id },
        data: { isActive: false },
      });
      await ctx.prisma.employee.update({
        where: { id: manager.id },
        data: { managerId: manager.id },
      });
      const result = await get('/api/team-cockpit')
        .query({
          scope: 'Organisation',
          employeeId: foreign.id,
          managerId: otherManager.id,
          actorId: hr.id,
        })
        .expect(200);
      expect(result.body.scope).toBe('Team');
      expect(result.body.employees.map((e: { id: string }) => e.id)).toEqual([
        worker.id,
      ]);
      expect(JSON.stringify(result.body)).not.toContain(indirect.id);
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { managerId: otherManager.id },
      });
      expect((await overview()).employees).toEqual([]);
      expect(
        (await overview(otherManager)).employees.map((e) => e.id).sort(),
      ).toEqual([foreign.id, worker.id].sort());
    });
    it('gives HR the active organisation, including managers and HR but excluding inactive accounts', async () => {
      await ctx.prisma.employee.update({
        where: { id: foreign.id },
        data: { isActive: false },
      });
      const result = await overview(hr);
      expect(result.scope).toBe('Organisation');
      expect(result.employees.map((e) => e.id).sort()).toEqual(
        [manager.id, otherManager.id, worker.id, hr.id].sort(),
      );
    });
    it.each(READ_KINDS)(
      '%s requires authentication and rejects an Employee',
      async (kind) => {
        await ctx.http.get(url(kind)).expect(401);
        await get(url(kind), worker).expect(403);
      },
    );
    it.each(['history', 'booking-targets'] as const)(
      '%s denies foreign reports and manager self-access',
      async (kind) => {
        await ctx.prisma.employee.update({
          where: { id: manager.id },
          data: { managerId: manager.id },
        });
        for (const employeeId of [foreign.id, manager.id])
          await get(url(kind, employeeId))
            .query({ actorId: hr.id, scope: 'Organisation' })
            .expect(403);
      },
    );
    it('distinguishes a missing employee only for HR, not for a manager probing outside current scope', async () => {
      const missing = randomUUID();
      await get(url('history', missing), hr).expect(404);
      await get(url('history', missing)).expect(403);
      await get(url('booking-targets', missing), hr).expect(404);
      await get(url('booking-targets', missing)).expect(403);
    });

    it('allows inactive current-member history but removes access when the assignment changes', async () => {
      const row = await entry();
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { isActive: false },
      });
      const result = await history();
      expect(result.employee).toEqual({
        id: worker.id,
        firstName: worker.firstName,
        lastName: worker.lastName,
        isActive: false,
      });
      expect(result.items.map((i) => i.id)).toEqual([row.id]);
      await get(url('booking-targets')).expect(403);
      expect((await history({}, hr)).items.map((i) => i.id)).toEqual([row.id]);
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { managerId: otherManager.id },
      });
      await get(url('history')).expect(403);
      expect((await history({}, otherManager)).items.map((i) => i.id)).toEqual([
        row.id,
      ]);
    });
    it.each(READ_KINDS)(
      '%s reloads role, active state and authVersion for the same bearer',
      async (kind) => {
        await get(url(kind)).expect(200);
        await ctx.prisma.employee.update({
          where: { id: manager.id },
          data: { role: 'Employee' },
        });
        await get(url(kind)).expect(403);
        await ctx.prisma.employee.update({
          where: { id: manager.id },
          data: { role: 'Manager', authVersion: { increment: 1 } },
        });
        await get(url(kind)).expect(401);
        manager.token = await login(ctx.http, manager.email);
        await get(url(kind)).expect(200);
        await ctx.prisma.employee.update({
          where: { id: manager.id },
          data: { isActive: false },
        });
        await get(url(kind)).expect(401);
      },
    );
    it.each(READ_KINDS)(
      '%s is unavailable in Solo, even for the owner HR',
      async (kind) => {
        await ctx.prisma.installationSettings.create({
          data: {
            id: 1,
            mode: 'Solo',
            ownerEmployeeId: hr.id,
            setupCompleted: true,
          },
        });
        await get(url(kind), hr).expect(403);
      },
    );
  });

  describe('attendance from confirmed contracts and real core times', () => {
    it('returns Missing only in a confirmed current core, with timezone and next refresh boundary', async () => {
      const result = await overview();
      expect(result).toMatchObject({
        generatedAt: NOW.toISOString(),
        today: TODAY,
        timeZone: 'Europe/Berlin',
        scope: 'Team',
        nextRefreshAt: '2026-05-04T09:00:00.000Z',
      });
      expect(result.employees).toHaveLength(1);
      expect(result.employees[0]).toMatchObject({
        id: worker.id,
        status: 'Missing',
        obligation: 'RequiredNow',
        contractKnown: true,
        scheduleName: 'Synthetic beneficiary core',
        openEntry: null,
        absences: [],
        coreWindows: [
          {
            start: '2026-05-04T08:00:00.000Z',
            end: '2026-05-04T09:00:00.000Z',
            label: 'Morning',
          },
          {
            start: '2026-05-04T12:00:00.000Z',
            end: '2026-05-04T13:00:00.000Z',
            label: 'Afternoon',
          },
        ],
      });
    });
    it.each([
      [
        '2026-05-04T07:59:59.999Z',
        'NoCoreNow',
        'NotRequiredNow',
        '2026-05-04T08:00:00.000Z',
      ],
      [
        '2026-05-04T08:00:00.000Z',
        'Missing',
        'RequiredNow',
        '2026-05-04T09:00:00.000Z',
      ],
      [
        '2026-05-04T09:00:00.000Z',
        'NoCoreNow',
        'NotRequiredNow',
        '2026-05-04T12:00:00.000Z',
      ],
      [
        '2026-05-04T12:00:00.000Z',
        'Missing',
        'RequiredNow',
        '2026-05-04T13:00:00.000Z',
      ],
      [
        '2026-05-04T13:00:00.000Z',
        'NoCoreNow',
        'NotRequiredNow',
        '2026-05-04T22:00:00.000Z',
      ],
    ])(
      'uses start-inclusive/end-exclusive boundaries at %s',
      async (instant, status, obligation, nextRefreshAt) => {
        clock.mockReturnValue(new Date(instant));
        const result = await overview();
        expect(result.employees[0]).toMatchObject({ status, obligation });
        expect(result.nextRefreshAt).toBe(nextRefreshAt);
      },
    );
    it('does not infer Missing from weekly hours, frame or unconfirmed live employment/holiday defaults', async () => {
      await ctx.prisma.employeeContractPeriod.deleteMany({
        where: { employeeId: worker.id },
      });
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: {
          startDate: new Date('2027-01-01'),
          holidayDates: [TODAY],
          weeklyHours: 40,
        },
      });
      expect(await attendance()).toMatchObject({
        status: 'UnknownContract',
        obligation: 'Unknown',
        contractKnown: false,
      });
    });
    it('does not bridge a contract-history gap with expired or future snapshots', async () => {
      await changeContract({ effectiveTo: new Date('2026-05-03') });
      await contract(worker.id, { effectiveFrom: new Date('2026-05-05') });
      expect(await attendance()).toMatchObject({
        status: 'UnknownContract',
        obligation: 'Unknown',
      });
    });
    it('uses the covering contract including its inclusive effective end', async () => {
      await changeContract({
        effectiveTo: new Date(TODAY),
        holidayDates: [TODAY],
      });
      await contract(worker.id, { effectiveFrom: new Date('2026-05-05') });
      expect(await attendance()).toMatchObject({
        status: 'Holiday',
        obligation: 'NotRequiredNow',
        contractKnown: true,
      });
    });
    it('treats overlapping confirmed contracts as unknown instead of picking one', async () => {
      await contract(worker.id, { effectiveFrom: new Date('2026-05-01') });
      expect(await attendance()).toMatchObject({
        status: 'UnknownContract',
        obligation: 'Unknown',
        contractKnown: false,
      });
    });
    it('prefers assigned schedule to default and uses the persisted default when unassigned', async () => {
      const fallback = await ctx.prisma.workSchedule.create({
        data: {
          name: 'Persisted default',
          frameStart: '07:00',
          frameEnd: '20:00',
          isDefault: true,
          coreTimes: { create: { start: '12:00', end: '13:00', weekdays: 31 } },
        },
      });
      expect(await attendance()).toMatchObject({
        scheduleName: 'Synthetic beneficiary core',
        status: 'Missing',
      });
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { workScheduleId: null },
      });
      expect(await attendance()).toMatchObject({
        scheduleName: fallback.name,
        status: 'NoCoreNow',
      });
      clock.mockReturnValue(new Date('2026-05-04T10:00:00Z'));
      expect(await attendance()).toMatchObject({
        status: 'Missing',
        obligation: 'RequiredNow',
      });
    });
    it('keeps an unknown schedule unknown despite confirmed weekly hours', async () => {
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { workScheduleId: null },
      });
      expect(await attendance()).toMatchObject({
        status: 'UnknownSchedule',
        obligation: 'Unknown',
        contractKnown: true,
        coreWindows: [],
      });
    });
    it('a real frame-only schedule is Flexible, never a guessed core requirement', async () => {
      await ctx.prisma.workScheduleCoreTime.deleteMany({
        where: { scheduleId },
      });
      expect(await attendance()).toMatchObject({
        status: 'Flexible',
        obligation: 'NotRequiredNow',
        coreWindows: [],
      });
      expect((await overview()).nextRefreshAt).toBe('2026-05-04T22:00:00.000Z');
    });
    it('only core windows applicable to the current weekday create an obligation', async () => {
      await ctx.prisma.workScheduleCoreTime.updateMany({
        where: { scheduleId },
        data: { weekdays: 2 },
      });
      expect(await attendance()).toMatchObject({
        status: 'Flexible',
        obligation: 'NotRequiredNow',
        coreWindows: [],
      });
    });
    it('does not turn an unsupported confirmed holiday calendar into a known obligation', async () => {
      // Calendar strings have no DB enum/check: stale/imported unsupported data
      // must not silently become the explicit, known NONE calendar.
      await changeContract({ holidayCalendar: 'UNSUPPORTED' });
      const result = await attendance();
      expect(result.obligation).toBe('Unknown');
      expect(result.status).not.toBe('Missing');
    });

    it('a zero-hour contract with configured core windows is unknown rather than a fabricated requirement', async () => {
      await changeContract({ weeklyHours: 0 });
      expect(await attendance()).toMatchObject({
        status: 'UnknownSchedule',
        obligation: 'Unknown',
      });
    });

    it.each(['2026-03-29T01:10:00Z', '2026-10-25T00:30:00Z'])(
      'keeps a nonexistent or ambiguous Berlin core boundary unknown at %s',
      async (instant) => {
        clock.mockReturnValue(new Date(instant));
        await changeContract({ workingDays: 127 });
        await ctx.prisma.workSchedule.update({
          where: { id: scheduleId },
          data: { workingDays: 127 },
        });
        await ctx.prisma.workScheduleCoreTime.deleteMany({
          where: { scheduleId },
        });
        await ctx.prisma.workScheduleCoreTime.create({
          data: { scheduleId, start: '02:15', end: '03:15', weekdays: 64 },
        });
        expect(await attendance()).toMatchObject({
          status: 'UnknownSchedule',
          obligation: 'Unknown',
        });
      },
    );

    it('a confirmed workday conflicting with schedule working mask is Unknown, not Missing', async () => {
      await ctx.prisma.workSchedule.update({
        where: { id: scheduleId },
        data: { workingDays: 30 },
      });
      expect(await attendance()).toMatchObject({
        status: 'UnknownSchedule',
        obligation: 'Unknown',
      });
    });
    it.each<
      [string, Prisma.EmployeeContractPeriodUpdateManyMutationInput, string]
    >([
      ['custom holiday', { holidayDates: [TODAY] }, 'Holiday'],
      ['non-working Monday', { workingDays: 30 }, 'NonWorkingDay'],
      [
        'employment ended',
        { employmentEnd: new Date('2026-05-03') },
        'OutsideEmployment',
      ],
      [
        'not yet employed',
        { employmentStart: new Date('2026-05-05') },
        'OutsideEmployment',
      ],
    ])(
      'knows %s is not a current clocking obligation',
      async (_label, facts, status) => {
        await changeContract(facts);
        expect(await attendance()).toMatchObject({
          status,
          obligation: 'NotRequiredNow',
          contractKnown: true,
        });
      },
    );
    it('honours a confirmed regional holiday rather than mutable live defaults', async () => {
      clock.mockReturnValue(new Date('2026-05-01T08:30:00Z'));
      await changeContract({ holidayCalendar: 'DE-BY' });
      expect(await attendance()).toMatchObject({
        status: 'Holiday',
        obligation: 'NotRequiredNow',
      });
    });
    it.each(['Vacation', 'SpecialLeave'] as const)(
      'approved full-day %s excuses clocking',
      async (type) => {
        const row = await application({ type });
        expect(await attendance()).toMatchObject({
          status: 'ApprovedAbsence',
          obligation: 'Excused',
          absences: [
            {
              id: row.id,
              source: 'Request',
              classification: type,
              status: 'Approved',
              coverage: 1,
            },
          ],
        });
      },
    );
    it.each(['Sickness', 'Training', 'Flextime'] as const)(
      'recorded %s excuses clocking without private notes',
      async (kind) => {
        const row = await absence({ kind });
        const result = await attendance();
        expect(result).toMatchObject({
          status: 'ApprovedAbsence',
          obligation: 'Excused',
        });
        expect(result.absences).toEqual([
          {
            id: row.id,
            source: 'Absence',
            classification: kind,
            status: 'Recorded',
            coverage: 1,
          },
        ]);
        expect(JSON.stringify(await overview())).not.toContain(MEDICAL_NOTE);
      },
    );
    it.each([
      'Draft',
      'Submitted',
      'PendingSubstitute',
      'PendingManager',
      'PendingHr',
      'Rejected',
      'Cancelled',
    ] as const)('%s requests do not excuse clocking', async (workflowState) => {
      await application({
        workflowState,
        status:
          workflowState === 'Rejected'
            ? 'Rejected'
            : workflowState === 'Cancelled'
              ? 'Cancelled'
              : 'Submitted',
      });
      expect(await attendance()).toMatchObject({
        status: 'Missing',
        obligation: 'RequiredNow',
        absences: [],
      });
    });
    it('inconsistent approved status and a cancellation timestamp do not excuse clocking', async () => {
      await application({ status: 'Submitted' });
      await application({ cancelledAt: NOW });
      expect(await attendance()).toMatchObject({
        status: 'Missing',
        obligation: 'RequiredNow',
        absences: [],
      });
    });
    it('approved HomeOffice is informative but does not excuse clocking', async () => {
      const row = await application({ type: 'HomeOffice' });
      expect(await attendance()).toMatchObject({
        status: 'Missing',
        obligation: 'RequiredNow',
        absences: [{ id: row.id, classification: 'HomeOffice', coverage: 1 }],
      });
    });
    it.each([
      { halfDayStart: true },
      { halfDayEnd: true },
      { halfDayStart: true, halfDayEnd: true },
    ])(
      'does not invent AM/PM for unanchored half-day flags %j',
      async (flags) => {
        await application({ ...flags, calculatedDays: 0.5 });
        expect(await attendance()).toMatchObject({
          status: 'PartialAbsenceUnknown',
          obligation: 'Unknown',
          absences: [{ coverage: 0.5 }],
        });
        clock.mockReturnValue(new Date('2026-05-04T12:30:00Z'));
        expect(await attendance()).toMatchObject({
          status: 'PartialAbsenceUnknown',
          obligation: 'Unknown',
        });
        clock.mockReturnValue(new Date('2026-05-04T09:00:00Z'));
        expect(await attendance()).toMatchObject({
          status: 'NoCoreNow',
          obligation: 'NotRequiredNow',
        });
      },
    );
    it('duplicate half-days do not add up to an invented full-day excusal', async () => {
      await application({ halfDayStart: true, calculatedDays: 0.5 });
      await application({
        type: 'SpecialLeave',
        halfDayEnd: true,
        calculatedDays: 0.5,
      });
      const result = await attendance();
      expect(result).toMatchObject({
        status: 'PartialAbsenceUnknown',
        obligation: 'Unknown',
      });
      expect(result.absences.map((a) => a.coverage)).toEqual([0.5, 0.5]);
    });
    it.each([
      'ordinary core',
      'holiday',
      'absence',
      'unknown contract',
      'unknown schedule',
      'outside employment',
      'outside core',
    ])(
      'open booking overrides %s with its actual start, not a physical-presence assertion',
      async (scenario) => {
        if (scenario === 'holiday')
          await changeContract({ holidayDates: [TODAY] });
        if (scenario === 'absence') await absence();
        if (scenario === 'unknown contract')
          await ctx.prisma.employeeContractPeriod.deleteMany({
            where: { employeeId: worker.id },
          });
        if (scenario === 'unknown schedule')
          await ctx.prisma.employee.update({
            where: { id: worker.id },
            data: { workScheduleId: null },
          });
        if (scenario === 'outside employment')
          await changeContract({ employmentEnd: new Date('2026-05-03') });
        if (scenario === 'outside core')
          clock.mockReturnValue(new Date('2026-05-04T09:30:00Z'));
        const started = new Date('2026-05-03T21:47:31.123Z');
        const open = await entry({
          clockIn: started,
          clockOut: null,
          status: 'Open',
          requiresApproval: true,
        });
        expect(await attendance()).toMatchObject({
          status: 'Booked',
          openEntry: {
            id: open.id,
            clockIn: started.toISOString(),
            requiresApproval: true,
          },
        });
      },
    );
    it('ignores voided open entries and closed work for the current booking fact', async () => {
      await entry({
        clockIn: new Date('2026-05-03T21:00:00Z'),
        clockOut: null,
        status: 'Open',
        voidedAt: NOW,
      });
      await entry();
      expect(await attendance()).toMatchObject({
        status: 'Missing',
        obligation: 'RequiredNow',
        openEntry: null,
      });
    });
    it('serializes safe attendance fields only, not employee account or medical fields', async () => {
      await absence();
      const result = await attendance();
      expect(Object.keys(result).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'isActive',
          'status',
          'obligation',
          'obligationReason',
          'contractKnown',
          'scheduleName',
          'openEntry',
          'coreWindows',
          'absences',
        ].sort(),
      );
      const raw = JSON.stringify(await overview());
      for (const privateValue of [
        worker.email,
        worker.passwordHash,
        MEDICAL_NOTE,
        'certified',
      ])
        expect(raw).not.toContain(privateValue);
    });
  });

  describe('history is complete, private, interval-based and pageable', () => {
    it('returns every request workflow state, every absence class and every time-entry state', async () => {
      const states = [
        'Draft',
        'Submitted',
        'PendingSubstitute',
        'PendingManager',
        'PendingHr',
        'Approved',
        'Rejected',
        'Cancelled',
      ] as const;
      const requests: Awaited<ReturnType<typeof application>>[] = [];
      for (const workflowState of states)
        requests.push(
          await application({
            workflowState,
            status:
              workflowState === 'Approved'
                ? 'Approved'
                : workflowState === 'Rejected'
                  ? 'Rejected'
                  : workflowState === 'Cancelled'
                    ? 'Cancelled'
                    : 'Submitted',
            reason: `Synthetic ${workflowState} history`,
          }),
        );
      const homeOffice = await application({ type: 'HomeOffice' });
      const special = await application({
        type: 'SpecialLeave',
        halfDayStart: true,
        halfDayEnd: true,
        calculatedDays: 0.5,
      });
      const correction = await application({
        type: 'TimeAdjustment',
        from: new Date('2026-05-04T12:17:23.456Z'),
        to: new Date('2026-05-04T12:47:24.789Z'),
        workflowState: 'PendingManager',
        status: 'Submitted',
        requiresApproval: true,
      });
      const recorded: Awaited<ReturnType<typeof absence>>[] = [];
      // Absence ranges are deliberately disjoint: the DB excludes overlapping rows.
      for (const [index, kind] of (
        ['Sickness', 'Training', 'Flextime'] as const
      ).entries()) {
        const date = `2026-05-0${4 + index}`;
        recorded.push(
          await absence({ kind, from: new Date(date), to: new Date(date) }),
        );
      }
      const closed: Awaited<ReturnType<typeof entry>>[] = [];
      for (const [index, status] of (
        ['Approved', 'Pending', 'Rejected'] as const
      ).entries()) {
        closed.push(
          await entry({
            status,
            clockIn: new Date(Date.UTC(2026, 4, 4, 4 + index)),
            clockOut: new Date(Date.UTC(2026, 4, 4, 5 + index)),
          }),
        );
      }
      const voided = await entry({
        clockIn: new Date('2026-05-04T07:00:00Z'),
        clockOut: new Date('2026-05-04T08:00:00Z'),
        voidedAt: NOW,
      });
      const open = await entry({
        clockIn: new Date('2026-05-04T08:15:00Z'),
        clockOut: null,
        status: 'Open',
      });
      const result = await history({ to: '2026-05-06' });
      expect(result).toMatchObject({
        from: TODAY,
        to: '2026-05-06',
        timeZone: 'Europe/Berlin',
        generatedAt: NOW.toISOString(),
        nextCursor: null,
      });
      expect(result.items).toHaveLength(19);
      for (const request of requests)
        expect(item(result, request.id)).toMatchObject({
          kind: 'Request',
          classification: 'Vacation',
          status: request.workflowState,
          workflowState: request.workflowState,
          allDay: true,
          from: TODAY,
          to: TODAY,
          request: {
            id: request.id,
            status: request.status,
            workflowState: request.workflowState,
          },
        });
      expect(item(result, homeOffice.id)).toMatchObject({
        classification: 'HomeOffice',
        allDay: true,
      });
      expect(item(result, special.id)).toMatchObject({
        classification: 'SpecialLeave',
        allDay: true,
        from: TODAY,
        to: TODAY,
        halfDayStart: true,
        halfDayEnd: true,
      });
      expect(item(result, correction.id)).toMatchObject({
        classification: 'TimeAdjustment',
        allDay: false,
        from: '2026-05-04T12:17:23.456Z',
        to: '2026-05-04T12:47:24.789Z',
        requiresApproval: true,
      });
      for (const row of recorded)
        expect(item(result, row.id)).toMatchObject({
          kind: 'Absence',
          classification: row.kind,
          status: 'Recorded',
          allDay: true,
          from: row.from.toISOString().slice(0, 10),
          to: row.to.toISOString().slice(0, 10),
          reason: null,
          request: null,
        });
      for (const row of closed)
        expect(item(result, row.id)).toMatchObject({
          kind: 'TimeEntry',
          status: row.status,
          allDay: false,
          grossMinutes: 60,
        });
      expect(item(result, voided.id)).toMatchObject({
        kind: 'TimeEntry',
        status: 'Voided',
      });
      expect(item(result, open.id)).toMatchObject({
        kind: 'TimeEntry',
        status: 'Open',
        to: null,
        grossMinutes: null,
        breakMinutes: null,
        netMinutes: null,
      });
      expect(result.items.every((row) => row.employeeId === worker.id)).toBe(
        true,
      );
      const raw = JSON.stringify(result);
      for (const secret of [
        MEDICAL_NOTE,
        worker.passwordHash,
        worker.email,
        'certified',
      ])
        expect(raw).not.toContain(secret);
    });

    it.each(['PendingManager', 'PendingHr', 'BlockedManager'] as const)(
      'retains %s frame-approval information without changing the TimeEntry state',
      async (state) => {
        const row = await entry({
          status: 'Pending',
          requiresApproval: true,
          revision: state === 'PendingHr' ? 1 : 0,
          frameApprovedRevision: state === 'PendingHr' ? 1 : null,
          frameApproverId: state === 'PendingHr' ? manager.id : null,
        });
        if (state === 'BlockedManager')
          await ctx.prisma.employee.update({
            where: { id: manager.id },
            data: { role: 'Employee' },
          });
        // HR retains visibility when the direct manager's role is no longer valid.
        const result = await history({}, hr);
        expect(item(result, row.id)).toMatchObject({
          status: 'Pending',
          workflowState: state,
          requiresApproval: true,
        });
        expect(
          (
            await ctx.prisma.timeEntry.findUniqueOrThrow({
              where: { id: row.id },
            })
          ).status,
        ).toBe('Pending');
        expect(await ctx.prisma.timeEntryAudit.count()).toBe(0);
      },
    );

    it('keeps complete cross-month source intervals and their actual duration, not period-clipped report sums', async () => {
      const project = await seedProject(ctx.prisma, {
        code: 'HISTORY',
        name: 'Synthetic history project',
        assigneeIds: [worker.id],
        serviceOrders: [{ orderNo: '01', title: 'Synthetic history order' }],
      });
      const shift = await entry({
        clockIn: new Date('2026-04-30T21:15:30.123Z'),
        clockOut: new Date('2026-05-01T06:15:30.123Z'),
        breakRules: [{ afterMinutes: 360, breakMinutes: 45 }],
        note: 'Synthetic work note',
        projectId: project.id,
        serviceOrderId: project.serviceOrders[0].id,
      });
      const vacation = await application({
        from: new Date('2026-04-29'),
        to: new Date('2026-05-02'),
        halfDayStart: true,
        halfDayEnd: true,
      });
      const sick = await absence({
        from: new Date('2026-04-30'),
        to: new Date('2026-05-03'),
      });
      const result = await history({ from: '2026-05-01', to: '2026-05-01' });
      expect(result.items).toHaveLength(3);
      expect(item(result, shift.id)).toMatchObject({
        from: shift.clockIn.toISOString(),
        to: required(shift.clockOut).toISOString(),
        grossMinutes: 540,
        breakMinutes: 45,
        netMinutes: 495,
        reason: 'Synthetic work note',
        projectName: project.name,
        serviceOrderTitle: 'Synthetic history order',
      });
      expect(item(result, vacation.id)).toMatchObject({
        from: '2026-04-29',
        to: '2026-05-02',
        allDay: true,
        halfDayStart: true,
        halfDayEnd: true,
      });
      expect(item(result, sick.id)).toMatchObject({
        from: '2026-04-30',
        to: '2026-05-03',
        allDay: true,
        reason: null,
      });
    });

    it('includes running work started before the period with its real start and null end', async () => {
      const row = await entry({
        clockIn: new Date('2026-04-30T20:12:13.456Z'),
        clockOut: null,
        status: 'Open',
      });
      const result = await history({ from: '2026-05-01', to: '2026-05-01' });
      expect(result.items).toHaveLength(1);
      expect(item(result, row.id)).toMatchObject({
        from: '2026-04-30T20:12:13.456Z',
        to: null,
        allDay: false,
        grossMinutes: null,
        netMinutes: null,
      });
    });

    it('uses Berlin calendar-day boundaries for instants and inclusive UTC date-only bounds for all-day sources', async () => {
      const before = await entry({
        clockIn: new Date('2026-05-03T21:00:00Z'),
        clockOut: new Date('2026-05-03T22:00:00Z'),
      });
      const start = await entry({
        clockIn: new Date('2026-05-03T22:00:00Z'),
        clockOut: new Date('2026-05-03T23:00:00Z'),
      });
      const end = await entry({
        clockIn: new Date('2026-05-04T21:59:30Z'),
        clockOut: new Date('2026-05-04T22:00:00Z'),
      });
      const after = await entry({
        clockIn: new Date('2026-05-04T22:00:00Z'),
        clockOut: new Date('2026-05-04T23:00:00Z'),
      });
      const previous = await absence({
        from: new Date('2026-05-02'),
        to: new Date('2026-05-03'),
      });
      const current = await absence();
      const next = await absence({
        from: new Date('2026-05-05'),
        to: new Date('2026-05-06'),
      });
      const endsToday = await application({
        from: new Date('2026-05-02'),
        to: new Date(TODAY),
        halfDayEnd: true,
      });
      const startsToday = await application({
        from: new Date(TODAY),
        to: new Date('2026-05-06'),
        halfDayStart: true,
      });
      const taBefore = await application({
        type: 'TimeAdjustment',
        from: new Date('2026-05-03T21:00:00Z'),
        to: new Date('2026-05-03T22:00:00Z'),
      });
      const taInside = await application({
        type: 'TimeAdjustment',
        from: new Date('2026-05-04T21:59:59.123Z'),
        to: new Date('2026-05-04T22:00:00Z'),
      });
      const taAfter = await application({
        type: 'TimeAdjustment',
        from: new Date('2026-05-04T22:00:00Z'),
        to: new Date('2026-05-04T23:00:00Z'),
      });
      const result = await history();
      expect(result.items.map((r) => r.id).sort()).toEqual(
        [
          start.id,
          end.id,
          current.id,
          endsToday.id,
          startsToday.id,
          taInside.id,
        ].sort(),
      );
      for (const excluded of [before, after, previous, next, taBefore, taAfter])
        expect(result.items.some((r) => r.id === excluded.id)).toBe(false);
    });

    it('allocates a capture-group break using siblings outside the filter and keeps it invariant across pages', async () => {
      const captureGroupId = randomUUID();
      const breakRules = [{ afterMinutes: 360, breakMinutes: 30 }];
      await entry({
        captureGroupId,
        breakRules,
        clockIn: new Date('2026-05-03T18:00:00Z'),
        clockOut: new Date('2026-05-03T22:00:00Z'),
      });
      const selected = await entry({
        captureGroupId,
        breakRules,
        clockIn: new Date('2026-05-03T22:00:00Z'),
        clockOut: new Date('2026-05-04T02:00:00Z'),
      });
      const result = await history({ limit: 1 });
      expect(result.items).toHaveLength(1);
      expect(item(result, selected.id)).toMatchObject({
        grossMinutes: 240,
        breakMinutes: 15,
        netMinutes: 225,
      });
      expect(
        item(await history({ from: '2026-05-03', to: TODAY }), selected.id),
      ).toMatchObject({ breakMinutes: 15, netMinutes: 225 });
    });

    it('paginates equal-time mixed kinds deterministically with no duplicate or omitted rows', async () => {
      const at = new Date('2026-05-04T00:00:00Z');
      const a = await absence();
      const r1 = await application();
      const r2 = await application({ type: 'SpecialLeave' });
      const r3 = await application({
        type: 'TimeAdjustment',
        from: at,
        to: new Date('2026-05-04T01:00:00Z'),
      });
      const t = await entry({
        clockIn: at,
        clockOut: new Date('2026-05-04T01:00:00Z'),
      });
      const expected = (await history({ limit: 200 })).items.map(
        (r) => `${r.kind}:${r.id}`,
      );
      expect(new Set(expected)).toEqual(
        new Set([
          `Absence:${a.id}`,
          `Request:${r1.id}`,
          `Request:${r2.id}`,
          `Request:${r3.id}`,
          `TimeEntry:${t.id}`,
        ]),
      );
      const seen: string[] = [];
      let cursor: string | null = null;
      const cursors = new Set<string>();
      for (let page = 0; page < 5; page++) {
        const result = await history({
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        expect(result.items).toHaveLength(1);
        seen.push(`${result.items[0].kind}:${result.items[0].id}`);
        if (page < 4) {
          expect(result.nextCursor).not.toBeNull();
          expect(cursors.has(required(result.nextCursor))).toBe(false);
          cursors.add(required(result.nextCursor));
        } else expect(result.nextCursor).toBeNull();
        cursor = result.nextCursor;
      }
      expect(seen).toEqual(expected);
      expect((await history({ limit: 1 })).items[0]).toEqual(
        (await history({ limit: 1 })).items[0],
      );
    });

    it('exhausts all 732 non-overlapping closed entries over leap-year 2024, in pages of 37 without a hidden 500 cap', async () => {
      const entries: Prisma.TimeEntryCreateManyInput[] = [];
      for (let day = 0; day < 366; day++)
        for (const hour of [8, 12])
          entries.push({
            id: randomUUID(),
            employeeId: worker.id,
            clockIn: new Date(Date.UTC(2024, 0, day + 1, hour)),
            clockOut: new Date(Date.UTC(2024, 0, day + 1, hour + 1)),
            status: 'Approved',
            breakRules: [],
          });
      await ctx.prisma.timeEntry.createMany({ data: entries });
      const foreignEntry = await entry({
        employeeId: foreign.id,
        clockIn: new Date('2024-06-01T08:00:00Z'),
        clockOut: new Date('2024-06-01T09:00:00Z'),
      });
      const seen: string[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;
      do {
        const result = await history({
          from: '2024-01-01',
          to: '2024-12-31',
          limit: 37,
          ...(cursor ? { cursor } : {}),
        });
        expect(result.items.length).toBeGreaterThan(0);
        expect(result.items.length).toBeLessThanOrEqual(37);
        expect(
          result.items.every(
            (r) =>
              r.kind === 'TimeEntry' &&
              r.employeeId === worker.id &&
              r.grossMinutes === 60 &&
              r.netMinutes === 60,
          ),
        ).toBe(true);
        seen.push(...result.items.map((r) => r.id));
        cursor = result.nextCursor;
        if (cursor) {
          expect(cursors.has(cursor)).toBe(false);
          cursors.add(cursor);
        }
        pages++;
        expect(pages).toBeLessThanOrEqual(20);
      } while (cursor);
      expect(pages).toBe(20);
      expect(seen).toHaveLength(732);
      expect(new Set(seen).size).toBe(732);
      expect(new Set(seen)).toEqual(new Set(entries.map((r) => r.id)));
      expect(seen).not.toContain(foreignEntry.id);
      // Both accepted bounds are exercised against an actually large result.
      expect(
        (await history({ from: '2024-01-01', to: '2024-12-31', limit: 200 }))
          .items,
      ).toHaveLength(200);
      expect(
        (await history({ from: '2024-01-01', to: '2024-12-31' })).items,
      ).toHaveLength(100);
    });

    it('a cursor never widens current scope, and a scope change revokes an already-issued next page', async () => {
      await application();
      await application({ type: 'HomeOffice' });
      const first = await history({ limit: 1 });
      expect(first.nextCursor).not.toBeNull();
      await get(`/api/team-cockpit/employees/${foreign.id}/history`)
        .query({
          from: TODAY,
          to: TODAY,
          cursor: required(first.nextCursor),
          employeeId: worker.id,
          actorId: hr.id,
        })
        .expect(403);
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { managerId: otherManager.id },
      });
      await get(`/api/team-cockpit/employees/${worker.id}/history`)
        .query({ from: TODAY, to: TODAY, cursor: required(first.nextCursor) })
        .expect(403);
      expect(
        (
          await history(
            { limit: 1, cursor: required(first.nextCursor) },
            otherManager,
          )
        ).items,
      ).toHaveLength(1);
    });

    it('shows only actor/time/operational-reason proxy evidence, not raw audit snapshots or medical notes', async () => {
      const records = [
        { kind: 'TimeEntry', row: await entry() },
        { kind: 'Request', row: await application() },
        { kind: 'Absence', row: await absence() },
      ];
      for (const [index, record] of records.entries()) {
        const at = new Date(Date.UTC(2026, 4, 4, 7, index));
        const audit = await ctx.prisma.teamProxyAudit.create({
          data: {
            actorId: manager.id,
            employeeId: worker.id,
            resourceKind: record.kind,
            resourceId: record.row.id,
            action: `Proxy${record.kind}Created`,
            reason: 'Employee requested administrative assistance',
            occurredAt: at,
            values: {
              actor: {
                id: manager.id,
                firstName: 'Historic',
                lastName: 'Manager',
                role: 'Manager',
              },
              note: MEDICAL_NOTE,
              employee: { id: worker.id, email: worker.email },
              certified: true,
              rawHealth: MEDICAL_NOTE,
            },
          },
        });
        const result = await history();
        expect(item(result, record.row.id).proxyActions).toEqual([
          {
            id: audit.id,
            action: `Proxy${record.kind}Created`,
            actorId: manager.id,
            actorName: 'Historic Manager',
            at: at.toISOString(),
            reason: 'Employee requested administrative assistance',
          },
        ]);
        const raw = JSON.stringify(result);
        for (const secret of [
          MEDICAL_NOTE,
          worker.email,
          'rawHealth',
          'certified',
          'values',
        ])
          expect(raw).not.toContain(secret);
      }
    });

    it.each([
      { from: '2026-02-30' },
      { to: '2026-02-29' },
      { from: '2026-5-04' },
      { from: '2026-05-04T00:00:00Z' },
      { from: 'not-a-date' },
      { from: '2026-05-05', to: TODAY },
      { from: '2020-01-01', to: '2025-01-04' },
      { limit: 0 },
      { limit: 201 },
      { limit: -1 },
      { limit: 1.5 },
      { limit: 'NaN' },
      { cursor: 'not-a-cursor' },
      { cursor: 'e30' },
      { cursor: 'x'.repeat(513) },
      {
        cursor: Buffer.from(
          JSON.stringify({
            at: NOW.toISOString(),
            kind: 'Employee',
            id: randomUUID(),
          }),
        ).toString('base64url'),
      },
      {
        cursor: Buffer.from(
          JSON.stringify({
            at: 'invalid',
            kind: 'TimeEntry',
            id: randomUUID(),
          }),
        ).toString('base64url'),
      },
      {
        cursor: Buffer.from(
          JSON.stringify({
            at: NOW.toISOString(),
            kind: 'TimeEntry',
            id: 'not-a-uuid',
          }),
        ).toString('base64url'),
      },
    ])(
      'rejects malformed or excessive history parameters %j',
      async (query) => {
        await get(`/api/team-cockpit/employees/${worker.id}/history`)
          .query({ from: TODAY, to: TODAY, ...query })
          .expect(400);
      },
    );
    it('requires both range bounds, validates employee UUIDs, and accepts exactly 1830 inclusive days', async () => {
      const endpoint = `/api/team-cockpit/employees/${worker.id}/history`;
      await get(endpoint).query({ from: TODAY }).expect(400);
      await get(endpoint).query({ to: TODAY }).expect(400);
      await get('/api/team-cockpit/employees/not-a-uuid/history')
        .query({ from: TODAY, to: TODAY })
        .expect(400);
      const first = new Date('2020-01-01T00:00:00Z');
      const last = new Date(first.getTime() + 1829 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect((await history({ from: '2020-01-01', to: last })).items).toEqual(
        [],
      );
      const tooLong = new Date(first.getTime() + 1830 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await get(endpoint)
        .query({ from: '2020-01-01', to: tooLong })
        .expect(400);
    });
  });

  describe('fresh service authority after an HTTP guard has already resolved identity', () => {
    function reads(actor: JwtUser): Array<() => Promise<unknown>> {
      return [
        () => service.overview(actor),
        () => service.history(worker.id, { from: TODAY, to: TODAY }, actor),
        () => service.approvalRequests(actor),
        () => service.bookingTargets(worker.id, actor),
      ];
    }
    it.each([
      'role revoked',
      'session version revoked',
      'actor inactive',
      'Solo switch',
    ])(
      'rejects all four reads after %s, without relying on the HTTP guards',
      async (change) => {
        const captured = identity(manager);
        const calls = reads(captured);
        for (const call of calls) await call();
        if (change === 'role revoked')
          await ctx.prisma.employee.update({
            where: { id: manager.id },
            data: { role: 'Employee' },
          });
        if (change === 'session version revoked')
          await ctx.prisma.employee.update({
            where: { id: manager.id },
            data: { authVersion: { increment: 1 } },
          });
        if (change === 'actor inactive')
          await ctx.prisma.employee.update({
            where: { id: manager.id },
            data: { isActive: false },
          });
        if (change === 'Solo switch')
          await ctx.prisma.installationSettings.create({
            data: { mode: 'Solo', ownerEmployeeId: hr.id },
          });
        for (const call of calls)
          await expect(call()).rejects.toMatchObject({ status: 403 });
      },
    );
    it('replaces captured HR-wide rights with the current narrower manager scope', async () => {
      const captured = identity(hr);
      expect(
        (await service.history(worker.id, { from: TODAY, to: TODAY }, captured))
          .employee.id,
      ).toBe(worker.id);
      await ctx.prisma.employee.update({
        where: { id: hr.id },
        data: { role: 'Manager' },
      });
      expect(await service.overview(captured)).toMatchObject({
        scope: 'Team',
        employees: [],
      });
      expect(await service.approvalRequests(captured)).toEqual([]);
      await expect(
        service.history(worker.id, { from: TODAY, to: TODAY }, captured),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.bookingTargets(worker.id, captured),
      ).rejects.toMatchObject({ status: 403 });
    });
    it('reloads current beneficiary assignment for all reads with a captured manager identity', async () => {
      const pending = await application({
        type: 'TimeAdjustment',
        status: 'Submitted',
        workflowState: 'PendingManager',
        currentApproverId: manager.id,
      });
      const captured = identity(manager);
      expect(
        (await service.approvalRequests(captured)).map((r) => r.id),
      ).toEqual([pending.id]);
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { managerId: otherManager.id },
      });
      expect((await service.overview(captured)).employees).toEqual([]);
      expect(await service.approvalRequests(captured)).toEqual([]);
      await expect(
        service.history(worker.id, { from: TODAY, to: TODAY }, captured),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.bookingTargets(worker.id, captured),
      ).rejects.toMatchObject({ status: 403 });
      // The new manager sees the pending request, including its stale assignment,
      // as information; this read does not rewrite the existing request workflow.
      expect(
        (await service.approvalRequests(identity(otherManager)))[0],
      ).toMatchObject({ id: pending.id, currentApproverId: manager.id });
      expect(
        (
          await ctx.prisma.request.findUniqueOrThrow({
            where: { id: pending.id },
          })
        ).currentApproverId,
      ).toBe(manager.id);
    });
  });

  describe('pending time-adjustment requests', () => {
    it('lists only pending corrections in CURRENT scope, including both stages and blocked assignment information', async () => {
      const managerStage = await application({
        type: 'TimeAdjustment',
        workflowState: 'PendingManager',
        status: 'Submitted',
        currentApproverId: manager.id,
      });
      const hrStage = await application({
        type: 'TimeAdjustment',
        workflowState: 'PendingHr',
        status: 'Submitted',
        currentApproverId: null,
        approverId: manager.id,
        requiresApproval: true,
      });
      const blocked = await application({
        type: 'TimeAdjustment',
        workflowState: 'PendingManager',
        status: 'Submitted',
        currentApproverId: null,
        reason: 'Waiting for assignment repair',
      });
      const foreignPending = await application({
        employeeId: foreign.id,
        type: 'TimeAdjustment',
        workflowState: 'PendingManager',
        status: 'Submitted',
        currentApproverId: otherManager.id,
      });
      const noManager = await person('no-manager');
      const organisationBlocked = await application({
        employeeId: noManager.id,
        type: 'TimeAdjustment',
        workflowState: 'PendingManager',
        status: 'Submitted',
        currentApproverId: null,
      });
      for (const type of ['Vacation', 'SpecialLeave', 'HomeOffice'] as const)
        await application({
          type,
          workflowState: 'PendingManager',
          status: 'Submitted',
          currentApproverId: manager.id,
        });
      for (const workflowState of [
        'Draft',
        'Approved',
        'Rejected',
        'Cancelled',
      ] as const)
        await application({
          type: 'TimeAdjustment',
          workflowState,
          status: workflowState === 'Draft' ? 'Submitted' : workflowState,
        });
      const inactive = await person('inactive-pending', 'Employee', manager.id);
      await application({
        employeeId: inactive.id,
        type: 'TimeAdjustment',
        workflowState: 'PendingManager',
        status: 'Submitted',
      });
      await ctx.prisma.employee.update({
        where: { id: inactive.id },
        data: { isActive: false },
      });
      await entry({ status: 'Pending', requiresApproval: true });
      const scoped = await get(url('approval-requests'))
        .query({
          employeeId: foreign.id,
          scope: 'Organisation',
          actorId: hr.id,
        })
        .expect(200);
      expect(scoped.body.map((r: { id: string }) => r.id).sort()).toEqual(
        [managerStage.id, hrStage.id, blocked.id].sort(),
      );
      expect(
        scoped.body.find((r: { id: string }) => r.id === blocked.id),
      ).toMatchObject({
        type: 'TimeAdjustment',
        workflowState: 'PendingManager',
        currentApproverId: null,
        reason: 'Waiting for assignment repair',
      });
      expect(
        scoped.body.find((r: { id: string }) => r.id === hrStage.id),
      ).toMatchObject({
        workflowState: 'PendingHr',
        approverId: manager.id,
        requiresApproval: true,
      });
      const organisation = await get(url('approval-requests'), hr).expect(200);
      expect(organisation.body.map((r: { id: string }) => r.id).sort()).toEqual(
        [
          managerStage.id,
          hrStage.id,
          blocked.id,
          foreignPending.id,
          organisationBlocked.id,
        ].sort(),
      );
    });

    it('does not silently truncate a current team pending list at the old generic 200-request cap', async () => {
      const requests: Prisma.RequestCreateManyInput[] = Array.from(
        { length: 231 },
        (_, index) => ({
          id: randomUUID(),
          employeeId: worker.id,
          type: 'TimeAdjustment',
          status: 'Submitted',
          workflowState: index % 2 ? 'PendingManager' : 'PendingHr',
          currentApproverId: index % 2 ? manager.id : null,
          from: new Date(Date.UTC(2025, 0, index + 1, 8)),
          to: new Date(Date.UTC(2025, 0, index + 1, 9)),
        }),
      );
      await ctx.prisma.request.createMany({ data: requests });
      const result = await get(url('approval-requests')).expect(200);
      expect(result.body).toHaveLength(231);
      expect(new Set(result.body.map((r: { id: string }) => r.id))).toEqual(
        new Set(requests.map((r) => r.id)),
      );
      expect(await ctx.prisma.timeEntry.count()).toBe(0);
      expect(await ctx.prisma.requestEvent.count()).toBe(0);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
    });

    it('does not grant review authority over foreign pending corrections or frame approvals', async () => {
      const pending = await application({
        employeeId: foreign.id,
        type: 'TimeAdjustment',
        from: new Date('2026-05-04T04:00:00Z'),
        to: new Date('2026-05-04T05:00:00Z'),
        workflowState: 'PendingManager',
        status: 'Submitted',
        currentApproverId: otherManager.id,
      });
      const frame = await entry({
        employeeId: foreign.id,
        status: 'Pending',
        requiresApproval: true,
      });
      expect((await get(url('approval-requests')).expect(200)).body).toEqual(
        [],
      );
      expect(
        (await get(url('approval-requests'), hr).expect(200)).body[0],
      ).toMatchObject({ id: pending.id });
      await ctx.http
        .post(`/api/requests/${pending.id}/manager-approve`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({ actorId: hr.id })
        .expect(403);
      await ctx.http
        .post(`/api/timeentries/${frame.id}/approval`)
        .set('Authorization', `Bearer ${manager.token}`)
        .send({
          revision: 0,
          stage: 'Manager',
          outcome: 'Approve',
          actorId: hr.id,
        })
        .expect(403);
      expect(
        (
          await ctx.prisma.request.findUniqueOrThrow({
            where: { id: pending.id },
          })
        ).workflowState,
      ).toBe('PendingManager');
      expect(
        (
          await ctx.prisma.timeEntry.findUniqueOrThrow({
            where: { id: frame.id },
          })
        ).status,
      ).toBe('Pending');
      expect(await ctx.prisma.requestEvent.count()).toBe(0);
      expect(await ctx.prisma.timeEntryAudit.count()).toBe(0);
    });
  });

  describe('beneficiary booking targets', () => {
    it('returns assigned active beneficiary projects/orders/customers, not actor or unassigned projects', async () => {
      const customer = await ctx.prisma.customer.create({
        data: { name: 'Synthetic active customer' },
      });
      const archived = await ctx.prisma.customer.create({
        data: { name: 'Synthetic archived customer', isActive: false },
      });
      const project = await seedProject(ctx.prisma, {
        code: '01-WORKER',
        name: 'Beneficiary project',
        assigneeIds: [worker.id],
        serviceOrders: [
          { orderNo: '01', title: 'Active order' },
          { orderNo: '02', title: 'Archived order', isActive: false },
        ],
      });
      await ctx.prisma.project.update({
        where: { id: project.id },
        data: { customerId: customer.id, defaultBillable: true },
      });
      await ctx.prisma.serviceOrder.update({
        where: { id: project.serviceOrders[0].id },
        data: { defaultBillable: true },
      });
      const noCustomer = await seedProject(ctx.prisma, {
        code: '02-NO-CUSTOMER',
        assigneeIds: [worker.id],
      });
      await seedProject(ctx.prisma, {
        code: 'ACTOR-ONLY',
        assigneeIds: [manager.id],
      });
      await seedProject(ctx.prisma, { code: 'UNASSIGNED' });
      await seedProject(ctx.prisma, {
        code: 'INACTIVE',
        assigneeIds: [worker.id],
        isActive: false,
      });
      const badCustomer = await seedProject(ctx.prisma, {
        code: 'ARCHIVED-CUSTOMER',
        assigneeIds: [worker.id],
      });
      await ctx.prisma.project.update({
        where: { id: badCustomer.id },
        data: { customerId: archived.id },
      });
      const result = await get(url('booking-targets'))
        .query({ employeeId: manager.id, actorId: hr.id })
        .expect(200);
      expect(result.body).toEqual([
        {
          id: project.id,
          code: project.code,
          name: project.name,
          customerId: customer.id,
          customerName: customer.name,
          defaultBillable: true,
          serviceOrders: [
            {
              id: project.serviceOrders[0].id,
              orderNo: '01',
              title: 'Active order',
              defaultBillable: true,
            },
          ],
        },
        {
          id: noCustomer.id,
          code: noCustomer.code,
          name: noCustomer.name,
          customerId: null,
          customerName: null,
          defaultBillable: false,
          serviceOrders: [],
        },
      ]);
      expect((await get(url('booking-targets'), hr).expect(200)).body).toEqual(
        result.body,
      );
      expect(await ctx.prisma.timeEntry.count()).toBe(0);
      expect(await ctx.prisma.teamProxyAudit.count()).toBe(0);
    });
    it('re-reads project assignment, order state and customer state on every read', async () => {
      const project = await seedProject(ctx.prisma, {
        code: 'LIVE',
        assigneeIds: [worker.id],
        serviceOrders: [{ orderNo: '01', title: 'Live order' }],
      });
      expect((await get(url('booking-targets')).expect(200)).body).toHaveLength(
        1,
      );
      await ctx.prisma.serviceOrder.update({
        where: { id: project.serviceOrders[0].id },
        data: { isActive: false },
      });
      expect(
        (await get(url('booking-targets')).expect(200)).body[0].serviceOrders,
      ).toEqual([]);
      const customer = await ctx.prisma.customer.create({
        data: { name: 'Archived live customer', isActive: false },
      });
      await ctx.prisma.project.update({
        where: { id: project.id },
        data: { customerId: customer.id },
      });
      expect((await get(url('booking-targets')).expect(200)).body).toEqual([]);
      await ctx.prisma.customer.update({
        where: { id: customer.id },
        data: { isActive: true },
      });
      expect((await get(url('booking-targets')).expect(200)).body).toHaveLength(
        1,
      );
      await ctx.prisma.projectAssignment.delete({
        where: {
          employeeId_projectId: {
            employeeId: worker.id,
            projectId: project.id,
          },
        },
      });
      expect((await get(url('booking-targets')).expect(200)).body).toEqual([]);
    });
    it('requires a currently active beneficiary even for HR or a captured service identity', async () => {
      const captured = identity(hr);
      await ctx.prisma.employee.update({
        where: { id: worker.id },
        data: { isActive: false },
      });
      await get(url('booking-targets'), hr).expect(403);
      await expect(
        service.bookingTargets(worker.id, captured),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
