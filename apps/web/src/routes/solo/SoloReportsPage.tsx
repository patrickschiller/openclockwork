import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { downloadAuthenticated } from '../../api/client';
import { soloApi } from '../../api/solo';
import { useInstallation } from '../../app/installation';
import { useI18n } from '../../app/i18n';
import { dateInZone } from '../../app/solo-time';
import {
  Check,
  Feedback,
  Field,
  Minutes,
  QueryError,
  selectClass,
  useSoloAction,
} from './SoloUi';

export function periodDates(
  period: 'today' | 'week' | 'month',
  timeZone: string,
) {
  const to = dateInZone(timeZone);
  if (period === 'today') return { from: to, to };
  if (period === 'month') return { from: `${to.slice(0, 7)}-01`, to };
  const date = new Date(`${to}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return { from: date.toISOString().slice(0, 10), to };
}
export function SoloReportsPage() {
  const { t, languageTag, formatDateTime } = useI18n();
  const action = useSoloAction();
  const { data: installation } = useInstallation();
  const [search, setSearch] = useSearchParams();
  const defaults = periodDates('month', installation?.timeZone ?? 'UTC');
  const [filters, setFilters] = useState({
    from: search.get('from') || defaults.from,
    to: search.get('to') || defaults.to,
    customerId: search.get('customerId') || '',
    projectId: search.get('projectId') || '',
    serviceOrderId: search.get('serviceOrderId') || '',
    billable: search.get('billable') || '',
    unassigned: search.get('unassigned') === 'true',
  });
  const [applied, setApplied] = useState(
    new URLSearchParams(
      Object.entries(filters)
        .filter(
          ([key, value]) => value !== '' && (key !== 'unassigned' || value),
        )
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  const customers = useQuery({
    queryKey: ['solo-customers'],
    queryFn: soloApi.customers,
  });
  const projects = useQuery({
    queryKey: ['solo-projects'],
    queryFn: soloApi.projects,
  });
  const report = useQuery({
    queryKey: ['solo-report', applied.toString()],
    queryFn: () => soloApi.report(applied),
  });
  const project = projects.data?.find((p) => p.id === filters.projectId);
  const reportValue = report.data;
  const minuteText = (value: number) =>
    value.toLocaleString(languageTag, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return (
    <div className="space-y-6">
      <div className="solo-no-print">
        <h1 className="text-3xl font-semibold">{t('solo.reports')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('solo.reportHint')}
        </p>
      </div>
      <div className="solo-no-print">
        <Feedback action={action} successMessage={t('solo.downloadStarted')} />
        <QueryError
          error={report.error || projects.error || customers.error}
          retry={() => {
            void report.refetch();
            void projects.refetch();
            void customers.refetch();
          }}
        />
      </div>
      <form
        className="solo-no-print space-y-4 rounded-lg border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(filters))
            if (value !== '' && (key !== 'unassigned' || value))
              params.set(key, String(value));
          setApplied(params);
          setSearch(params, { replace: true });
        }}
      >
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month'] as const).map((period) => (
            <Button
              key={period}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setFilters({
                  ...filters,
                  ...periodDates(period, installation?.timeZone ?? 'UTC'),
                })
              }
            >
              {t(`solo.${period}`)}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('common.from')}>
            <Input
              type="date"
              required
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </Field>
          <Field label={t('common.to')}>
            <Input
              type="date"
              required
              min={filters.from}
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </Field>
          <Field label={t('solo.customer')}>
            <select
              className={selectClass}
              value={filters.customerId}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  customerId: e.target.value,
                  projectId: '',
                  serviceOrderId: '',
                  unassigned: false,
                })
              }
            >
              <option value="">{t('common.all')}</option>
              {customers.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('common.project')}>
            <select
              className={selectClass}
              value={filters.projectId}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  projectId: e.target.value,
                  serviceOrderId: '',
                  unassigned: false,
                })
              }
            >
              <option value="">{t('common.all')}</option>
              {projects.data
                ?.filter(
                  (p) =>
                    !filters.customerId || p.customerId === filters.customerId,
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t('projects.reportOrder')}>
            <select
              className={selectClass}
              value={filters.serviceOrderId}
              onChange={(e) =>
                setFilters({ ...filters, serviceOrderId: e.target.value })
              }
            >
              <option value="">{t('common.all')}</option>
              {project?.serviceOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNo} · {o.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('solo.billable')}>
            <select
              className={selectClass}
              value={filters.billable}
              onChange={(e) =>
                setFilters({ ...filters, billable: e.target.value })
              }
            >
              <option value="">{t('common.all')}</option>
              <option value="true">{t('solo.billable')}</option>
              <option value="false">{t('solo.nonBillable')}</option>
            </select>
          </Field>
        </div>
        <Check
          label={t('solo.unassigned')}
          checked={filters.unassigned}
          onChange={(value) =>
            setFilters({
              ...filters,
              unassigned: value,
              ...(value
                ? { customerId: '', projectId: '', serviceOrderId: '' }
                : {}),
            })
          }
        />
        <Button>{t('solo.reportFilter')}</Button>
      </form>
      {report.isFetching && (
        <p role="status" className="solo-no-print">
          {t('common.loading')}
        </p>
      )}
      {reportValue && (
        <>
          <div className="solo-no-print flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={action.pending || !action.online}
              onClick={() =>
                void action.run(() =>
                  downloadAuthenticated(
                    `/api/reports/solo.csv?${applied}`,
                    `openclockwork-${reportValue.from}-${reportValue.to}.csv`,
                  ),
                )
              }
            >
              {t('solo.csv')}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              {t('solo.print')}
            </Button>
          </div>
          {reportValue.openTimerCount > 0 && (
            <p className="solo-no-print text-sm text-amber-700 dark:text-amber-300">
              {t('solo.reportOpen', { count: reportValue.openTimerCount })}
            </p>
          )}
          <section className="solo-print space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                {t('solo.reportCustomerTitle')}
              </h2>
              <p className="text-sm">
                {reportValue.from} – {reportValue.to}
              </p>
              {applied.get('customerId') && (
                <p>
                  {
                    customers.data?.find(
                      (c) => c.id === applied.get('customerId'),
                    )?.name
                  }
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('solo.reportDefinition', { timeZone: reportValue.timeZone })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('solo.reportSnapshot', {
                  date: formatDateTime(new Date(report.dataUpdatedAt)),
                })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(
                [
                  'grossMinutes',
                  'breakMinutes',
                  'netMinutes',
                  'billableNetMinutes',
                ] as const
              ).map((key, index) => (
                <Card key={key}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">
                      {t(
                        [
                          'solo.gross',
                          'solo.break',
                          'solo.net',
                          'solo.billableNet',
                        ][index],
                      )}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      <Minutes value={reportValue.totals[key]} />
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div
              className="overflow-x-auto rounded border"
              tabIndex={0}
              role="region"
              aria-label={t('solo.reportCustomerTitle')}
            >
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    {[
                      'projects.reportDate',
                      'solo.customer',
                      'common.project',
                      'projects.reportOrder',
                      'common.activity',
                      'solo.gross',
                      'solo.break',
                      'solo.net',
                      'solo.billableNet',
                    ].map((key) => (
                      <th key={key} className="p-3 font-medium">
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportValue.rows.map((row) => (
                    <tr key={`${row.id}-${row.date}`} className="border-t">
                      <td className="whitespace-nowrap p-3">{row.date}</td>
                      <td className="p-3">{row.customerName ?? '—'}</td>
                      <td className="p-3">
                        {row.projectName ?? t('solo.unassigned')}
                      </td>
                      <td className="p-3">{row.orderNo ?? '—'}</td>
                      <td className="max-w-sm break-words p-3">
                        {row.activity ?? '—'}
                      </td>
                      <td className="p-3 tabular-nums">
                        {minuteText(row.grossMinutes)}
                      </td>
                      <td className="p-3 tabular-nums">
                        {minuteText(row.breakMinutes)}
                      </td>
                      <td className="p-3 tabular-nums">
                        {minuteText(row.netMinutes)}
                      </td>
                      <td className="p-3 tabular-nums">
                        {minuteText(row.billableNetMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reportValue.rows.length === 0 && <p>{t('solo.reportEmpty')}</p>}
          </section>
        </>
      )}
    </div>
  );
}
