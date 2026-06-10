import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type BookableProjectDto, type ClockInPayload, type TimeEntryDto } from '../api/client';
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

/** ISO timestamp → value for <input type="datetime-local"> in local time. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BookingPage() {
  const user = useCurrentUser();
  const employeeId = user.id;
  const qc = useQueryClient();
  const online = useOnline();
  const [useGps, setUseGps] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectDialogEntry, setProjectDialogEntry] = useState<TimeEntryDto | null>(null);
  const [splitDialogEntry, setSplitDialogEntry] = useState<TimeEntryDto | null>(null);

  const entriesKey = ['time-entries', employeeId];
  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: () => api.timeEntries(employeeId),
  });
  const bookableQuery = useQuery({
    queryKey: ['bookable-projects', employeeId],
    queryFn: () => api.bookableProjects(employeeId),
  });
  const bookable = useMemo(() => bookableQuery.data ?? [], [bookableQuery.data]);
  const open = entriesQuery.data?.find((e) => !e.clockOut) ?? null;

  const clockInMutation = useMutation<TimeEntryDto, Error, void, { previous?: TimeEntryDto[] }>({
    mutationFn: async () => {
      const gps = useGps ? await captureGps() : null;
      const payload: ClockInPayload = {
        employeeId,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
        accuracyMeters: gps?.accuracy ?? null,
        projectId: selectedProjectId || null,
      };
      return api.clockIn(payload);
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: entriesKey });
      const previous = qc.getQueryData<TimeEntryDto[]>(entriesKey);
      const project = bookable.find((p) => p.id === selectedProjectId) ?? null;
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
        projectId: project?.id ?? null,
        projectCode: project?.code ?? null,
        projectName: project?.name ?? null,
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
        <p className="text-sm text-muted-foreground">
          Kommen / Gehen mit optionalem GPS und optionaler Projektbuchung.
        </p>
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
              ? `Seit ${fmtDateTime(open.clockIn)}${open.projectCode ? ` · Projekt ${open.projectCode}` : ''}`
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
          {bookable.length > 0 && (
            <div className="max-w-md space-y-1">
              <Label htmlFor="clock-in-project" className="text-sm">
                Projekt (optional)
              </Label>
              <select
                id="clock-in-project"
                value={selectedProjectId}
                disabled={!!open}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— ohne Projekt —</option>
                {bookable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {fmtDateTime(e.clockIn)}
                      {e.clockOut ? ` – ${fmtDateTime(e.clockOut)}` : ' – offen'}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtSummary(e)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.projectCode && (
                      <Badge variant="outline" title={e.projectName ?? undefined}>
                        {e.projectCode}
                      </Badge>
                    )}
                    {e.requiresApproval && <Badge variant="destructive">Genehmigung</Badge>}
                    <Badge variant={e.status === 'Approved' ? 'default' : 'secondary'}>
                      {e.status}
                    </Badge>
                    {e.status !== 'Approved' && !e.id.startsWith('optimistic-') && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setProjectDialogEntry(e)}
                        >
                          Projekt
                        </Button>
                        {e.clockOut && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSplitDialogEntry(e)}
                          >
                            Aufteilen
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Noch keine Buchungen.</p>
          )}
        </CardContent>
      </Card>

      {projectDialogEntry && (
        <EntryProjectDialog
          entry={projectDialogEntry}
          projects={bookable}
          onClose={() => setProjectDialogEntry(null)}
          onSaved={() => {
            setProjectDialogEntry(null);
            qc.invalidateQueries({ queryKey: entriesKey });
          }}
        />
      )}
      {splitDialogEntry && (
        <SplitEntryDialog
          entry={splitDialogEntry}
          projects={bookable}
          onClose={() => setSplitDialogEntry(null)}
          onSaved={() => {
            setSplitDialogEntry(null);
            qc.invalidateQueries({ queryKey: entriesKey });
          }}
        />
      )}
    </div>
  );
}

interface EntryDialogProps {
  entry: TimeEntryDto;
  projects: BookableProjectDto[];
  onClose: () => void;
  onSaved: () => void;
}

function EntryProjectDialog({ entry, projects, onClose, onSaved }: EntryDialogProps) {
  const [projectId, setProjectId] = useState(entry.projectId ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.updateTimeEntryProject(entry.id, projectId || null),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Projekt zuordnen</DialogTitle>
          <DialogDescription>
            Buchung {fmtDateTime(entry.clockIn)}
            {entry.clockOut ? ` – ${fmtDateTime(entry.clockOut)}` : ' (offen)'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="entry-project">Projekt</Label>
          <select
            id="entry-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— ohne Projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            {save.isPending ? 'Speichere…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitEntryDialog({ entry, projects, onClose, onSaved }: EntryDialogProps) {
  // clockOut is guaranteed: the split action is only offered on closed entries.
  const clockOut = entry.clockOut as string;
  const midpoint = new Date(
    (new Date(entry.clockIn).getTime() + new Date(clockOut).getTime()) / 2,
  ).toISOString();
  const [at, setAt] = useState(toLocalInputValue(midpoint));
  // '' = inherit from first segment, 'none' = explicitly without project.
  const [secondProject, setSecondProject] = useState('');
  const [error, setError] = useState<string | null>(null);

  const atDate = new Date(at);
  const valid =
    !Number.isNaN(atDate.getTime()) &&
    atDate.getTime() > new Date(entry.clockIn).getTime() &&
    atDate.getTime() < new Date(clockOut).getTime();

  const save = useMutation({
    mutationFn: () =>
      api.splitTimeEntry(
        entry.id,
        atDate.toISOString(),
        secondProject === '' ? undefined : secondProject === 'none' ? null : secondProject,
      ),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : 'Aufteilen fehlgeschlagen'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buchung aufteilen</DialogTitle>
          <DialogDescription>
            {fmtDateTime(entry.clockIn)} – {fmtDateTime(clockOut)} wird am gewählten Zeitpunkt in
            zwei Buchungen geteilt, z. B. für einen Projektwechsel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="split-at">Zeitpunkt</Label>
            <Input
              id="split-at"
              type="datetime-local"
              value={at}
              min={toLocalInputValue(entry.clockIn)}
              max={toLocalInputValue(clockOut)}
              onChange={(e) => setAt(e.target.value)}
            />
            {!valid && (
              <p className="text-xs text-destructive">
                Der Zeitpunkt muss strikt zwischen Kommen und Gehen liegen.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="split-project">Projekt für den zweiten Teil</Label>
            <select
              id="split-project"
              value={secondProject}
              onChange={(e) => setSecondProject(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">
                {entry.projectCode
                  ? `— wie erster Teil (${entry.projectCode}) —`
                  : '— wie erster Teil (ohne Projekt) —'}
              </option>
              <option value="none">— ohne Projekt —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            {save.isPending ? 'Teile…' : 'Aufteilen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
