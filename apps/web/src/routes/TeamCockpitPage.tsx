import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  type CockpitAttendanceDto,
  type TeamCockpitDto,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { CockpitApprovals } from '../components/team-cockpit/CockpitApprovals';
import { CockpitHistory } from '../components/team-cockpit/CockpitHistory';
import { CockpitProxyForms } from '../components/team-cockpit/CockpitProxyForms';

/** Relative server duration avoids depending on the viewer's wall-clock skew. */
export function cockpitRefreshDelay(
  data: Pick<TeamCockpitDto, 'generatedAt' | 'nextRefreshAt'>,
) {
  const difference =
    Date.parse(data.nextRefreshAt) - Date.parse(data.generatedAt);
  return Number.isFinite(difference)
    ? Math.max(100, Math.min(30_000, difference + 100))
    : 30_000;
}

export function TeamCockpitPage() {
  const user = useCurrentUser();
  const { t, languageTag } = useI18n();
  const allowed = user.role === 'Manager' || user.role === 'HRAdmin';
  const [selectedId, setSelectedId] = useState('');
  const [expired, setExpired] = useState(false);
  const overview = useQuery({
    queryKey: ['team-cockpit', user.id, user.role, 'overview'],
    queryFn: () => api.teamCockpit(),
    enabled: allowed,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const { refetch, dataUpdatedAt, data } = overview;
  useEffect(() => {
    setExpired(false);
    if (!data) return;
    // Also expire cached data immediately when navigating back after a boundary.
    const delay = Math.max(
      0,
      cockpitRefreshDelay(data) - (Date.now() - dataUpdatedAt),
    );
    const timer = window.setTimeout(() => {
      setExpired(true);
      void refetch();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [data, dataUpdatedAt, refetch]);
  useEffect(() => {
    setSelectedId('');
  }, [user.id, user.role]);
  if (!allowed) return <p role="alert">{t('reports.accessDenied')}</p>;
  const stale = expired || overview.isError;
  // Never keep a revoked beneficiary selected after an authoritative refresh.
  const employees =
    data?.employees.filter(
      (employee) => employee.id !== user.id && employee.isActive,
    ) ?? [];
  const selected = employees.find((employee) => employee.id === selectedId);
  const format = (iso: string) =>
    new Intl.DateTimeFormat(languageTag, {
      timeZone: data?.timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  return (
    <main className="space-y-6 pb-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{t('cockpit.title')}</h1>
        <p>{t('cockpit.description')}</p>
      </header>
      <section
        className="space-y-4 rounded-lg border p-4"
        aria-label={t('cockpit.status')}
      >
        <h2 className="text-xl font-semibold">{t('cockpit.status')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('cockpit.bookingOnly')}
        </p>
        {overview.isPending && <p role="status">{t('common.loading')}</p>}
        {overview.isError && (
          <p role="alert">
            {t('cockpit.loadFailed')}{' '}
            {overview.error instanceof Error ? overview.error.message : ''}
          </p>
        )}
        {stale && data && <p role="alert">{t('cockpit.stale')}</p>}
        <Button
          variant="outline"
          disabled={overview.isFetching}
          onClick={() => void refetch()}
        >
          {t('frameApproval.refresh')}
        </Button>
        {data && (
          <>
            <p>{t(`cockpit.scope.${data.scope}`)}</p>
            <p className="text-sm">
              {t('cockpit.generated', {
                at: format(data.generatedAt),
                zone: data.timeZone,
              })}
            </p>
            {employees.length === 0 && <p>{t('cockpit.noEmployees')}</p>}
            <ul className="grid gap-3 md:grid-cols-2">
              {employees.map((employee) => (
                <Attendance
                  key={employee.id}
                  employee={employee}
                  stale={stale}
                  format={format}
                  onSelect={() => setSelectedId(employee.id)}
                />
              ))}
            </ul>
            {employees.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="cockpit-employee">
                  {t('cockpit.employee')}
                </Label>
                <select
                  id="cockpit-employee"
                  className="w-full rounded border bg-background p-2"
                  value={selected?.id ?? ''}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  <option value="">{t('cockpit.selectEmployee')}</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </section>
      <CockpitApprovals timeZone={data?.timeZone} />
      {selected && data && (
        <section
          key={`${user.id}-${user.role}-${selected.id}`}
          className="space-y-6"
          aria-label={t('cockpit.details')}
        >
          <h2 className="text-xl font-semibold">
            {selected.firstName} {selected.lastName}
          </h2>
          <CockpitProxyForms
            employee={selected}
            employees={employees}
            timeZone={data.timeZone}
          />
          <CockpitHistory employeeId={selected.id} today={data.today} />
        </section>
      )}
    </main>
  );
}

function Attendance({
  employee,
  stale,
  format,
  onSelect,
}: {
  employee: CockpitAttendanceDto;
  stale: boolean;
  format: (iso: string) => string;
  onSelect: () => void;
}) {
  const { t, enumLabel } = useI18n();
  return (
    <li className="space-y-2 rounded-md border p-3">
      <Button
        variant="link"
        className="h-auto p-0 text-base"
        onClick={onSelect}
      >
        {employee.firstName} {employee.lastName}
      </Button>
      <div>
        <Badge
          variant={
            !stale && employee.status === 'Missing'
              ? 'destructive'
              : 'secondary'
          }
        >
          {t(
            stale
              ? 'cockpit.unknownCurrent'
              : `cockpit.status.${employee.status}`,
          )}
        </Badge>
      </div>
      {!stale && employee.status === 'Booked' && employee.obligationReason && (
        <p>{t(`cockpit.expectation.${employee.obligationReason}`)}</p>
      )}
      {!stale && employee.openEntry && (
        <p>
          {t('cockpit.since', { at: format(employee.openEntry.clockIn) })}
          {employee.openEntry.projectName
            ? ` · ${employee.openEntry.projectName}`
            : ''}
          {employee.openEntry.serviceOrderTitle
            ? ` · ${employee.openEntry.serviceOrderTitle}`
            : ''}
        </p>
      )}
      <details>
        <summary className="cursor-pointer">{t('cockpit.core')}</summary>
        {employee.coreWindows.length === 0 ? (
          <p>{t('cockpit.noCore')}</p>
        ) : (
          <ul>
            {employee.coreWindows.map((window) => (
              <li key={`${window.start}-${window.end}`}>
                {format(window.start)} – {format(window.end)}
                {window.label ? ` · ${window.label}` : ''}
              </li>
            ))}
          </ul>
        )}
      </details>
      {employee.absences.length > 0 && (
        <div>
          <p>{t('cockpit.absences')}</p>
          <ul>
            {employee.absences.map((absence) => (
              <li key={`${absence.source}-${absence.id}`}>
                {enumLabel(absence.classification)} ·{' '}
                {t(`cockpit.${absence.status}`)} ·{' '}
                {t('cockpit.coverage', { coverage: absence.coverage })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
