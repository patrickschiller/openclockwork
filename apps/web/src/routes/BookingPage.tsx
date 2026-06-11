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

function entryBadge(e: TimeEntryDto): string | null {
  if (!e.projectCode) return null;
  return e.serviceOrderNo ? `${e.projectCode} · ${e.serviceOrderNo}` : e.projectCode;
}

/**
 * Shared project / service-order / activity selection. The service-order
 * select only appears when the chosen project has active orders — in that
 * case picking one is mandatory (mirrors the API rule).
 */
interface BookingTargetState {
  projectId: string;
  serviceOrderId: string;
  activity: string;
}

const EMPTY_TARGET: BookingTargetState = { projectId: '', serviceOrderId: '', activity: '' };

function targetNeedsOrder(projects: BookableProjectDto[], target: BookingTargetState): boolean {
  const project = projects.find((p) => p.id === target.projectId);
  return !!project && project.serviceOrders.length > 0;
}

function targetIsValid(projects: BookableProjectDto[], target: BookingTargetState): boolean {
  return !targetNeedsOrder(projects, target) || target.serviceOrderId !== '';
}

function BookingTargetFields({
  idPrefix,
  projects,
  target,
  onChange,
  noProjectLabel = '— ohne Projekt —',
}: {
  idPrefix: string;
  projects: BookableProjectDto[];
  target: BookingTargetState;
  onChange: (next: BookingTargetState) => void;
  noProjectLabel?: string;
}) {
  const project = projects.find((p) => p.id === target.projectId);
  const needsOrder = !!project && project.serviceOrders.length > 0;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-project`}>Projekt</Label>
        <select
          id={`${idPrefix}-project`}
          value={target.projectId}
          onChange={(e) =>
            onChange({ projectId: e.target.value, serviceOrderId: '', activity: target.activity })
          }
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">{noProjectLabel}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </div>
      {needsOrder && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-order`}>Service-Auftrag (Pflicht)</Label>
          <select
            id={`${idPrefix}-order`}
            value={target.serviceOrderId}
            onChange={(e) => onChange({ ...target, serviceOrderId: e.target.value })}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— Auftrag wählen —</option>
            {project?.serviceOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNo} · {o.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {target.projectId !== '' && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-activity`}>Tätigkeit (für die Kundenauswertung)</Label>
          <Input
            id={`${idPrefix}-activity`}
            value={target.activity}
            maxLength={500}
            placeholder="z. B. Konzept für Startseite erstellt"
            onChange={(e) => onChange({ ...target, activity: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function BookingPage() {
  const user = useCurrentUser();
  const employeeId = user.id;
  const qc = useQueryClient();
  const online = useOnline();
  const [useGps, setUseGps] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clockInTarget, setClockInTarget] = useState<BookingTargetState>(EMPTY_TARGET);
  const [editDialogEntry, setEditDialogEntry] = useState<TimeEntryDto | null>(null);
  const [splitDialogEntry, setSplitDialogEntry] = useState<TimeEntryDto | null>(null);
  const [bookRangeOpen, setBookRangeOpen] = useState(false);

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
  const clockInTargetValid = targetIsValid(bookable, clockInTarget);

  const clockInMutation = useMutation<TimeEntryDto, Error, void, { previous?: TimeEntryDto[] }>({
    mutationFn: async () => {
      const gps = useGps ? await captureGps() : null;
      const project = bookable.find((p) => p.id === clockInTarget.projectId) ?? null;
      const payload: ClockInPayload = {
        employeeId,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
        accuracyMeters: gps?.accuracy ?? null,
        projectId: project?.id ?? null,
        serviceOrderId: clockInTarget.serviceOrderId || null,
        activity: project ? clockInTarget.activity.trim() || null : null,
      };
      return api.clockIn(payload);
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: entriesKey });
      const previous = qc.getQueryData<TimeEntryDto[]>(entriesKey);
      const project = bookable.find((p) => p.id === clockInTarget.projectId) ?? null;
      const order =
        project?.serviceOrders.find((o) => o.id === clockInTarget.serviceOrderId) ?? null;
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
        serviceOrderId: order?.id ?? null,
        serviceOrderNo: order?.orderNo ?? null,
        serviceOrderTitle: order?.title ?? null,
        activity: project ? clockInTarget.activity.trim() || null : null,
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
              ? `Seit ${fmtDateTime(open.clockIn)}${entryBadge(open) ? ` · ${entryBadge(open)}` : ''}`
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
          {bookable.length > 0 && !open && (
            <div className="max-w-md">
              <BookingTargetFields
                idPrefix="clock-in"
                projects={bookable}
                target={clockInTarget}
                onChange={setClockInTarget}
              />
              {!clockInTargetValid && (
                <p className="mt-1 text-xs text-destructive">
                  Dieses Projekt erfordert die Auswahl eines Service-Auftrags.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              disabled={!!open || clockInMutation.isPending || !online || !clockInTargetValid}
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Letzte Buchungen</CardTitle>
          {bookable.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setBookRangeOpen(true)}>
              Nachtragen
            </Button>
          )}
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
                    {e.activity && (
                      <p className="text-xs italic text-muted-foreground">{e.activity}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {entryBadge(e) && (
                      <Badge variant="outline" title={e.serviceOrderTitle ?? e.projectName ?? undefined}>
                        {entryBadge(e)}
                      </Badge>
                    )}
                    {e.requiresApproval && <Badge variant="destructive">Genehmigung</Badge>}
                    <Badge variant={e.status === 'Approved' ? 'default' : 'secondary'}>
                      {e.status}
                    </Badge>
                    {!e.id.startsWith('optimistic-') && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditDialogEntry(e)}>
                          Projekt
                        </Button>
                        {e.clockOut && (
                          <Button size="sm" variant="ghost" onClick={() => setSplitDialogEntry(e)}>
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

      {editDialogEntry && (
        <EntryEditDialog
          entry={editDialogEntry}
          projects={bookable}
          onClose={() => setEditDialogEntry(null)}
          onSaved={() => {
            setEditDialogEntry(null);
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
      {bookRangeOpen && (
        <BookProjectDialog
          employeeId={employeeId}
          projects={bookable}
          onClose={() => setBookRangeOpen(false)}
          onSaved={() => {
            setBookRangeOpen(false);
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

function EntryEditDialog({ entry, projects, onClose, onSaved }: EntryDialogProps) {
  const [target, setTarget] = useState<BookingTargetState>({
    projectId: entry.projectId ?? '',
    serviceOrderId: entry.serviceOrderId ?? '',
    activity: entry.activity ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.updateTimeEntry(entry.id, {
        projectId: target.projectId || null,
        serviceOrderId: target.serviceOrderId || null,
        activity: target.activity.trim() || null,
      }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buchung bearbeiten</DialogTitle>
          <DialogDescription>
            {fmtDateTime(entry.clockIn)}
            {entry.clockOut ? ` – ${fmtDateTime(entry.clockOut)}` : ' (offen)'}
          </DialogDescription>
        </DialogHeader>
        <BookingTargetFields
          idPrefix="entry-edit"
          projects={projects}
          target={target}
          onChange={setTarget}
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={save.isPending || !targetIsValid(projects, target)}
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
  const [mode, setMode] = useState('');
  const [target, setTarget] = useState<BookingTargetState>(EMPTY_TARGET);
  const [error, setError] = useState<string | null>(null);

  const atDate = new Date(at);
  const atValid =
    !Number.isNaN(atDate.getTime()) &&
    atDate.getTime() > new Date(entry.clockIn).getTime() &&
    atDate.getTime() < new Date(clockOut).getTime();
  const targetValid =
    mode !== 'project' || (target.projectId !== '' && targetIsValid(projects, target));

  const save = useMutation({
    mutationFn: () => {
      const base = { at: atDate.toISOString() };
      if (mode === '') return api.splitTimeEntry(entry.id, base);
      if (mode === 'none') return api.splitTimeEntry(entry.id, { ...base, projectId: null });
      return api.splitTimeEntry(entry.id, {
        ...base,
        projectId: target.projectId,
        serviceOrderId: target.serviceOrderId || null,
        activity: target.activity.trim() || null,
      });
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : 'Aufteilen fehlgeschlagen'),
  });

  const inheritLabel = entryBadge(entry)
    ? `— wie erster Teil (${entryBadge(entry)}) —`
    : '— wie erster Teil (ohne Projekt) —';

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
            {!atValid && (
              <p className="text-xs text-destructive">
                Der Zeitpunkt muss strikt zwischen Kommen und Gehen liegen.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="split-mode">Projekt für den zweiten Teil</Label>
            <select
              id="split-mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setTarget(EMPTY_TARGET);
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{inheritLabel}</option>
              <option value="none">— ohne Projekt —</option>
              <option value="project">Anderes Projekt wählen…</option>
            </select>
          </div>
          {mode === 'project' && (
            <BookingTargetFields
              idPrefix="split"
              projects={projects}
              target={target}
              onChange={setTarget}
              noProjectLabel="— Projekt wählen —"
            />
          )}
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
            disabled={!atValid || !targetValid || save.isPending}
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

function BookProjectDialog({
  employeeId,
  projects,
  onClose,
  onSaved,
}: {
  employeeId: string;
  projects: BookableProjectDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0);
  const defaultTo = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0);
  const [from, setFrom] = useState(toLocalInputValue(defaultFrom.toISOString()));
  const [to, setTo] = useState(toLocalInputValue(defaultTo.toISOString()));
  const [target, setTarget] = useState<BookingTargetState>(EMPTY_TARGET);
  const [error, setError] = useState<string | null>(null);

  const fromDate = new Date(from);
  const toDate = new Date(to);
  const rangeValid =
    !Number.isNaN(fromDate.getTime()) &&
    !Number.isNaN(toDate.getTime()) &&
    fromDate.getTime() < toDate.getTime();
  const targetValid = target.projectId !== '' && targetIsValid(projects, target);

  const save = useMutation({
    mutationFn: () =>
      api.bookProjectRange({
        employeeId,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        projectId: target.projectId,
        serviceOrderId: target.serviceOrderId || null,
        activity: target.activity.trim() || null,
      }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : 'Nachtrag fehlgeschlagen'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Projektzeit nachtragen</DialogTitle>
          <DialogDescription>
            Bucht ein Zeitintervall nachträglich auf ein Projekt. Voraussetzung: Du warst im
            gesamten Intervall eingestempelt — die bestehenden Buchungen werden entsprechend
            aufgeteilt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="range-from">Von</Label>
              <Input
                id="range-from"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to">Bis</Label>
              <Input
                id="range-to"
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          {!rangeValid && (
            <p className="text-xs text-destructive">„Von" muss vor „Bis" liegen.</p>
          )}
          <BookingTargetFields
            idPrefix="range"
            projects={projects}
            target={target}
            onChange={setTarget}
            noProjectLabel="— Projekt wählen —"
          />
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
            disabled={!rangeValid || !targetValid || save.isPending}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            {save.isPending ? 'Buche…' : 'Nachtragen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
