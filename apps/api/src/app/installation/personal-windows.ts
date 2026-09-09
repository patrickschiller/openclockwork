export interface PersonalCoreWindow {
  [key: string]: string | number | undefined;
  start: string;
  end: string;
  weekdays: number;
  label?: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parsePersonalWindows(value: unknown): PersonalCoreWindow[] {
  if (!Array.isArray(value) || value.length > 20)
    throw new Error('Invalid personal core windows');
  const windows: PersonalCoreWindow[] = value.map((item) => {
    if (
      !item ||
      typeof item.start !== 'string' ||
      !HHMM.test(item.start) ||
      typeof item.end !== 'string' ||
      !HHMM.test(item.end) ||
      item.start >= item.end ||
      !Number.isInteger(item.weekdays) ||
      item.weekdays < 1 ||
      item.weekdays > 127 ||
      (item.label !== undefined &&
        (typeof item.label !== 'string' || item.label.length > 100))
    )
      throw new Error('Invalid personal core window');
    return {
      start: item.start,
      end: item.end,
      weekdays: item.weekdays,
      ...(item.label ? { label: item.label.trim() } : {}),
    };
  });
  for (let index = 0; index < windows.length; index++) {
    if (
      windows
        .slice(index + 1)
        .some(
          (other) =>
            (other.weekdays & windows[index].weekdays) !== 0 &&
            other.start < windows[index].end &&
            other.end > windows[index].start,
        )
    )
      throw new Error('Personal core windows overlap');
  }
  return windows;
}

export function validatePersonalFrame(
  start: string,
  end: string,
  windows: PersonalCoreWindow[],
): void {
  if (!HHMM.test(start) || !HHMM.test(end) || start >= end)
    throw new Error('Frame start must be before frame end');
  if (windows.some((window) => window.start < start || window.end > end))
    throw new Error('Core windows must be inside the personal frame');
}
