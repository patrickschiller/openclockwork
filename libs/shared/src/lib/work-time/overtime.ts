import { calculateWorkingDays } from '../vacation/leave-calculator.js';
import type { HolidayProvider } from '../vacation/holidays.js';

export interface OvertimeInput {
  /** Employee's first day under the system's bookkeeping. Soll-Stunden are counted from here. */
  startDate: Date;
  /** Year for which the YTD balance is being computed. */
  year: number;
  /** Current point in time within `year`. */
  now: Date;
  /** Contractual weekly hours (Vollzeit = 40, Teilzeit = 20, …). */
  weeklyHours: number;
  /** Net minutes accumulated YTD (within `year`) — sum of approved time entries. */
  netMinutesYtd: number;
  /** One-time carry-over from before the system started tracking this employee. */
  openingBalanceMinutes: number;
  /** Holiday provider for excluding non-working days from the Soll calculation. */
  holidayProvider?: HolidayProvider;
}

export interface OvertimeResult {
  overtimeMinutes: number;
  sollMinutes: number;
  netMinutes: number;
  openingBalanceMinutes: number;
  /** Effective lower bound of the Soll calculation (max of year-start and startDate). */
  sollFrom: Date;
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Year-to-date overtime balance, fair to mid-year hires.
 *
 * Soll-Stunden are counted from `max(yearStart, startDate)` to `now`. The
 * one-time `openingBalanceMinutes` carry-over is added on top so that an
 * employee migrated from a prior system arrives with the correct balance
 * instead of starting at zero or accidentally underwater.
 */
export function calculateOvertimeMinutes(input: OvertimeInput): OvertimeResult {
  const yearStart = new Date(Date.UTC(input.year, 0, 1));
  const sollFromCandidate = utcMidnight(input.startDate).getTime() > yearStart.getTime()
    ? utcMidnight(input.startDate)
    : yearStart;
  const sollEnd = utcMidnight(input.now);

  // If the employee hasn't started yet (future startDate), there is no Soll
  // and the YTD balance reduces to the opening balance.
  if (sollFromCandidate.getTime() > sollEnd.getTime()) {
    return {
      overtimeMinutes: input.openingBalanceMinutes,
      sollMinutes: 0,
      netMinutes: input.netMinutesYtd,
      openingBalanceMinutes: input.openingBalanceMinutes,
      sollFrom: sollFromCandidate,
    };
  }

  const workingDays = calculateWorkingDays(sollFromCandidate, sollEnd, input.holidayProvider);
  const dailyMinutes = (input.weeklyHours / 5) * 60;
  const sollMinutes = Math.round(workingDays * dailyMinutes);

  return {
    overtimeMinutes: input.openingBalanceMinutes + input.netMinutesYtd - sollMinutes,
    sollMinutes,
    netMinutes: input.netMinutesYtd,
    openingBalanceMinutes: input.openingBalanceMinutes,
    sollFrom: sollFromCandidate,
  };
}
