export interface TimeSummary {
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
}

export type BreakRule = {
  /** Inclusive attendance threshold, in minutes. */
  afterMinutes: number;
  /** Total deduction at this threshold, not an additional deduction. */
  breakMinutes: number;
};

/** Historical OpenClockwork policy; an optional preset, not a compliance guarantee. */
export const LEGACY_BREAK_RULES: BreakRule[] = [
  { afterMinutes: 360, breakMinutes: 30 },
  { afterMinutes: 540, breakMinutes: 45 },
];

/** Decode stored JSON. Invalid persisted policies must fail visibly. */
export function parseBreakRules(value: unknown): BreakRule[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (rule) =>
        !rule ||
        !Number.isInteger(rule.afterMinutes) ||
        !Number.isInteger(rule.breakMinutes) ||
        rule.afterMinutes < 0 ||
        rule.afterMinutes > 1440 ||
        rule.breakMinutes < 0 ||
        rule.breakMinutes > rule.afterMinutes,
    )
  )
    throw new Error('Invalid break rules');
  return value.map(({ afterMinutes, breakMinutes }) => ({
    afterMinutes,
    breakMinutes,
  }));
}

export function calculateBreakMinutes(
  grossMinutes: number,
  rules: readonly BreakRule[] = [],
): number {
  return Math.min(
    Math.max(0, grossMinutes),
    rules.reduce(
      (deduction, rule) =>
        grossMinutes >= rule.afterMinutes
          ? Math.max(deduction, rule.breakMinutes)
          : deduction,
      0,
    ),
  );
}

export function calculateNetMinutes(
  grossMinutes: number,
  rules: readonly BreakRule[] = [],
): number {
  if (grossMinutes <= 0) return 0;
  return Math.max(0, grossMinutes - calculateBreakMinutes(grossMinutes, rules));
}

/**
 * Smallest attendance duration whose automatic break deduction yields the
 * requested net working time. This keeps a daily block consistent with all
 * existing summaries and account calculations.
 */
export function calculateGrossMinutesForNet(
  netMinutes: number,
  rules: readonly BreakRule[] = [],
): number {
  const target = Math.max(0, Math.round(netMinutes));
  const maxDeduction = Math.max(0, ...rules.map((rule) => rule.breakMinutes));
  for (let gross = target; gross <= target + maxDeduction; gross += 1) {
    if (calculateNetMinutes(gross, rules) === target) return gross;
  }
  return target + maxDeduction;
}

export function summarize(
  clockIn: Date,
  clockOut: Date | null | undefined,
  rules: readonly BreakRule[] = [],
): TimeSummary {
  if (!clockOut || clockOut.getTime() <= clockIn.getTime()) {
    return { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 };
  }
  const grossMinutes = Math.floor(
    (clockOut.getTime() - clockIn.getTime()) / 60_000,
  );
  const breakMinutes = calculateBreakMinutes(grossMinutes, rules);
  return {
    grossMinutes,
    breakMinutes,
    netMinutes: grossMinutes - breakMinutes,
  };
}
