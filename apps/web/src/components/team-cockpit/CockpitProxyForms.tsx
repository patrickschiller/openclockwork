import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type BookableProjectDto } from '../../api/client';
import { useCurrentUser } from '../../app/auth';
import { useI18n } from '../../app/i18n';
import { useOnline } from '../../app/use-online';
import {
  zonedDateTimeCandidates,
  zonedUtcOffsetLabel,
} from '../../lib/iana-date-time';
import { refreshTeamCockpit } from './cache';

type Employee = { id: string; firstName: string; lastName: string };
type Props = { employee: Employee; timeZone: string; employees: Employee[] };
type Mode = 'clockIn' | 'manual' | 'absence' | 'request';
type Submission =
  | { mode: 'clockIn'; payload: Parameters<typeof api.teamCockpitClockIn>[1] }
  | { mode: 'manual'; payload: Parameters<typeof api.teamCockpitManual>[1] }
  | {
      mode: 'absence';
      payload: Parameters<typeof api.teamCockpitRecordAbsence>[1];
    }
  | {
      mode: 'request';
      payload: Parameters<typeof api.teamCockpitRequestAbsence>[1];
    };
const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
const textareaClass =
  'min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm';

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-'))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** A new beneficiary/actor/zone always gets a fresh form, never stale input. */
export function CockpitProxyForms(props: Props) {
  const user = useCurrentUser();
  const { t } = useI18n();
  if (
    props.employee.id === user.id ||
    !['Manager', 'HRAdmin'].includes(user.role)
  ) {
    return <p role="alert">{t('cockpitProxy.unavailable')}</p>;
  }
  return (
    <ProxyForm
      key={`${user.id}:${user.role}:${props.employee.id}:${props.timeZone}`}
      {...props}
    />
  );
}

function ZonedInput({
  id,
  label,
  timeZone,
  value,
  choice,
  onChange,
  onChoose,
}: {
  id: string;
  label: string;
  timeZone: string;
  value: string;
  choice: string;
  onChange: (value: string) => void;
  onChoose: (value: string) => void;
}) {
  const { t } = useI18n();
  const candidates = useMemo(
    () => zonedDateTimeCandidates(value, timeZone),
    [value, timeZone],
  );
  const iso =
    candidates.length === 1
      ? candidates[0]
      : candidates.includes(choice)
        ? choice
        : '';
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="datetime-local"
        step="0.001"
        required
        value={value}
        aria-describedby={`${id}-help`}
        aria-invalid={!!value && !iso}
        onChange={(event) => onChange(event.target.value)}
      />
      <div id={`${id}-help`} className="text-sm text-muted-foreground">
        {value && candidates.length === 0 && (
          <p role="alert">{t('cockpitProxy.gap')}</p>
        )}
        {candidates.length > 1 && (
          <>
            <p>{t('cockpitProxy.fold')}</p>
            <Label htmlFor={`${id}-choice`}>
              {t('cockpitProxy.occurrence', { field: label })}
            </Label>
            <select
              id={`${id}-choice`}
              required
              className={selectClass}
              value={iso}
              onChange={(e) => onChoose(e.target.value)}
            >
              <option value="">{t('cockpitProxy.chooseOccurrence')}</option>
              {candidates.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {zonedUtcOffsetLabel(candidate, timeZone)} · {candidate}
                </option>
              ))}
            </select>
          </>
        )}
        {iso && <p>{t('cockpitProxy.instant', { iso })}</p>}
      </div>
    </div>
  );
}

