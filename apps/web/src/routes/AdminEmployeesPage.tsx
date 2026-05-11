import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound, UserMinus, UserPlus, Pencil } from 'lucide-react';
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
import {
  api,
  BUNDESLAND_LABEL,
  type Bundesland,
  type CreateEmployeePayload,
  type EmployeeDto,
  type EmployeeRole,
  type TimeModel,
  type UpdateEmployeePayload,
  type WorkScheduleDto,
} from '../api/client';
import { useCurrentUser } from '../app/auth';

const ROLES: EmployeeRole[] = ['Employee', 'Manager', 'HRAdmin'];
const TIME_MODELS: TimeModel[] = ['Vollzeit', 'Teilzeit', 'Gleitzeit', 'Vertrauensarbeitszeit'];

function formatHm(minutes: number): string {
  if (minutes === 0) return '0:00';
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface EditorState {
  mode: 'create' | 'edit';
  employee?: EmployeeDto;
}

export function AdminEmployeesPage() {
  const user = useCurrentUser();
  const isAuthorized = user.role === 'HRAdmin';

  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [passwordFor, setPasswordFor] = useState<EmployeeDto | null>(null);

  const employees = useQuery({
    queryKey: ['employees', { includeInactive }],
    queryFn: () => api.employees(includeInactive),
    enabled: isAuthorized,
  });
  const schedules = useQuery({
    queryKey: ['work-schedules'],
    queryFn: () => api.workSchedules(),
    enabled: isAuthorized,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['employees'] });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivateEmployee(id),
    onSuccess: refresh,
  });
  const reactivate = useMutation({
    mutationFn: (id: string) => api.reactivateEmployee(id),
    onSuccess: refresh,
  });
  const changeSchedule = useMutation({
    mutationFn: ({ id, scheduleId }: { id: string; scheduleId: string | null }) =>
      api.updateEmployee(id, { workScheduleId: scheduleId }),
    onSuccess: refresh,
  });

  const managerOptions = useMemo(
    () => (employees.data ?? []).filter((e) => (e.role === 'Manager' || e.role === 'HRAdmin') && e.isActive),
    [employees.data],
  );

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
          <h1 className="text-3xl font-semibold tracking-tight">Mitarbeiter</h1>
          <p className="text-sm text-muted-foreground">
            Stammdaten, Rollen, Manager-Zuordnung, Arbeitszeitplan, Aktivierung.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            inaktive einblenden
          </label>
          <Button onClick={() => setEditor({ mode: 'create' })}>
            <Plus className="mr-2 h-4 w-4" /> Neu anlegen
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{employees.data?.length ?? 0} Mitarbeiter:innen</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">PersNr</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">E-Mail</th>
                  <th className="px-4 py-2">Rolle</th>
                  <th className="px-4 py-2">Modell</th>
                  <th className="px-4 py-2 text-right">Wo. h</th>
                  <th className="px-4 py-2 text-right">Urlaub</th>
                  <th className="px-4 py-2">Eintritt</th>
                  <th className="px-4 py-2 text-right">Übertrag</th>
                  <th className="px-4 py-2">Land</th>
                  <th className="px-4 py-2">Manager</th>
                  <th className="px-4 py-2">Arbeitszeitplan</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.data?.map((e) => {
                  const manager = (employees.data ?? []).find((m) => m.id === e.managerId);
                  return (
                    <tr key={e.id} className={e.isActive ? '' : 'opacity-50'}>
                      <td className="px-4 py-2 font-mono text-xs">{e.personalNo}</td>
                      <td className="px-4 py-2">
                        {e.lastName}, {e.firstName}
                      </td>
                      <td className="px-4 py-2 text-xs">{e.email}</td>
                      <td className="px-4 py-2">
                        <Badge variant={e.role === 'HRAdmin' ? 'default' : 'secondary'}>{e.role}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs">{e.timeModel}</td>
                      <td className="px-4 py-2 text-right text-xs">{e.weeklyHours}</td>
                      <td className="px-4 py-2 text-right text-xs">{e.annualLeaveDays}</td>
                      <td className="px-4 py-2 text-xs">
                        {new Date(e.startDate).toLocaleDateString('de-DE')}
                      </td>
                      <td
                        className="px-4 py-2 text-right text-xs"
                        title={`${e.overtimeOpeningBalanceMinutes} min Übertrag`}
                      >
                        {formatHm(e.overtimeOpeningBalanceMinutes)}
                      </td>
                      <td
                        className="px-4 py-2 font-mono text-xs"
                        title={BUNDESLAND_LABEL[e.bundesland]}
                      >
                        {e.bundesland}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {manager ? `${manager.firstName} ${manager.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={e.workScheduleId ?? ''}
                          onChange={(ev) =>
                            changeSchedule.mutate({
                              id: e.id,
                              scheduleId: ev.target.value || null,
                            })
                          }
                          className="h-7 rounded border border-input bg-background px-2 text-xs"
                        >
                          <option value="">— kein Plan —</option>
                          {schedules.data?.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        {e.isActive ? (
                          <Badge variant="outline">aktiv</Badge>
                        ) : (
                          <Badge variant="destructive">inaktiv</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Bearbeiten"
                            onClick={() => setEditor({ mode: 'edit', employee: e })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Passwort setzen"
                            onClick={() => setPasswordFor(e)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          {e.isActive ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Deaktivieren"
                              disabled={deactivate.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Mitarbeiter ${e.firstName} ${e.lastName} deaktivieren?`,
                                  )
                                ) {
                                  deactivate.mutate(e.id);
                                }
                              }}
                            >
                              <UserMinus className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Reaktivieren"
                              disabled={reactivate.isPending}
                              onClick={() => reactivate.mutate(e.id)}
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {employees.data && employees.data.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Keine Mitarbeiter:innen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editor && (
        <EmployeeEditor
          state={editor}
          managerOptions={managerOptions}
          schedules={schedules.data ?? []}
          onClose={() => setEditor(null)}
          onSaved={() => {
            refresh();
            setEditor(null);
          }}
        />
      )}

      {passwordFor && (
        <PasswordDialog
          employee={passwordFor}
          onClose={() => setPasswordFor(null)}
        />
      )}
    </div>
  );
}

