import { useEffect, useId, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  api,
  request as apiRequest,
  type CockpitHistoryDto,
  type CockpitHistoryItemDto,
  type TimeEntryAuditDto,
} from '../../api/client';
import { useCurrentUser } from '../../app/auth';
import { useI18n } from '../../app/i18n';
import { TimeAdjustmentDiff } from '../../routes/RequestsPage';
import { ComparisonTable } from '../../routes/AdminWorkingTimesPage';
import {
  HISTORY_PAGE_SIZE,
  HISTORY_STATUSES,
  historyDayCount,
  historyDays,
  historyItemDays,
  historyItemKey,
  historyPreset,
  historyStatus,
  historyStatusColor,
  isHistoryDate,
  nextHistoryCursor,
  uniqueHistoryItems,
  validHistoryPeriod,
  type HistoryPreset,
  type HistoryPeriod,
} from './cockpit-history';

const controlClass = 'rounded-md border bg-background px-3 py-2 text-sm';
const buttonClass = `${controlClass} hover:bg-muted disabled:opacity-50`;

function useHistoryLabels() {
  const i18n = useI18n();
  const label = (key: string, fallback: string) => {
    const value = i18n.t(key);
    return value === key ? fallback : value;
  };
  return {
    ...i18n,
    statusLabel: (status: string) =>
      label(`cockpitHistory.status.${status}`, status),
    kindLabel: (kind: string) => label(`cockpitHistory.kind.${kind}`, kind),
    classificationLabel: (value: string) =>
      label(`cockpitHistory.classification.${value}`, '') ||
      label(`enum.${value}`, value),
    actionLabel: (action: string) => {
      const history = label(`cockpitHistory.action.${action}`, '');
      const frame = label(`frameApproval.event.${action}`, '');
      return history || frame || label(`enum.${action}`, action);
    },
  };
}

