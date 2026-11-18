import { HOLIDAY_CALENDARS, holidayProviderForCalendar } from 'shared';
import type {
  Absence,
  Employee,
  EmployeeContractPeriod,
  Request,
  TimeEntry,
  WorkSchedule,
  WorkScheduleCoreTime,
} from '@prisma/client';
import type {
  CockpitAttendanceDto,
  CockpitCoreWindowDto,
  CockpitDayAbsenceDto,
} from './team-cockpit.dto';

export function localDayKey(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const dayKey = (value: Date) => value.toISOString().slice(0, 10);
export type CockpitSchedule = WorkSchedule & {
  coreTimes: WorkScheduleCoreTime[];
};

/** No half-day field in this domain identifies morning/afternoon: never invent one. */
function requestCoverage(request: Request, day: string): number {
  if (day < dayKey(request.from) || day > dayKey(request.to)) return 0;
  return (day === dayKey(request.from) && request.halfDayStart) ||
    (day === dayKey(request.to) && request.halfDayEnd)
    ? 0.5
    : 1;
}

/** Resolve only unambiguous existing local schedule times; gaps/folds are unknown. */
function scheduleBoundary(day: Date, value: string): Date | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  const result = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hour,
    minute,
    0,
    0,
  );
  const matches = (date: Date) =>
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate() &&
    date.getHours() === hour &&
    date.getMinutes() === minute;
  if (!matches(result)) return null;
  const previous = new Date(result.getTime() - 36 * 3_600_000),
    next = new Date(result.getTime() + 36 * 3_600_000);
  const delta =
    Math.abs(previous.getTimezoneOffset() - next.getTimezoneOffset()) * 60_000;
  if (
    delta &&
    (matches(new Date(result.getTime() + delta)) ||
      matches(new Date(result.getTime() - delta)))
  )
    return null;
  return result;
}

export function attendanceForEmployee(input: {
  employee: Employee;
  contracts: EmployeeContractPeriod[];
  schedule: CockpitSchedule | null;
  openEntry:
    | (TimeEntry & {
        project: { name: string } | null;
        serviceOrder: { title: string } | null;
      })
    | null;
  requests: Request[];
  absences: Absence[];
  now: Date;
}): CockpitAttendanceDto {
  const { employee, now, schedule, openEntry } = input;
  const today = localDayKey(now),
    bit = 1 << ((now.getDay() + 6) % 7);
  const covering = input.contracts.filter(
    (period) =>
      dayKey(period.effectiveFrom) <= today &&
      (!period.effectiveTo || dayKey(period.effectiveTo) >= today),
  );
  const candidate = covering.length === 1 ? covering[0] : null;
  const calendarKnown =
    candidate &&
    (HOLIDAY_CALENDARS as readonly string[]).includes(
      candidate.holidayCalendar,
    ) &&
    candidate.holidayDates.every((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    });
  const contract = calendarKnown ? candidate : null;
  const absences: CockpitDayAbsenceDto[] = [
    ...input.requests
      .filter(
        (r) =>
          r.workflowState === 'Approved' &&
          r.status === 'Approved' &&
          !r.cancelledAt &&
          ['Vacation', 'HomeOffice', 'SpecialLeave'].includes(r.type),
      )
      .map((r) => ({
        id: r.id,
        source: 'Request' as const,
        classification: r.type,
        status: 'Approved' as const,
        coverage: requestCoverage(r, today),
      }))
      .filter((r) => r.coverage > 0),
    ...input.absences
      .filter((a) => dayKey(a.from) <= today && dayKey(a.to) >= today)
      .map((a) => ({
        id: a.id,
        source: 'Absence' as const,
        classification: a.kind,
        status: 'Recorded' as const,
        coverage: 1,
      })),
  ];
  const coreWindows: CockpitCoreWindowDto[] = [];
  let ambiguous = false;
  for (const window of schedule?.coreTimes ?? []) {
    if (!(window.weekdays & bit)) continue;
    const start = scheduleBoundary(now, window.start),
      end = scheduleBoundary(now, window.end);
    if (!start || !end || end <= start) {
      ambiguous = true;
      continue;
    }
    coreWindows.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: window.label,
    });
  }
  const result: CockpitAttendanceDto = {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    isActive: employee.isActive,
    status: 'UnknownContract',
    obligation: 'Unknown',
    obligationReason: 'UnknownContract',
    contractKnown: !!contract,
    scheduleName: schedule?.name ?? null,
    openEntry: openEntry
      ? {
          id: openEntry.id,
          clockIn: openEntry.clockIn.toISOString(),
          requiresApproval: openEntry.requiresApproval,
          projectName: openEntry.project?.name ?? null,
          serviceOrderTitle: openEntry.serviceOrder?.title ?? null,
        }
      : null,
    coreWindows,
    absences,
  };
  const set = (
    status: Exclude<CockpitAttendanceDto['status'], 'Booked'>,
    obligation: CockpitAttendanceDto['obligation'],
  ): CockpitAttendanceDto => ({
    ...result,
    status: openEntry ? 'Booked' : status,
    obligation,
    obligationReason:
      status === 'Missing'
        ? 'CoreWindow'
        : status === 'NoCoreNow'
          ? 'OutsideCore'
          : status === 'PartialAbsenceUnknown'
            ? 'PartialDayTimingUnknown'
            : status,
  });
  const excused = Math.max(
    0,
    ...absences
      .filter((a) => a.classification !== 'HomeOffice')
      .map((a) => a.coverage),
  );
  if (excused >= 1) return set('ApprovedAbsence', 'Excused');
  if (!contract) return set('UnknownContract', 'Unknown');
  if (
    today < dayKey(contract.employmentStart) ||
    (contract.employmentEnd && today > dayKey(contract.employmentEnd))
  )
    return set('OutsideEmployment', 'NotRequiredNow');
  if (
    holidayProviderForCalendar(
      contract.holidayCalendar,
      contract.holidayDates,
    ).isHoliday(new Date(`${today}T00:00:00.000Z`))
  )
    return set('Holiday', 'NotRequiredNow');
  if (!(contract.workingDays & bit))
    return set('NonWorkingDay', 'NotRequiredNow');
  if (
    !schedule ||
    !(schedule.workingDays & bit) ||
    ambiguous ||
    (coreWindows.length > 0 && Number(contract.weeklyHours) <= 0)
  )
    return set('UnknownSchedule', 'Unknown');
  if (coreWindows.length === 0) return set('Flexible', 'NotRequiredNow');
  const inCore = coreWindows.some(
    (window) => now >= new Date(window.start) && now < new Date(window.end),
  );
  if (!inCore) return set('NoCoreNow', 'NotRequiredNow');
  if (excused > 0) return set('PartialAbsenceUnknown', 'Unknown');
  return set('Missing', 'RequiredNow');
}

export function nextAttendanceBoundary(
  now: Date,
  employees: CockpitAttendanceDto[],
): Date {
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const candidates = [
    midnight.getTime(),
    ...employees.flatMap((employee) =>
      employee.coreWindows.flatMap((window) => [
        Date.parse(window.start),
        Date.parse(window.end),
      ]),
    ),
  ].filter((time) => time > now.getTime());
  return new Date(Math.min(...candidates));
}
