import { zonedUtcOffsetLabel } from '../lib/iana-date-time';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  api,
  type RequestDto,
  type RequestType,
  type TimeAdjustmentTargetDto,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';
import {
  formatLocalDateTime,
  localDateTimeCandidates,
  utcOffsetLabel,
} from '../lib/local-date-time';

const TYPES: RequestType[] = [
  'Vacation',
  'HomeOffice',
  'SpecialLeave',
  'TimeAdjustment',
];

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRange(
  type: RequestType,
  fromIso: string,
  toIso: string,
  locale: string,
): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  if (type === 'TimeAdjustment') {
    return `${f.toLocaleString(locale)} – ${t.toLocaleString(locale)}`;
  }
  return `${f.toLocaleDateString(locale, { timeZone: 'UTC' })} – ${t.toLocaleDateString(locale, { timeZone: 'UTC' })}`;
}

function correctionInstant(
  iso: string,
  locale: string,
  timeZone?: string,
): string {
  // Supported by our browsers/Node 20, but absent from the app's older
  // Intl library declarations. Keep the extension local, not a config change.
  const options: Intl.DateTimeFormatOptions & { fractionalSecondDigits: 3 } = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  };
  return `${new Date(iso).toLocaleString(locale, options)} (${timeZone ? zonedUtcOffsetLabel(iso, timeZone) : utcOffsetLabel(iso)})`;
}

function minutesBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

