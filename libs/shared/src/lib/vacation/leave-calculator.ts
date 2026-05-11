import type { HolidayProvider } from './holidays.js';
import { NrwHolidayProvider } from './holidays.js';

export function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Working days between `from` and `to` (inclusive), excluding weekends and the
 * holidays of the given provider.
 */
export function calculateWorkingDays(
  from: Date,
  to: Date,
  holidayProvider: HolidayProvider = NrwHolidayProvider,
): number {
  if (to.getTime() < from.getTime()) return 0;
  let count = 0;
  const cursor = utcMidnight(from);
  const end = utcMidnight(to);
  while (cursor.getTime() <= end.getTime()) {
    if (!isWeekend(cursor) && !holidayProvider.isHoliday(cursor)) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
