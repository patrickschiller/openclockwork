import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type AbsenceKind, type EmployeeDto } from '../api/client';
import { useCurrentUser } from '../app/auth';

const KIND_OPTIONS: AbsenceKind[] = ['Sickness', 'Training', 'Flextime'];

const KIND_LABEL: Record<AbsenceKind, string> = {
  Sickness: 'Krankheit',
  Training: 'Schulung',
  Flextime: 'Gleittag',
};

const KIND_BADGE: Record<AbsenceKind, 'destructive' | 'secondary' | 'outline'> = {
  Sickness: 'destructive',
  Training: 'secondary',
  Flextime: 'outline',
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE');
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function AbsencesPage() {
  const user = useCurrentUser();
  const canManageOthers = user.role === 'Manager' || user.role === 'HRAdmin';
  const qc = useQueryClient();

  const [employeeFilter, setEmployeeFilter] = useState<string>(user.id);
  const [createOpen, setCreateOpen] = useState(false);

  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees(),
    enabled: canManageOthers,
  });

  const absences = useQuery({
    queryKey: ['absences', employeeFilter],
    queryFn: () => api.absences({ employeeId: employeeFilter || undefined }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAbsence(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['absences'] }),
  });

  const employeeName = (id: string) => {
    const e = (employees.data ?? []).find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Abwesenheiten</h1>
          <p className="text-sm text-muted-foreground">
            Krankheit, Schulungen, Gleittage — werden ohne Genehmigung als Tatsache eingetragen.
            Manager:innen und HR können Einträge für betreute Mitarbeiter:innen anlegen.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Eintragen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <NewAbsenceForm
              defaultEmployeeId={user.id}
              employees={employees.data ?? []}
              canPickOther={canManageOthers}
              onClose={() => {
                setCreateOpen(false);
                qc.invalidateQueries({ queryKey: ['absences'] });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {canManageOthers && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anzeigen</CardTitle>
            <CardDescription>
              Wähle eine Person — leer lassen heißt: alle Mitarbeiter:innen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— alle —</option>
              {employees.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.role})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{absences.data?.length ?? 0} Einträge</CardTitle>
        </CardHeader>
        <CardContent>
          {absences.data && absences.data.length > 0 ? (
            <ul className="divide-y text-sm">
              {absences.data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      <Badge variant={KIND_BADGE[a.kind]} className="mr-2">
                        {KIND_LABEL[a.kind]}
                      </Badge>
                      {fmtDate(a.from)} – {fmtDate(a.to)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {daysBetween(a.from, a.to)} Kalendertage
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {canManageOthers && a.employeeId !== user.id && (
                        <span>{employeeName(a.employeeId)} · </span>
                      )}
                      {a.note ?? <em>keine Notiz</em>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.kind === 'Sickness' && a.certified && (
                      <Badge variant="secondary">Attest vorgelegt</Badge>
                    )}
                    {a.kind === 'Sickness' && !a.certified && (
                      <Badge variant="outline">ohne Attest</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Löschen"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm('Eintrag wirklich löschen?')) {
                          remove.mutate(a.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Keine Einträge.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface NewAbsenceFormProps {
  defaultEmployeeId: string;
  employees: EmployeeDto[];
  canPickOther: boolean;
  onClose: () => void;
}

function NewAbsenceForm({ defaultEmployeeId, employees, canPickOther, onClose }: NewAbsenceFormProps) {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [kind, setKind] = useState<AbsenceKind>('Sickness');
  const [from, setFrom] = useState(isoToday);
  const [to, setTo] = useState(isoToday);
  const [certified, setCertified] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const valid = !!employeeId && from <= to;

  const create = useMutation({
    mutationFn: () =>
      api.createAbsence({
        employeeId,
        kind,
        from: new Date(from + 'T00:00:00.000Z').toISOString(),
        to: new Date(to + 'T00:00:00.000Z').toISOString(),
        certified: kind === 'Sickness' ? certified : false,
        note: note || null,
      }),
    onSuccess: onClose,
    onError: (e) => setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Abwesenheit eintragen</DialogTitle>
        <DialogDescription>Typ, Zeitraum, optionale Notiz</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {canPickOther && (
          <div className="space-y-2">
            <Label htmlFor="emp">Mitarbeiter:in</Label>
            <select
              id="emp"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.role})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="kind">Typ</Label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AbsenceKind)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="from">Von</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">Bis</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {kind === 'Sickness' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
            ärztliches Attest liegt vor
          </label>
        )}
        <div className="space-y-2">
          <Label htmlFor="note">Notiz (optional)</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {kind === 'Flextime' && (
          <Alert>
            <AlertDescription>
              Hinweis: Gleittage reduzieren das Überstundenkonto aktuell <strong>nicht</strong>{' '}
              automatisch — die rechnerische Verrechnung kommt in einer späteren Iteration. Der
              Kalender und die Liste zeigen den Eintrag korrekt.
            </AlertDescription>
          </Alert>
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
          disabled={!valid || create.isPending}
          onClick={() => {
            setError(null);
            create.mutate();
          }}
        >
          {create.isPending ? 'Speichere…' : 'Speichern'}
        </Button>
      </DialogFooter>
    </>
  );
}
