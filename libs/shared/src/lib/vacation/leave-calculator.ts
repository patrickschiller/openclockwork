import type { HolidayProvider } from './holidays.js';
import { NrwHolidayProvider } from './holidays.js';
import { WEEKDAYS_MON_TO_FRI } from '../work-time/core-time.js';

export interface WorkingDaysOptions {
  /**
   * Holiday calendar to consult. Defaults to NRW (federal + NW-specific).
   */
  holidayProvider?: HolidayProvider;
  /**
   * Bitmask of weekdays counted as working: Mon=1, Tue=2, …, Sun=64. Default
   * is Mon–Fri (= 31). Use this to model schedules where Saturday or Sunday
   * is a regular working day, or where Friday isn't.
   */
  workingDays?: number;
}

export function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function weekdayBit(date: Date): number {
  const dow = date.getUTCDay(); // Sun=0..Sat=6
  if (dow === 0) return 64; // Sun
  return 1 << (dow - 1); // Mon=1, …, Sat=32
}

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Working days between `from` and `to` (inclusive). A day counts when its
 * weekday is in `workingDays` and the holiday provider does not flag it.
 */
export function calculateWorkingDays(
  from: Date,
  to: Date,
  options: WorkingDaysOptions = {},
): number {
  if (to.getTime() < from.getTime()) return 0;
  const holidayProvider = options.holidayProvider ?? NrwHolidayProvider;
  const workingDays = options.workingDays ?? WEEKDAYS_MON_TO_FRI;
  let count = 0;
  const cursor = utcMidnight(from);
  const end = utcMidnight(to);
  while (cursor.getTime() <= end.getTime()) {
    if ((weekdayBit(cursor) & workingDays) !== 0 && !holidayProvider.isHoliday(cursor)) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export interface HalfDayOptions extends WorkingDaysOptions {
  /** First day of the range is taken as a half-day. */
  halfDayStart?: boolean;
  /** Last day of the range is taken as a half-day. */
  halfDayEnd?: boolean;
}

/**
 * Working days like `calculateWorkingDays`, but lets the caller mark the
 * first and/or the last day as a half-day. Returns a decimal value (e.g.
 * 4.5). When `from === to` and either flag is true, the result is 0.5.
 *
 * The function never subtracts more than the day itself contributes — i.e.
 * a half-day on a holiday or weekend has no effect because that day did
 * not count to begin with.
 */
export function calculateVacationDays(from: Date, to: Date, options: HalfDayOptions = {}): number {
  const baseline = calculateWorkingDays(from, to, options);
  if (baseline === 0) return 0;
  const holidayProvider = options.holidayProvider ?? NrwHolidayProvider;
  const workingDays = options.workingDays ?? WEEKDAYS_MON_TO_FRI;
  const start = utcMidnight(from);
  const end = utcMidnight(to);
  const isWorkday = (d: Date) =>
    (weekdayBit(d) & workingDays) !== 0 && !holidayProvider.isHoliday(d);

  // Single-day range: a half-day flag (either one) means 0.5; both = 0.5.
  if (start.getTime() === end.getTime()) {
    return options.halfDayStart || options.halfDayEnd ? 0.5 : baseline;
  }
  let adjusted = baseline;
  if (options.halfDayStart && isWorkday(start)) adjusted -= 0.5;
  if (options.halfDayEnd && isWorkday(end)) adjusted -= 0.5;
  return adjusted;
}
