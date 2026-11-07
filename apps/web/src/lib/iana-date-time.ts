/** Resolve wall-clock input in the declared server zone, never the browser zone.
 * Intl supplies the IANA rules; no implicit Date parsing/DST normalization. */
function formatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function wallTime(date: Date, format: Intl.DateTimeFormat): string {
  const parts = Object.fromEntries(
    format.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
}

export function formatZonedDateTime(iso: string, timeZone: string): string {
  return wallTime(new Date(iso), formatter(timeZone));
}

/** Empty for malformed dates, invalid zones and DST gaps; two for a fold.
 * Callers must explicitly choose an instant whenever more than one matches. */
export function zonedDateTimeCandidates(
  value: string,
  timeZone: string,
): string[] {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      value,
    );
  if (!match || value.startsWith('0000-')) return [];
  const normalized = `${match[1]}:${match[2] ?? '00'}.${(match[3] ?? '').padEnd(3, '0')}`;
  const naive = new Date(`${normalized}Z`);
  if (
    !Number.isFinite(naive.getTime()) ||
    naive.toISOString() !== `${normalized}Z`
  )
    return [];
  try {
    const format = formatter(timeZone);
    // Sampling both surrounding days captures both transition offsets, also
    // half-hour folds and date-line changes, without assuming whole hours.
    const offsets = new Set<number>();
    for (let hours = -48; hours <= 48; hours += 6) {
      const sample = new Date(naive.getTime() + hours * 3_600_000);
      offsets.add(
        new Date(`${wallTime(sample, format)}Z`).getTime() - sample.getTime(),
      );
    }
    return [...offsets]
      .map((offset) => new Date(naive.getTime() - offset).toISOString())
      .filter((iso) => wallTime(new Date(iso), format) === normalized)
      .sort();
  } catch {
    return [];
  }
}

export function zonedUtcOffsetLabel(iso: string, timeZone: string): string {
  const offset =
    (new Date(`${formatZonedDateTime(iso, timeZone)}Z`).getTime() -
      new Date(iso).getTime()) /
    60_000;
  const absolute = Math.abs(offset);
  return `UTC${offset < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}
