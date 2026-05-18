import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { api, type ClockInPayload, type TimeEntryDto } from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useOnline } from '../app/use-online';

function captureGps(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    );
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE');
}

function fmtSummary(entry: TimeEntryDto): string {
  if (!entry.summary) return '— offen';
  const { grossMinutes, breakMinutes, netMinutes } = entry.summary;
  const h = (n: number) => `${Math.floor(n / 60)}h ${(n % 60).toString().padStart(2, '0')}min`;
  return `Brutto ${h(grossMinutes)} · Pause ${breakMinutes}min · Netto ${h(netMinutes)}`;
}

export function BookingPage() {
  const user = useCurrentUser();
  const employeeId = user.id;
  const qc = useQueryClient();
  const online = useOnline();
  const [useGps, setUseGps] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const entriesKey = ['time-entries', employeeId];
  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: () => api.timeEntries(employeeId),
  });
  const open = entriesQuery.data?.find((e) => !e.clockOut) ?? null;

  const clockInMutation = useMutation<TimeEntryDto, Error, void, { previous?: TimeEntryDto[] }>({
    mutationFn: async () => {
      const gps = useGps ? await captureGps() : null;
      const payload: ClockInPayload = {
        employeeId,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
        accuracyMeters: gps?.accuracy ?? null,
      };
      return api.clockIn(payload);
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: entriesKey });
      const previous = qc.getQueryData<TimeEntryDto[]>(entriesKey);
      const optimistic: TimeEntryDto = {
        id: `optimistic-${Date.now()}`,
        employeeId,
        clockIn: new Date().toISOString(),
        clockOut: null,
        source: 'web',
        status: 'Open',
        requiresApproval: false,
        latitude: null,
        longitude: null,
        accuracyMeters: null,
        summary: null,
      };
      qc.setQueryData<TimeEntryDto[]>(entriesKey, (old) => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (e, _v, context) => {
      if (context?.previous) qc.setQueryData(entriesKey, context.previous);
      setError(e instanceof Error ? e.message : 'Buchung fehlgeschlagen');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: entriesKey }),
  });

  const clockOutMutation = useMutation<TimeEntryDto, Error, void, { previous?: TimeEntryDto[] }>({
    mutationFn: () => api.clockOut(employeeId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: entriesKey });
      const previous = qc.getQueryData<TimeEntryDto[]>(entriesKey);
      const now = new Date().toISOString();
      qc.setQueryData<TimeEntryDto[]>(entriesKey, (old) =>
        (old ?? []).map((e) => (!e.clockOut ? { ...e, clockOut: now } : e)),
      );
      return { previous };
    },
    onError: (e, _v, context) => {
      if (context?.previous) qc.setQueryData(entriesKey, context.previous);
      setError(e instanceof Error ? e.message : 'Ausstempeln fehlgeschlagen');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: entriesKey }),
  });

  const now = new Date();
  const offHours = now.getHours() < 7 || now.getHours() >= 23;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Buchung</h1>
        <p className="text-sm text-muted-foreground">Kommen / Gehen mit optionalem GPS.</p>
      </div>

      {!online && (
        <Alert variant="destructive">
          <AlertTitle>Offline</AlertTitle>
          <AlertDescription>
            Keine Verbindung zum Server. Buchungen sind aktuell deaktiviert — sobald wieder online,
            ist die Schaltfläche freigegeben.
          </AlertDescription>
        </Alert>
      )}

      {offHours && (
        <Alert>
          <AlertTitle>Außerhalb der Regelzeit</AlertTitle>
          <AlertDescription>
            Buchungen vor 07:00 oder nach 23:00 sind genehmigungspflichtig.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{open ? 'Eingestempelt' : 'Nicht eingestempelt'}</CardTitle>
          <CardDescription>
            {open
              ? `Seit ${fmtDateTime(open.clockIn)}`
              : 'Drücke „Kommen", um eine neue Session zu starten.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              id="use-gps"
              type="checkbox"
              className="h-4 w-4"
              checked={useGps}
              onChange={(e) => setUseGps(e.target.checked)}
            />
            <Label htmlFor="use-gps" className="text-sm">
              Standort beim Stempeln mitsenden (optional)
            </Label>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              disabled={!!open || clockInMutation.isPending || !online}
              onClick={() => {
                setError(null);
                clockInMutation.mutate();
              }}
            >
              {clockInMutation.isPending ? 'Buche…' : 'Kommen'}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={!open || clockOutMutation.isPending || !online}
              onClick={() => {
                setError(null);
                clockOutMutation.mutate();
              }}
            >
              {clockOutMutation.isPending ? 'Buche…' : 'Gehen'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letzte Buchungen</CardTitle>
        </CardHeader>
        <CardContent>
          {entriesQuery.data && entriesQuery.data.length > 0 ? (
            <ul className="divide-y text-sm">
              {entriesQuery.data.slice(0, 20).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {fmtDateTime(e.clockIn)}
                      {e.clockOut ? ` – ${fmtDateTime(e.clockOut)}` : ' – offen'}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtSummary(e)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.requiresApproval && <Badge variant="destructive">Genehmigung</Badge>}
                    <Badge variant={e.status === 'Approved' ? 'default' : 'secondary'}>
                      {e.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Noch keine Buchungen.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