export function RequestsPage() {
  const user = useCurrentUser();
  const { t, enumLabel, languageTag } = useI18n();
  const employeeId = user.id;
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const requests = useQuery({
    queryKey: ['requests', { employeeId }],
    queryFn: () => api.listRequests({ employeeId }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t('requests.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('requests.description')}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>{t('requests.new')}</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
            <NewRequestForm
              onClose={() => {
                setDialogOpen(false);
                qc.invalidateQueries({ queryKey: ['requests'] });
                qc.invalidateQueries({ queryKey: ['vacation-balance'] });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {editingId && (
        <EditRequestDialog
          requestId={editingId}
          onClose={() => {
            setEditingId(null);
            qc.invalidateQueries({ queryKey: ['requests'] });
            qc.invalidateQueries({ queryKey: ['request'] });
            qc.invalidateQueries({ queryKey: ['request-events'] });
            qc.invalidateQueries({ queryKey: ['vacation-balance'] });
          }}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('requests.own')}</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.data && requests.data.length > 0 ? (
            <ul className="divide-y text-sm">
              {requests.data.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {r.employeeName || `${user.firstName} ${user.lastName}`} ·{' '}
                      {enumLabel(r.type)} ·{' '}
                      {formatRange(
                        r.type as RequestType,
                        r.from,
                        r.to,
                        languageTag,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.type === 'TimeAdjustment'
                        ? `${minutesBetween(r.from, r.to)} min`
                        : `${Number(r.calculatedDays).toFixed(1)} Werktage`}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.requiresApproval && (
                      <Badge variant="destructive">
                        {t('requests.specialApproval')}
                      </Badge>
                    )}
                    {r.workflowState === 'Draft' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingId(r.id)}
                      >
                        {enumLabel(r.workflowState)} · {t('requests.edit')}
                      </Button>
                    ) : (
                      <Badge variant="secondary">
                        {enumLabel(r.workflowState)}
                      </Badge>
                    )}
                  </div>
                  {r.type === 'TimeAdjustment' && (
                    <div className="w-full space-y-2">
                      <TimeAdjustmentDiff request={r} />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={historyId === r.id}
                        onClick={() =>
                          setHistoryId(historyId === r.id ? null : r.id)
                        }
                      >
                        {t('requests.bookingHistory')}
                      </Button>
                      {historyId === r.id && (
                        <RequestTimeEntryAudit requestId={r.id} />
                      )}
                    </div>
                  )}
                  {r.type === 'SpecialLeave' && (
                    <AttachmentsList requestId={r.id} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('requests.none')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EditRequestDialog({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const request = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => api.getRequest(requestId),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        {request.data && !request.isFetching ? (
          <NewRequestForm
            key={request.data.updatedAt}
            request={request.data}
            onClose={onClose}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>{t('requests.edit')}</DialogTitle>
            <DialogDescription>
              {request.isError ? t('requests.loadFailed') : t('common.loading')}
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface NewRequestFormProps {
  onClose: () => void;
  request?: RequestDto;
}

function useLocalDateTime(originalIso?: string) {
  const [value, setValue] = useState(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return formatLocalDateTime(originalIso ?? now.toISOString());
  });
  const [chosenIso, setChosenIso] = useState(originalIso ?? '');
  const candidates = useMemo(() => localDateTimeCandidates(value), [value]);
  const chosen = candidates.find(
    (iso) => new Date(iso).getTime() === new Date(chosenIso).getTime(),
  );
  // Preserve the exact persisted value until this field is changed, not just
  // its minute-level local representation. Validation and payload share iso.
  const iso = chosen
    ? chosenIso
    : candidates.length === 1
      ? candidates[0]
      : null;
  return {
    value,
    candidates,
    iso,
    setChosenIso,
    reset: (iso: string) => {
      setValue(formatLocalDateTime(iso));
      setChosenIso(iso);
    },
    change: (next: string) => {
      setValue(next);
      setChosenIso('');
    },
  };
}

function LocalDateTimeField({
  id,
  label,
  time,
}: {
  id: string;
  label: string;
  time: ReturnType<typeof useLocalDateTime>;
}) {
  const { t } = useI18n();
  const ambiguous = time.candidates.length > 1;
  const invalid = !time.iso;
  return (
    <>
      <Input
        id={id}
        type="datetime-local"
        step="0.001"
        value={time.value}
        onChange={(e) => time.change(e.target.value)}
        aria-invalid={invalid}
        aria-describedby={ambiguous || invalid ? `${id}-time-help` : undefined}
      />
      {ambiguous ? (
        <div className="space-y-2">
          <p id={`${id}-time-help`} className="text-xs text-muted-foreground">
            {t('requests.ambiguousTime', {
              zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })}
          </p>
          <Label htmlFor={`${id}-occurrence`}>
            {t('requests.timeOccurrence', { field: label })}
          </Label>
          <select
            id={`${id}-occurrence`}
            value={time.iso ? new Date(time.iso).toISOString() : ''}
            onChange={(e) => time.setChosenIso(e.target.value)}
            aria-invalid={invalid}
            aria-describedby={`${id}-time-help`}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">{t('requests.chooseOccurrence')}</option>
            {time.candidates.map((iso, index) => (
              <option key={iso} value={iso}>
                {t('requests.timeOccurrenceOption', {
                  number: index + 1,
                  offset: utcOffsetLabel(iso),
                })}
              </option>
            ))}
          </select>
        </div>
      ) : invalid ? (
        <p id={`${id}-time-help`} className="text-sm text-destructive">
          {t('requests.nonexistentTime')}
        </p>
      ) : null}
    </>
  );
}

function NewRequestForm({ onClose, request }: NewRequestFormProps) {
  const user = useCurrentUser();
  const { t, enumLabel, languageTag } = useI18n();
  const employeeId = user.id;
  const today = isoDateOnly(new Date());
  const [type, setType] = useState<RequestType>(request?.type ?? 'Vacation');
  const [from, setFrom] = useState(request?.from.slice(0, 10) ?? today);
  const [to, setTo] = useState(request?.to.slice(0, 10) ?? today);
  const fromTime = useLocalDateTime(
    request?.type === 'TimeAdjustment' ? request.from : undefined,
  );
  const toTime = useLocalDateTime(
    request?.type === 'TimeAdjustment' ? request.to : undefined,
  );
  const [adjustmentMode, setAdjustmentMode] = useState(
    request?.targetTimeEntryId ? 'correction' : 'missing',
  );
  // Capture the selected version, not a pointer into a refetchable query.
  // Draft requests always retain their immutable persisted ID and revision.
  const [selectedTarget, setSelectedTarget] =
    useState<TimeAdjustmentTargetDto | null>(null);
  const targetId = request ? request.targetTimeEntryId : selectedTarget?.id;
  const targetRevision = request
    ? request.expectedTargetRevision
    : selectedTarget?.revision;
  const targetBefore = request ? request.targetTimeEntryBefore : selectedTarget;
  const isCorrection =
    type === 'TimeAdjustment' && adjustmentMode === 'correction';
  const targets = useQuery({
    queryKey: ['time-adjustment-targets', employeeId],
    queryFn: () => api.timeAdjustmentTargets(),
    enabled: isCorrection && !request,
  });
  const missingTarget =
    isCorrection &&
    (!targetId || targetRevision == null || !targetBefore?.clockOut);
  const [reason, setReason] = useState(request?.reason ?? '');
  const [substituteId, setSubstituteId] = useState<string>(
    request?.substituteId ?? '',
  );
  const [halfDayStart, setHalfDayStart] = useState(
    request?.halfDayStart ?? false,
  );
  const [halfDayEnd, setHalfDayEnd] = useState(request?.halfDayEnd ?? false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const employees = useQuery({
    queryKey: ['employee-directory'],
    queryFn: () => api.employeeDirectory(),
  });

  const events = useQuery({
    queryKey: ['request-events', request?.id],
    queryFn: () =>
      request ? api.getRequestEvents(request.id) : Promise.resolve([]),
    enabled: !!request,
  });
  const revisionNote =
    request?.decisionNote ??
    events.data
      ?.filter(
        (event) =>
          event.kind === 'Returned' || event.kind === 'SubstituteDeclined',
      )
      .at(-1)?.note;

  const fromDate = useMemo(() => new Date(`${from}T00:00:00.000Z`), [from]);
  const year = fromDate.getUTCFullYear();
  const balance = useQuery({
    queryKey: ['vacation-balance', employeeId, year],
    queryFn: () => api.vacationBalance(employeeId, year),
    enabled: type === 'Vacation',
  });

  const isTimeAdjustment = type === 'TimeAdjustment';

  const unresolvedTime = isTimeAdjustment && (!fromTime.iso || !toTime.iso);
  const invalidRange = isTimeAdjustment
    ? !fromTime.iso ||
      !toTime.iso ||
      new Date(toTime.iso).getTime() <= new Date(fromTime.iso).getTime()
    : new Date(to).getTime() < new Date(from).getTime();

  const create = useMutation({
    mutationFn: async (saveOnly: boolean) => {
      const fromIso = isTimeAdjustment
        ? fromTime.iso
        : new Date(`${from}T00:00:00.000Z`).toISOString();
      const toIso = isTimeAdjustment
        ? toTime.iso
        : new Date(`${to}T00:00:00.000Z`).toISOString();
      if (missingTarget) throw new Error(t('requests.targetRequired'));
      const targetFields =
        isCorrection && targetId && targetRevision != null
          ? {
              targetTimeEntryId: targetId,
              expectedTargetRevision: targetRevision,
            }
          : {};
      if (!fromIso || !toIso || invalidRange) {
        throw new Error(
          t(
            isTimeAdjustment
              ? 'requests.invalidTimeRange'
              : 'requests.invalidDateRange',
          ),
        );
      }
      if (request) {
        const payload = {
          expectedUpdatedAt: request.updatedAt,
          ...(isTimeAdjustment
            ? {
                targetTimeEntryId: request.targetTimeEntryId ?? null,
                expectedTargetRevision: request.expectedTargetRevision ?? null,
              }
            : {}),
          from: fromIso,
          to: toIso,
          reason: reason || null,
          substituteId: type === 'Vacation' ? substituteId || null : null,
          halfDayStart: type === 'Vacation' && halfDayStart,
          halfDayEnd: type === 'Vacation' && halfDayEnd,
        };
        return saveOnly
          ? api.updateDraftRequest(request.id, payload)
          : api.resubmitRequest(request.id, payload);
      }
      if (type === 'Vacation') {
        return api.createVacationRequest({
          employeeId,
          from: fromIso,
          to: toIso,
          substituteId: substituteId || null,
          reason: reason || null,
          halfDayStart,
          halfDayEnd,
        });
      }
      const created = await api.createRequest({
        ...targetFields,
        employeeId,
        type,
        from: fromIso,
        to: toIso,
        reason: reason || null,
      });
      // Belege are scoped to Sonderurlaub server-side — only attempt the
      // upload when the user actually picked one and the type matches.
      if (type === 'SpecialLeave' && attachment) {
        await api.uploadAttachment(created.id, attachment);
      }
      return created;
    },
    onSuccess: () => onClose(),
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('requests.submitFailed')),
  });

  const cancelStaleRequest = useMutation({
    mutationFn: () => {
      if (!request) throw new Error(t('requests.loadFailed'));
      return api.cancelRequest(request.id, user.id);
    },
    onSuccess: onClose,
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('requests.submitFailed')),
  });

  const insufficientVacation =
    type === 'Vacation' &&
    balance.data !== undefined &&
    balance.data.remainingDays < 0.5;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(request ? 'requests.edit' : 'requests.new')}
        </DialogTitle>
        <DialogDescription>{t('requests.chooseTypeRange')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <p className="text-sm font-medium">
          {t('requests.employee')}:{' '}
          {request?.employeeName || `${user.firstName} ${user.lastName}`}
        </p>
        {request && revisionNote && (
          <Alert>
            <AlertDescription>
              {t('requests.revisionReason')}: {revisionNote}
            </AlertDescription>
          </Alert>
        )}
        {request && request.workflowState !== 'Draft' && (
          <Alert variant="destructive">
            <AlertDescription>{t('requests.notDraft')}</AlertDescription>
          </Alert>
        )}
        {request?.type === 'SpecialLeave' && (
          <AttachmentsList requestId={request.id} />
        )}
        <div className="space-y-2">
          <Label htmlFor="type">{t('common.type')}</Label>
          <select
            id="type"
            disabled={!!request}
            value={type}
            onChange={(e) => setType(e.target.value as RequestType)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {enumLabel(t)}
              </option>
            ))}
          </select>
        </div>
        {isTimeAdjustment && (
          <div className="space-y-2">
            <Label htmlFor="adjustment-mode">
              {t('requests.adjustmentMode')}
            </Label>
            <select
              id="adjustment-mode"
              value={adjustmentMode}
              disabled={!!request}
              onChange={(event) => {
                setAdjustmentMode(event.target.value);
                setSelectedTarget(null);
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="missing">{t('requests.missingBooking')}</option>
              <option value="correction">{t('requests.correctBooking')}</option>
            </select>
            {isCorrection && (
              <>
                <Label htmlFor="target-booking">
                  {t('requests.targetBooking')}
                </Label>
                <select
                  id="target-booking"
                  value={targetId ?? ''}
                  disabled={!!request || targets.isPending || targets.isError}
                  onChange={(event) => {
                    const target =
                      targets.data?.find(
                        (entry) => entry.id === event.target.value,
                      ) ?? null;
                    setSelectedTarget(target);
                    if (target?.clockOut) {
                      fromTime.reset(target.clockIn);
                      toTime.reset(target.clockOut);
                    }
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t('requests.chooseTarget')}</option>
                  {request && targetId ? (
                    <option value={targetId}>
                      {t('requests.targetReference', {
                        id: targetId,
                        revision: targetRevision ?? '—',
                      })}
                    </option>
                  ) : (
                    targets.data?.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.id} ·{' '}
                        {correctionInstant(entry.clockIn, languageTag)} –{' '}
                        {entry.clockOut
                          ? correctionInstant(entry.clockOut, languageTag)
                          : ''}
                      </option>
                    ))
                  )}
                </select>
                {!request && targets.isPending && (
                  <p role="status">{t('common.loading')}</p>
                )}
                {!request && targets.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {t('requests.targetsFailed')}
                    </AlertDescription>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void targets.refetch()}
                    >
                      {t('requests.retry')}
                    </Button>
                  </Alert>
                )}
                {!request && targets.isSuccess && targets.data.length === 0 && (
                  <p>{t('requests.targetsEmpty')}</p>
                )}
                {missingTarget && (
                  <p className="text-sm text-muted-foreground">
                    {t('requests.targetRequired')}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="from">{t('common.from')}</Label>
            {isTimeAdjustment ? (
              <LocalDateTimeField
                id="from"
                label={t('common.from')}
                time={fromTime}
              />
            ) : (
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">{t('common.to')}</Label>
            {isTimeAdjustment ? (
              <LocalDateTimeField
                id="to"
                label={t('common.to')}
                time={toTime}
              />
            ) : (
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </div>
        </div>
        {isTimeAdjustment && (!isCorrection || targetId) && (
          <TimeAdjustmentDiff
            request={{
              targetTimeEntryId: isCorrection ? targetId : null,
              expectedTargetRevision: isCorrection ? targetRevision : null,
              targetTimeEntryBefore:
                isCorrection && targetBefore?.clockOut
                  ? {
                      clockIn: targetBefore.clockIn,
                      clockOut: targetBefore.clockOut,
                    }
                  : null,
              from: fromTime.iso,
              to: toTime.iso,
            }}
          />
        )}
        <div className="space-y-2">
          <Label htmlFor="reason">{t('requests.reasonOptional')}</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {type === 'Vacation' && employees.data && (
          <div className="space-y-2">
            <Label htmlFor="substitute">
              {t('requests.substituteOptional')}
            </Label>
            <select
              id="substitute"
              value={substituteId}
              onChange={(e) => setSubstituteId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t('common.none')}</option>
              {employees.data
                .filter((e) => e.id !== employeeId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
            </select>
          </div>
        )}

        {type === 'Vacation' && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={halfDayStart}
                onChange={(e) => setHalfDayStart(e.target.checked)}
              />
              {t('requests.firstHalfDay')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={halfDayEnd}
                onChange={(e) => setHalfDayEnd(e.target.checked)}
              />
              {t('requests.lastHalfDay')}
            </label>
          </div>
        )}

        {type === 'SpecialLeave' && !request && (
          <div className="space-y-2">
            <Label htmlFor="attachment">{t('requests.attachmentLabel')}</Label>
            <Input
              id="attachment"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.docx,.odt"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            />
            {attachment && (
              <p className="text-xs text-muted-foreground">
                {attachment.name} · {Math.round(attachment.size / 1024)} KB
              </p>
            )}
          </div>
        )}

        {type === 'Vacation' && balance.data && (
          <Alert>
            <AlertDescription>
              {t('requests.balanceHint', {
                remaining: balance.data.remainingDays.toFixed(1),
                total: balance.data.totalEntitlement.toFixed(1),
                approved: balance.data.approvedDays.toFixed(1),
                pending: balance.data.pendingDays.toFixed(1),
              })}
            </AlertDescription>
          </Alert>
        )}

        {isTimeAdjustment && (
          <Alert variant="destructive">
            <AlertDescription>
              {t('requests.timeAdjustmentPolicy')}
            </AlertDescription>
          </Alert>
        )}

        {invalidRange && !unresolvedTime && (
          <Alert variant="destructive">
            <AlertDescription>
              {isTimeAdjustment
                ? t('requests.invalidTimeRange')
                : t('requests.invalidDateRange')}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              {isCorrection && request && (
                <div className="mt-2 space-y-2">
                  <p>{t('requests.staleTargetHint')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancelStaleRequest.isPending}
                    onClick={() => cancelStaleRequest.mutate()}
                  >
                    {t('requests.cancelStale')}
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        {request && (
          <Button
            variant="outline"
            disabled={
              create.isPending ||
              invalidRange ||
              missingTarget ||
              request.workflowState !== 'Draft'
            }
            onClick={() => {
              setError(null);
              create.mutate(true);
            }}
          >
            {t('requests.saveDraft')}
          </Button>
        )}
        <Button
          disabled={
            create.isPending ||
            insufficientVacation ||
            invalidRange ||
            missingTarget ||
            (!!request && request.workflowState !== 'Draft')
          }
          onClick={() => {
            setError(null);
            create.mutate(false);
          }}
        >
          {create.isPending
            ? t('common.saving')
            : t(request ? 'requests.resubmit' : 'requests.submit')}
        </Button>
      </DialogFooter>
    </>
  );
}

function AttachmentsList({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const attachments = useQuery({
    queryKey: ['attachments', requestId],
    queryFn: () => api.listAttachments(requestId),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAttachment(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['attachments', requestId] }),
  });
  if (!attachments.data || attachments.data.length === 0) return null;
  return (
    <ul className="mt-2 flex w-full flex-col gap-1 text-xs text-muted-foreground">
      {attachments.data.map((a) => (
        <li key={a.id} className="flex items-center gap-2">
          <button
            type="button"
            className="font-medium text-foreground underline-offset-2 hover:underline"
            onClick={() => api.downloadAttachment(a.id, a.fileName)}
          >
            {a.fileName}
          </button>
          <span>· {Math.round(a.sizeBytes / 1024)} KB</span>
          <button
            type="button"
            className="ml-auto text-destructive hover:underline"
            onClick={() => remove.mutate(a.id)}
            disabled={remove.isPending}
          >
            {t('common.remove')}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Always use the trusted request snapshot, never the latest target entry. */
export function TimeAdjustmentDiff({
  request,
  timeZone,
}: {
  timeZone?: string;
  request: {
    targetTimeEntryId?: string | null;
    expectedTargetRevision?: number | null;
    targetTimeEntryBefore?: { clockIn: string; clockOut: string } | null;
    from: string | null;
    to: string | null;
  };
}) {
  const { t, languageTag } = useI18n();
  const before = request.targetTimeEntryBefore;
  const valid =
    !!request.from &&
    !!request.to &&
    new Date(request.to).getTime() > new Date(request.from).getTime();
  const seconds = (from: string, to: string) =>
    (new Date(to).getTime() - new Date(from).getTime()) / 1000;
  const number = (n: number) =>
    new Intl.NumberFormat(languageTag, {
      maximumFractionDigits: 3,
    }).format(n);
  const range = (from: string, to: string) => (
    <>
      <time dateTime={from} title={from}>
        {correctionInstant(from, languageTag, timeZone)}
      </time>{' '}
      →{' '}
      <time dateTime={to} title={to}>
        {correctionInstant(to, languageTag, timeZone)}
      </time>
    </>
  );
  return (
    <section
      className="space-y-2 rounded-md border p-3 text-sm"
      aria-label={t(
        request.targetTimeEntryId
          ? 'requests.correctBooking'
          : 'requests.missingBooking',
      )}
    >
      <p className="font-medium">
        {t(
          request.targetTimeEntryId
            ? 'requests.correctBooking'
            : 'requests.missingBooking',
        )}
      </p>
      {request.targetTimeEntryId && (
        <>
          <p>
            {t('requests.targetReference', {
              id: request.targetTimeEntryId,
              revision: request.expectedTargetRevision ?? '—',
            })}
          </p>
          <p className="text-muted-foreground">
            {t('requests.correctionHint')}
          </p>
          {before && (
            <p>
              <strong>{t('requests.before')}: </strong>
              {range(before.clockIn, before.clockOut)}
            </p>
          )}
        </>
      )}
      {request.from && request.to && (
        <p>
          <strong>{t('requests.proposed')}: </strong>
          {range(request.from, request.to)}
        </p>
      )}
      {valid &&
        request.from &&
        request.to &&
        (before ? (
          <p>
            {t('requests.grossDuration', {
              before: number(seconds(before.clockIn, before.clockOut)),
              after: number(seconds(request.from, request.to)),
              delta: number(
                seconds(request.from, request.to) -
                  seconds(before.clockIn, before.clockOut),
              ),
            })}
          </p>
        ) : (
          <p>
            {t('requests.grossProposed', {
              duration: number(seconds(request.from, request.to)),
            })}
          </p>
        ))}
    </section>
  );
}

export function RequestTimeEntryAudit({
  requestId,
  timeZone,
}: {
  requestId: string;
  timeZone?: string;
}) {
  const { id: actorId, role: actorRole } = useCurrentUser();
  const { t, formatDateTime } = useI18n();
  const audit = useQuery({
    queryKey: ['request-time-entry-audit', requestId, actorId, actorRole],
    queryFn: () => api.requestTimeEntryAudit(requestId),
  });
  return (
    <section
      className="space-y-2 text-sm"
      aria-label={t('requests.bookingHistory')}
    >
      {audit.isPending && <p role="status">{t('common.loading')}</p>}
      {audit.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('requests.auditFailed')}</AlertDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void audit.refetch()}
          >
            {t('requests.retry')}
          </Button>
        </Alert>
      )}
      {audit.isSuccess && audit.data.length === 0 && (
        <p>{t('requests.auditEmpty')}</p>
      )}
      {audit.data && (
        <ol className="space-y-2">
          {audit.data.map((event) => {
            const before = auditRange(event.before);
            const after = auditRange(event.after);
            return (
              <li key={event.id} className="rounded-md border p-3">
                <p>
                  {t(
                    event.action === 'RequestMissingBookingAdded'
                      ? 'requests.auditMissingAdded'
                      : 'requests.auditApplied',
                    {
                      id: event.timeEntryId,
                      requestId: event.requestId ?? requestId,
                    },
                  )}
                </p>
                <p>
                  {t('requests.appliedBy', {
                    actor:
                      event.actorName ??
                      event.actorId ??
                      t('requests.unknownActor'),
                  })}
                </p>
                <time dateTime={event.occurredAt}>
                  {formatDateTime(event.occurredAt, timeZone)}
                </time>
                {after && (
                  <TimeAdjustmentDiff
                    timeZone={timeZone}
                    request={{
                      targetTimeEntryId: before ? event.timeEntryId : null,
                      expectedTargetRevision: before?.revision,
                      targetTimeEntryBefore: before,
                      from: after.clockIn,
                      to: after.clockOut,
                    }}
                  />
                )}
                {event.reason && <p>{event.reason}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function auditRange(
  value: unknown,
): { clockIn: string; clockOut: string; revision?: number } | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.clockIn === 'string' &&
    typeof snapshot.clockOut === 'string'
    ? {
        clockIn: snapshot.clockIn,
        clockOut: snapshot.clockOut,
        revision:
          typeof snapshot.revision === 'number' ? snapshot.revision : undefined,
      }
    : null;
}