function ProxyForm({ employee, timeZone, employees }: Props) {
  const user = useCurrentUser();
  const { t, enumLabel } = useI18n();
  const online = useOnline();
  const qc = useQueryClient();
  const prefix = useId();
  const name = `${employee.firstName} ${employee.lastName}`;
  const [mode, setMode] = useState<Mode>('clockIn');
  const [proxyReason, setProxyReason] = useState('');
  const [projectId, setProjectId] = useState('');
  const [serviceOrderId, setServiceOrderId] = useState('');
  const [activity, setActivity] = useState('');
  const [billable, setBillable] = useState(true);
  const [note, setNote] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [startChoice, setStartChoice] = useState('');
  const [endChoice, setEndChoice] = useState('');
  const [kind, setKind] = useState<'Sickness' | 'Training' | 'Flextime'>(
    'Sickness',
  );
  const [type, setType] = useState<'Vacation' | 'HomeOffice' | 'SpecialLeave'>(
    'Vacation',
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [halfDayStart, setHalfDayStart] = useState(false);
  const [halfDayEnd, setHalfDayEnd] = useState(false);
  const [substituteId, setSubstituteId] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The synchronous lock covers a second submit before React renders pending.
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isBooking = mode === 'clockIn' || mode === 'manual';
  const targetsKey = [
    'team-cockpit',
    user.id,
    user.role,
    'booking-targets',
    employee.id,
  ];
  const targets = useQuery({
    queryKey: targetsKey,
    queryFn: () => api.teamCockpitBookingTargets(employee.id),
    enabled: isBooking && online,
  });
  const projects = targets.data ?? [];
  const project = projects.find((p) => p.id === projectId);
  // Beneficiary scope and substitute eligibility are different domain rules:
  // the normal workflow permits any active directory colleague, including the actor.
  const directory = useQuery({
    queryKey: ['team-cockpit', user.id, user.role, 'substitute-directory'],
    queryFn: () => api.employeeDirectory(),
    enabled: mode === 'request' && type === 'Vacation' && online,
  });
  const substitutes = (directory.data ?? employees).filter(
    (person) => person.id !== employee.id,
  );
  const startCandidates = useMemo(
    () => zonedDateTimeCandidates(start, timeZone),
    [start, timeZone],
  );
  const endCandidates = useMemo(
    () => zonedDateTimeCandidates(end, timeZone),
    [end, timeZone],
  );
  const startIso =
    startCandidates.length === 1
      ? startCandidates[0]
      : startCandidates.includes(startChoice)
        ? startChoice
        : '';
  const endIso =
    endCandidates.length === 1
      ? endCandidates[0]
      : endCandidates.includes(endChoice)
        ? endChoice
        : '';

  const mutation = useMutation({
    mutationFn: async (submission: Submission) => {
      switch (submission.mode) {
        case 'clockIn':
          return api.teamCockpitClockIn(employee.id, submission.payload);
        case 'manual':
          return api.teamCockpitManual(employee.id, submission.payload);
        case 'absence':
          return api.teamCockpitRecordAbsence(employee.id, submission.payload);
        case 'request':
          return api.teamCockpitRequestAbsence(employee.id, submission.payload);
      }
    },
    onSuccess: () => {
      if (!mounted.current) return;
      setProxyReason('');
      setSaved(true);
    },
    onError: () => {
      if (mounted.current) setError(t('cockpitProxy.failed'));
    },
    onSettled: async () => {
      // Also revalidate after conflicts or a revoked scope; never keep stale
      // entries/approval/account/report state after a proxy attempt.
      try {
        await refreshTeamCockpit(qc);
      } finally {
        locked.current = false;
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || mutation.isPending || !mounted.current || !online)
      return;
    setSaved(false);
    setError(null);
    const reason = proxyReason.trim();
    if (reason.length < 5 || reason.length > 1000) {
      setError(t('cockpitProxy.reasonInvalid'));
      return;
    }
    let submission: Submission;
    if (isBooking) {
      // Read the live cache as well: an invalidation/assignment update can
      // arrive before React Query has notified this render's observer.
      const currentTargets = qc.getQueryState<BookableProjectDto[]>(targetsKey);
      const currentProject = currentTargets?.data?.find(
        (p) => p.id === projectId,
      );
      if (
        currentTargets?.status !== 'success' ||
        currentTargets.fetchStatus !== 'idle' ||
        currentTargets.isInvalidated ||
        !currentTargets.data ||
        (projectId && !currentProject) ||
        (currentProject?.serviceOrders.length &&
          !currentProject.serviceOrders.some(
            (order) => order.id === serviceOrderId,
          )) ||
        (serviceOrderId &&
          !currentProject?.serviceOrders.some(
            (order) => order.id === serviceOrderId,
          ))
      ) {
        setError(t('cockpitProxy.targetInvalid'));
        return;
      }
      if (activity.length > 500 || note.length > 2000) {
        setError(t('cockpitProxy.invalid'));
        return;
      }
      const booking = {
        reason,
        projectId: projectId || null,
        serviceOrderId: serviceOrderId || null,
        activity: activity.trim() || null,
        billable,
        note: note.trim() || null,
      };
      if (mode === 'manual') {
        if (
          !startIso ||
          !endIso ||
          startIso >= endIso ||
          new Date(endIso).getTime() > Date.now()
        ) {
          setError(t('cockpitProxy.timeInvalid'));
          return;
        }
        submission = {
          mode: 'manual',
          payload: { ...booking, clockIn: startIso, clockOut: endIso },
        };
      } else submission = { mode: 'clockIn', payload: booking };
    } else {
      if (!validDate(from) || !validDate(to) || to < from) {
        setError(t('cockpitProxy.dateInvalid'));
        return;
      }
      if (mode === 'absence') {
        submission = { mode, payload: { kind, from, to, proxyReason: reason } };
      } else {
        if (type === 'Vacation' && from.slice(0, 4) !== to.slice(0, 4)) {
          setError(t('cockpitProxy.vacationYear'));
          return;
        }
        if (
          requestReason.length > 2000 ||
          (type === 'Vacation' &&
            substituteId &&
            !substitutes.some((p) => p.id === substituteId))
        ) {
          setError(t('cockpitProxy.invalid'));
          return;
        }
        submission = {
          mode: 'request',
          payload: {
            type,
            from,
            to,
            halfDayStart: type === 'Vacation' && halfDayStart,
            halfDayEnd: type === 'Vacation' && halfDayEnd,
            substituteId: type === 'Vacation' ? substituteId || null : null,
            reason: requestReason.trim() || null,
            proxyReason: reason,
          },
        };
      }
    }
    // Capture employee and payload at submit time. Changes to another employee
    // unmount this form and cannot retarget the in-flight operation.
    locked.current = true;
    mutation.mutate(submission);
  }

  const id = (field: string) => `${prefix}-${field}`;
  return (
    <section
      aria-labelledby={id('title')}
      className="space-y-4 rounded-lg border p-4"
    >
      <h2 id={id('title')} className="text-xl font-semibold">
        {t('cockpitProxy.title')}
      </h2>
      <p className="font-medium">{t('cockpitProxy.beneficiary', { name })}</p>
      {!online && <p role="alert">{t('cockpitProxy.offline')}</p>}
      <form onSubmit={submit} aria-label={t('cockpitProxy.title')}>
        <fieldset
          disabled={mutation.isPending || !online}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label htmlFor={id('action')}>{t('cockpitProxy.action')}</Label>
            <select
              id={id('action')}
              className={selectClass}
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setProxyReason('');
                setError(null);
                setSaved(false);
              }}
            >
              {(['clockIn', 'manual', 'absence', 'request'] as const).map(
                (value) => (
                  <option key={value} value={value}>
                    {t(`cockpitProxy.${value}`)}
                  </option>
                ),
              )}
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(`cockpitProxy.${mode}Help`)}
          </p>
          {mode === 'manual' && (
            <>
              <p>{t('cockpitProxy.zone', { timeZone })}</p>
              <ZonedInput
                id={id('start')}
                label={t('cockpitProxy.clockInTime')}
                timeZone={timeZone}
                value={start}
                choice={startChoice}
                onChoose={setStartChoice}
                onChange={(v) => {
                  setStart(v);
                  setStartChoice('');
                }}
              />
              <ZonedInput
                id={id('end')}
                label={t('cockpitProxy.clockOutTime')}
                timeZone={timeZone}
                value={end}
                choice={endChoice}
                onChoose={setEndChoice}
                onChange={(v) => {
                  setEnd(v);
                  setEndChoice('');
                }}
              />
            </>
          )}
          {isBooking && (
            <>
              {targets.isPending && (
                <p role="status">{t('cockpitProxy.targetsLoading')}</p>
              )}
              {targets.isError && (
                <div role="alert">
                  <p>{t('cockpitProxy.targetsFailed')}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => targets.refetch()}
                    disabled={targets.isFetching}
                  >
                    {t('cockpitProxy.retry')}
                  </Button>
                </div>
              )}
              {targets.isSuccess && projects.length === 0 && (
                <p>{t('cockpitProxy.targetsEmpty')}</p>
              )}
              <div className="space-y-1">
                <Label htmlFor={id('project')}>
                  {t('cockpitProxy.project')}
                </Label>
                <select
                  id={id('project')}
                  className={selectClass}
                  value={projectId}
                  disabled={!targets.isSuccess || targets.isFetching}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setServiceOrderId('');
                  }}
                >
                  <option value="">{t('cockpitProxy.noProject')}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {!!project?.serviceOrders.length && (
                <div className="space-y-1">
                  <Label htmlFor={id('order')}>{t('cockpitProxy.order')}</Label>
                  <select
                    id={id('order')}
                    className={selectClass}
                    value={serviceOrderId}
                    required
                    onChange={(e) => setServiceOrderId(e.target.value)}
                  >
                    <option value="">{t('cockpitProxy.chooseOrder')}</option>
                    {project.serviceOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNo} · {order.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor={id('activity')}>
                  {t('cockpitProxy.activity')}
                </Label>
                <Input
                  id={id('activity')}
                  maxLength={500}
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={id('billable')}
                  type="checkbox"
                  checked={billable}
                  onChange={(e) => setBillable(e.target.checked)}
                />
                <Label htmlFor={id('billable')}>
                  {t('cockpitProxy.billable')}
                </Label>
              </div>
              <div className="space-y-1">
                <Label htmlFor={id('note')}>{t('cockpitProxy.note')}</Label>
                <textarea
                  id={id('note')}
                  className={textareaClass}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </>
          )}
          {!isBooking && (
            <>
              <div className="space-y-1">
                <Label htmlFor={id('kind')}>
                  {t(
                    mode === 'absence'
                      ? 'cockpitProxy.kind'
                      : 'cockpitProxy.type',
                  )}
                </Label>
                {mode === 'absence' ? (
                  <select
                    id={id('kind')}
                    className={selectClass}
                    value={kind}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                  >
                    {(['Sickness', 'Training', 'Flextime'] as const).map(
                      (value) => (
                        <option key={value} value={value}>
                          {enumLabel(value)}
                        </option>
                      ),
                    )}
                  </select>
                ) : (
                  <select
                    id={id('kind')}
                    className={selectClass}
                    value={type}
                    onChange={(e) => setType(e.target.value as typeof type)}
                  >
                    {(['Vacation', 'HomeOffice', 'SpecialLeave'] as const).map(
                      (value) => (
                        <option key={value} value={value}>
                          {enumLabel(value)}
                        </option>
                      ),
                    )}
                  </select>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor={id('from')}>{t('cockpitProxy.from')}</Label>
                <Input
                  id={id('from')}
                  type="date"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={id('to')}>{t('cockpitProxy.to')}</Label>
                <Input
                  id={id('to')}
                  type="date"
                  required
                  min={from || undefined}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </>
          )}
          {mode === 'request' && (
            <>
              {type === 'Vacation' && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      id={id('halfStart')}
                      type="checkbox"
                      checked={halfDayStart}
                      onChange={(e) => setHalfDayStart(e.target.checked)}
                    />
                    <Label htmlFor={id('halfStart')}>
                      {t('cockpitProxy.halfDayStart')}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id={id('halfEnd')}
                      type="checkbox"
                      checked={halfDayEnd}
                      onChange={(e) => setHalfDayEnd(e.target.checked)}
                    />
                    <Label htmlFor={id('halfEnd')}>
                      {t('cockpitProxy.halfDayEnd')}
                    </Label>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={id('substitute')}>
                      {t('cockpitProxy.substitute')}
                    </Label>
                    {directory.isFetching && (
                      <p role="status">{t('common.loading')}</p>
                    )}
                    {directory.isError && (
                      <div role="alert">
                        <p>{t('cockpitProxy.directoryFailed')}</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void directory.refetch()}
                        >
                          {t('cockpitProxy.retry')}
                        </Button>
                      </div>
                    )}
                    <select
                      id={id('substitute')}
                      className={selectClass}
                      value={substituteId}
                      onChange={(e) => setSubstituteId(e.target.value)}
                    >
                      <option value="">{t('cockpitProxy.noSubstitute')}</option>
                      {substitutes.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.firstName} {person.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label htmlFor={id('requestReason')}>
                  {t('cockpitProxy.requestReason')}
                </Label>
                <textarea
                  id={id('requestReason')}
                  className={textareaClass}
                  maxLength={2000}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor={id('proxyReason')}>
              {t('cockpitProxy.proxyReason')}
            </Label>
            <textarea
              id={id('proxyReason')}
              required
              minLength={5}
              maxLength={1000}
              aria-describedby={id('reasonHelp')}
              className={textareaClass}
              value={proxyReason}
              onChange={(e) => {
                setProxyReason(e.target.value);
                setSaved(false);
              }}
            />
            <p id={id('reasonHelp')} className="text-sm text-muted-foreground">
              {t('cockpitProxy.reasonHelp')}
            </p>
          </div>
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              !online ||
              (isBooking && (!targets.isSuccess || targets.isFetching))
            }
          >
            {mutation.isPending
              ? t('cockpitProxy.saving')
              : t('cockpitProxy.submit', { name })}
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="mt-3 text-destructive">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-3">
            {t('cockpitProxy.saved')}
          </p>
        )}
      </form>
    </section>
  );
}
