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
import {
  api,
  type CoreTimeWindowDto,
  type BreakRuleDto,
  type WorkScheduleDto,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';

function weekdayLabels(languageTag: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(languageTag, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
}
const TIME_MODELS = [
  'Vollzeit',
  'Teilzeit',
  'Gleitzeit',
  'Vertrauensarbeitszeit',
] as const;

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
  workingDays: number;
  breakRules: BreakRuleDto[];
  cores: CoreDraft[];
}

const EMPTY_DRAFT: FormDraft = {
  name: '',
  description: '',
  frameStart: '00:00',
  frameEnd: '23:59',
  isDefault: false,
  workingDays: 31, // Mo–Fr
  breakRules: [],
  cores: [],
};

function fromSchedule(s: WorkScheduleDto): FormDraft {
  return {
    name: s.name,
    description: s.description ?? '',
    frameStart: s.frameStart,
    frameEnd: s.frameEnd,
    isDefault: s.isDefault,
    workingDays: s.workingDays,
    breakRules: s.breakRules ?? [],
    cores: s.coreTimes.map((c) => ({
      label: c.label ?? '',
      start: c.start,
      end: c.end,
      weekdays: c.weekdays,
    })),
  };
}

function weekdayLabel(mask: number, labels: string[]): string {
  if (mask === 0) return '—';
  if (mask === 31) return `${labels[0]}–${labels[4]}`;
  if (mask === 127) return `${labels[0]}–${labels[6]}`;
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) if (mask & (1 << i)) out.push(labels[i]);
  return out.join(', ');
}

function describeCores(
  cores: CoreTimeWindowDto[],
  labels: string[],
  emptyLabel: string,
): string {
  if (cores.length === 0) return emptyLabel;
  return cores
    .map(
      (c) =>
        `${c.label ? c.label + ' ' : ''}${c.start}–${c.end} (${weekdayLabel(c.weekdays, labels)})`,
    )
    .join(' · ');
}