function HistoryBadge({ item }: { item: CockpitHistoryItemDto }) {
  const { statusLabel } = useHistoryLabels();
  const status = historyStatus(item);
  return (
    <span
      className={`rounded px-1 py-0.5 text-xs font-medium ${historyStatusColor(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function HistoryCalendar({
  history,
  items,
  instanceId,
}: {
  history: CockpitHistoryDto;
  items: CockpitHistoryItemDto[];
  instanceId: string;
}) {
  const { t, languageTag, classificationLabel, kindLabel } = useHistoryLabels();
  const calendar = useMemo(() => {
    const byDay = new Map<string, CockpitHistoryItemDto[]>();
    for (const item of items)
      for (const day of historyItemDays(item, history)) {
        const entries = byDay.get(day) ?? [];
        entries.push(item);
        byDay.set(day, entries);
      }
    const months = new Map<string, string[]>();
    for (const day of historyDays(history)) {
      const month = day.slice(0, 7);
      months.set(month, [...(months.get(month) ?? []), day]);
    }
    return { byDay, months };
  }, [history, items]);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(languageTag, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, 0, 5 + index))),
  );
  return (
    <section aria-label={t('cockpitHistory.calendar')} className="space-y-5">
      {[...calendar.months].map(([month, days]) => {
        const firstDay = `${month}-01`;
        const lastDay = new Date(
          Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
        ).getUTCDate();
        const offset = (new Date(firstDay).getUTCDay() + 6) % 7;
        const count = Math.ceil((offset + lastDay) / 7) * 7;
        const included = new Set(days);
        const caption = new Intl.DateTimeFormat(languageTag, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(firstDay));
        return (
          <div key={month} className="overflow-x-auto">
            <table className="w-full min-w-[700px] table-fixed border-collapse text-xs">
              <caption className="pb-2 text-left text-base font-semibold">
                {caption}
              </caption>
              <thead>
                <tr>
                  {weekdays.map((day, index) => (
                    <th key={index} scope="col" className="border p-2">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: count / 7 }, (_, week) => (
                  <tr key={week}>
                    {Array.from({ length: 7 }, (_, weekday) => {
                      const number = week * 7 + weekday - offset + 1;
                      const date = `${month}-${String(number).padStart(2, '0')}`;
                      if (number < 1 || number > lastDay || !included.has(date))
                        return (
                          <td key={weekday} className="border bg-muted/30" />
                        );
                      return (
                        <td
                          key={weekday}
                          className="h-24 border p-1 align-top"
                          data-history-date={date}
                        >
                          <time dateTime={date} className="font-semibold">
                            {number}
                          </time>
                          <ul className="mt-1 space-y-1">
                            {(calendar.byDay.get(date) ?? []).map((item) => (
                              <li key={historyItemKey(item)}>
                                <a
                                  href={`#${instanceId}-${historyItemKey(item)}`}
                                  className="block space-y-1 rounded border p-1 hover:underline"
                                >
                                  <span className="block">
                                    {kindLabel(item.kind)} ·{' '}
                                    {classificationLabel(item.classification)}
                                  </span>
                                  <HistoryBadge item={item} />
                                  {((item.halfDayStart && date === item.from) ||
                                    (item.halfDayEnd && date === item.to)) && (
                                    <span className="block">
                                      {t('cockpitHistory.halfDay')}
                                    </span>
                                  )}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}

function AuditSnapshot({
  value,
  timeZone,
}: {
  value: unknown;
  timeZone: string;
}) {
  const { t, languageTag, statusLabel } = useHistoryLabels();
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Record<string, unknown>;
  const time = (raw: unknown) =>
    typeof raw === 'string' && Number.isFinite(Date.parse(raw)) ? (
      <time dateTime={raw} title={raw}>
        {new Date(raw).toLocaleString(languageTag, { timeZone })}
      </time>
    ) : (
      '—'
    );
  return (
    <div className="space-y-1">
      {(typeof snapshot.clockIn === 'string' ||
        typeof snapshot.clockOut === 'string') && (
        <p>
          {time(snapshot.clockIn)} → {time(snapshot.clockOut)}
        </p>
      )}
      {typeof snapshot.status === 'string' && (
        <p>{statusLabel(snapshot.status)}</p>
      )}
      {typeof snapshot.revision === 'number' && (
        <p>{t('cockpitHistory.revision', { revision: snapshot.revision })}</p>
      )}
    </div>
  );
}

function BookingAudit({
  id,
  scope,
  timeZone,
}: {
  id: string;
  scope: 'request' | 'entry';
  timeZone: string;
}) {
  const user = useCurrentUser();
  const { t, languageTag, actionLabel } = useHistoryLabels();
  const query = useQuery({
    queryKey: ['team-cockpit', user.id, user.role, 'history-audit', scope, id],
    queryFn: () =>
      scope === 'request'
        ? api.requestTimeEntryAudit(id)
        : apiRequest<TimeEntryAuditDto[]>(
            `/api/timeentries/${encodeURIComponent(id)}/audit`,
          ),
  });
  return (
    <section
      aria-label={t(
        scope === 'request'
          ? 'cockpitHistory.appliedAudit'
          : 'cockpitHistory.entryAudit',
      )}
      className="space-y-2"
    >
      <h5 className="font-medium">
        {t(
          scope === 'request'
            ? 'cockpitHistory.appliedAudit'
            : 'cockpitHistory.entryAudit',
        )}
      </h5>
      {query.isPending && <p role="status">{t('common.loading')}</p>}
      {query.isError && <AuditError retry={() => void query.refetch()} />}
      {query.isSuccess && query.data.length === 0 && (
        <p>{t('cockpitHistory.noEvents')}</p>
      )}
      {query.data && (
        <ol className="space-y-2">
          {query.data.map((event) => (
            <li key={event.id} className="rounded border p-2">
              <p className="font-medium">{actionLabel(event.action)}</p>
              <p>
                {t('cockpitHistory.actor', {
                  actor:
                    event.actorName ??
                    event.actorId ??
                    t('cockpitHistory.system'),
                })}
              </p>
              <time dateTime={event.occurredAt} title={event.occurredAt}>
                {new Date(event.occurredAt).toLocaleString(languageTag, {
                  timeZone,
                })}
              </time>
              {event.requestId && (
                <p>
                  {t('cockpitHistory.relatedRequest', { id: event.requestId })}
                </p>
              )}
              {event.reason && (
                <p className="whitespace-pre-wrap">{event.reason}</p>
              )}
              {event.before != null && (
                <div className="mt-2">
                  <p className="font-medium">{t('cockpitHistory.before')}</p>
                  <AuditSnapshot value={event.before} timeZone={timeZone} />
                </div>
              )}
              {event.after != null && (
                <div className="mt-2">
                  <p className="font-medium">{t('cockpitHistory.after')}</p>
                  <AuditSnapshot value={event.after} timeZone={timeZone} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AuditError({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert">
      <p>{t('cockpitHistory.auditFailed')}</p>
      <button type="button" className={buttonClass} onClick={retry}>
        {t('cockpitHistory.retry')}
      </button>
    </div>
  );
}
function WorkflowAudit({
  item,
  timeZone,
}: {
  item: CockpitHistoryItemDto;
  timeZone: string;
}) {
  const user = useCurrentUser();
  const { t, languageTag, actionLabel } = useHistoryLabels();
  const events = useQuery({
    queryKey: [
      'team-cockpit',
      user.id,
      user.role,
      'history-workflow',
      item.kind,
      item.id,
    ],
    queryFn: () => api.getRequestEvents(item.id),
    enabled: item.kind === 'Request',
  });
  const approvals = useQuery({
    queryKey: [
      'team-cockpit',
      user.id,
      user.role,
      'history-approvals',
      item.id,
    ],
    queryFn: () => api.timeEntryApprovalHistory(item.id),
    enabled: item.kind === 'TimeEntry' && item.requiresApproval,
  });
  const at = (value: string) => (
    <time dateTime={value} title={value}>
      {new Date(value).toLocaleString(languageTag, { timeZone })}
    </time>
  );
  return (
    <div className="space-y-4" aria-label={t('cockpitHistory.audit')}>
      {item.kind === 'Request' && (
        <section aria-label={t('cockpitHistory.events')}>
          <h5 className="font-medium">{t('cockpitHistory.events')}</h5>
          {events.isPending && <p role="status">{t('common.loading')}</p>}
          {events.isError && <AuditError retry={() => void events.refetch()} />}
          {events.isSuccess && events.data.length === 0 && (
            <p>{t('cockpitHistory.noEvents')}</p>
          )}
          {events.data && (
            <ol className="space-y-2">
              {events.data.map((event) => (
                <li key={event.id} className="rounded border p-2">
                  <p>{actionLabel(event.kind)}</p>
                  <p>
                    {t('cockpitHistory.actor', {
                      actor: event.actorId || t('cockpitHistory.system'),
                    })}
                  </p>
                  {at(event.at)}
                  {event.note && (
                    <p className="whitespace-pre-wrap">{event.note}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      {(item.kind === 'TimeEntry' ||
        item.request?.type === 'TimeAdjustment') && (
        <BookingAudit
          id={item.id}
          scope={item.kind === 'Request' ? 'request' : 'entry'}
          timeZone={timeZone}
        />
      )}
      {item.kind === 'TimeEntry' && item.requiresApproval && (
        <section aria-label={t('cockpitHistory.approvalAudit')}>
          <h5 className="font-medium">{t('cockpitHistory.approvalAudit')}</h5>
          {approvals.isPending && <p role="status">{t('common.loading')}</p>}
          {approvals.isError && (
            <AuditError retry={() => void approvals.refetch()} />
          )}
          {approvals.isSuccess && approvals.data.length === 0 && (
            <p>{t('cockpitHistory.noEvents')}</p>
          )}
          {approvals.data && (
            <ol className="space-y-2">
              {approvals.data.map((event) => (
                <li key={event.id} className="rounded border p-2">
                  <p>{actionLabel(event.action)}</p>
                  <p>
                    {t('cockpitHistory.actor', {
                      actor:
                        event.actorName ??
                        event.actorId ??
                        t('cockpitHistory.system'),
                    })}
                  </p>
                  {at(event.occurredAt)}
                  {event.requestId && (
                    <p>
                      {t('cockpitHistory.relatedRequest', {
                        id: event.requestId,
                      })}
                    </p>
                  )}
                  {event.reason && (
                    <p className="whitespace-pre-wrap">{event.reason}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

function HistoryRecord({
  item,
  history,
  instanceId,
}: {
  item: CockpitHistoryItemDto;
  history: CockpitHistoryDto;
  instanceId: string;
}) {
  const { t, languageTag, classificationLabel, kindLabel, actionLabel } =
    useHistoryLabels();
  const [details, setDetails] = useState(false);
  const at = (value: string, allDay = false) => (
    <time dateTime={value} title={value}>
      {new Date(value).toLocaleString(
        languageTag,
        allDay
          ? {
              timeZone: 'UTC',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }
          : {
              timeZone: history.timeZone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            },
      )}
    </time>
  );
  return (
    <li
      id={`${instanceId}-${historyItemKey(item)}`}
      className="scroll-mt-4 space-y-2 rounded border p-3 text-sm"
      tabIndex={-1}
    >
      <h4 className="font-semibold">
        {kindLabel(item.kind)} · {classificationLabel(item.classification)}{' '}
        <HistoryBadge item={item} />
      </h4>
      <p>
        {at(item.from, item.allDay)} →{' '}
        {item.to
          ? at(item.to, item.allDay)
          : t('cockpitHistory.running', {
              at: new Date(history.generatedAt).toLocaleString(languageTag, {
                timeZone: history.timeZone,
              }),
            })}
      </p>
      {item.halfDayStart && <p>{t('cockpitHistory.halfDayStart')}</p>}
      {item.halfDayEnd && <p>{t('cockpitHistory.halfDayEnd')}</p>}
      {(item.projectName || item.serviceOrderTitle) && (
        <p>
          {[item.projectName, item.serviceOrderTitle]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {item.kind !== 'Absence' && item.reason && (
        <p className="whitespace-pre-wrap">{item.reason}</p>
      )}
      <div className="flex flex-wrap gap-3">
        {(['gross', 'break', 'net'] as const).map((key) => {
          const value = item[`${key}Minutes`];
          return (
            value != null && (
              <span key={key}>
                {t(`cockpitHistory.${key}`, {
                  value: new Intl.NumberFormat(languageTag, {
                    maximumFractionDigits: 3,
                  }).format(value),
                })}
              </span>
            )
          );
        })}
      </div>
      {item.requiresApproval && <p>{t('cockpitHistory.requiresApproval')}</p>}
      {item.request?.type === 'TimeAdjustment' && (
        <TimeAdjustmentDiff
          request={item.request}
          timeZone={history.timeZone}
        />
      )}
      {item.proxyActions.length > 0 && (
        <section aria-label={t('cockpitHistory.proxy')}>
          <h5 className="font-medium">{t('cockpitHistory.proxy')}</h5>
          <ol className="space-y-2">
            {item.proxyActions.map((event) => (
              <li key={event.id} className="rounded border p-2">
                <p>{actionLabel(event.action)}</p>
                <p>
                  {t('cockpitHistory.actor', {
                    actor:
                      event.actorName ??
                      event.actorId ??
                      t('cockpitHistory.system'),
                  })}
                </p>
                {at(event.at)}
                <p className="whitespace-pre-wrap">{event.reason}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {item.kind !== 'Absence' && (
        <>
          <button
            type="button"
            className={buttonClass}
            aria-expanded={details}
            aria-controls={`${instanceId}-audit-${historyItemKey(item)}`}
            onClick={() => setDetails(!details)}
          >
            {t(
              details
                ? 'cockpitHistory.closeDetails'
                : 'cockpitHistory.details',
            )}
          </button>
          {details && (
            <div id={`${instanceId}-audit-${historyItemKey(item)}`}>
              <WorkflowAudit item={item} timeZone={history.timeZone} />
            </div>
          )}
        </>
      )}
    </li>
  );
}

function HistoryComparison({
  employeeId,
  period,
}: {
  employeeId: string;
  period: HistoryPeriod;
}) {
  const user = useCurrentUser();
  const { t } = useI18n();
  const query = useQuery({
    queryKey: [
      'team-cockpit',
      user.id,
      user.role,
      'history-comparison',
      employeeId,
      period.from,
      period.to,
    ],
    queryFn: () => api.workingTimeReport(period.from, period.to, employeeId),
  });
  return (
    <div>
      {query.isPending && <p role="status">{t('common.loading')}</p>}
      {query.isError && (
        <div role="alert">
          <p>{t('cockpitHistory.comparisonFailed')}</p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void query.refetch()}
          >
            {t('cockpitHistory.retry')}
          </button>
        </div>
      )}
      {query.data && !query.isError && <ComparisonTable report={query.data} />}
    </div>
  );
}

export function CockpitHistory({
  employeeId,
  today,
}: {
  employeeId: string;
  today: string;
}) {
  // Employee identity resets filters/audit state so another person's details are never retained.
  return (
    <EmployeeHistory key={employeeId} employeeId={employeeId} today={today} />
  );
}
function EmployeeHistory({
  employeeId,
  today,
}: {
  employeeId: string;
  today: string;
}) {
  const user = useCurrentUser();
  const { t, languageTag, statusLabel, classificationLabel } =
    useHistoryLabels();
  const instanceId = useId();
  const [preset, setPreset] = useState<HistoryPreset>('month');
  const [anchor, setAnchor] = useState(today);
  const [period, setPeriod] = useState(() => historyPreset('month', today));
  const [showComparison, setShowComparison] = useState(false);
  const valid = validHistoryPeriod(period);
  const enabled =
    valid &&
    !!employeeId &&
    (user.role === 'Manager' || user.role === 'HRAdmin');
  const history = useInfiniteQuery({
    queryKey: [
      'team-cockpit',
      user.id,
      user.role,
      'history',
      employeeId,
      period.from,
      period.to,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await api.teamCockpitHistory(employeeId, {
        ...period,
        limit: HISTORY_PAGE_SIZE,
        cursor: pageParam,
      });
      if (
        page.employee.id !== employeeId ||
        page.from !== period.from ||
        page.to !== period.to
      )
        throw new Error('History scope mismatch');
      return page;
    },
    // Cycle detection is rendered as an accessible failure, not thrown from a query observer.
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
  const pages = history.data?.pages ?? [];
  const items = useMemo(
    () => uniqueHistoryItems(history.data?.pages ?? []),
    [history.data],
  );
  let cursorError = false;
  if (pages.length) {
    try {
      nextHistoryCursor(pages[pages.length - 1], pages);
    } catch {
      cursorError = true;
    }
    if (pages.some((page) => page.timeZone !== pages[0].timeZone))
      cursorError = true;
  }
  const { fetchNextPage } = history;
  useEffect(() => {
    if (
      enabled &&
      history.hasNextPage &&
      !history.isFetching &&
      !history.isError &&
      !cursorError
    )
      void fetchNextPage();
  }, [
    enabled,
    history.hasNextPage,
    history.isFetching,
    history.isError,
    cursorError,
    fetchNextPage,
    pages.length,
  ]);
  const failed = history.isError || cursorError;
  const complete =
    enabled &&
    history.isSuccess &&
    !history.hasNextPage &&
    !history.isFetching &&
    !failed;
  const snapshot = pages[0];
  function choosePreset(value: HistoryPreset) {
    setPreset(value);
    if (value !== 'custom' && isHistoryDate(anchor))
      setPeriod(historyPreset(value, anchor));
  }
  function move(direction: number) {
    const date = new Date(`${period.from}T00:00:00Z`);
    date.setUTCMonth(
      date.getUTCMonth() +
        direction * (preset === 'year' ? 12 : preset === 'quarter' ? 3 : 1),
    );
    const next = date.toISOString().slice(0, 10);
    setAnchor(next);
    if (preset !== 'custom') setPeriod(historyPreset(preset, next));
  }
  return (
    <section aria-label={t('cockpitHistory.title')} className="space-y-5">
      <h2 className="text-xl font-semibold">{t('cockpitHistory.title')}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          {t('cockpitHistory.period')}
          <select
            className={controlClass}
            value={preset}
            onChange={(event) =>
              choosePreset(event.target.value as HistoryPreset)
            }
          >
            {(['month', 'quarter', 'year', 'custom'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`cockpitHistory.${value}`)}
              </option>
            ))}
          </select>
        </label>
        {preset !== 'custom' && (
          <>
            <button
              type="button"
              className={buttonClass}
              onClick={() => move(-1)}
            >
              {t('cockpitHistory.previous')}
            </button>
            <label className="grid gap-1">
              {t('cockpitHistory.anchor')}
              <input
                type="date"
                className={controlClass}
                value={anchor}
                onChange={(event) => {
                  const value = event.target.value;
                  setAnchor(value);
                  if (isHistoryDate(value))
                    setPeriod(historyPreset(preset, value));
                }}
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              onClick={() => move(1)}
            >
              {t('cockpitHistory.next')}
            </button>
          </>
        )}
        <label className="grid gap-1">
          {t('cockpitHistory.from')}
          <input
            type="date"
            className={controlClass}
            aria-invalid={!valid}
            aria-describedby={!valid ? `${instanceId}-invalid` : undefined}
            value={period.from}
            onChange={(event) => {
              setPreset('custom');
              setPeriod({ ...period, from: event.target.value });
            }}
          />
        </label>
        <label className="grid gap-1">
          {t('cockpitHistory.to')}
          <input
            type="date"
            className={controlClass}
            aria-invalid={!valid}
            aria-describedby={!valid ? `${instanceId}-invalid` : undefined}
            value={period.to}
            onChange={(event) => {
              setPreset('custom');
              setPeriod({ ...period, to: event.target.value });
            }}
          />
        </label>
      </div>
      {!valid && (
        <p role="alert" id={`${instanceId}-invalid`}>
          {t('cockpitHistory.invalid')}
        </p>
      )}
      {valid && !enabled && <p role="alert">{t('reports.accessDenied')}</p>}
      {enabled && !complete && (
        <p role="status" aria-live="polite">
          {t('cockpitHistory.loading', {
            pages: pages.length,
            count: items.length,
          })}
        </p>
      )}
      {enabled && failed && (
        <div role="alert">
          <p>{t('cockpitHistory.failed')}</p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              if (!cursorError && history.isFetchNextPageError)
                void history.fetchNextPage();
              else void history.refetch();
            }}
          >
            {t('cockpitHistory.retry')}
          </button>
        </div>
      )}
      {complete && snapshot && (
        <>
          <p role="status">
            {t('cockpitHistory.complete', {
              count: items.length,
              pages: pages.length,
            })}
          </p>
          <p className="text-sm">
            {t('cockpitHistory.zone', {
              zone: snapshot.timeZone,
              at: new Date(snapshot.generatedAt).toLocaleString(languageTag, {
                timeZone: snapshot.timeZone,
              }),
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('cockpitHistory.exclusiveEnd')}
          </p>
          <section
            aria-label={t('cockpitHistory.legend')}
            className="space-y-2"
          >
            <h3 className="font-medium">{t('cockpitHistory.legend')}</h3>
            <ul className="flex flex-wrap gap-2">
              {[
                ...new Set([...HISTORY_STATUSES, ...items.map(historyStatus)]),
              ].map((status) => (
                <li
                  key={status}
                  className={`rounded px-2 py-1 text-xs ${historyStatusColor(status)}`}
                >
                  {statusLabel(status)}
                </li>
              ))}
            </ul>
            <p className="text-sm">
              {['Sickness', 'Training', 'Flextime']
                .map(classificationLabel)
                .join(' · ')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('cockpitHistory.pendingHint')}
            </p>
          </section>
          <HistoryCalendar
            history={snapshot}
            items={items}
            instanceId={instanceId}
          />
          <section
            aria-label={t('cockpitHistory.records')}
            className="space-y-3"
          >
            <h3 className="text-lg font-semibold">
              {t('cockpitHistory.records')}
            </h3>
            {items.length === 0 ? (
              <p>{t('cockpitHistory.empty')}</p>
            ) : (
              <ol className="space-y-3">
                {items.map((item) => (
                  <HistoryRecord
                    key={historyItemKey(item)}
                    item={item}
                    history={snapshot}
                    instanceId={instanceId}
                  />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      {enabled && (
        <div className="space-y-3">
          {historyDayCount(period) > 366 ? (
            <p>{t('cockpitHistory.comparisonLimit')}</p>
          ) : (
            <>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showComparison}
                  onChange={(event) => setShowComparison(event.target.checked)}
                />
                {t('cockpitHistory.comparison')}
              </label>
              {showComparison && (
                <HistoryComparison
                  key={`${employeeId}:${period.from}:${period.to}`}
                  employeeId={employeeId}
                  period={period}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
