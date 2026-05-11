import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
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