export function AdminSchedulesPage() {
  const user = useCurrentUser();
  const { t } = useI18n();
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

  const [editing, setEditing] = useState<{
    id: string | null;
    draft: FormDraft;
  } | null>(null);

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
            {t('schedules.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('schedules.description')}
          </p>
        </div>
        <Button onClick={() => setEditing({ id: null, draft: EMPTY_DRAFT })}>
          <Plus className="mr-2 h-4 w-4" /> {t('schedules.new')}
        </Button>
      </div>

      <div className="grid gap-4">
        {schedules.data?.map((s) => (
          <ScheduleCard
            key={s.id}
            schedule={s}
            onEdit={() => setEditing({ id: s.id, draft: fromSchedule(s) })}
            onDeleted={() =>
              qc.invalidateQueries({ queryKey: ['work-schedules'] })
            }
            employees={employees.data ?? []}
          />
        ))}
        {schedules.data && schedules.data.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t('schedules.none')}
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
  employees: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  }[];
}

function ScheduleCard({
  schedule,
  onEdit,
  onDeleted,
  employees,
}: ScheduleCardProps) {
  const qc = useQueryClient();
  const { t, enumLabel, languageTag } = useI18n();
  const labels = weekdayLabels(languageTag);
  const [bulkModel, setBulkModel] =
    useState<(typeof TIME_MODELS)[number]>('Vollzeit');
  const [override, setOverride] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => api.deleteWorkSchedule(schedule.id),
    onSuccess: onDeleted,
  });
  const bulkAssign = useMutation({
    mutationFn: () => api.bulkAssignSchedule(schedule.id, bulkModel, override),
    onSuccess: (r) => {
      setBulkResult(t('schedules.assignedResult', r));
      qc.invalidateQueries({ queryKey: ['work-schedules'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {schedule.name}
          {schedule.isDefault && <Badge variant="secondary">Default</Badge>}
          <Badge variant="outline">
            {t('schedules.employees', { count: schedule.employeeCount })}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {schedule.description && (
          <p className="text-muted-foreground">{schedule.description}</p>
        )}
        <p>
          <span className="font-medium">{t('schedules.frame')}:</span>{' '}
          {schedule.frameStart}–{schedule.frameEnd}
        </p>
        <p>
          <span className="font-medium">{t('schedules.workingDays')}:</span>{' '}
          {weekdayLabel(schedule.workingDays, labels)}
        </p>
        <p>
          <span className="font-medium">{t('schedules.coreTimes')}:</span>{' '}
          {describeCores(schedule.coreTimes, labels, t('schedules.noCoreTime'))}
        </p>

        <p>
          <span className="font-medium">{t('schedules.breakRules')}:</span>{' '}
          {schedule.breakRules?.length
            ? schedule.breakRules
                .map((rule) =>
                  t('schedules.breakRuleSummary', {
                    after: rule.afterMinutes,
                    deduction: rule.breakMinutes,
                  }),
                )
                .join(' · ')
            : t('schedules.noBreakRules')}
        </p>

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('schedules.assign')}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor={`tm-${schedule.id}`} className="text-xs">
                {t('schedules.timeModel')}
              </Label>
              <select
                id={`tm-${schedule.id}`}
                value={bulkModel}
                onChange={(e) =>
                  setBulkModel(e.target.value as (typeof TIME_MODELS)[number])
                }
                className="mt-1 flex h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {TIME_MODELS.map((tm) => (
                  <option key={tm} value={tm}>
                    {enumLabel(tm)}
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
              {t('schedules.override')}
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkAssign.isPending}
              onClick={() => bulkAssign.mutate()}
            >
              {bulkAssign.isPending
                ? t('schedules.assigning')
                : t('schedules.bulkAssign')}
            </Button>
            {bulkResult && (
              <span className="text-xs text-muted-foreground">
                {bulkResult}
              </span>
            )}
          </div>
          <div className="mt-3">
            <Label className="text-xs">{t('schedules.assignEmployee')}</Label>
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
              <option value="">{t('common.select')}</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({enumLabel(emp.role)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            {t('common.edit')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={remove.isPending || schedule.employeeCount > 0}
            onClick={() => remove.mutate()}
            title={
              schedule.employeeCount > 0
                ? t('schedules.deleteHint')
                : t('common.delete')
            }
          >
            <Trash2 className="mr-1 h-4 w-4" /> {t('common.delete')}
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
  const { t, languageTag } = useI18n();
  const labels = weekdayLabels(languageTag);
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
        workingDays: draft.workingDays,
        breakRules: draft.breakRules,
        coreTimes: draft.cores.map((c) => ({
          label: c.label.trim() || null,
          start: c.start,
          end: c.end,
          weekdays: c.weekdays,
        })),
      };
      return state.id
        ? api.updateWorkSchedule(state.id, payload)
        : api.createWorkSchedule(payload);
    },
    onSuccess: onSaved,
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('common.saveFailed')),
  });

  const addCore = () =>
    setDraft((d) => ({
      ...d,
      cores: [
        ...d.cores,
        { label: '', start: '10:00', end: '11:00', weekdays: 31 },
      ],
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
    if (
      !draft.breakRules.every(
        (rule) =>
          Number.isInteger(rule.afterMinutes) &&
          rule.afterMinutes >= 0 &&
          rule.afterMinutes <= 1440 &&
          Number.isInteger(rule.breakMinutes) &&
          rule.breakMinutes >= 0 &&
          rule.breakMinutes <= rule.afterMinutes,
      )
    )
      return false;
    if (draft.breakRules.length > 50) return false;
    return draft.cores.every((c) => c.start < c.end && c.weekdays > 0);
  }, [draft]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {state.id ? t('schedules.edit') : t('schedules.new')}
          </DialogTitle>
          <DialogDescription>
            {t('schedules.editorDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('common.name')}</Label>
            <Input
              id="name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">{t('common.description')}</Label>
            <Input
              id="desc"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fs">{t('schedules.frameStart')}</Label>
              <Input
                id="fs"
                type="time"
                value={draft.frameStart}
                onChange={(e) =>
                  setDraft({ ...draft, frameStart: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fe">{t('schedules.frameEnd')}</Label>
              <Input
                id="fe"
                type="time"
                value={draft.frameEnd}
                onChange={(e) =>
                  setDraft({ ...draft, frameEnd: e.target.value })
                }
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) =>
                setDraft({ ...draft, isDefault: e.target.checked })
              }
            />
            {t('schedules.defaultHint')}
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('schedules.workingDays')}</p>
            <p className="text-xs text-muted-foreground">
              {t('schedules.workingDaysHint')}
            </p>
            <div className="flex flex-wrap gap-1 text-xs">
              {labels.map((label, i) => {
                const bit = 1 << i;
                const active = (draft.workingDays & bit) !== 0;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        workingDays: draft.workingDays ^ bit,
                      })
                    }
                    className={`rounded border px-3 py-1 ${
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
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t('schedules.breakRules')}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={draft.breakRules.length >= 50}
                onClick={() =>
                  setDraft({
                    ...draft,
                    breakRules: [
                      ...draft.breakRules,
                      { afterMinutes: 0, breakMinutes: 0 },
                    ],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> {t('schedules.addBreakRule')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('schedules.breakRulesHint')}
            </p>
            {draft.breakRules.map((rule, index) => (
              <div
                key={index}
                className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
              >
                <div className="space-y-1">
                  <Label htmlFor={`break-after-${index}`}>
                    {t('schedules.breakAfter')}
                  </Label>
                  <Input
                    id={`break-after-${index}`}
                    type="number"
                    min={0}
                    max={1440}
                    step={1}
                    value={rule.afterMinutes}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        breakRules: draft.breakRules.map((current, i) =>
                          i === index
                            ? {
                                ...current,
                                afterMinutes: Number(event.target.value),
                              }
                            : current,
                        ),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`break-minutes-${index}`}>
                    {t('schedules.breakMinutes')}
                  </Label>
                  <Input
                    id={`break-minutes-${index}`}
                    type="number"
                    min={0}
                    max={rule.afterMinutes}
                    step={1}
                    value={rule.breakMinutes}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        breakRules: draft.breakRules.map((current, i) =>
                          i === index
                            ? {
                                ...current,
                                breakMinutes: Number(event.target.value),
                              }
                            : current,
                        ),
                      })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.remove')}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      breakRules: draft.breakRules.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t('schedules.coreTimes')}</p>
              <Button size="sm" variant="outline" onClick={addCore}>
                <Plus className="mr-1 h-4 w-4" /> {t('schedules.addCoreTime')}
              </Button>
            </div>
            {draft.cores.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('schedules.noCoreTimes')}
              </p>
            ) : (
              <ul className="space-y-3">
                {draft.cores.map((c, idx) => (
                  <li key={idx} className="space-y-2 rounded-md border p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <div>
                        <Label className="text-xs">
                          {t('schedules.coreLabel')}
                        </Label>
                        <Input
                          value={c.label}
                          onChange={(e) =>
                            updateCore(idx, { label: e.target.value })
                          }
                          placeholder={t('schedules.corePlaceholder')}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">
                          {t('schedules.start')}
                        </Label>
                        <Input
                          type="time"
                          value={c.start}
                          onChange={(e) =>
                            updateCore(idx, { start: e.target.value })
                          }
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('schedules.end')}</Label>
                        <Input
                          type="time"
                          value={c.end}
                          onChange={(e) =>
                            updateCore(idx, { end: e.target.value })
                          }
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
                      {labels.map((label, i) => {
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
