import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  api,
  ApiError,
  BUNDESLAND_LABEL,
  type Bundesland,
  type ContractPeriodDto,
  type CreateContractPeriodPayload,
  type EmployeeDto,
  type HolidayCalendar,
  type TimeModel,
  type WorkScheduleDto,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';

const TIME_MODELS: TimeModel[] = [
  'Vollzeit',
  'Teilzeit',
  'Gleitzeit',
  'Vertrauensarbeitszeit',
];
const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function localToday(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function FactInput({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        min={type === 'number' ? 0 : undefined}
        max={type === 'number' ? 168 : undefined}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** HR-only, append/confirm workflow. No update/delete UI for confirmed facts. */
export function ContractPeriodsPanel({
  employee,
  schedules,
}: {
  employee: EmployeeDto;
  schedules: WorkScheduleDto[];
}) {
  const user = useCurrentUser();
  const { t, enumLabel, formatDate, formatDateTime, languageTag } = useI18n();
  const queryClient = useQueryClient();
  const panelId = useId();
  const isHr = user.role === 'HRAdmin';
  const [draft, setDraft] = useState(() => {
    const schedule = employee.workScheduleId
      ? schedules.find((item) => item.id === employee.workScheduleId)
      : schedules.find((item) => item.isDefault);
    return {
      effectiveFrom: localToday(),
      effectiveTo: '',
      employmentStart: employee.startDate,
      employmentEnd: '',
      weeklyHours: String(employee.weeklyHours),
      timeModel: employee.timeModel,
      workingDays: schedule?.workingDays ?? 31,
      scheduleLabel: schedule?.name ?? employee.workScheduleName ?? '',
      holidayCalendar: employee.holidayCalendar,
      holidayDatesText: employee.holidayDates.join(', '),
      confirmationNote: '',
    };
  });
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  // Capture the revision on explicit selection, not from a subsequently refreshed query.
  const [supersession, setSupersession] = useState<{
    id: string;
    revision: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  } | null>(null);
  const history = useQuery({
    queryKey: ['contract-periods', employee.id],
    queryFn: () => api.contractPeriods(employee.id),
    enabled: isHr,
  });
  const update = (value: Partial<typeof draft>) => {
    setDraft((previous) => ({ ...previous, ...value }));
    setConfirmed(false);
    setSaved(false);
  };
  const holidayDates = [
    ...new Set(draft.holidayDatesText.split(/[\s,;]+/).filter(Boolean)),
  ].sort();
  const datesValid =
    validDate(draft.effectiveFrom) &&
    validDate(draft.employmentStart) &&
    (!draft.effectiveTo ||
      (validDate(draft.effectiveTo) &&
        draft.effectiveTo >= draft.effectiveFrom)) &&
    (!draft.employmentEnd ||
      (validDate(draft.employmentEnd) &&
        draft.employmentEnd >= draft.employmentStart)) &&
    holidayDates.every(validDate);
  const weeklyHours = Number(draft.weeklyHours);
  const workingDayCount = Array.from({ length: 7 }, (_, index) =>
    Number(Boolean(draft.workingDays & (1 << index))),
  ).reduce((sum, count) => sum + count, 0);
  const noteValid =
    draft.confirmationNote.trim().length >= 5 &&
    draft.confirmationNote.trim().length <= 1000;
  const factsValid =
    datesValid &&
    draft.weeklyHours.trim() !== '' &&
    Number.isFinite(weeklyHours) &&
    weeklyHours >= 0 &&
    weeklyHours <= 168 &&
    Math.abs(Math.round(weeklyHours * 100) / 100 - weeklyHours) < 1e-10 &&
    weeklyHours <= workingDayCount * 24 &&
    holidayDates.length <= 3660 &&
    draft.scheduleLabel.trim().length <= 120 &&
    (!supersession ||
      (draft.effectiveFrom > supersession.effectiveFrom &&
        (!supersession.effectiveTo ||
          draft.effectiveFrom <= supersession.effectiveTo)));
  const save = useMutation({
    mutationFn: () => {
      const facts = {
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo || null,
        employmentStart: draft.employmentStart,
        employmentEnd: draft.employmentEnd || null,
        weeklyHours: Number(draft.weeklyHours),
        timeModel: draft.timeModel,
        workingDays: draft.workingDays,
        holidayCalendar: draft.holidayCalendar,
        holidayDates,
        scheduleLabel: draft.scheduleLabel.trim() || null,
        confirmationNote: draft.confirmationNote.trim(),
        confirmed: true as const,
      };
      const payload: CreateContractPeriodPayload = supersession
        ? {
            ...facts,
            supersedesPeriodId: supersession.id,
            expectedRevision: supersession.revision,
          }
        : facts;
      return api.createContractPeriod(employee.id, payload);
    },
    onSuccess: () => {
      setSaved(true);
      setConfirmed(false);
      setSupersession(null);
      setDraft((previous) => ({ ...previous, confirmationNote: '' }));
      void queryClient.invalidateQueries({
        queryKey: ['contract-periods', employee.id],
      });
      void queryClient.invalidateQueries({ queryKey: ['working-time-report'] });
    },
  });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(languageTag, {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
  const periodRange = (period: ContractPeriodDto) =>
    `${formatDate(period.effectiveFrom)} – ${period.effectiveTo ? formatDate(period.effectiveTo) : t('contracts.openEnded')}`;
  const fact = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );

  if (!isHr) return null;
  return (
    <section
      aria-labelledby={`${panelId}-title`}
      className="space-y-4 rounded-md border p-4"
    >
      <h2 id={`${panelId}-title`} className="font-semibold">
        {t('contracts.title')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('contracts.description')}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('contracts.snapshotHint')}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t('contracts.history')}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={history.isFetching || save.isPending}
          onClick={() => {
            setSupersession(null);
            setConfirmed(false);
            save.reset();
            void history.refetch();
          }}
        >
          {t('contracts.refresh')}
        </Button>
      </div>
      {history.isPending && (
        <p role="status" className="text-sm">
          {t('common.loading')}
        </p>
      )}
      {history.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('contracts.loadFailed')}</AlertDescription>
        </Alert>
      )}
      {!history.isError && history.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('contracts.empty')}</p>
      )}
      {!history.isError &&
        history.data?.map((period) => (
          <details key={period.id} className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {periodRange(period)} · {t('contracts.revision')}{' '}
              {period.revision}
            </summary>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              {fact(
                t('contracts.employmentStart'),
                formatDate(period.employmentStart),
              )}
              {fact(
                t('contracts.employmentEnd'),
                period.employmentEnd
                  ? formatDate(period.employmentEnd)
                  : t('contracts.openEnded'),
              )}
              {fact(
                t('contracts.weeklyHours'),
                new Intl.NumberFormat(languageTag).format(period.weeklyHours),
              )}
              {fact(t('contracts.timeModel'), enumLabel(period.timeModel))}
              {fact(
                t('contracts.workingDays'),
                weekdays
                  .filter((_, index) => period.workingDays & (1 << index))
                  .join(', '),
              )}
              {fact(t('contracts.scheduleLabel'), period.scheduleLabel || '—')}
              {fact(
                t('contracts.holidayCalendar'),
                period.holidayCalendar === 'NONE'
                  ? t('employees.holidayCalendarNone')
                  : period.holidayCalendar,
              )}
              {fact(
                t('contracts.holidayDates'),
                period.holidayDates.map(formatDate).join(', ') || '—',
              )}
              {fact(t('contracts.confirmationNote'), period.confirmationNote)}
              {fact(
                t('contracts.confirmedBy'),
                period.confirmedById || t('contracts.actorUnavailable'),
              )}
              {fact(t('contracts.createdAt'), formatDateTime(period.createdAt))}
            </dl>
          </details>
        ))}
      <details className="rounded border p-3">
        <summary className="cursor-pointer font-medium">
          {t('contracts.new')}
        </summary>
        <div className="mt-4 space-y-4">
          <Alert>
            <AlertDescription>{t('contracts.unconfirmed')}</AlertDescription>
          </Alert>
          <fieldset
            disabled={save.isPending}
            className="grid gap-3 sm:grid-cols-2"
          >
            <legend className="sr-only">{t('contracts.new')}</legend>
            <FactInput
              label={t('contracts.effectiveFrom')}
              type="date"
              value={draft.effectiveFrom}
              onChange={(effectiveFrom) => update({ effectiveFrom })}
            />
            <FactInput
              label={t('contracts.effectiveTo')}
              type="date"
              value={draft.effectiveTo}
              onChange={(effectiveTo) => update({ effectiveTo })}
            />
            <FactInput
              label={t('contracts.employmentStart')}
              type="date"
              value={draft.employmentStart}
              onChange={(employmentStart) => update({ employmentStart })}
            />
            <FactInput
              label={t('contracts.employmentEnd')}
              type="date"
              value={draft.employmentEnd}
              onChange={(employmentEnd) => update({ employmentEnd })}
            />
            <FactInput
              label={t('contracts.weeklyHours')}
              type="number"
              value={draft.weeklyHours}
              onChange={(weeklyHours) => update({ weeklyHours })}
            />
            <div className="space-y-1">
              <Label htmlFor={`${panelId}-model`}>
                {t('contracts.timeModel')}
              </Label>
              <select
                id={`${panelId}-model`}
                className={selectClass}
                value={draft.timeModel}
                onChange={(event) =>
                  update({ timeModel: event.target.value as TimeModel })
                }
              >
                {TIME_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {enumLabel(model)}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium">
                {t('contracts.workingDays')}
              </legend>
              <div className="flex flex-wrap gap-3">
                {weekdays.map((day, index) => (
                  <label key={day} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.workingDays & (1 << index))}
                      onChange={() =>
                        update({
                          workingDays: draft.workingDays ^ (1 << index),
                        })
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
            <FactInput
              label={t('contracts.scheduleLabel')}
              value={draft.scheduleLabel}
              onChange={(scheduleLabel) => update({ scheduleLabel })}
              maxLength={120}
            />
            <div className="space-y-1">
              <Label htmlFor={`${panelId}-holidays`}>
                {t('contracts.holidayCalendar')}
              </Label>
              <select
                id={`${panelId}-holidays`}
                className={selectClass}
                value={draft.holidayCalendar}
                onChange={(event) =>
                  update({
                    holidayCalendar: event.target.value as HolidayCalendar,
                  })
                }
              >
                <option value="NONE">
                  {t('employees.holidayCalendarNone')}
                </option>
                {(Object.keys(BUNDESLAND_LABEL) as Bundesland[]).map(
                  (region) => (
                    <option key={region} value={`DE-${region}`}>
                      {t('employees.holidayCalendarGermany', {
                        region: BUNDESLAND_LABEL[region],
                      })}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`${panelId}-dates`}>
                {t('contracts.holidayDates')}
              </Label>
              <textarea
                id={`${panelId}-dates`}
                className={`${selectClass} h-auto`}
                rows={2}
                value={draft.holidayDatesText}
                onChange={(event) =>
                  update({ holidayDatesText: event.target.value })
                }
                aria-describedby={`${panelId}-dates-hint`}
              />
              <p
                id={`${panelId}-dates-hint`}
                className="text-xs text-muted-foreground"
              >
                {t('employees.holidayDatesHint')}
              </p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`${panelId}-supersedes`}>
                {t('contracts.supersedes')}
              </Label>
              <select
                id={`${panelId}-supersedes`}
                className={selectClass}
                value={supersession?.id ?? ''}
                disabled={
                  history.isPending || history.isError || history.isFetching
                }
                onChange={(event) => {
                  const selected = history.data?.find(
                    (period) => period.id === event.target.value,
                  );
                  setSupersession(
                    selected
                      ? {
                          id: selected.id,
                          revision: selected.revision,
                          effectiveFrom: selected.effectiveFrom,
                          effectiveTo: selected.effectiveTo,
                        }
                      : null,
                  );
                  setConfirmed(false);
                  setSaved(false);
                }}
              >
                <option value="">{t('contracts.noSupersession')}</option>
                {history.data?.map((period) => (
                  <option key={period.id} value={period.id}>
                    {periodRange(period)} · {t('contracts.revision')}{' '}
                    {period.revision}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {t('contracts.supersessionHint')}
              </p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`${panelId}-note`}>
                {t('contracts.confirmationNote')}
              </Label>
              <textarea
                id={`${panelId}-note`}
                className={`${selectClass} h-auto`}
                rows={2}
                required
                minLength={5}
                maxLength={1000}
                aria-describedby={`${panelId}-note-hint`}
                value={draft.confirmationNote}
                onChange={(event) =>
                  update({ confirmationNote: event.target.value })
                }
              />
              <p
                id={`${panelId}-note-hint`}
                className="text-xs text-muted-foreground"
              >
                {t('contracts.noteHint')}
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t('contracts.confirm')}
            </label>
          </fieldset>
          {!factsValid && (
            <p className="text-sm text-destructive">{t('contracts.invalid')}</p>
          )}
          {save.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {save.error instanceof ApiError && save.error.status === 409
                  ? t('contracts.conflict')
                  : t('contracts.saveFailed')}
              </AlertDescription>
            </Alert>
          )}
          {saved && (
            <p role="status" className="text-sm">
              {t('contracts.saved')}
            </p>
          )}
          <Button
            type="button"
            disabled={
              !factsValid ||
              !confirmed ||
              !noteValid ||
              save.isPending ||
              history.isPending ||
              history.isError ||
              history.isFetching
            }
            onClick={() => {
              setSaved(false);
              save.mutate();
            }}
          >
            {save.isPending ? t('common.saving') : t('contracts.save')}
          </Button>
        </div>
      </details>
    </section>
  );
}
