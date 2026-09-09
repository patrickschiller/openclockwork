import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { soloApi, type SoloEntry, type SoloProject } from '../../api/solo';
import { useCurrentUser } from '../../app/auth';
import { useInstallation } from '../../app/installation';
import { useI18n } from '../../app/i18n';
import { zonedInput } from '../../app/solo-time';
import { DailyBlockDialog } from './DailyBlockDialog';
import {
  Check,
  Feedback,
  Field,
  Minutes,
  QueryError,
  resolveWallTime,
  selectClass,
  useSoloAction,
  WallTimeField,
  type WallTime,
} from './SoloUi';

interface Allocation {
  projectId: string;
  serviceOrderId: string;
  activity: string;
  note: string;
  billable: boolean;
}
const emptyAllocation: Allocation = {
  projectId: '',
  serviceOrderId: '',
  activity: '',
  note: '',
  billable: false,
};
function payload(value: Allocation) {
  return {
    projectId: value.projectId || null,
    serviceOrderId: value.serviceOrderId || null,
    activity: value.activity.trim() || null,
    note: value.note.trim() || null,
    billable: value.billable,
  };
}
function entryAllocation(entry: SoloEntry): Allocation {
  return {
    projectId: entry.projectId ?? '',
    serviceOrderId: entry.serviceOrderId ?? '',
    activity: entry.activity ?? '',
    note: entry.note ?? '',
    billable: entry.billable,
  };
}
export function AllocationFields({
  value,
  onChange,
  projects,
}: {
  value: Allocation;
  onChange: (value: Allocation) => void;
  projects: SoloProject[];
}) {
  const { t } = useI18n();
  const project = projects.find((p) => p.id === value.projectId);
  const orders =
    project?.serviceOrders.filter(
      (o) => o.isActive !== false || o.id === value.serviceOrderId,
    ) ?? [];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.project')}>
          <select
            className={selectClass}
            value={value.projectId}
            onChange={(event) => {
              const next = projects.find((p) => p.id === event.target.value);
              onChange({
                ...value,
                projectId: event.target.value,
                serviceOrderId: '',
                billable: next?.defaultBillable ?? false,
              });
            }}
          >
            <option value="">{t('solo.unassigned')}</option>
            {projects
              .filter((p) => p.isActive !== false || p.id === value.projectId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field
          label={t('projects.reportOrder')}
          hint={orders.length ? t('solo.orderRequired') : undefined}
        >
          <select
            className={selectClass}
            value={value.serviceOrderId}
            required={orders.length > 0}
            onChange={(event) => {
              const order = orders.find((o) => o.id === event.target.value);
              onChange({
                ...value,
                serviceOrderId: event.target.value,
                billable:
                  order?.defaultBillable ?? project?.defaultBillable ?? false,
              });
            }}
          >
            <option value="">{t('common.none')}</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNo} · {o.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('common.activity')} hint={t('solo.activityHint')}>
        <Input
          maxLength={500}
          value={value.activity}
          onChange={(event) =>
            onChange({ ...value, activity: event.target.value })
          }
        />
      </Field>
      <Field label={t('solo.privateNote')} hint={t('solo.reasonHint')}>
        <Input
          maxLength={2000}
          value={value.note}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
        />
      </Field>
      <Check
        label={t('solo.billable')}
        checked={value.billable}
        onChange={(billable) => onChange({ ...value, billable })}
      />
    </div>
  );
}

