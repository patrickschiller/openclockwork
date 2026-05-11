export const APPROVAL_THRESHOLD_EARLIEST_HOUR = 7;
export const APPROVAL_THRESHOLD_LATEST_HOUR = 23;

/**
 * A booking or time-adjustment request that begins before 07:00 or ends at/after
 * 23:00 (or crosses midnight) requires special approval per the spec.
 */
export function requiresSpecialApproval(start: Date, end?: Date | null): boolean {
  if (start.getHours() < APPROVAL_THRESHOLD_EARLIEST_HOUR) return true;
  if (!end) return false;
  if (end.getHours() >= APPROVAL_THRESHOLD_LATEST_HOUR && (end.getHours() > 23 || end.getMinutes() > 0)) {
    return true;
  }
  if (end.getHours() >= APPROVAL_THRESHOLD_LATEST_HOUR) return true;
  if (
    end.getFullYear() !== start.getFullYear() ||
    end.getMonth() !== start.getMonth() ||
    end.getDate() !== start.getDate()
  ) {
    return true;
  }
  return false;
}
