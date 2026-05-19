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
  /**
   * Working-day weekday bitmask (Mon=1..Sun=64). Default is Mon–Fri (= 31).
   * Days outside this mask contribute zero Soll regardless of holiday status.
   */
  workingDays?: number;
  /**
   * Working days within `[sollFrom, now]` that are excused from Soll —
   * approved vacation, sickness, training. Flextime/Gleittage are NOT excused
   * because their whole point is to drain the overtime account.
   */
  excusedDays?: number;
}

export interface OvertimeResult {
  overtimeMinutes: number;
  sollMinutes: number;
  netMinutes: number;
  openingBalanceMinutes: number;
  /** Effective lower bound of the Soll calculation (max of year-start and startDate). */
  sollFrom: Date;
  /** Working days excused from Soll (vacation + sickness + training). */
  excusedDays: number;
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
  // Soll only accrues for *completed* days. Today is in progress; counting
  // it would show every fresh hire as immediately one full day in deficit.
  const sollEnd = utcMidnight(input.now);
  sollEnd.setUTCDate(sollEnd.getUTCDate() - 1);

  // If the employee hasn't started yet (future startDate), there is no Soll
  // and the YTD balance reduces to the opening balance.
  if (sollFromCandidate.getTime() > sollEnd.getTime()) {
    return {
      overtimeMinutes: input.openingBalanceMinutes,
      sollMinutes: 0,
      netMinutes: input.netMinutesYtd,
      openingBalanceMinutes: input.openingBalanceMinutes,
      sollFrom: sollFromCandidate,
      excusedDays: 0,
    };
  }

  const workingDays = calculateWorkingDays(sollFromCandidate, sollEnd, {
    holidayProvider: input.holidayProvider,
    workingDays: input.workingDays,
  });
  const excusedDays = Math.max(0, Math.min(workingDays, input.excusedDays ?? 0));
  const sollDays = workingDays - excusedDays;
  const dailyMinutes = (input.weeklyHours / 5) * 60;
  const sollMinutes = Math.round(sollDays * dailyMinutes);

  return {
    overtimeMinutes: input.openingBalanceMinutes + input.netMinutesYtd - sollMinutes,
    sollMinutes,
    netMinutes: input.netMinutesYtd,
    openingBalanceMinutes: input.openingBalanceMinutes,
    sollFrom: sollFromCandidate,
    excusedDays,
  };
}
