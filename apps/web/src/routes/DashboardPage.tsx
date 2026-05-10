import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardPage() {
  const { current } = useCurrentEmployee();
  const employeeId = current?.id;

  const vacationQuery = useQuery({
    queryKey: ['vacation-balance', employeeId, new Date().getFullYear()],
    queryFn: () => api.vacationBalance(employeeId!),
    enabled: !!employeeId,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {current
            ? `Willkommen, ${current.firstName} ${current.lastName}.`
            : 'Lade Profil…'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Resturlaub"
          value={
            vacationQuery.data
              ? `${vacationQuery.data.remainingDays.toFixed(1)} Tage`
              : '—'
          }
          hint={
            vacationQuery.data
              ? `${vacationQuery.data.approvedDays.toFixed(1)} genehmigt · ${vacationQuery.data.pendingDays.toFixed(1)} offen · ${vacationQuery.data.totalEntitlement.toFixed(1)} gesamt`
              : 'Backend nicht erreichbar'
          }
        />
        <KpiCard label="Überstundenkonto" value="—" hint="API folgt in Epic 2" />
        <KpiCard label="Kernzeitverletzungen YTD" value="—" hint="API folgt in Epic 2" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            OpenClockwork Web läuft auf Nx + Vite + Tailwind + shadcn/ui. Die NestJS-API
            (<code>apps/api</code>) ist als Skeleton vorhanden, aber noch ohne Endpunkte —
            Implementation startet in Epic 2.
          </p>
          <p>
            Bis dahin schlagen alle Daten-Queries fehl, das Routing und die Shell sind aber
            bereits vollständig.
          </p>
        </CardContent>
      </Card>
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
