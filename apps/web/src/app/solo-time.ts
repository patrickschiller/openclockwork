/** Format a wall-clock value in the installation zone, independently of browser locale. */
export function zonedInput(instant: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function localCandidates(local: string, timeZone: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return [];
  const nominal = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(nominal)) return [];
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const instant = nominal + hours * 3_600_000;
    offsets.add(
      Date.parse(`${zonedInput(new Date(instant), timeZone)}:00Z`) - instant,
    );
  }
  return [...offsets]
    .map((offset) => new Date(nominal - offset).toISOString())
    .filter((instant) => zonedInput(instant, timeZone) === local)
    .sort();
}
export function dateInZone(timeZone: string) {
  return zonedInput(new Date(), timeZone).slice(0, 10);
}
export function offsetLabel(instant: string, local: string) {
  const minutes = (Date.parse(`${local}:00Z`) - Date.parse(instant)) / 60_000;
  return `UTC${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
}
