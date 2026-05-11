export interface CoreTimeRule {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export const DEFAULT_CORE_TIME: CoreTimeRule = {
  startHour: 9,
  startMinute: 0,
  endHour: 15,
  endMinute: 0,
};

export type ViolationKind = 'LateArrival' | 'EarlyDeparture';

export interface CoreTimeViolation {
  kind: ViolationKind;
  boundary: string;
  deltaMinutes: number;
}

function formatHm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function detectViolations(
  clockIn: Date,
  clockOut: Date | null | undefined,
  rule: CoreTimeRule = DEFAULT_CORE_TIME,
): CoreTimeViolation[] {
  const out: CoreTimeViolation[] = [];

  const dayStart = new Date(clockIn);
  dayStart.setHours(rule.startHour, rule.startMinute, 0, 0);
  if (clockIn.getTime() > dayStart.getTime()) {
    out.push({
      kind: 'LateArrival',
      boundary: formatHm(rule.startHour, rule.startMinute),
      deltaMinutes: Math.floor((clockIn.getTime() - dayStart.getTime()) / 60_000),
    });
  }

  if (clockOut) {
    const dayEnd = new Date(clockOut);
    dayEnd.setHours(rule.endHour, rule.endMinute, 0, 0);
    if (clockOut.getTime() < dayEnd.getTime()) {
      out.push({
        kind: 'EarlyDeparture',
        boundary: formatHm(rule.endHour, rule.endMinute),
        deltaMinutes: Math.floor((dayEnd.getTime() - clockOut.getTime()) / 60_000),
      });
    }
  }

  return out;
}
