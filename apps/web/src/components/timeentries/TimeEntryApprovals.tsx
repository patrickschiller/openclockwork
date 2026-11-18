import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  api,
  type TimeEntryApprovalDecision,
  type TimeEntryApprovalDto,
} from '../../api/client';
import { useCurrentUser } from '../../app/auth';
import { useI18n } from '../../app/i18n';

/** All lists and downstream totals must reflect decisions and edited entries. */
export async function refreshTimeEntryApprovals(
  qc: ReturnType<typeof useQueryClient>,
) {
  await Promise.all(
    [
      'time-entry-approvals',
      'time-entry-approval-history',
      'time-entries',
      'account',
      'violations',
      'working-time-report',
      'project-report',
      'team-cockpit',
      'requests',
      'time-adjustment-targets',
    ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
  );
}

export function TimeEntryApprovals({
  scope,
  pendingOnly = false,
  timeZone,
}: {
  scope: 'own' | 'review';
  pendingOnly?: boolean;
  timeZone?: string;
}) {
  const user = useCurrentUser();
  const { t } = useI18n();
  const allowed =
    scope === 'own' || user.role === 'Manager' || user.role === 'HRAdmin';
  const query = useQuery({
    queryKey: ['time-entry-approvals', scope, user.id, user.role],
    queryFn: () => api.timeEntryApprovals(scope),
    enabled: allowed,
    refetchInterval: pendingOnly ? 30_000 : false,
  });
  const approvals = query.data?.filter(
    (item) =>
      !pendingOnly ||
      ['Open', 'BlockedManager', 'PendingManager', 'PendingHr'].includes(
        item.state,
      ),
  );
  if (!allowed) return null;

  return (
    <Card id="time-entry-approvals">
      <CardHeader>
        <CardTitle>
          {t(
            scope === 'own' ? 'frameApproval.ownTitle' : 'frameApproval.title',
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('frameApproval.chain')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('frameApproval.managerChanged')}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending && <p role="status">{t('common.loading')}</p>}
        {query.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {t('frameApproval.loadFailed')}{' '}
              {query.error instanceof Error ? query.error.message : ''}
            </AlertDescription>
          </Alert>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t('frameApproval.refresh')}
        </Button>
        {query.isSuccess && approvals?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('frameApproval.empty')}
          </p>
        )}
        {approvals && approvals.length > 0 && (
          <ul className="divide-y">
            {approvals.map((approval) => (
              <TimeEntryApprovalRow
                key={approval.entry.id}
                approval={approval}
                scope={scope}
                refreshOnError={pendingOnly}
                timeZone={timeZone}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TimeEntryApprovalRow({
  approval,
  scope,
  refreshOnError,
  timeZone,
}: {
  approval: TimeEntryApprovalDto;
  scope: 'own' | 'review';
  refreshOnError: boolean;
  timeZone?: string;
}) {
  const user = useCurrentUser();
  const { t, formatDateTime } = useI18n();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const decisionLock = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { entry, state } = approval;
  const stage =
    state === 'PendingManager'
      ? 'Manager'
      : state === 'PendingHr'
        ? 'HR'
        : null;
  // canDecide is server-authoritative; also guard role, stage and self-approval.
  const canDecide =
    scope === 'review' &&
    approval.canDecide &&
    entry.employeeId !== user.id &&
    !!entry.clockOut &&
    ((stage === 'Manager' &&
      user.role === 'Manager' &&
      approval.managerId === user.id) ||
      (stage === 'HR' && user.role === 'HRAdmin'));
  const decision = useMutation({
    mutationFn: (outcome: TimeEntryApprovalDecision['outcome']) => {
      // Do not allow a stale UI event to bypass the currently displayed stage.
      if (!canDecide || !stage) throw new Error(t('frameApproval.notAllowed'));
      if (outcome === 'Reject' && !note.trim()) {
        throw new Error(t('frameApproval.reasonRequired'));
      }
      return api.decideTimeEntryApproval(entry.id, {
        revision: approval.revision,
        stage,
        outcome,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    },
    onError: () => (refreshOnError ? refreshTimeEntryApprovals(qc) : undefined),
    onSettled: () => {
      decisionLock.current = false;
    },
    onSuccess: async (_updated, outcome) => {
      setResult(
        t(
          outcome === 'Reject'
            ? 'frameApproval.rejectedResult'
            : stage === 'Manager'
              ? 'frameApproval.managerResult'
              : 'frameApproval.hrResult',
        ),
      );
      setNote('');
      await refreshTimeEntryApprovals(qc);
    },
  });
  const labelId = `frame-approval-${entry.id}`;

  return (
    <li
      className="space-y-3 py-4"
      aria-labelledby={labelId}
      data-entry-id={entry.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p id={labelId} className="font-medium">
            {approval.employeeName} · {formatDateTime(entry.clockIn, timeZone)}{' '}
            –{' '}
            {entry.clockOut
              ? formatDateTime(entry.clockOut, timeZone)
              : t('booking.open')}
          </p>
          {entry.summary && (
            <p className="text-sm text-muted-foreground">
              {t('booking.summary', {
                gross: `${entry.summary.grossMinutes}min`,
                break: entry.summary.breakMinutes,
                net: `${entry.summary.netMinutes}min`,
              })}
            </p>
          )}
          {entry.projectCode && (
            <p className="text-sm text-muted-foreground">
              {entry.projectCode}
              {entry.serviceOrderNo ? ` · ${entry.serviceOrderNo}` : ''}
            </p>
          )}
          {entry.activity && <p className="text-sm">{entry.activity}</p>}
        </div>
        <Badge variant={state === 'Rejected' ? 'destructive' : 'secondary'}>
          {t(`frameApproval.state.${state}`)}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(`frameApproval.help.${state}`, {
          manager: approval.managerName ?? t('frameApproval.assignedManager'),
        })}
      </p>
      {result && (
        <p role="status" className="text-sm">
          {result}
        </p>
      )}
      {decision.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('frameApproval.decisionFailed')}{' '}
            {decision.error instanceof Error ? decision.error.message : ''}{' '}
            {t('frameApproval.refreshHint')}
          </AlertDescription>
        </Alert>
      )}
      {canDecide && (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor={`frame-note-${entry.id}`}>
            {t('frameApproval.note')}
          </Label>
          <Input
            id={`frame-note-${entry.id}`}
            value={note}
            disabled={decision.isPending}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t('frameApproval.reasonRequired')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={decision.isPending}
              onClick={() => {
                if (decisionLock.current) return;
                decisionLock.current = true;
                setResult(null);
                decision.mutate('Approve');
              }}
            >
              {t(`frameApproval.approve.${stage}`)}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={decision.isPending || !note.trim()}
              onClick={() => {
                if (decisionLock.current) return;
                decisionLock.current = true;
                setResult(null);
                decision.mutate('Reject');
              }}
            >
              {t(`frameApproval.reject.${stage}`)}
            </Button>
          </div>
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={historyOpen}
        aria-controls={`frame-history-${entry.id}`}
        onClick={() => setHistoryOpen((open) => !open)}
      >
        {t('frameApproval.history')}
      </Button>
      {historyOpen && (
        <ApprovalHistory entryId={entry.id} timeZone={timeZone} />
      )}
    </li>
  );
}

export function ApprovalHistory({
  entryId,
  timeZone,
}: {
  entryId: string;
  timeZone?: string;
}) {
  const user = useCurrentUser();
  const { t, formatDateTime } = useI18n();
  const history = useQuery({
    queryKey: ['time-entry-approval-history', entryId, user.id, user.role],
    queryFn: () => api.timeEntryApprovalHistory(entryId),
  });
  return (
    <div
      id={`frame-history-${entryId}`}
      className="rounded-md border p-3 text-sm"
    >
      {history.isPending && <p role="status">{t('common.loading')}</p>}
      {history.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('frameApproval.historyFailed')}{' '}
            {history.error instanceof Error ? history.error.message : ''}
          </AlertDescription>
        </Alert>
      )}
      {history.isSuccess && history.data.length === 0 && (
        <p>{t('frameApproval.noHistory')}</p>
      )}
      {history.data && (
        <ol className="space-y-3">
          {history.data.map((event) => (
            <li key={event.id}>
              <p className="font-medium">
                {t(`frameApproval.event.${event.action}`)}
              </p>
              <p className="text-muted-foreground">
                {event.actorName ?? event.actorId ?? t('frameApproval.system')}{' '}
                ·{' '}
                <time dateTime={event.occurredAt}>
                  {formatDateTime(event.occurredAt, timeZone)}
                </time>
              </p>
              {event.requestId && (
                <p>{t('requests.relatedRequest', { id: event.requestId })}</p>
              )}
              {event.reason && (
                <p className="whitespace-pre-wrap">{event.reason}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {history.isError && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void history.refetch()}
        >
          {t('frameApproval.refresh')}
        </Button>
      )}
    </div>
  );
}
