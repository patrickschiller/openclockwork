import { DEFAULT_FRAME, type FrameTimeRule } from '../work-time/core-time.js';

export const APPROVAL_THRESHOLD_EARLIEST_HOUR = 7;
export const APPROVAL_THRESHOLD_LATEST_HOUR = 23;

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function frameStartMinutes(frame: FrameTimeRule): number {
  return frame.startHour * 60 + frame.startMinute;
}

function frameEndMinutes(frame: FrameTimeRule): number {
  return frame.endHour * 60 + frame.endMinute;
}

/**
 * A booking or time-adjustment request that begins before the frame's start
 * or ends after its end (or crosses midnight) requires special approval.
 * Defaults to 07:00 / 23:00 per the OpenClockwork spec.
 */
export function requiresSpecialApproval(
  start: Date,
  end?: Date | null,
  frame: FrameTimeRule = DEFAULT_FRAME,
): boolean {
  if (minutesOf(start) < frameStartMinutes(frame)) return true;
  if (!end) return false;
  if (
    end.getFullYear() !== start.getFullYear() ||
    end.getMonth() !== start.getMonth() ||
    end.getDate() !== start.getDate()
  ) {
    return true; // crosses midnight
  }
  if (minutesOf(end) > frameEndMinutes(frame)) return true;
  return false;
}
