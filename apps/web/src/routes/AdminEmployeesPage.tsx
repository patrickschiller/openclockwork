import { useId, useMemo, useState } from 'react';
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
  type HolidayCalendar,
  type CreateEmployeePayload,
  type EmployeeDto,
  type EmployeeRole,
  type TimeModel,
  type UpdateEmployeePayload,
  type WorkScheduleDto,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';

const ROLES: EmployeeRole[] = ['Employee', 'Manager', 'HRAdmin'];
const TIME_MODELS: TimeModel[] = [
  'Vollzeit',
  'Teilzeit',
  'Gleitzeit',
  'Vertrauensarbeitszeit',
];

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
  const { t, enumLabel, formatDate } = useI18n();
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
    mutationFn: ({
      id,
      scheduleId,
    }: {
      id: string;
      scheduleId: string | null;
    }) => api.updateEmployee(id, { workScheduleId: scheduleId }),
    onSuccess: refresh,
  });

  const managerOptions = useMemo(
    () =>
      (employees.data ?? []).filter(
        (e) => (e.role === 'Manager' || e.role === 'HRAdmin') && e.isActive,
      ),
    [employees.data],
  );

  if (!isAuthorized) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('common.hrOnly')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t('employees.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('employees.description')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            {t('employees.showInactive')}
          </label>
          <Button onClick={() => setEditor({ mode: 'create' })}>
            <Plus className="mr-2 h-4 w-4" /> {t('common.create')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('employees.count', { count: employees.data?.length ?? 0 })}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">{t('employees.personalNo')}</th>
                  <th className="px-4 py-2">{t('common.name')}</th>
                  <th className="px-4 py-2">{t('common.email')}</th>
                  <th className="px-4 py-2">{t('common.role')}</th>
                  <th className="px-4 py-2">{t('employees.timeModel')}</th>
                  <th className="px-4 py-2 text-right">
                    {t('employees.weeklyHours')}
                  </th>
                  <th className="px-4 py-2 text-right">
                    {t('employees.annualLeaveDays')}
                  </th>
                  <th className="px-4 py-2">{t('employees.startDate')}</th>
                  <th className="px-4 py-2 text-right">
                    {t('employees.overtimeBalanceShort')}
                  </th>
                  <th className="px-4 py-2">
                    {t('employees.holidayCalendar')}
                  </th>
                  <th className="px-4 py-2">{t('common.manager')}</th>
                  <th className="px-4 py-2">{t('employees.workSchedule')}</th>
                  <th className="px-4 py-2">{t('employees.dailyBlock')}</th>
                  <th className="px-4 py-2">{t('common.status')}</th>
                  <th className="px-4 py-2 text-right">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.data?.map((e) => {
                  const manager = (employees.data ?? []).find(
                    (m) => m.id === e.managerId,
                  );
                  return (
                    <tr key={e.id} className={e.isActive ? '' : 'opacity-50'}>
                      <td className="px-4 py-2 font-mono text-xs">
                        {e.personalNo}
                      </td>
                      <td className="px-4 py-2">
                        {e.lastName}, {e.firstName}
                      </td>
                      <td className="px-4 py-2 text-xs">{e.email}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            e.role === 'HRAdmin' ? 'default' : 'secondary'
                          }
                        >
                          {enumLabel(e.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {enumLabel(e.timeModel)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs">
                        {e.weeklyHours}
                      </td>
                      <td className="px-4 py-2 text-right text-xs">
                        {e.annualLeaveDays}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {formatDate(e.startDate)}
                      </td>
                      <td
                        className="px-4 py-2 text-right text-xs"
                        title={t('employees.overtimeBalanceHint', {
                          minutes: e.overtimeOpeningBalanceMinutes,
                        })}
                      >
                        {formatHm(e.overtimeOpeningBalanceMinutes)}
                      </td>
                      <td
                        className="px-4 py-2 font-mono text-xs"
                        title={t('employees.holidaySummary', {
                          calendar:
                            e.holidayCalendar === 'NONE'
                              ? t('employees.holidayCalendarNone')
                              : e.holidayCalendar,
                          count: e.holidayDates?.length ?? 0,
                        })}
                      >
                        {e.holidayCalendar === 'NONE' ? '—' : e.holidayCalendar}
                        {e.holidayDates?.length
                          ? ` +${e.holidayDates.length}`
                          : ''}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {manager
                          ? `${manager.firstName} ${manager.lastName}`
                          : '—'}
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
                          <option value="">{t('employees.noSchedule')}</option>
                          {schedules.data?.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        {e.allowDailyBlockBooking ? (
                          <Badge variant="outline">{t('common.active')}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {e.isActive ? (
                          <Badge variant="outline">{t('common.active')}</Badge>
                        ) : (
                          <Badge variant="destructive">
                            {t('common.inactive')}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title={t('common.edit')}
                            onClick={() =>
                              setEditor({ mode: 'edit', employee: e })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={t('employees.password')}
                            onClick={() => setPasswordFor(e)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          {e.isActive ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t('common.deactivate')}
                              disabled={deactivate.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    t('employees.deactivateConfirm', {
                                      name: `${e.firstName} ${e.lastName}`,
                                    }),
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
                              title={t('common.reactivate')}
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
                    <td
                      colSpan={15}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      {t('employees.none')}
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

function EmployeeEditor({
  state,
  managerOptions,
  schedules,
  onClose,
  onSaved,
}: EmployeeEditorProps) {
  const { t, enumLabel } = useI18n();
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
    annualLeaveDays: seed?.annualLeaveDays ?? 0,
    startDate: seed?.startDate ?? todayIsoDate(),
    overtimeOpeningBalanceMinutes: seed?.overtimeOpeningBalanceMinutes ?? 0,
    holidayCalendar: (seed?.holidayCalendar ?? 'NONE') as HolidayCalendar,
    holidayDatesText: (seed?.holidayDates ?? []).join(', '),
    managerId: seed?.managerId ?? '',
    workScheduleId: seed?.workScheduleId ?? '',
    allowDailyBlockBooking: seed?.allowDailyBlockBooking ?? false,
    isActive: seed?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const holidayDates = [
    ...new Set(draft.holidayDatesText.split(/[\s,;]+/).filter(Boolean)),
  ];
  const validHolidayDates = holidayDates.every((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    );
  });

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
          overtimeOpeningBalanceMinutes:
            Number(draft.overtimeOpeningBalanceMinutes) || 0,
          holidayCalendar: draft.holidayCalendar,
          holidayDates,
          managerId: draft.managerId || null,
          workScheduleId: draft.workScheduleId || null,
          allowDailyBlockBooking: draft.allowDailyBlockBooking,
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
        overtimeOpeningBalanceMinutes:
          Number(draft.overtimeOpeningBalanceMinutes) || 0,
        managerId: draft.managerId || null,
        workScheduleId: draft.workScheduleId || null,
        allowDailyBlockBooking: draft.allowDailyBlockBooking,
        isActive: draft.isActive,
        holidayCalendar: draft.holidayCalendar,
        holidayDates,
      };
      return api.updateEmployee(id, payload);
    },
    onSuccess: onSaved,
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('common.saveFailed')),
  });

  const valid =
    validHolidayDates &&
    draft.personalNo.trim().length > 0 &&
    draft.firstName.trim().length > 0 &&
    draft.lastName.trim().length > 0 &&
    /.+@.+\..+/.test(draft.email) &&
    Number(draft.weeklyHours) >= 0 &&
    Number(draft.annualLeaveDays) >= 0 &&
    (!isCreate || draft.password.length >= 8);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? t('employees.new') : t('employees.edit')}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? t('employees.masterDataCreate')
              : t('employees.masterDataEdit')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('employees.personalNo')}
            value={draft.personalNo}
            onChange={(v) => setDraft({ ...draft, personalNo: v })}
          />
          <Field
            label={t('common.email')}
            value={draft.email}
            onChange={(v) => setDraft({ ...draft, email: v })}
            type="email"
          />
          <Field
            label={t('employees.firstName')}
            value={draft.firstName}
            onChange={(v) => setDraft({ ...draft, firstName: v })}
          />
          <Field
            label={t('employees.lastName')}
            value={draft.lastName}
            onChange={(v) => setDraft({ ...draft, lastName: v })}
          />
          {isCreate && (
            <Field
              label={t('employees.initialPassword')}
              value={draft.password}
              onChange={(v) => setDraft({ ...draft, password: v })}
              type="password"
            />
          )}
          <Select
            label={t('common.role')}
            value={draft.role}
            onChange={(v) => setDraft({ ...draft, role: v as EmployeeRole })}
            options={ROLES.map((r) => ({ value: r, label: enumLabel(r) }))}
          />
          <Select
            label={t('employees.timeModel')}
            value={draft.timeModel}
            onChange={(v) => setDraft({ ...draft, timeModel: v as TimeModel })}
            options={TIME_MODELS.map((model) => ({
              value: model,
              label: enumLabel(model),
            }))}
          />
          <Field
            label={t('employees.weeklyHours')}
            value={String(draft.weeklyHours)}
            onChange={(v) => setDraft({ ...draft, weeklyHours: Number(v) })}
            type="number"
          />
          <Field
            label={t('employees.annualLeaveDays')}
            value={String(draft.annualLeaveDays)}
            onChange={(v) => setDraft({ ...draft, annualLeaveDays: Number(v) })}
            type="number"
          />
          <Field
            label={t('employees.startDate')}
            value={draft.startDate}
            onChange={(v) => setDraft({ ...draft, startDate: v })}
            type="date"
          />
          <Field
            label={t('employees.overtimeBalance')}
            value={String(draft.overtimeOpeningBalanceMinutes)}
            onChange={(v) =>
              setDraft({ ...draft, overtimeOpeningBalanceMinutes: Number(v) })
            }
            type="number"
          />
          <Select
            label={t('employees.holidayCalendar')}
            value={draft.holidayCalendar}
            onChange={(value) =>
              setDraft({ ...draft, holidayCalendar: value as HolidayCalendar })
            }
            options={[
              { value: 'NONE', label: t('employees.holidayCalendarNone') },
              ...(Object.keys(BUNDESLAND_LABEL) as Bundesland[]).map(
                (region) => ({
                  value: `DE-${region}`,
                  label: t('employees.holidayCalendarGermany', {
                    region: BUNDESLAND_LABEL[region],
                  }),
                }),
              ),
            ]}
          />
          <div className="col-span-2 space-y-2">
            <Label htmlFor="holiday-dates">{t('employees.holidayDates')}</Label>
            <textarea
              id="holiday-dates"
              rows={3}
              value={draft.holidayDatesText}
              onChange={(event) =>
                setDraft({ ...draft, holidayDatesText: event.target.value })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-describedby="holiday-dates-hint"
              aria-invalid={!validHolidayDates}
            />
            <p
              id="holiday-dates-hint"
              className="text-xs text-muted-foreground"
            >
              {t('employees.holidayDatesHint')}
            </p>
            {!validHolidayDates && (
              <p className="text-xs text-destructive">
                {t('employees.holidayDatesInvalid')}
              </p>
            )}
          </div>
          <Select
            label={t('common.manager')}
            value={draft.managerId}
            onChange={(v) => setDraft({ ...draft, managerId: v })}
            options={[
              { value: '', label: t('common.none') },
              ...managerOptions
                .filter((m) => m.id !== seed?.id)
                .map((m) => ({
                  value: m.id,
                  label: `${m.firstName} ${m.lastName} (${enumLabel(m.role)})`,
                })),
            ]}
          />
          <Select
            label={t('employees.workSchedule')}
            value={draft.workScheduleId}
            onChange={(v) => setDraft({ ...draft, workScheduleId: v })}
            options={[
              { value: '', label: t('common.default') },
              ...schedules.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <label className="col-span-2 mt-2 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={draft.allowDailyBlockBooking}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  allowDailyBlockBooking: e.target.checked,
                })
              }
            />
            <span>
              <span className="block font-medium">
                {t('employees.dailyBlockBooking')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('employees.dailyBlockBookingHint')}
              </span>
            </span>
          </label>
          {!isCreate && (
            <label className="col-span-2 mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) =>
                  setDraft({ ...draft, isActive: e.target.checked })
                }
              />
              {t('employees.activeHint')}
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
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
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
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
      />
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
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
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

function PasswordDialog({
  employee,
  onClose,
}: {
  employee: EmployeeDto;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = useMutation({
    mutationFn: () => api.setEmployeePassword(employee.id, password),
    onSuccess: () => setDone(true),
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('employees.passwordFailed')),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('employees.password')}</DialogTitle>
          <DialogDescription>
            {t('employees.passwordFor', {
              name: `${employee.firstName} ${employee.lastName}`,
              email: employee.email,
            })}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <Alert>
            <AlertDescription>
              {t('employees.passwordUpdated')}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="pw">{t('employees.newPassword')}</Label>
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
            {done ? t('common.close') : t('common.cancel')}
          </Button>
          {!done && (
            <Button
              disabled={password.length < 8 || set.isPending}
              onClick={() => {
                setError(null);
                set.mutate();
              }}
            >
              {set.isPending
                ? t('employees.passwordSetting')
                : t('employees.passwordSet')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