interface EmployeeEditorProps {
  state: EditorState;
  managerOptions: EmployeeDto[];
  schedules: WorkScheduleDto[];
  onClose: () => void;
  onSaved: () => void;
}

function EmployeeEditor({ state, managerOptions, schedules, onClose, onSaved }: EmployeeEditorProps) {
  const isCreate = state.mode === 'create';
  const seed = state.employee;
  const [draft, setDraft] = useState({
    personalNo: seed?.personalNo ?? '',
    firstName: seed?.firstName ?? '',
    lastName: seed?.lastName ?? '',
    email: seed?.email ?? '',
    password: '',
    role: (seed?.role ?? 'Employee') as EmployeeRole,
    timeModel: (seed?.timeModel ?? 'Vollzeit') as TimeModel,
    weeklyHours: seed?.weeklyHours ?? 40,
    annualLeaveDays: seed?.annualLeaveDays ?? 30,
    startDate: seed?.startDate ?? todayIsoDate(),
    overtimeOpeningBalanceMinutes: seed?.overtimeOpeningBalanceMinutes ?? 0,
    bundesland: (seed?.bundesland ?? 'NW') as Bundesland,
    managerId: seed?.managerId ?? '',
    workScheduleId: seed?.workScheduleId ?? '',
    isActive: seed?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (isCreate) {
        const payload: CreateEmployeePayload = {
          personalNo: draft.personalNo.trim(),
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          password: draft.password,
          role: draft.role,
          timeModel: draft.timeModel,
          weeklyHours: Number(draft.weeklyHours),
          annualLeaveDays: Number(draft.annualLeaveDays),
          startDate: draft.startDate,
          overtimeOpeningBalanceMinutes: Number(draft.overtimeOpeningBalanceMinutes) || 0,
          bundesland: draft.bundesland,
          managerId: draft.managerId || null,
          workScheduleId: draft.workScheduleId || null,
        };
        return api.createEmployee(payload);
      }
      const id = seed?.id;
      if (!id) throw new Error('Missing employee id');
      const payload: UpdateEmployeePayload = {
        personalNo: draft.personalNo.trim(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email.trim(),
        role: draft.role,
        timeModel: draft.timeModel,
        weeklyHours: Number(draft.weeklyHours),
        annualLeaveDays: Number(draft.annualLeaveDays),
        startDate: draft.startDate,
        overtimeOpeningBalanceMinutes: Number(draft.overtimeOpeningBalanceMinutes) || 0,
        managerId: draft.managerId || null,
        workScheduleId: draft.workScheduleId || null,
        isActive: draft.isActive,
      };
      return api.updateEmployee(id, payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'),
  });

  const valid =
    draft.personalNo.trim().length > 0 &&
    draft.firstName.trim().length > 0 &&
    draft.lastName.trim().length > 0 &&
    /.+@.+\..+/.test(draft.email) &&
    Number(draft.weeklyHours) >= 0 &&
    Number(draft.annualLeaveDays) >= 0 &&
    (!isCreate || draft.password.length >= 8);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Neuer Mitarbeiter' : 'Mitarbeiter bearbeiten'}</DialogTitle>
          <DialogDescription>
            {isCreate ? 'Stammdaten + Initial-Passwort' : 'Stammdaten anpassen'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Personal-Nr" value={draft.personalNo} onChange={(v) => setDraft({ ...draft, personalNo: v })} />
          <Field label="E-Mail" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} type="email" />
          <Field label="Vorname" value={draft.firstName} onChange={(v) => setDraft({ ...draft, firstName: v })} />
          <Field label="Nachname" value={draft.lastName} onChange={(v) => setDraft({ ...draft, lastName: v })} />
          {isCreate && (
            <Field
              label="Initial-Passwort (≥ 8 Zeichen)"
              value={draft.password}
              onChange={(v) => setDraft({ ...draft, password: v })}
              type="password"
            />
          )}
          <Select
            label="Rolle"
            value={draft.role}
            onChange={(v) => setDraft({ ...draft, role: v as EmployeeRole })}
            options={ROLES.map((r) => ({ value: r, label: r }))}
          />
          <Select
            label="Zeitmodell"
            value={draft.timeModel}
            onChange={(v) => setDraft({ ...draft, timeModel: v as TimeModel })}
            options={TIME_MODELS.map((t) => ({ value: t, label: t }))}
          />
          <Field
            label="Wochenstunden"
            value={String(draft.weeklyHours)}
            onChange={(v) => setDraft({ ...draft, weeklyHours: Number(v) })}
            type="number"
          />
          <Field
            label="Jahresurlaub (Tage)"
            value={String(draft.annualLeaveDays)}
            onChange={(v) => setDraft({ ...draft, annualLeaveDays: Number(v) })}
            type="number"
          />
          <Field
            label="Eintrittsdatum"
            value={draft.startDate}
            onChange={(v) => setDraft({ ...draft, startDate: v })}
            type="date"
          />
          <Field
            label="Übertrag Überstunden (Minuten, ± erlaubt)"
            value={String(draft.overtimeOpeningBalanceMinutes)}
            onChange={(v) => setDraft({ ...draft, overtimeOpeningBalanceMinutes: Number(v) })}
            type="number"
          />
          <Select
            label="Bundesland (Feiertage)"
            value={draft.bundesland}
            onChange={(v) => setDraft({ ...draft, bundesland: v as Bundesland })}
            options={(Object.keys(BUNDESLAND_LABEL) as Bundesland[]).map((c) => ({
              value: c,
              label: `${c} — ${BUNDESLAND_LABEL[c]}`,
            }))}
          />
          <Select
            label="Manager"
            value={draft.managerId}
            onChange={(v) => setDraft({ ...draft, managerId: v })}
            options={[
              { value: '', label: '— keine —' },
              ...managerOptions
                .filter((m) => m.id !== seed?.id)
                .map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName} (${m.role})` })),
            ]}
          />
          <Select
            label="Arbeitszeitplan"
            value={draft.workScheduleId}
            onChange={(v) => setDraft({ ...draft, workScheduleId: v })}
            options={[
              { value: '', label: '— Default —' },
              ...schedules.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          {!isCreate && (
            <label className="col-span-2 mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              aktiv (deaktivierte Mitarbeiter:innen können sich nicht einloggen)
            </label>
          )}
        </div>
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

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PasswordDialog({ employee, onClose }: { employee: EmployeeDto; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = useMutation({
    mutationFn: () => api.setEmployeePassword(employee.id, password),
    onSuccess: () => setDone(true),
    onError: (e) => setError(e instanceof Error ? e.message : 'Setzen fehlgeschlagen'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Passwort setzen</DialogTitle>
          <DialogDescription>
            Für {employee.firstName} {employee.lastName} ({employee.email})
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <Alert>
            <AlertDescription>Passwort wurde aktualisiert.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="pw">Neues Passwort (≥ 8 Zeichen)</Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {done ? 'Schließen' : 'Abbrechen'}
          </Button>
          {!done && (
            <Button
              disabled={password.length < 8 || set.isPending}
              onClick={() => {
                setError(null);
                set.mutate();
              }}
            >
              {set.isPending ? 'Setze…' : 'Setzen'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
