import { Alert, Box, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { Button } from '@mui/material';
import { api } from '../api/client';
import { useCurrentEmployee } from '../app/CurrentEmployee';
import { formatDateTime, formatMinutesAsHours } from '../util/format';

export function DashboardPage() {
  const { current } = useCurrentEmployee();
  const employeeId = current?.id;

  const accountQuery = useQuery({
    queryKey: ['account', employeeId],
    queryFn: () => api.account(employeeId!),
    enabled: !!employeeId
  });

  const yearStartIso = `${new Date().getFullYear()}-01-01T00:00:00Z`;
  const violationsQuery = useQuery({
    queryKey: ['violations', employeeId, yearStartIso],
    queryFn: () => api.violations(employeeId!, yearStartIso),
    enabled: !!employeeId
  });

  const requestsQuery = useQuery({
    queryKey: ['requests', 'submitted', employeeId],
    queryFn: () => api.listRequests({ employeeId, status: 'Submitted' }),
    enabled: !!employeeId
  });

  const timeEntriesQuery = useQuery({
    queryKey: ['timeentries', employeeId, 'recent'],
    queryFn: () => api.timeEntries(employeeId!),
    enabled: !!employeeId
  });

  const openEntry = timeEntriesQuery.data?.find((e) => e.clockOut === null);

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h1">Dashboard</Typography>
        <Typography variant="body1" color="text.secondary">
          {current ? `Willkommen, ${current.firstName} ${current.lastName}.` : 'Lade Profil…'}
        </Typography>
      </Stack>

      {accountQuery.isError && (
        <Alert severity="error">Konto konnte nicht geladen werden: {(accountQuery.error as Error).message}</Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }
        }}
      >
        <KpiCard
          label="Überstundenkonto"
          value={accountQuery.data ? formatMinutesAsHours(accountQuery.data.overtimeMinutes) : '—'}
          hint={current ? `Wochensoll ${current.weeklyHours} h · ${current.timeModel}` : ''}
          loading={accountQuery.isLoading}
        />
        <KpiCard
          label="Resturlaub"
          value={accountQuery.data ? `${accountQuery.data.vacationDaysRemaining} Tage` : '—'}
          hint={accountQuery.data ? `${accountQuery.data.vacationDaysUsed} von ${accountQuery.data.vacationDaysTotal} verbraucht` : ''}
          loading={accountQuery.isLoading}
        />
        <KpiCard
          label="Kernzeitverletzungen YTD"
          value={violationsQuery.data ? String(violationsQuery.data.length) : '—'}
          hint={violationsQuery.data && violationsQuery.data.length > 0 ? 'Im Jahresverlauf festgestellt' : 'Saubere Akte'}
          loading={violationsQuery.isLoading}
          tone={violationsQuery.data && violationsQuery.data.length > 0 ? 'warning' : 'default'}
        />
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h4">Aktuelle Buchung</Typography>
            {timeEntriesQuery.isLoading && <CircularProgress aria-label="Lade Buchungen" />}
            {!timeEntriesQuery.isLoading && !openEntry && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                <Typography color="text.secondary">Keine offene Buchung.</Typography>
                <Button component={RouterLink} to="/booking" variant="contained">
                  Jetzt einbuchen
                </Button>
              </Stack>
            )}
            {openEntry && (
              <Alert severity="info">
                Eingebucht seit {formatDateTime(openEntry.clockIn)}.{' '}
                <Button component={RouterLink} to="/booking" size="small">
                  Zur Buchung
                </Button>
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h4">Offene Anträge</Typography>
              <Button component={RouterLink} to="/requests" size="small">
                Alle ansehen
              </Button>
            </Stack>
            {requestsQuery.isLoading && <CircularProgress aria-label="Lade Anträge" />}
            {!requestsQuery.isLoading && requestsQuery.data && requestsQuery.data.length === 0 && (
              <Typography color="text.secondary">Keine offenen Anträge.</Typography>
            )}
            {requestsQuery.data?.slice(0, 5).map((r) => (
              <Stack key={r.id} direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                <Typography>
                  {r.type} · {formatDateTime(r.from)} → {formatDateTime(r.to)}
                </Typography>
                {r.requiresApproval && <Chip label="Sondergenehmigung" size="small" color="warning" />}
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
  tone?: 'default' | 'warning';
}

function KpiCard({ label, value, hint, loading, tone = 'default' }: KpiProps) {
  return (
    <Card sx={{ borderColor: tone === 'warning' ? 'warning.main' : undefined }}>
      <CardContent>
        <Stack spacing={0.5}>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          {loading ? (
            <CircularProgress size={20} />
          ) : (
            <Typography variant="h2" sx={{ fontWeight: 500 }}>
              {value}
            </Typography>
          )}
          {hint && (
            <Typography variant="body2" color="text.secondary">
              {hint}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
