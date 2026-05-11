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

export type ViolationKind = 'LateArrival' | 'EarlyDeparture';

export interface CoreTimeViolation {
  kind: ViolationKind;
  boundary: string;
  deltaMinutes: number;
  /** Which window (label or index) was violated. */
  windowLabel?: string;
}

function formatHm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Convert JS Date.getDay() (Sun=0..Sat=6) to the Mon=1..Sun=64 bitmask bit. */
function getWeekdayBit(date: Date): number {
  const dow = date.getDay();
  // Sun=0 → 64, Mon=1 → 1, Tue=2 → 2, ..., Sat=6 → 32
  if (dow === 0) return WEEKDAY_BITS.Sun;
  return 1 << (dow - 1);
}

/**
 * Detect core-time violations across all windows that apply to the day on which
 * the time entry started. Returns at most one LateArrival and one
 * EarlyDeparture per matching window.
 */
export function detectCoreTimeViolations(
  clockIn: Date,
  clockOut: Date | null | undefined,
  windows: CoreTimeWindow[],
): CoreTimeViolation[] {
  const out: CoreTimeViolation[] = [];
  if (windows.length === 0) return out;

  const dowBit = getWeekdayBit(clockIn);

  for (const w of windows) {
    if ((w.weekdays & dowBit) === 0) continue;

    const winStart = new Date(clockIn);
    winStart.setHours(w.startHour, w.startMinute, 0, 0);

    if (clockIn.getTime() > winStart.getTime()) {
      out.push({
        kind: 'LateArrival',
        boundary: formatHm(w.startHour, w.startMinute),
        deltaMinutes: Math.floor((clockIn.getTime() - winStart.getTime()) / 60_000),
        windowLabel: w.label,
      });
    }

    if (clockOut) {
      const winEnd = new Date(clockOut);
      winEnd.setHours(w.endHour, w.endMinute, 0, 0);
      if (clockOut.getTime() < winEnd.getTime()) {
        out.push({
          kind: 'EarlyDeparture',
          boundary: formatHm(w.endHour, w.endMinute),
          deltaMinutes: Math.floor((winEnd.getTime() - clockOut.getTime()) / 60_000),
          windowLabel: w.label,
        });
      }
    }
  }

  return out;
}

// ---- Backwards-compatible single-window API (used by older callers/tests) ----

/** @deprecated use {@link CoreTimeWindow}. */
export type CoreTimeRule = Omit<CoreTimeWindow, 'weekdays' | 'label'>;

export const DEFAULT_CORE_TIME: CoreTimeRule = {
  startHour: 9,
  startMinute: 0,
  endHour: 15,
  endMinute: 0,
};

/** @deprecated use {@link detectCoreTimeViolations} with explicit windows. */
export function detectViolations(
  clockIn: Date,
  clockOut: Date | null | undefined,
  rule: CoreTimeRule = DEFAULT_CORE_TIME,
): CoreTimeViolation[] {
  return detectCoreTimeViolations(clockIn, clockOut, [
    { ...rule, weekdays: WEEKDAYS_MON_TO_FRI | WEEKDAY_BITS.Sat | WEEKDAY_BITS.Sun },
  ]);
}
