/** datetime-local has no UTC offset. Keep seconds/milliseconds visible and
 * enumerate matching instants rather than silently accepting Date's earlier
 * occurrence (or its normalization of a nonexistent spring-forward time). */
export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number, digits = 2) => String(n).padStart(digits, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function localDateTimeCandidates(value: string): string[] {
  const parts =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      value,
    );
  if (!parts) return [];
  const normalized = `${parts[1]}:${parts[2] ?? '00'}.${(parts[3] ?? '').padEnd(3, '0')}`;
  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    formatLocalDateTime(parsed.toISOString()) !== normalized
  )
    return [];

  // The offsets on the surrounding days include both sides of a clock
  // change, including non-hour changes such as Australia/Lord_Howe.
  const offsets = new Set(
    [-1, 0, 1].map((day) =>
      new Date(parsed.getTime() + day * 86_400_000).getTimezoneOffset(),
    ),
  );
  return [...offsets]
    .map((offset) =>
      new Date(
        parsed.getTime() + (offset - parsed.getTimezoneOffset()) * 60_000,
      ).toISOString(),
    )
    .filter((iso) => formatLocalDateTime(iso) === normalized)
    .sort();
}

export function utcOffsetLabel(iso: string): string {
  const minutes = -new Date(iso).getTimezoneOffset();
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}
