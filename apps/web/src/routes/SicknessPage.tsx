import { useMemo, useState } from 'react';
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
import { api, type EmployeeDto } from '../api/client';
import { useCurrentUser } from '../app/auth';

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

export function SicknessPage() {
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
          <h1 className="text-3xl font-semibold tracking-tight">Krankmeldungen</h1>
          <p className="text-sm text-muted-foreground">
            Krankheit ist kein Antrag — sie wird gemeldet und ist sofort gültig. Manager:innen
            und HR können Meldungen für betreute Mitarbeiter:innen eintragen.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Krank melden
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
                    {a.certified ? (
                      <Badge variant="secondary">Attest vorgelegt</Badge>
                    ) : (
                      <Badge variant="outline">ohne Attest</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Löschen"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm('Krankmeldung wirklich löschen?')) {
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
            <p className="text-sm text-muted-foreground">Keine Krankmeldungen.</p>
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
  const [from, setFrom] = useState(isoToday);
  const [to, setTo] = useState(isoToday);
  const [certified, setCertified] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const valid = useMemo(() => {
    return !!employeeId && from <= to;
  }, [employeeId, from, to]);

  const create = useMutation({
    mutationFn: () =>
      api.createAbsence({
        employeeId,
        from: new Date(from + 'T00:00:00.000Z').toISOString(),
        to: new Date(to + 'T00:00:00.000Z').toISOString(),
        certified,
        note: note || null,
      }),
    onSuccess: onClose,
    onError: (e) => setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Krank melden</DialogTitle>
        <DialogDescription>Zeitraum + optional Notiz / Attest</DialogDescription>
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
          ärztliches Attest liegt vor
        </label>
        <div className="space-y-2">
          <Label htmlFor="note">Notiz (optional)</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
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
