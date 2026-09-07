export function formatMinutesAsHours(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatNetMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatDateTime(iso: string, languageTag?: string): string {
  const d = new Date(iso);
  return d.toLocaleString(languageTag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string, languageTag?: string): string {
  return new Date(iso).toLocaleDateString(languageTag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTime(iso: string, languageTag?: string): string {
  return new Date(iso).toLocaleTimeString(languageTag, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
