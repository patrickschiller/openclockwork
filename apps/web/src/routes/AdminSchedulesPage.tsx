import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { api, type CoreTimeWindowDto, type WorkScheduleDto } from '../api/client';
import { useCurrentUser } from '../app/auth';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
const TIME_MODELS = ['Vollzeit', 'Teilzeit', 'Gleitzeit', 'Vertrauensarbeitszeit'] as const;

interface CoreDraft {
  label: string;
  start: string;
  end: string;
  weekdays: number;
}

interface FormDraft {
  name: string;
  description: string;
  frameStart: string;
  frameEnd: string;
  isDefault: boolean;
  cores: CoreDraft[];
}

const EMPTY_DRAFT: FormDraft = {
  name: '',
  description: '',
  frameStart: '07:00',
  frameEnd: '23:00',
  isDefault: false,
  cores: [],
};

function fromSchedule(s: WorkScheduleDto): FormDraft {
  return {
    name: s.name,
    description: s.description ?? '',
    frameStart: s.frameStart,
    frameEnd: s.frameEnd,
    isDefault: s.isDefault,
    cores: s.coreTimes.map((c) => ({
      label: c.label ?? '',
      start: c.start,
      end: c.end,
      weekdays: c.weekdays,
    })),
  };
}

function weekdayLabel(mask: number): string {
  if (mask === 0) return '—';
  if (mask === 31) return 'Mo–Fr';
  if (mask === 127) return 'Mo–So';
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) if (mask & (1 << i)) out.push(WEEKDAY_LABELS[i]);
  return out.join(', ');
}

function describeCores(cores: CoreTimeWindowDto[]): string {
  if (cores.length === 0) return 'keine Kernzeit';
  return cores
    .map((c) => `${c.label ? c.label + ' ' : ''}${c.start}–${c.end} (${weekdayLabel(c.weekdays)})`)
    .join(' · ');
}

