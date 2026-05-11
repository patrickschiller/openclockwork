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
