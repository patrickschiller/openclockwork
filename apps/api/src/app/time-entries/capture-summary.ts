import {
  calculateBreakMinutes,
  parseBreakRules,
  summarize,
  type TimeSummary,
} from 'shared';

export interface CaptureSummaryEntry {
  id: string;
  employeeId: string;
  clockIn: Date;
  clockOut: Date | null;
  breakRules: unknown;
  captureGroupId?: string | null;
  voidedAt?: Date | null;
  status?: string;
}

/**
 * Supply every member of each capture group, including members outside a report
 * filter. A project split never starts a new break threshold. Solo durations keep
 * millisecond precision; rounding belongs to presentation. Historical ungrouped
 * team entries retain their existing per-entry calculation.
 * Pass `now` only for an explicitly provisional view of an open timer.
 */
export function calculateCaptureSummaries(
  entries: readonly CaptureSummaryEntry[],
  now?: Date,
): Map<string, TimeSummary> {
  const result = new Map<string, TimeSummary>();
  const groups = new Map<string, CaptureSummaryEntry[]>();
  for (const entry of entries) {
    if (entry.voidedAt || entry.status === 'Rejected') continue;
    const end = entry.clockOut ?? now;
    if (!end || end <= entry.clockIn) continue;
    if (!entry.captureGroupId) {
      result.set(
        entry.id,
        summarize(entry.clockIn, end, parseBreakRules(entry.breakRules)),
      );
      continue;
    }
    const key = `${entry.employeeId}:${entry.captureGroupId}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        a.clockIn.getTime() - b.clockIn.getTime() || a.id.localeCompare(b.id),
    );
    const durations = group.map(
      (entry) =>
        (entry.clockOut ?? (now as Date)).getTime() - entry.clockIn.getTime(),
    );
    const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
    const totalBreak = calculateBreakMinutes(
      totalMs / 60_000,
      parseBreakRules(group[0].breakRules),
    );
    let cumulativeMs = 0;
    let allocatedBreak = 0;
    group.forEach((entry, index) => {
      cumulativeMs += durations[index];
      const throughBreak =
        index === group.length - 1
          ? totalBreak
          : (totalBreak * cumulativeMs) / totalMs;
      const breakMinutes = throughBreak - allocatedBreak;
      allocatedBreak = throughBreak;
      const grossMinutes = durations[index] / 60_000;
      result.set(entry.id, {
        grossMinutes,
        breakMinutes,
        netMinutes: grossMinutes - breakMinutes,
      });
    });
  }
  return result;
}
