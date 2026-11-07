import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RequestDto, type EmployeeRole } from '../../api/client';
import { useCurrentUser } from '../../app/auth';
import { useI18n } from '../../app/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { TimeEntryApprovals } from '../timeentries/TimeEntryApprovals';
import { TimeAdjustmentDiff } from '../../routes/RequestsPage';
import { AuditTrail } from '../../routes/AdminRequestsPage';
import { refreshTeamCockpit } from './cache';

export function canReviewCorrection(
  request: RequestDto,
  actorId: string,
  role: EmployeeRole,
) {
  return (
    request.employeeId !== actorId &&
    ((role === 'Manager' &&
      request.workflowState === 'PendingManager' &&
      request.currentApproverId === actorId) ||
      (role === 'HRAdmin' && request.workflowState === 'PendingHr'))
  );
}

export function CockpitApprovals({ timeZone }: { timeZone?: string }) {
  const user = useCurrentUser();
  const { t } = useI18n();
  const [auditId, setAuditId] = useState<string | null>(null);
  const requests = useQuery({
    queryKey: ['team-cockpit', user.id, user.role, 'approval-requests'],
    queryFn: () => api.teamCockpitApprovalRequests(),
    refetchInterval: 30_000,
  });
  return (
    <section className="space-y-4" aria-label={t('cockpit.approvals')}>
      <h2 className="text-xl font-semibold">{t('cockpit.approvals')}</h2>
      <TimeEntryApprovals scope="review" pendingOnly timeZone={timeZone} />
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold">{t('cockpit.corrections')}</h3>
        {requests.isPending && <p role="status">{t('common.loading')}</p>}
        {requests.isError && (
          <p role="alert">
            {t('cockpit.loadFailed')}{' '}
            {requests.error instanceof Error ? requests.error.message : ''}
          </p>
        )}
        <Button
          variant="outline"
          disabled={requests.isFetching}
          onClick={() => void requests.refetch()}
        >
          {t('frameApproval.refresh')}
        </Button>
        {requests.data?.length === 0 && <p>{t('cockpit.noApprovals')}</p>}
        <ul className="divide-y">
          {requests.data?.map((request) => (
            <CorrectionRow
              key={request.id}
              request={request}
              onAudit={() => setAuditId(request.id)}
              stale={requests.isError}
              timeZone={timeZone}
            />
          ))}
        </ul>
      </div>
      <Sheet
        open={!!auditId}
        onOpenChange={(open) => !open && setAuditId(null)}
      >
        <SheetContent className="overflow-y-auto">
          {auditId && <AuditTrail requestId={auditId} timeZone={timeZone} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function CorrectionRow({
  request,
  onAudit,
  stale,
  timeZone,
}: {
  request: RequestDto;
  onAudit: () => void;
  stale: boolean;
  timeZone?: string;
}) {
  const user = useCurrentUser();
  const { t, enumLabel, formatDateTime } = useI18n();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [result, setResult] = useState(false);
  const lock = useRef(false);
  const allowed = !stale && canReviewCorrection(request, user.id, user.role);
  const decision = useMutation({
    mutationFn: async (approve: boolean) => {
      if (!allowed || (!approve && !note.trim()))
        throw new Error(t('cockpit.notAllowed'));
      if (user.role === 'HRAdmin')
        return approve
          ? api.hrConfirm(
              request.id,
              user.id,
              note.trim() || undefined,
              request.updatedAt,
            )
          : api.hrReject(request.id, user.id, note.trim(), request.updatedAt);
      return approve
        ? api.managerApprove(
            request.id,
            user.id,
            note.trim() || undefined,
            request.requiresApproval,
            request.updatedAt,
          )
        : api.managerReject(
            request.id,
            user.id,
            note.trim(),
            request.updatedAt,
          );
    },
    onSuccess: () => {
      setResult(true);
      setNote('');
    },
    onSettled: async () => {
      await refreshTeamCockpit(qc);
      lock.current = false;
    },
  });
  const submit = (approve: boolean) => {
    if (lock.current || !allowed) return;
    lock.current = true;
    setResult(false);
    decision.mutate(approve);
  };
  return (
    <li className="space-y-3 py-4" data-request-id={request.id}>
      <p className="font-medium">
        {request.employeeName} · {enumLabel(request.type)}
      </p>
      <p>
        {formatDateTime(request.from, timeZone)} –{' '}
        {formatDateTime(request.to, timeZone)}
      </p>
      <Badge variant="secondary">{enumLabel(request.workflowState)}</Badge>
      {request.reason && (
        <p className="whitespace-pre-wrap">{request.reason}</p>
      )}
      {request.type === 'TimeAdjustment' && (
        <TimeAdjustmentDiff request={request} timeZone={timeZone} />
      )}
      {!allowed && (
        <p>
          {t(
            request.workflowState === 'PendingManager' &&
              !request.currentApproverId
              ? 'cockpit.blockedManager'
              : 'cockpit.waiting',
          )}
        </p>
      )}
      {decision.isError && (
        <p role="alert">
          {t('cockpit.decisionFailed')}{' '}
          {decision.error instanceof Error ? decision.error.message : ''}
        </p>
      )}
      {result && <p role="status">{t('cockpit.decisionSaved')}</p>}
      {allowed && (
        <div className="space-y-2">
          <Label htmlFor={`correction-note-${request.id}`}>
            {t('frameApproval.note')}
          </Label>
          <Input
            id={`correction-note-${request.id}`}
            value={note}
            maxLength={2000}
            disabled={decision.isPending}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex gap-2">
            <Button disabled={decision.isPending} onClick={() => submit(true)}>
              {t(
                user.role === 'HRAdmin'
                  ? 'approvals.hrConfirm'
                  : 'common.approve',
              )}
            </Button>
            <Button
              variant="destructive"
              disabled={decision.isPending || !note.trim()}
              onClick={() => submit(false)}
            >
              {t('common.reject')}
            </Button>
          </div>
        </div>
      )}
      <Button variant="ghost" onClick={onAudit}>
        {t('approvals.history')}
      </Button>
    </li>
  );
}
