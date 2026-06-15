import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type RequestDto, type VacationBalanceDto } from '../api/client';
import { useCurrentUser } from '../app/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '../app/i18n';

function fmtMinutes(min: number): string {
  const sign = min < 0 ? '−' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h ${m.toString().padStart(2, '0')}min`;
}

export function DashboardPage() {
  const user = useCurrentUser();
  const { t, enumLabel, formatDate, formatDateTime } = useI18n();
  const employeeId = user.id;
  const year = new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();

  const accountQuery = useQuery({
    queryKey: ['account', employeeId],
    queryFn: () => api.account(employeeId),
  });
  const vacationQuery = useQuery({
    queryKey: ['vacation-balance', employeeId, year],
    queryFn: () => api.vacationBalance(employeeId, year),
  });
  const violationsQuery = useQuery({
    queryKey: ['violations', employeeId, year],
    queryFn: () => api.violations(employeeId, yearStart),
  });
  const openRequestsQuery = useQuery({
    queryKey: ['requests', { employeeId, status: 'Submitted' }],
    queryFn: () => api.listRequests({ employeeId, status: 'Submitted' }),
  });
  const allRequestsQuery = useQuery({
    queryKey: ['requests', { employeeId }],
    queryFn: () => api.listRequests({ employeeId }),
  });
  const vacationRequests = (allRequestsQuery.data ?? []).filter(
    (r) => r.type === 'Vacation',
  );
  const openEntryQuery = useQuery({
    queryKey: ['time-entries', employeeId, 'open'],
    queryFn: () => api.timeEntries(employeeId),
    select: (entries) => entries.find((e) => !e.clockOut) ?? null,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('nav.dashboard')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.welcome', {
            name: `${user.firstName} ${user.lastName}`,
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label={t('dashboard.remainingLeave')}
          value={
            vacationQuery.data
              ? t('dashboard.daysValue', {
                  count: vacationQuery.data.remainingDays.toFixed(1),
                })
              : '—'
          }
          hint={
            vacationQuery.data
              ? t('dashboard.leaveHint', {
                  approved: vacationQuery.data.approvedDays.toFixed(1),
                  pending: vacationQuery.data.pendingDays.toFixed(1),
                  total: vacationQuery.data.totalEntitlement.toFixed(1),
                })
              : t('common.loading')
          }
        />
        <KpiCard
          label={t('dashboard.overtime')}
          value={
            accountQuery.data
              ? fmtMinutes(accountQuery.data.overtimeMinutes)
              : '—'
          }
          hint={
            accountQuery.data
              ? formatDateTime(accountQuery.data.asOf)
              : t('common.loading')
          }
        />
        <KpiCard
          label={t('dashboard.violationsYtd')}
          value={
            violationsQuery.data ? String(violationsQuery.data.length) : '—'
          }
          hint={
            violationsQuery.data && violationsQuery.data.length > 0
              ? (() => {
                  const late = violationsQuery.data.filter(
                    (v) => v.kind === 'LateArrival',
                  ).length;
                  const early = violationsQuery.data.filter(
                    (v) => v.kind === 'EarlyDeparture',
                  ).length;
                  const mid = violationsQuery.data.filter(
                    (v) => v.kind === 'MidDayGap',
                  ).length;
                  const parts: string[] = [];
                  if (late)
                    parts.push(t('dashboard.violationLate', { count: late }));
                  if (early)
                    parts.push(t('dashboard.violationEarly', { count: early }));
                  if (mid)
                    parts.push(t('dashboard.violationMid', { count: mid }));
                  return parts.join(' · ');
                })()
              : t('dashboard.noViolations')
          }
        />
      </div>

      {violationsQuery.data && violationsQuery.data.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{t('dashboard.violationsDetected')}</AlertTitle>
          <AlertDescription>
            {t('dashboard.violationDetails', {
              count: violationsQuery.data.length,
            })}
          </AlertDescription>
        </Alert>
      )}

      <VacationWidget
        year={year}
        balance={vacationQuery.data}
        vacationRequests={vacationRequests}
        loading={vacationQuery.isLoading}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.currentBooking')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {openEntryQuery.data ? (
              <>
                <p>
                  {t('dashboard.clockedInSince', {
                    date: formatDateTime(openEntryQuery.data.clockIn),
                  })}
                </p>
                <Button asChild>
                  <Link to="/booking">{t('dashboard.bookingPage')}</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {t('dashboard.notClockedIn')}
                </p>
                <Button asChild>
                  <Link to="/booking">{t('dashboard.clockInOut')}</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.openRequests')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {openRequestsQuery.data && openRequestsQuery.data.length > 0 ? (
              <ul className="space-y-2">
                {openRequestsQuery.data.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      {enumLabel(r.type)} · {formatDate(r.from)} –{' '}
                      {formatDate(r.to)}
                    </span>
                    <Badge variant="secondary">
                      {enumLabel(r.workflowState)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                {t('dashboard.noOpenRequests')}
              </p>
            )}
            <Button variant="outline" asChild>
              <Link to="/requests">{t('dashboard.allRequests')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
}

function KpiCard({ label, value, hint }: KpiProps) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-3xl font-medium">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

interface VacationWidgetProps {
  year: number;
  balance: VacationBalanceDto | undefined;
  vacationRequests: RequestDto[];
  loading: boolean;
}

function VacationWidget({
  year,
  balance,
  vacationRequests,
  loading,
}: VacationWidgetProps) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between gap-2 space-y-0">
        <CardTitle>{t('dashboard.vacation', { year })}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/requests">{t('dashboard.createRequest')}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {loading || !balance ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <>
            <VacationProgress balance={balance} />
            <div className="grid gap-6 sm:grid-cols-2">
              <EntitlementBreakdown balance={balance} />
              <UsageBreakdown balance={balance} />
            </div>
            {balance.carryOverDays > 0 && balance.carryOverExpiresOn && (
              <CarryOverNotice
                days={balance.carryOverDays}
                expiresOn={balance.carryOverExpiresOn}
              />
            )}
            <UpcomingVacations requests={vacationRequests} year={year} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VacationProgress({ balance }: { balance: VacationBalanceDto }) {
  const { t } = useI18n();
  const total = balance.totalEntitlement;
  const approved = Math.min(balance.approvedDays, total);
  const pending = Math.max(0, Math.min(total - approved, balance.pendingDays));
  const approvedPct = total > 0 ? (approved / total) * 100 : 0;
  const pendingPct = total > 0 ? (pending / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t('dashboard.planned', {
            used: (approved + pending).toFixed(1),
            total: total.toFixed(1),
          })}
        </span>
        <span>
          {t('dashboard.remaining', {
            count: balance.remainingDays.toFixed(1),
          })}
        </span>
      </div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={t('dashboard.leaveUsage', {
          used: (approved + pending).toFixed(1),
          total: total.toFixed(1),
        })}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={approved + pending}
      >
        <div
          className="bg-primary transition-[width]"
          style={{ width: `${approvedPct}%` }}
          title={t('dashboard.daysApproved', { count: approved.toFixed(1) })}
        />
        <div
          className="bg-primary/40 transition-[width]"
          style={{ width: `${pendingPct}%` }}
          title={t('dashboard.daysPending', { count: pending.toFixed(1) })}
        />
      </div>
    </div>
  );
}

function EntitlementBreakdown({ balance }: { balance: VacationBalanceDto }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('dashboard.entitlement')}
      </p>
      <DetailRow
        label={t('dashboard.baseEntitlement')}
        value={t('dashboard.daysValue', { count: balance.baseDays.toFixed(1) })}
      />
      <DetailRow
        label={t('dashboard.carryOver')}
        value={t('dashboard.daysValue', {
          count: `${balance.carryOverDays >= 0 ? '+' : ''}${balance.carryOverDays.toFixed(1)}`,
        })}
        muted={balance.carryOverDays === 0}
      />
      <DetailRow
        label={
          balance.adjustmentReason
            ? `${t('dashboard.adjustment')} (${balance.adjustmentReason})`
            : t('dashboard.adjustment')
        }
        value={t('dashboard.daysValue', {
          count: `${balance.adjustmentDays >= 0 ? '+' : ''}${balance.adjustmentDays.toFixed(1)}`,
        })}
        muted={balance.adjustmentDays === 0}
      />
      <div className="border-t pt-2">
        <DetailRow
          label={t('dashboard.total')}
          value={t('dashboard.daysValue', {
            count: balance.totalEntitlement.toFixed(1),
          })}
          emphasized
        />
      </div>
    </div>
  );
}

function UsageBreakdown({ balance }: { balance: VacationBalanceDto }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('dashboard.usage')}
      </p>
      <DetailRow
        label={t('dashboard.approved')}
        value={t('dashboard.daysValue', {
          count: balance.approvedDays.toFixed(1),
        })}
      />
      <DetailRow
        label={t('dashboard.pending')}
        value={t('dashboard.daysValue', {
          count: balance.pendingDays.toFixed(1),
        })}
      />
      <div className="border-t pt-2">
        <DetailRow
          label={t('dashboard.remainingLabel')}
          value={t('dashboard.daysValue', {
            count: balance.remainingDays.toFixed(1),
          })}
          emphasized
        />
      </div>
    </div>
  );
}

function CarryOverNotice({
  days,
  expiresOn,
}: {
  days: number;
  expiresOn: string;
}) {
  const { t, formatDate } = useI18n();
  return (
    <Alert>
      <AlertTitle>{t('dashboard.carryOverExpires')}</AlertTitle>
      <AlertDescription>
        {t('dashboard.carryOverExpiresDescription', {
          days: days.toFixed(1),
          date: formatDate(expiresOn),
        })}
      </AlertDescription>
    </Alert>
  );
}

function UpcomingVacations({
  requests,
  year,
}: {
  requests: RequestDto[];
  year: number;
}) {
  const { t, enumLabel, formatDate } = useI18n();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = requests
    .filter((r) => {
      if (r.workflowState === 'Rejected' || r.workflowState === 'Cancelled')
        return false;
      const to = new Date(r.to);
      const from = new Date(r.from);
      // Show anything that hasn't fully ended yet AND falls in the displayed year window.
      return to >= today && from.getFullYear() <= year + 1;
    })
    .sort((a, b) => new Date(a.from).getTime() - new Date(b.from).getTime())
    .slice(0, 4);

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {t('dashboard.plannedVacations')}
      </p>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('dashboard.noPlannedVacations')}
        </p>
      ) : (
        <ul className="space-y-1">
          {upcoming.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span>
                {formatDate(r.from)} – {formatDate(r.to)} ·{' '}
                <span className="text-muted-foreground">
                  {t('dashboard.workDays', {
                    count: r.calculatedDays.toFixed(1),
                  })}
                </span>
              </span>
              <Badge
                variant={
                  r.workflowState === 'Approved' ? 'default' : 'secondary'
                }
              >
                {enumLabel(r.workflowState)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  emphasized,
  muted,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span
        className={
          emphasized ? 'font-semibold' : muted ? 'text-muted-foreground' : ''
        }
      >
        {value}
      </span>
    </div>
  );
}
