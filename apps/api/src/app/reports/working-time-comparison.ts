import {
  calculateDailyTargetMinutes,
  holidayProviderForCalendar,
} from 'shared';
import type { WorkingTimeComparisonDto } from './reports.dto';

export const EXCESS_THRESHOLD_MINUTES = 600;
const DAY_MS = 86_400_000;

/** Only persisted, explicitly confirmed facts belong here, never live employee defaults. */
interface ContractSnapshot {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  employmentStart: Date;
  employmentEnd: Date | null;
  weeklyHours: { toString(): string } | number;
  workingDays: number;
  holidayCalendar: string;
  holidayDates: string[];
}

interface ExcusedRange {
  from: Date;
  to: Date;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
}

/** Date-valued requests and absences use UTC calendar keys, not local instants. */
function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function coverage(range: ExcusedRange, key: string): number {
  const from = dateKey(range.from);
  const to = dateKey(range.to);
  if (key < from || key > to) return 0;
  // A one-day request with both endpoint flags still excuses just half a day.
  return (key === from && range.halfDayStart) ||
    (key === to && range.halfDayEnd)
    ? 0.5
    : 1;
}

export function compareWorkingTime(input: {
  employeeId: string;
  employeeName: string;
  from: string;
  to: string;
  /** Most recent effectiveFrom/revision first. Effective end dates are inclusive. */
  snapshots: readonly ContractSnapshot[];
  /** Approved Vacation/SpecialLeave and recorded Sickness/Training only. */
  excused: readonly ExcusedRange[];
  actualMinutes: number;
  openEntryCount: number;
}): WorkingTimeComparisonDto {
  const unknownDates: string[] = [];
  let knownTarget = 0;
  const holidays = new Map<
    ContractSnapshot,
    ReturnType<typeof holidayProviderForCalendar>
  >();
  for (
    let day = new Date(`${input.from}T00:00:00.000Z`);
    dateKey(day) <= input.to;
    day = new Date(day.getTime() + DAY_MS)
  ) {
    const key = dateKey(day);
    const snapshot = input.snapshots.find(
      (period) =>
        dateKey(period.effectiveFrom) <= key &&
        (!period.effectiveTo || dateKey(period.effectiveTo) >= key),
    );
    // No inference from the current employee, even for weekends or prehire dates.
    if (!snapshot) {
      unknownDates.push(key);
      continue;
    }
    if (
      key < dateKey(snapshot.employmentStart) ||
      (snapshot.employmentEnd && key > dateKey(snapshot.employmentEnd))
    )
      continue;
    if ((snapshot.workingDays & (1 << ((day.getUTCDay() + 6) % 7))) === 0)
      continue;
    let calendar = holidays.get(snapshot);
    if (!calendar) {
      calendar = holidayProviderForCalendar(
        snapshot.holidayCalendar,
        snapshot.holidayDates,
      );
      holidays.set(snapshot, calendar);
    }
    if (calendar.isHoliday(day)) continue;
    // The same day cannot be excused twice. Overlapping half-day records use the
    // PersonalSummary max/union rule, not additive synthetic half-day credits.
    const excused = Math.min(
      1,
      Math.max(0, ...input.excused.map((range) => coverage(range, key))),
    );
    knownTarget +=
      calculateDailyTargetMinutes(
        Number(snapshot.weeklyHours),
        snapshot.workingDays,
      ) *
      (1 - excused);
  }
  const targetMinutes = unknownDates.length ? null : knownTarget;
  const differenceMinutes =
    targetMinutes === null ? null : input.actualMinutes - targetMinutes;
  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    targetMinutes,
    actualMinutes: input.actualMinutes,
    differenceMinutes,
    targetStatus: targetMinutes === null ? 'Unknown' : 'Known',
    unknownDates,
    reason: targetMinutes === null ? 'CONTRACT_HISTORY_GAP' : null,
    indicator:
      differenceMinutes === null
        ? 'Unknown'
        : differenceMinutes < 0
          ? 'Negative'
          : differenceMinutes === 0
            ? 'Balanced'
            : differenceMinutes >= EXCESS_THRESHOLD_MINUTES
              ? 'Excess'
              : 'Positive',
    openEntryCount: input.openEntryCount,
  };
}
