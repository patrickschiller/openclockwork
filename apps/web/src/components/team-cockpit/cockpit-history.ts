import type {
  CockpitHistoryDto,
  CockpitHistoryItemDto,
} from '../../api/client';

const DAY = 86_400_000;
export type HistoryPreset = 'month' | 'quarter' | 'year' | 'custom';
export type HistoryPeriod = { from: string; to: string };
export const HISTORY_PAGE_SIZE = 200;
export const HISTORY_MAX_DAYS = 1830;

export function isHistoryDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function historyDayCount({ from, to }: HistoryPeriod): number {
  return isHistoryDate(from) && isHistoryDate(to)
    ? Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1
    : 0;
}
export function validHistoryPeriod(period: HistoryPeriod): boolean {
  const count = historyDayCount(period);
  return count > 0 && count <= HISTORY_MAX_DAYS;
}
function dateOnly(year: number, month: number, day: number): string {
  const value = new Date(0);
  value.setUTCFullYear(year, month, day);
  return value.toISOString().slice(0, 10);
}
export function historyPreset(
  preset: Exclude<HistoryPreset, 'custom'>,
  anchor: string,
): HistoryPeriod {
  const [year, month] = anchor.split('-').map(Number);
  const startMonth =
    preset === 'year'
      ? 0
      : preset === 'quarter'
        ? Math.floor((month - 1) / 3) * 3
        : month - 1;
  const months = preset === 'year' ? 12 : preset === 'quarter' ? 3 : 1;
  return {
    from: dateOnly(year, startMonth, 1),
    to: dateOnly(year, startMonth + months, 0),
  };
}
export function historyDays(period: HistoryPeriod): string[] {
  if (!validHistoryPeriod(period)) return [];
  return Array.from({ length: historyDayCount(period) }, (_, index) =>
    new Date(Date.parse(period.from) + index * DAY).toISOString().slice(0, 10),
  );
}
export function historyDateAt(
  instant: string | number,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** All-day ends are inclusive; instant ends are exclusive. Never extend an open entry into the future. */
export function historyItemDays(
  item: CockpitHistoryItemDto,
  history: Pick<CockpitHistoryDto, 'from' | 'to' | 'timeZone' | 'generatedAt'>,
): string[] {
  let from: string;
  let to: string;
  if (item.allDay) {
    from = item.from;
    to = item.to ?? item.from;
  } else {
    const start = Date.parse(item.from);
    const end = Date.parse(item.to ?? history.generatedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      return [];
    from = historyDateAt(start, history.timeZone);
    to = historyDateAt(end - 1, history.timeZone);
  }
  return historyDays({
    from: from > history.from ? from : history.from,
    to: to < history.to ? to : history.to,
  });
}
export const historyItemKey = (
  item: Pick<CockpitHistoryItemDto, 'kind' | 'id'>,
) => `${item.kind}:${item.id}`;
export function uniqueHistoryItems(
  pages: CockpitHistoryDto[],
): CockpitHistoryItemDto[] {
  const items = new Map<string, CockpitHistoryItemDto>();
  for (const page of pages)
    for (const item of page.items) items.set(historyItemKey(item), item);
  return [...items.values()].sort(
    (a, b) =>
      b.from.localeCompare(a.from) ||
      historyItemKey(a).localeCompare(historyItemKey(b)),
  );
}
/** Fail explicitly on broken paging instead of presenting an incomplete calendar as complete. */
export function nextHistoryCursor(
  last: CockpitHistoryDto,
  pages: CockpitHistoryDto[],
): string | undefined {
  if (!last.nextCursor) return undefined;
  if (
    pages.length >= 10_000 ||
    pages.slice(0, -1).some((page) => page.nextCursor === last.nextCursor)
  ) {
    throw new Error('Invalid history pagination');
  }
  return last.nextCursor;
}
export function historyStatus(item: CockpitHistoryItemDto): string {
  return item.status === 'Voided'
    ? 'Voided'
    : (item.workflowState ?? item.status);
}
export const HISTORY_STATUSES = [
  'Draft',
  'Submitted',
  'PendingSubstitute',
  'PendingManager',
  'PendingHr',
  'BlockedManager',
  'Open',
  'Pending',
  'Approved',
  'Recorded',
  'Rejected',
  'Cancelled',
  'Voided',
] as const;
export function historyStatusColor(status: string): string {
  const colors: Record<string, string> = {
    Draft: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
    Submitted:
      'bg-yellow-100 text-yellow-950 dark:bg-yellow-950 dark:text-yellow-100',
    PendingSubstitute:
      'bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100',
    PendingManager:
      'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
    PendingHr:
      'bg-orange-100 text-orange-950 dark:bg-orange-950 dark:text-orange-100',
    BlockedManager:
      'bg-fuchsia-100 text-fuchsia-950 dark:bg-fuchsia-950 dark:text-fuchsia-100',
    Open: 'bg-cyan-100 text-cyan-950 dark:bg-cyan-950 dark:text-cyan-100',
    Pending:
      'bg-indigo-100 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100',
    Approved:
      'bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100',
    Recorded: 'bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100',
    Rejected: 'bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100',
    Cancelled: 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
    Voided: 'bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100',
  };
  return colors[status] ?? 'bg-muted text-muted-foreground';
}
