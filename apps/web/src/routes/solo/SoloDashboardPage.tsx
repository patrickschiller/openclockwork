import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { soloApi } from '../../api/solo';
import { useCurrentUser } from '../../app/auth';
import { useInstallation } from '../../app/installation';
import { useI18n } from '../../app/i18n';
import { dateInZone } from '../../app/solo-time';
import { Minutes, QueryError } from './SoloUi';
import { SoloTimer } from './SoloTimesPage';
import { periodDates } from './SoloReportsPage';
import { PersonalHints } from './PersonalHints';

export function SoloDashboardPage() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const { data: installation } = useInstallation();
  const zone = installation?.timeZone ?? 'UTC';
  const today = dateInZone(zone);
  const week = periodDates('week', zone);
  const entries = useQuery({
    queryKey: ['solo-times', user.id],
    queryFn: () => soloApi.entries(user.id),
    refetchInterval: 30_000,
  });
  const projects = useQuery({
    queryKey: ['solo-bookable', user.id],
    queryFn: () => soloApi.bookableProjects(user.id),
  });
  const dayReport = useQuery({
    queryKey: ['solo-report', `today-${today}`],
    queryFn: () =>
      soloApi.report(new URLSearchParams({ from: today, to: today })),
  });
  const weekReport = useQuery({
    queryKey: ['solo-report', `week-${week.from}-${week.to}`],
    queryFn: () => soloApi.report(new URLSearchParams(week)),
  });
  const summary = useQuery({
    queryKey: ['solo-summary', today],
    queryFn: () => soloApi.summary(`${today.slice(0, 4)}-01-01`, today),
    enabled: Boolean(
      installation?.capabilities.targets || installation?.capabilities.leave,
    ),
  });
  const recent = [
    ...new Map(
      (entries.data ?? [])
        .filter((entry) => entry.projectId && !entry.voidedAt)
        .sort((a, b) => b.clockIn.localeCompare(a.clockIn))
        .map((entry) => [entry.projectId, entry.projectName]),
    ).entries(),
  ].slice(0, 5);
  const unassigned =
    entries.data?.filter(
      (entry) => !entry.projectId && entry.clockOut && !entry.voidedAt,
    ).length ?? 0;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">{t('solo.overview')}</h1>
      <QueryError
        error={
          entries.error ||
          projects.error ||
          dayReport.error ||
          weekReport.error ||
          summary.error
        }
        retry={() => {
          void entries.refetch();
          void projects.refetch();
          void dayReport.refetch();
          void weekReport.refetch();
          if (summary.isEnabled) void summary.refetch();
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">
              {t('solo.today')} · {t('solo.net')}
            </p>
            <p className="mt-1 text-3xl font-semibold">
              <Minutes value={dayReport.data?.totals.netMinutes} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">
              {t('solo.week')} · {t('solo.net')}
            </p>
            <p className="mt-1 text-3xl font-semibold">
              <Minutes value={weekReport.data?.totals.netMinutes} />
            </p>
          </CardContent>
        </Card>
      </div>
      {entries.isLoading ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <SoloTimer
          entries={entries.data ?? []}
          projects={projects.data ?? []}
        />
      )}
      {(installation?.capabilities.targets ||
        installation?.capabilities.leave) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {installation.capabilities.targets && (
            <>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">
                    {t('solo.target')}
                  </p>
                  <p className="text-xl font-semibold">
                    <Minutes value={summary.data?.targetMinutes} />
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-sm text-muted-foreground">
                    {t('solo.balance')}
                  </p>
                  <p className="text-xl font-semibold">
                    <Minutes value={summary.data?.overtimeMinutes} />
                  </p>
                </CardContent>
              </Card>
            </>
          )}
          {installation.capabilities.leave && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">
                  {t('solo.leaveRemaining')}
                </p>
                <p className="text-xl font-semibold">
                  {summary.data?.vacationDaysRemaining ?? '—'}{' '}
                  {t('common.days')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      <PersonalHints />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h2 className="font-semibold">
              {t('solo.unassigned')}: {unassigned}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('solo.unassignedHint')}
            </p>
            <Button variant="outline" asChild>
              <Link to="/booking">{t('solo.times')}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h2 className="font-semibold">{t('solo.recentProjects')}</h2>
            <ul className="space-y-2">
              {recent.map(([id, name]) => (
                <li key={id}>
                  <Link
                    className="break-words text-sm underline underline-offset-4"
                    to={`/reports?projectId=${id}`}
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
            {recent.length === 0 && (
              <Link className="text-sm underline" to="/projects">
                {t('solo.projectNew')}
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
