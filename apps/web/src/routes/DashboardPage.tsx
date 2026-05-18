import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type RequestDto, type VacationBalanceDto } from '../api/client';
import { useCurrentUser } from '../app/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function fmtMinutes(min: number): string {
  const sign = min < 0 ? '−' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h ${m.toString().padStart(2, '0')}min`;
}

export function DashboardPage() {
  const user = useCurrentUser();
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
  const vacationRequests = (allRequestsQuery.data ?? []).filter((r) => r.type === 'Vacation');
  const openEntryQuery = useQuery({
    queryKey: ['time-entries', employeeId, 'open'],
    queryFn: () => api.timeEntries(employeeId),
    select: (entries) => entries.find((e) => !e.clockOut) ?? null,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Willkommen, {user.firstName} {user.lastName}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Resturlaub"
          value={vacationQuery.data ? `${vacationQuery.data.remainingDays.toFixed(1)} Tage` : '—'}
          hint={
            vacationQuery.data
              ? `${vacationQuery.data.approvedDays.toFixed(1)} genehmigt · ${vacationQuery.data.pendingDays.toFixed(1)} offen · ${vacationQuery.data.totalEntitlement.toFixed(1)} gesamt`
              : 'Lade…'
          }
        />
        <KpiCard
          label="Überstundenkonto"
          value={accountQuery.data ? fmtMinutes(accountQuery.data.overtimeMinutes) : '—'}
          hint={accountQuery.data ? `Stand ${new Date(accountQuery.data.asOf).toLocaleString('de-DE')}` : 'Lade…'}
        />
        <KpiCard
          label="Kernzeitverletzungen YTD"
          value={violationsQuery.data ? String(violationsQuery.data.length) : '—'}
          hint={
            violationsQuery.data && violationsQuery.data.length > 0
              ? (() => {
                  const late = violationsQuery.data.filter((v) => v.kind === 'LateArrival').length;
                  const early = violationsQuery.data.filter((v) => v.kind === 'EarlyDeparture').length;
                  const mid = violationsQuery.data.filter((v) => v.kind === 'MidDayGap').length;
                  const parts: string[] = [];
                  if (late) parts.push(`${late} verspätet`);
                  if (early) parts.push(`${early} zu früh`);
                  if (mid) parts.push(`${mid} Pause in Kernzeit`);
                  return parts.join(' · ');
                })()
              : 'Keine Verstöße erkannt'
          }
        />
      </div>

      {violationsQuery.data && violationsQuery.data.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Kernzeitverletzungen erkannt</AlertTitle>
          <AlertDescription>
            {violationsQuery.data.length} Verstoß / Verstöße im laufenden Jahr — Details auf der
            Buchungs-Seite.
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
            <CardTitle>Aktuelle Buchung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {openEntryQuery.data ? (
              <>
                <p>
                  Eingestempelt seit{' '}
                  <strong>{new Date(openEntryQuery.data.clockIn).toLocaleString('de-DE')}</strong>.
                </p>
                <Button asChild>
                  <Link to="/booking">Zur Buchungsseite</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Du bist aktuell nicht eingestempelt.</p>
                <Button asChild>
                  <Link to="/booking">Kommen / Gehen</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offene Anträge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {openRequestsQuery.data && openRequestsQuery.data.length > 0 ? (
              <ul className="space-y-2">
                {openRequestsQuery.data.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>
                      {r.type} · {new Date(r.from).toLocaleDateString('de-DE')} –{' '}
                      {new Date(r.to).toLocaleDateString('de-DE')}
                    </span>
                    <Badge variant="secondary">{r.workflowState}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Keine offenen Anträge.</p>
            )}
            <Button variant="outline" asChild>
              <Link to="/requests">Alle Anträge</Link>
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
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
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

function VacationWidget({ year, balance, vacationRequests, loading }: VacationWidgetProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between gap-2 space-y-0">
        <CardTitle>Urlaub {year}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/requests">Antrag stellen</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {loading || !balance ? (
          <p className="text-muted-foreground">Lade…</p>
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
  const total = balance.totalEntitlement;
  const approved = Math.min(balance.approvedDays, total);
  const pending = Math.max(0, Math.min(total - approved, balance.pendingDays));
  const approvedPct = total > 0 ? (approved / total) * 100 : 0;
  const pendingPct = total > 0 ? (pending / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {(approved + pending).toFixed(1)} von {total.toFixed(1)} Tagen verplant
        </span>
        <span>{balance.remainingDays.toFixed(1)} verbleibend</span>
      </div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`Urlaubsverbrauch: ${(approved + pending).toFixed(1)} von ${total.toFixed(1)} Tagen`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={approved + pending}
      >
        <div
          className="bg-primary transition-[width]"
          style={{ width: `${approvedPct}%` }}
          title={`${approved.toFixed(1)} Tage genehmigt`}
        />
        <div
          className="bg-primary/40 transition-[width]"
          style={{ width: `${pendingPct}%` }}
          title={`${pending.toFixed(1)} Tage offen`}
        />
      </div>
    </div>
  );
}

function EntitlementBreakdown({ balance }: { balance: VacationBalanceDto }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Anspruch</p>
      <DetailRow label="Grundanspruch" value={`${balance.baseDays.toFixed(1)} Tage`} />
      <DetailRow
        label="Übertrag"
        value={`${balance.carryOverDays >= 0 ? '+' : ''}${balance.carryOverDays.toFixed(1)} Tage`}
        muted={balance.carryOverDays === 0}
      />
      <DetailRow
        label={balance.adjustmentReason ? `Korrektur (${balance.adjustmentReason})` : 'Korrektur'}
        value={`${balance.adjustmentDays >= 0 ? '+' : ''}${balance.adjustmentDays.toFixed(1)} Tage`}
        muted={balance.adjustmentDays === 0}
      />
      <div className="border-t pt-2">
        <DetailRow
          label="Gesamt"
          value={`${balance.totalEntitlement.toFixed(1)} Tage`}
          emphasized
        />
      </div>
    </div>
  );
}

function UsageBreakdown({ balance }: { balance: VacationBalanceDto }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Nutzung</p>
      <DetailRow label="Genehmigt" value={`${balance.approvedDays.toFixed(1)} Tage`} />
      <DetailRow label="Offen" value={`${balance.pendingDays.toFixed(1)} Tage`} />
      <div className="border-t pt-2">
        <DetailRow
          label="Verbleibend"
          value={`${balance.remainingDays.toFixed(1)} Tage`}
          emphasized
        />
      </div>
    </div>
  );
}

function CarryOverNotice({ days, expiresOn }: { days: number; expiresOn: string }) {
  return (
    <Alert>
      <AlertTitle>Übertrag verfällt bald</AlertTitle>
      <AlertDescription>
        {days.toFixed(1)} Tage Resturlaub aus dem Vorjahr müssen bis zum{' '}
        <strong>{new Date(expiresOn).toLocaleDateString('de-DE')}</strong> genommen werden.
      </AlertDescription>
    </Alert>
  );
}

function UpcomingVacations({ requests, year }: { requests: RequestDto[]; year: number }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = requests
    .filter((r) => {
      if (r.workflowState === 'Rejected' || r.workflowState === 'Cancelled') return false;
      const to = new Date(r.to);
      const from = new Date(r.from);
      // Show anything that hasn't fully ended yet AND falls in the displayed year window.
      return to >= today && from.getFullYear() <= year + 1;
    })
    .sort((a, b) => new Date(a.from).getTime() - new Date(b.from).getTime())
    .slice(0, 4);

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Geplante Urlaube</p>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aktuell keine bevorstehenden oder eingereichten Urlaube.
        </p>
      ) : (
        <ul className="space-y-1">
          {upcoming.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span>
                {new Date(r.from).toLocaleDateString('de-DE')} –{' '}
                {new Date(r.to).toLocaleDateString('de-DE')} ·{' '}
                <span className="text-muted-foreground">
                  {r.calculatedDays.toFixed(1)} Arbeitstage
                </span>
              </span>
              <Badge variant={r.workflowState === 'Approved' ? 'default' : 'secondary'}>
                {workflowLabel(r.workflowState)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function workflowLabel(state: RequestDto['workflowState']): string {
  switch (state) {
    case 'Approved':
      return 'Genehmigt';
    case 'Submitted':
      return 'Eingereicht';
    case 'PendingSubstitute':
      return 'Wartet auf Vertretung';
    case 'PendingManager':
      return 'Wartet auf Manager';
    case 'PendingHr':
      return 'Wartet auf HR';
    case 'Rejected':
      return 'Abgelehnt';
    case 'Cancelled':
      return 'Storniert';
    case 'Draft':
      return 'Entwurf';
    default:
      return state;
  }
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
      <span className={emphasized ? 'font-semibold' : muted ? 'text-muted-foreground' : ''}>
        {value}
      </span>
    </div>
  );
}