export function SoloTimer({
  entries,
  projects,
  onCorrect,
}: {
  entries: SoloEntry[];
  projects: SoloProject[];
  onCorrect?: (entry: SoloEntry) => void;
}) {
  const { t, languageTag } = useI18n();
  const installation = useInstallation().data;
  const action = useSoloAction();
  const [allocation, setAllocation] = useState<Allocation>(emptyAllocation);
  const [switching, setSwitching] = useState(false);
  const [captureLocation, setCaptureLocation] = useState(false);
  const [now, setNow] = useState(Date.now());
  const running = entries.find((entry) => !entry.clockOut && !entry.voidedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const duration = running
    ? Math.max(0, Math.floor((now - Date.parse(running.clockIn)) / 1000))
    : 0;
  const timerText = `${Math.floor(duration / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((duration / 60) % 60)
    .toString()
    .padStart(2, '0')}:${(duration % 60).toString().padStart(2, '0')}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(running ? 'solo.running' : 'solo.noTimer')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Feedback action={action} />
        {running && (
          <>
            <p className="font-mono text-4xl tabular-nums" role="timer">
              {timerText}
            </p>
            <p className="break-words text-sm text-muted-foreground">
              {new Date(running.clockIn).toLocaleString(languageTag, {
                timeZone: installation?.timeZone,
              })}{' '}
              · {running.projectName ?? t('solo.unassigned')}
              {running.activity ? ` · ${running.activity}` : ''}
            </p>
            {duration > 43200 && (
              <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                {t('solo.forgottenTimer')}{' '}
                {onCorrect ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCorrect(running)}
                  >
                    {t('solo.correctOpen')}
                  </Button>
                ) : (
                  <Link className="underline" to="/booking">
                    {t('solo.correctOpen')}
                  </Link>
                )}
              </div>
            )}
          </>
        )}
        {(!running || switching) && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run<unknown>(
                async () => {
                  if (running)
                    return soloApi.switchProject(running.id, {
                      ...payload(allocation),
                      revision: running.revision,
                    });
                  let position:
                    | {
                        latitude: number;
                        longitude: number;
                        accuracyMeters: number;
                      }
                    | undefined;
                  if (captureLocation && installation?.capabilities.gps) {
                    position = await new Promise((resolve, reject) => {
                      if (!navigator.geolocation) {
                        reject(new Error(t('solo.locationFailed')));
                        return;
                      }
                      navigator.geolocation.getCurrentPosition(
                        (p) =>
                          resolve({
                            latitude: p.coords.latitude,
                            longitude: p.coords.longitude,
                            accuracyMeters: p.coords.accuracy,
                          }),
                        () => reject(new Error(t('solo.locationFailed'))),
                        {
                          timeout: 10_000,
                          maximumAge: 0,
                          enableHighAccuracy: false,
                        },
                      );
                    });
                  }
                  return soloApi.start({ ...payload(allocation), ...position });
                },
                () => {
                  setSwitching(false);
                  setAllocation(emptyAllocation);
                },
              );
            }}
          >
            <AllocationFields
              value={allocation}
              onChange={setAllocation}
              projects={projects}
            />
            {!running && installation?.capabilities.gps && (
              <Check
                label={t('solo.captureLocation')}
                checked={captureLocation}
                onChange={setCaptureLocation}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={action.pending || !action.online} type="submit">
                {t(running ? 'solo.switchProject' : 'solo.start')}
              </Button>
              {switching && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setSwitching(false)}
                >
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </form>
        )}
        {running && !switching && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={action.pending || !action.online}
              onClick={() =>
                void action.run(() =>
                  soloApi.stop(running.id, running.revision),
                )
              }
            >
              {t('solo.stop')}
            </Button>
            <Button
              variant="outline"
              disabled={action.pending || !action.online}
              onClick={() => {
                setAllocation(entryAllocation(running));
                setSwitching(true);
              }}
            >
              {t('solo.switchProject')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SoloTimesPage() {
  const user = useCurrentUser();
  const { t, languageTag } = useI18n();
  const { data: installation } = useInstallation();
  const entries = useQuery({
    queryKey: ['solo-times', user.id],
    queryFn: () => soloApi.entries(user.id),
    refetchInterval: 30_000,
  });
  const projects = useQuery({
    queryKey: ['solo-bookable', user.id],
    queryFn: () => soloApi.bookableProjects(user.id),
  });
  const [editing, setEditing] = useState<{
    kind: 'manual' | 'correct' | 'split' | 'void';
    entry?: SoloEntry;
  } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [daily, setDaily] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [unassigned, setUnassigned] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const timeZone = installation?.timeZone ?? 'UTC';
  const filtered = (entries.data ?? [])
    .filter(
      (entry) =>
        (showVoided || !entry.voidedAt) &&
        (!unassigned || !entry.projectId) &&
        (!from ||
          zonedInput(entry.clockOut ?? new Date(), timeZone).slice(0, 10) >=
            from) &&
        (!to || zonedInput(entry.clockIn, timeZone).slice(0, 10) <= to),
    )
    .sort((a, b) => b.clockIn.localeCompare(a.clockIn));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{t('solo.times')}</h1>
        <Button onClick={() => setEditing({ kind: 'manual' })}>
          {t('solo.manual')}
        </Button>
        {installation?.capabilities.dailyBlock && (
          <Button variant="outline" onClick={() => setDaily(true)}>
            {t('solo.dailyBlockAction')}
          </Button>
        )}
      </div>
      <QueryError
        error={entries.error || projects.error}
        retry={() => {
          void entries.refetch();
          void projects.refetch();
        }}
      />
      {entries.isLoading ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <SoloTimer
          entries={entries.data ?? []}
          projects={projects.data ?? []}
          onCorrect={(entry) => setEditing({ kind: 'correct', entry })}
        />
      )}
      <div className="flex flex-wrap gap-4">
        <Field label={t('common.from')}>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={t('common.to')}>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Check
          label={t('solo.unassigned')}
          checked={unassigned}
          onChange={setUnassigned}
        />
        <Check
          label={t('solo.showVoided')}
          checked={showVoided}
          onChange={setShowVoided}
        />
      </div>
      <div className="space-y-3">
        {filtered.map((entry) => (
          <Card key={entry.id} className={entry.voidedAt ? 'opacity-60' : ''}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {new Date(entry.clockIn).toLocaleString(languageTag, {
                      timeZone,
                    })}{' '}
                    –{' '}
                    {entry.clockOut
                      ? new Date(entry.clockOut).toLocaleString(languageTag, {
                          timeZone,
                        })
                      : t('solo.running')}
                  </p>
                  <p className="break-words text-sm">
                    {entry.projectName ?? t('solo.unassigned')}
                    {entry.serviceOrderNo ? ` · ${entry.serviceOrderNo}` : ''}
                  </p>
                  {entry.activity && (
                    <p className="break-words text-sm text-muted-foreground">
                      {entry.activity}
                    </p>
                  )}
                </div>
                <span className="rounded bg-muted px-2 py-1 text-xs">
                  {t(
                    entry.voidedAt
                      ? 'solo.voided'
                      : entry.clockOut
                        ? 'solo.recorded'
                        : 'solo.running',
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {entry.summary && (
                  <>
                    <span>
                      {t('solo.gross')}:{' '}
                      <Minutes value={entry.summary.grossMinutes} />
                    </span>
                    <span>
                      {t('solo.break')}:{' '}
                      <Minutes value={entry.summary.breakMinutes} />
                    </span>
                    <span>
                      {t('solo.net')}:{' '}
                      <Minutes value={entry.summary.netMinutes} />
                    </span>
                  </>
                )}
                <span>
                  {t(entry.billable ? 'solo.billable' : 'solo.nonBillable')}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {!entry.voidedAt && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing({ kind: 'correct', entry })}
                    >
                      {t('solo.correct')}
                    </Button>
                    {entry.clockOut && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing({ kind: 'split', entry })}
                      >
                        {t('solo.split')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing({ kind: 'void', entry })}
                    >
                      {t('solo.void')}
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHistoryId(entry.id)}
                >
                  {t('solo.history')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!entries.isLoading && !filtered.length && (
          <p className="text-muted-foreground">{t('solo.noEntries')}</p>
        )}
      </div>
      {editing && (
        <EntryDialog
          key={`${editing.kind}-${editing.entry?.id ?? 'new'}`}
          {...editing}
          projects={projects.data ?? []}
          timeZone={timeZone}
          close={() => setEditing(null)}
        />
      )}
      {historyId && (
        <AuditDialog id={historyId} close={() => setHistoryId(null)} />
      )}
      {daily && (
        <DailyBlockDialog
          projects={projects.data ?? []}
          timeZone={timeZone}
          close={() => setDaily(false)}
        />
      )}
    </div>
  );
}
function EntryDialog({
  kind,
  entry,
  projects,
  timeZone,
  close,
}: {
  kind: 'manual' | 'correct' | 'split' | 'void';
  entry?: SoloEntry;
  projects: SoloProject[];
  timeZone: string;
  close: () => void;
}) {
  const { t } = useI18n();
  const action = useSoloAction();
  const wall = (instant: string | Date): WallTime => ({
    local: zonedInput(instant, timeZone),
    choice: new Date(
      Math.floor(new Date(instant).getTime() / 60_000) * 60_000,
    ).toISOString(),
    original: new Date(instant).toISOString(),
  });
  const [start, setStart] = useState(
    wall(entry?.clockIn ?? new Date(Date.now() - 3600_000)),
  );
  const [end, setEnd] = useState(wall(entry?.clockOut ?? new Date()));
  const [split, setSplit] = useState(
    wall(
      entry?.clockOut
        ? new Date((Date.parse(entry.clockIn) + Date.parse(entry.clockOut)) / 2)
        : new Date(),
    ),
  );
  const [allocation, setAllocation] = useState(
    entry ? entryAllocation(entry) : emptyAllocation,
  );
  const [reason, setReason] = useState('');
  const editorProjects: SoloProject[] = [...projects];
  if (
    entry?.projectId &&
    !editorProjects.some((project) => project.id === entry.projectId)
  ) {
    editorProjects.push({
      id: entry.projectId,
      code: entry.projectCode ?? '',
      name: entry.projectName ?? t('solo.archived'),
      description: null,
      isActive: false,
      planHours: null,
      bookedMinutes: 0,
      assignedEmployeeCount: 1,
      updatedAt: '',
      customerId: null,
      customerName: null,
      defaultBillable: entry.billable,
      serviceOrders: entry.serviceOrderId
        ? [
            {
              id: entry.serviceOrderId,
              projectId: entry.projectId,
              orderNo: entry.serviceOrderNo ?? '',
              title: entry.serviceOrderTitle ?? '',
              isActive: false,
              planHours: null,
              bookedMinutes: 0,
              defaultBillable: entry.billable,
            },
          ]
        : [],
    });
  }
  const title = t(`solo.${kind}`);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t(
              kind === 'void'
                ? 'solo.voidConfirm'
                : kind === 'split'
                  ? 'solo.splitHint'
                  : 'solo.manualHint',
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              if (kind === 'void' && entry)
                return soloApi.void(entry.id, entry.revision, reason);
              if (kind === 'split' && entry)
                return soloApi.split(entry.id, {
                  at: resolveWallTime(split, timeZone, t),
                  ...payload(allocation),
                  revision: entry.revision,
                });
              const values = {
                ...payload(allocation),
                clockIn: resolveWallTime(start, timeZone, t),
                clockOut: resolveWallTime(end, timeZone, t),
              };
              return entry
                ? soloApi.correct(entry.id, {
                    ...values,
                    revision: entry.revision,
                    reason,
                  })
                : soloApi.manual(values);
            }, close);
          }}
        >
          <Feedback action={action} />
          {kind === 'split' ? (
            <WallTimeField
              label={t('booking.splitAt')}
              value={split}
              onChange={setSplit}
              timeZone={timeZone}
            />
          ) : (
            kind !== 'void' && (
              <>
                <WallTimeField
                  label={t('common.from')}
                  value={start}
                  onChange={setStart}
                  timeZone={timeZone}
                />
                <WallTimeField
                  label={t('common.to')}
                  value={end}
                  onChange={setEnd}
                  timeZone={timeZone}
                />
              </>
            )
          )}
          {kind !== 'void' && (
            <AllocationFields
              value={allocation}
              onChange={setAllocation}
              projects={editorProjects}
            />
          )}
          {(kind === 'correct' || kind === 'void') && (
            <Field label={t('solo.reason')} hint={t('solo.reasonHint')}>
              <Input
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={action.pending || !action.online}>
              {action.pending ? t('common.saving') : title}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function AuditDialog({
  id,
  close,
  day = false,
  settings = false,
}: {
  id: string;
  close: () => void;
  day?: boolean;
  settings?: boolean;
}) {
  const { t, formatDateTime } = useI18n();
  const history = useQuery({
    queryKey: ['solo-audit', day, settings, id],
    queryFn: () =>
      settings
        ? soloApi.installationEvents()
        : day
          ? soloApi.dayAudit(id)
          : soloApi.audit(id),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('solo.history')}</DialogTitle>
          <DialogDescription>{t('solo.reasonHint')}</DialogDescription>
        </DialogHeader>
        <QueryError error={history.error} retry={history.refetch} />
        {history.isLoading && <p>{t('common.loading')}</p>}
        <ol className="space-y-4">
          {history.data?.map((event) => (
            <li key={event.id} className="border-b pb-3">
              <p className="font-medium">{t(`solo.audit.${event.action}`)}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(event.occurredAt)}
              </p>
              {event.reason && (
                <p className="break-words text-sm">{event.reason}</p>
              )}
              <details className="mt-2 text-xs">
                <summary>{t('common.description')}</summary>
                <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
                  {JSON.stringify(
                    { before: event.before, after: event.after },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </li>
          ))}
        </ol>
        {history.data?.length === 0 && <p>{t('solo.noHistory')}</p>}
      </DialogContent>
    </Dialog>
  );
}