export function AdminSchedulesPage() {
  const user = useCurrentUser();
  const isAuthorized = user.role === 'HRAdmin';

  const qc = useQueryClient();
  const schedules = useQuery({
    queryKey: ['work-schedules'],
    queryFn: () => api.workSchedules(),
    enabled: isAuthorized,
  });
  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees(),
    enabled: isAuthorized,
  });

  const [editing, setEditing] = useState<{ id: string | null; draft: FormDraft } | null>(null);

  if (!isAuthorized) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Diese Seite ist HR-Admins vorbehalten.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Arbeitszeitpläne</h1>
          <p className="text-sm text-muted-foreground">
            Rahmenarbeitszeit + Kernzeiten pro Plan, Zuweisung an Mitarbeiter:innen oder ganze
            Zeitmodelle.
          </p>
        </div>
        <Button onClick={() => setEditing({ id: null, draft: EMPTY_DRAFT })}>
          <Plus className="mr-2 h-4 w-4" /> Neuer Plan
        </Button>
      </div>

      <div className="grid gap-4">
        {schedules.data?.map((s) => (
          <ScheduleCard
            key={s.id}
            schedule={s}
            onEdit={() => setEditing({ id: s.id, draft: fromSchedule(s) })}
            onDeleted={() => qc.invalidateQueries({ queryKey: ['work-schedules'] })}
            employees={employees.data ?? []}
          />
        ))}
        {schedules.data && schedules.data.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Noch keine Arbeitszeitpläne angelegt.
            </CardContent>
          </Card>
        )}
      </div>

      {editing && (
        <ScheduleEditor
          state={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['work-schedules'] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface ScheduleCardProps {
  schedule: WorkScheduleDto;
  onEdit: () => void;
  onDeleted: () => void;
  employees: { id: string; firstName: string; lastName: string; role: string }[];
}

function ScheduleCard({ schedule, onEdit, onDeleted, employees }: ScheduleCardProps) {
  const qc = useQueryClient();
  const [bulkModel, setBulkModel] = useState<(typeof TIME_MODELS)[number]>('Vollzeit');
  const [override, setOverride] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => api.deleteWorkSchedule(schedule.id),
    onSuccess: onDeleted,
  });
  const bulkAssign = useMutation({
    mutationFn: () => api.bulkAssignSchedule(schedule.id, bulkModel, override),
    onSuccess: (r) => {
      setBulkResult(`${r.assigned} zugewiesen, ${r.skipped} übersprungen`);
      qc.invalidateQueries({ queryKey: ['work-schedules'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {schedule.name}
          {schedule.isDefault && <Badge variant="secondary">Default</Badge>}
          <Badge variant="outline">{schedule.employeeCount} Mitarbeiter:innen</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {schedule.description && <p className="text-muted-foreground">{schedule.description}</p>}
        <p>
          <span className="font-medium">Rahmen:</span> {schedule.frameStart}–{schedule.frameEnd}
        </p>
        <p>
          <span className="font-medium">Kernzeiten:</span> {describeCores(schedule.coreTimes)}
        </p>

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Zuweisen
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor={`tm-${schedule.id}`} className="text-xs">
                Zeitmodell
              </Label>
              <select
                id={`tm-${schedule.id}`}
                value={bulkModel}
                onChange={(e) => setBulkModel(e.target.value as (typeof TIME_MODELS)[number])}
                className="mt-1 flex h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {TIME_MODELS.map((tm) => (
                  <option key={tm} value={tm}>
                    {tm}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
              />
              Bestehende Zuweisungen überschreiben
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkAssign.isPending}
              onClick={() => bulkAssign.mutate()}
            >
              {bulkAssign.isPending ? 'Weise zu…' : 'Bulk zuweisen'}
            </Button>
            {bulkResult && <span className="text-xs text-muted-foreground">{bulkResult}</span>}
          </div>
          <div className="mt-3">
            <Label className="text-xs">Einzelnen Mitarbeiter zuweisen</Label>
            <select
              onChange={(e) => {
                if (!e.target.value) return;
                api.assignSchedule(schedule.id, e.target.value).then(() => {
                  qc.invalidateQueries({ queryKey: ['work-schedules'] });
                  e.target.value = '';
                });
              }}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              defaultValue=""
            >
              <option value="">— wählen —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Bearbeiten
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={remove.isPending || schedule.employeeCount > 0}
            onClick={() => remove.mutate()}
            title={
              schedule.employeeCount > 0
                ? 'Zuerst alle Mitarbeiter:innen einem anderen Plan zuweisen'
                : 'Plan löschen'
            }
          >
            <Trash2 className="mr-1 h-4 w-4" /> Löschen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface ScheduleEditorProps {
  state: { id: string | null; draft: FormDraft };
  onClose: () => void;
  onSaved: () => void;
}

function ScheduleEditor({ state, onClose, onSaved }: ScheduleEditorProps) {
  const [draft, setDraft] = useState<FormDraft>(state.draft);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(state.draft);
  }, [state.id, state.draft]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        frameStart: draft.frameStart,
        frameEnd: draft.frameEnd,
        isDefault: draft.isDefault,
        coreTimes: draft.cores.map((c) => ({
          label: c.label.trim() || null,
          start: c.start,
          end: c.end,
          weekdays: c.weekdays,
        })),
      };
      return state.id ? api.updateWorkSchedule(state.id, payload) : api.createWorkSchedule(payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'),
  });

  const addCore = () =>
    setDraft((d) => ({
      ...d,
      cores: [...d.cores, { label: '', start: '10:00', end: '11:00', weekdays: 31 }],
    }));

  const updateCore = (idx: number, patch: Partial<CoreDraft>) =>
    setDraft((d) => ({
      ...d,
      cores: d.cores.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));

  const removeCore = (idx: number) =>
    setDraft((d) => ({ ...d, cores: d.cores.filter((_, i) => i !== idx) }));

  const toggleWeekday = (idx: number, bit: number) =>
    setDraft((d) => ({
      ...d,
      cores: d.cores.map((c, i) =>
        i === idx ? { ...c, weekdays: c.weekdays ^ bit } : c,
      ),
    }));

  const valid = useMemo(() => {
    if (!draft.name.trim()) return false;
    if (draft.frameStart >= draft.frameEnd) return false;
    return draft.cores.every((c) => c.start < c.end && c.weekdays > 0);
  }, [draft]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{state.id ? 'Plan bearbeiten' : 'Neuer Plan'}</DialogTitle>
          <DialogDescription>Rahmen + beliebig viele Kernzeiten pro Wochentag</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Beschreibung</Label>
            <Input
              id="desc"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fs">Rahmen Start</Label>
              <Input
                id="fs"
                type="time"
                value={draft.frameStart}
                onChange={(e) => setDraft({ ...draft, frameStart: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fe">Rahmen Ende</Label>
              <Input
                id="fe"
                type="time"
                value={draft.frameEnd}
                onChange={(e) => setDraft({ ...draft, frameEnd: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
            />
            Als Default-Plan markieren (wird verwendet, wenn Mitarbeiter keinen eigenen Plan hat)
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Kernzeiten</p>
              <Button size="sm" variant="outline" onClick={addCore}>
                <Plus className="mr-1 h-4 w-4" /> Kernzeit hinzufügen
              </Button>
            </div>
            {draft.cores.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Keine Kernzeiten — passt für Vertrauensarbeitszeit.
              </p>
            ) : (
              <ul className="space-y-3">
                {draft.cores.map((c, idx) => (
                  <li key={idx} className="space-y-2 rounded-md border p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <div>
                        <Label className="text-xs">Bezeichnung</Label>
                        <Input
                          value={c.label}
                          onChange={(e) => updateCore(idx, { label: e.target.value })}
                          placeholder="z. B. Vormittag"
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Start</Label>
                        <Input
                          type="time"
                          value={c.start}
                          onChange={(e) => updateCore(idx, { start: e.target.value })}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Ende</Label>
                        <Input
                          type="time"
                          value={c.end}
                          onChange={(e) => updateCore(idx, { end: e.target.value })}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCore(idx)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 text-xs">
                      {WEEKDAY_LABELS.map((label, i) => {
                        const bit = 1 << i;
                        const active = (c.weekdays & bit) !== 0;
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleWeekday(idx, bit)}
                            className={`rounded border px-2 py-1 ${
                              active
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input bg-background'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
            {save.isPending ? 'Speichere…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
