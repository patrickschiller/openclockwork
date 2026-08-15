/** Number of configured weekdays in a Mon=1 .. Sun=64 bitmask. */
export function countWorkingDays(workingDays: number): number {
  let mask = workingDays & 0x7f;
  let count = 0;
  while (mask > 0) {
    count += mask & 1;
    mask >>= 1;
  }
  return count;
}

/**
 * Equal daily net target derived from contractual weekly hours and the
 * employee's configured workdays. Minute precision is the system-wide unit.
 */
export function calculateDailyTargetMinutes(
  weeklyHours: number,
  workingDays: number,
): number {
  const days = countWorkingDays(workingDays);
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || days === 0) return 0;
  return Math.round((weeklyHours * 60) / days);
}
