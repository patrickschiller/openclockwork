/** A single core-time window. Times are measured in the *local* timezone of the user. */
export interface CoreTimeWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  /** Bitmask: Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64. */
  weekdays: number;
  label?: string;
}

export const WEEKDAY_BITS = {
  Mon: 1,
  Tue: 2,
  Wed: 4,
  Thu: 8,
  Fri: 16,
  Sat: 32,
  Sun: 64,
} as const;

export const WEEKDAYS_MON_TO_FRI =
  WEEKDAY_BITS.Mon | WEEKDAY_BITS.Tue | WEEKDAY_BITS.Wed | WEEKDAY_BITS.Thu | WEEKDAY_BITS.Fri;

/** A frame defines the earliest start and latest end for off-hours / approval logic. */
export interface FrameTimeRule {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export const DEFAULT_FRAME: FrameTimeRule = {
  startHour: 7,
  startMinute: 0,
  endHour: 23,
  endMinute: 0,
};

/**
 * A core-time violation describes a gap *inside* a core-time window that the
 * employee did not cover with a time entry on a day when they were present
 * (= had at least one closed entry that day).
 *
 * - `LateArrival`    — the gap touches the window's start.
 * - `EarlyDeparture` — the gap touches the window's end.
 * - `MidDayGap`      — the gap is fully inside the window (e.g. unexpected break).
 */
export type ViolationKind = 'LateArrival' | 'EarlyDeparture' | 'MidDayGap';

export interface CoreTimeViolation {
  kind: ViolationKind;
  /** The core-time window the gap is within, formatted as "HH:mm–HH:mm". */
  boundary: string;
  /** Length of the uncovered gap in minutes. */
  deltaMinutes: number;
  /** Optional label of the core-time window (e.g. "Vormittag"). */
  windowLabel?: string;
}

function formatHm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Convert JS Date.getDay() (Sun=0..Sat=6) to the Mon=1..Sun=64 bitmask bit. */
function getWeekdayBit(date: Date): number {
  const dow = date.getDay();
  if (dow === 0) return WEEKDAY_BITS.Sun;
  return 1 << (dow - 1);
}

interface ClosedEntry {
  clockIn: Date;
  clockOut: Date | null | undefined;
}

function mergeIntervals(entries: ClosedEntry[]): Array<[number, number]> {
  const closed: Array<[number, number]> = [];
  for (const e of entries) {
    if (!e.clockOut) continue;
    if (e.clockOut.getTime() <= e.clockIn.getTime()) continue;
    closed.push([e.clockIn.getTime(), e.clockOut.getTime()]);
  }
  if (closed.length === 0) return [];
  closed.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [closed[0]];
  for (let i = 1; i < closed.length; i += 1) {
    const last = merged[merged.length - 1];
    const cur = closed[i];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function windowBounds(day: Date, w: CoreTimeWindow): { start: number; end: number; boundary: string } {
  const s = new Date(day);
  s.setHours(w.startHour, w.startMinute, 0, 0);
  const e = new Date(day);
  e.setHours(w.endHour, w.endMinute, 0, 0);
  return {
    start: s.getTime(),
    end: e.getTime(),
    boundary: `${formatHm(w.startHour, w.startMinute)}–${formatHm(w.endHour, w.endMinute)}`,
  };
}

function classify(
  gapStart: number,
  gapEnd: number,
  windowStart: number,
  windowEnd: number,
): ViolationKind {
  const touchesStart = gapStart <= windowStart;
  const touchesEnd = gapEnd >= windowEnd;
  if (touchesStart && !touchesEnd) return 'LateArrival';
  if (!touchesStart && touchesEnd) return 'EarlyDeparture';
  if (touchesStart && touchesEnd) {
    // The whole window is uncovered — flag it as LateArrival (the most
    // prominent marker); deltaMinutes already say it's the full window.
    return 'LateArrival';
  }
  return 'MidDayGap';
}

/**
 * Detect core-time violations for one day.
 *
 * Domain rule: a violation is a gap inside a core-time window that is NOT
 * covered by any time entry of that day. If the employee has no closed entry
 * at all on the day, there is no violation — the employee was off (sick,
 * vacation, weekend, etc.) and the day is simply not worked.
 *
 * `day` is any timestamp on the day in question — only its date (in the
 * server's local timezone) and weekday matter.
 */
export function detectCoreTimeViolationsForDay(
  entries: ClosedEntry[],
  windows: CoreTimeWindow[],
  day: Date,
): CoreTimeViolation[] {
  if (entries.length === 0) return [];
  const intervals = mergeIntervals(entries);
  if (intervals.length === 0) return [];

  const dowBit = getWeekdayBit(day);
  const applicable = windows.filter((w) => (w.weekdays & dowBit) !== 0);
  if (applicable.length === 0) return [];

  const out: CoreTimeViolation[] = [];
  for (const w of applicable) {
    const { start: ws, end: we, boundary } = windowBounds(day, w);

    let cursor = ws;
    for (const [s, e] of intervals) {
      if (e <= cursor) continue;
      if (s >= we) break;
      if (s > cursor) {
        const gapEnd = Math.min(s, we);
        out.push({
          kind: classify(cursor, gapEnd, ws, we),
          boundary,
          deltaMinutes: Math.floor((gapEnd - cursor) / 60_000),
          windowLabel: w.label,
        });
      }
      cursor = Math.max(cursor, e);
      if (cursor >= we) break;
    }
    if (cursor < we) {
      out.push({
        kind: classify(cursor, we, ws, we),
        boundary,
        deltaMinutes: Math.floor((we - cursor) / 60_000),
        windowLabel: w.label,
      });
    }
  }
  return out;
}
