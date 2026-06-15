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
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type BulkResult, type RequestDto } from '../api/client';
import { useCurrentUser } from '../app/auth';
import { cn } from '@/lib/utils';
import { useI18n } from '../app/i18n';

type BulkDialog =
  | { mode: 'approve'; ids: string[] }
  | { mode: 'reject'; ids: string[] }
  | null;

export function AdminRequestsPage() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const isAuthorized = user.role === 'Manager' || user.role === 'HRAdmin';
  const qc = useQueryClient();
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<BulkDialog>(null);
  const [bulkOutcome, setBulkOutcome] = useState<BulkResult[] | null>(null);

  const inboxQuery = useQuery({
    queryKey: ['requests', 'admin-inbox', user.id],
    queryFn: () =>
      api.listRequests(
        user.role === 'HRAdmin'
          ? { workflowState: 'PendingHr' }
          : { currentApproverId: user.id },
      ),
    enabled: isAuthorized,
  });

  const allQuery = useQuery({
    queryKey: ['requests', 'admin-all'],
    queryFn: () => api.listRequests({}),
    enabled: isAuthorized,
  });

  const inbox = useMemo(() => inboxQuery.data ?? [], [inboxQuery.data]);
  const all = useMemo(() => allQuery.data ?? [], [allQuery.data]);
  const others = useMemo(
    () => all.filter((r) => !inbox.some((i) => i.id === r.id)).slice(0, 20),
    [all, inbox],
  );

  // Drop selections that are no longer in the inbox (e.g. after a refresh).
  const inboxIds = useMemo(() => new Set(inbox.map((r) => r.id)), [inbox]);
  const cleanedSelected = useMemo(() => {
    const out = new Set<string>();
    selected.forEach((id) => {
      if (inboxIds.has(id)) out.add(id);
    });
    return out;
  }, [selected, inboxIds]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(inbox.map((r) => r.id)));
  const clear = () => setSelected(new Set());

  if (!isAuthorized) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('approvals.restricted')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('approvals.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {user.role === 'HRAdmin'
            ? t('approvals.hrInbox')
            : t('approvals.managerInbox')}
        </p>
      </div>

      {bulkOutcome && (
        <BulkResultBanner
          results={bulkOutcome}
          onDismiss={() => setBulkOutcome(null)}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{t('approvals.inbox', { count: inbox.length })}</CardTitle>
          {inbox.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {t('approvals.selectAll')}
              </Button>
              {cleanedSelected.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  {t('approvals.clearSelection')}
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {inbox.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('approvals.noOpen')}
            </p>
          ) : (
            <RequestList
              items={inbox}
              role={user.role}
              actorId={user.id}
              onAudit={(id) => setDrawerId(id)}
              qc={qc}
              selectable
              selected={cleanedSelected}
              onToggle={toggle}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('approvals.lastActivity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestList
            items={others}
            role={user.role}
            actorId={user.id}
            onAudit={(id) => setDrawerId(id)}
            qc={qc}
            selectable={false}
            selected={cleanedSelected}
            onToggle={toggle}
          />
        </CardContent>
      </Card>

      <Sheet
        open={!!drawerId}
        onOpenChange={(open) => !open && setDrawerId(null)}
      >
        <SheetContent side="right" className="w-full max-w-md sm:w-[480px]">
          {drawerId && <AuditTrail requestId={drawerId} />}
        </SheetContent>
      </Sheet>

      {cleanedSelected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-card/95 px-4 py-3 backdrop-blur md:left-64">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {t('approvals.selected', { count: cleanedSelected.size })}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={clear}>
                Aufheben
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  setBulkDialog({
                    mode: 'reject',
                    ids: Array.from(cleanedSelected),
                  })
                }
              >
                {t('common.reject')}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  setBulkDialog({
                    mode: 'approve',
                    ids: Array.from(cleanedSelected),
                  })
                }
              >
                {t('common.approve')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {bulkDialog && (
        <BulkConfirmDialog
          state={bulkDialog}
          actorId={user.id}
          onClose={() => setBulkDialog(null)}
          onDone={(results) => {
            setBulkOutcome(results);
            setBulkDialog(null);
            clear();
            qc.invalidateQueries({ queryKey: ['requests'] });
          }}
        />
      )}
    </div>
  );
}

function BulkResultBanner({
  results,
  onDismiss,
}: {
  results: BulkResult[];
  onDismiss: () => void;
}) {
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const failures = results.filter((r) => !r.ok);
  return (
    <Alert variant={fail > 0 ? 'destructive' : 'default'}>
      <AlertDescription className="space-y-2">
        <div className="flex items-center justify-between">
          <span>
            {ok} erfolgreich, {fail} fehlgeschlagen.
          </span>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            ✕
          </Button>
        </div>
        {failures.length > 0 && (
          <ul className="ml-4 list-disc text-xs">
            {failures.map((f) => (
              <li key={f.id}>
                <code className="font-mono">{f.id.slice(0, 8)}…</code> —{' '}
                {f.error}
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

interface BulkConfirmDialogProps {
  state: NonNullable<BulkDialog>;
  actorId: string;
  onClose: () => void;
  onDone: (results: BulkResult[]) => void;
}

function BulkConfirmDialog({
  state,
  actorId,
  onClose,
  onDone,
}: BulkConfirmDialogProps) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const [requiresHr, setRequiresHr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => {
      if (state.mode === 'approve') {
        return api.bulkApproveRequests(
          actorId,
          state.ids,
          note || undefined,
          requiresHr,
        );
      }
      return api.bulkRejectRequests(actorId, state.ids, note);
    },
    onSuccess: onDone,
    onError: (e) =>
      setError(e instanceof Error ? e.message : 'Bulk-Aktion fehlgeschlagen'),
  });

  const isApprove = state.mode === 'approve';
  const noteRequired = !isApprove;
  const valid = !noteRequired || note.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isApprove
              ? t('approvals.approveRequests')
              : t('approvals.rejectRequests')}{' '}
            ({state.ids.length})
          </DialogTitle>
          <DialogDescription>
            {isApprove
              ? t('approvals.approveDescription')
              : t('approvals.rejectDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="bulk-note" className="text-xs">
              Notiz{' '}
              {noteRequired && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="bulk-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isApprove
                  ? 'optional'
                  : 'z. B. „Bitte als TimeAdjustment einreichen"'
              }
            />
          </div>
          {isApprove && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={requiresHr}
                onChange={(e) => setRequiresHr(e.target.checked)}
              />
              {t('approvals.hrRequired')}
            </label>
          )}
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
            variant={isApprove ? 'default' : 'destructive'}
            disabled={!valid || submit.isPending}
            onClick={() => {
              setError(null);
              submit.mutate();
            }}
          >
            {submit.isPending
              ? 'Verarbeite…'
              : isApprove
                ? `${state.ids.length} genehmigen`
                : `${state.ids.length} ablehnen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RequestListProps {
  items: RequestDto[];
  role: 'Employee' | 'Manager' | 'HRAdmin';
  actorId: string;
  onAudit: (id: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  selectable: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function RequestList({
  items,
  role,
  actorId,
  onAudit,
  qc,
  selectable,
  selected,
  onToggle,
}: RequestListProps) {
  return (
    <ul className="divide-y text-sm">
      {items.map((r) => (
        <RequestRow
          key={r.id}
          request={r}
          role={role}
          actorId={actorId}
          onAudit={onAudit}
          qc={qc}
          selectable={selectable}
          isSelected={selected.has(r.id)}
          onToggle={() => onToggle(r.id)}
        />
      ))}
    </ul>
  );
}

interface RequestRowProps {
  request: RequestDto;
  role: 'Employee' | 'Manager' | 'HRAdmin';
  actorId: string;
  onAudit: (id: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  selectable: boolean;
  isSelected: boolean;
  onToggle: () => void;
}

function RequestRow({
  request,
  role,
  actorId,
  onAudit,
  qc,
  selectable,
  isSelected,
  onToggle,
}: RequestRowProps) {
  const { t, enumLabel, formatDate, formatDateTime } = useI18n();
  const [note, setNote] = useState('');
  const [requiresHr, setRequiresHr] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ['requests'] });

  const forcedHr =
    request.type === 'TimeAdjustment' && request.requiresApproval;
  const hrChecked = forcedHr || requiresHr;
  const isTimeAdjustment = request.type === 'TimeAdjustment';

  const approve = useMutation({
    mutationFn: () =>
      api.managerApprove(request.id, actorId, note || undefined, hrChecked),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: () => api.managerReject(request.id, actorId, note || undefined),
    onSuccess: refresh,
  });
  const returnIt = useMutation({
    mutationFn: () =>
      api.returnRequest(request.id, actorId, note || 'Bitte überarbeiten'),
    onSuccess: refresh,
  });
  const hrConfirm = useMutation({
    mutationFn: () => api.hrConfirm(request.id, actorId, note || undefined),
    onSuccess: refresh,
  });
  const hrReject = useMutation({
    mutationFn: () => api.hrReject(request.id, actorId, note || 'Abgelehnt'),
    onSuccess: refresh,
  });

  const inHrInbox = request.workflowState === 'PendingHr';
  const inManagerInbox = request.workflowState === 'PendingManager';

  return (
    <li
      className={cn(
        'space-y-2 py-3',
        isSelected && 'bg-accent/40 -mx-3 px-3 rounded',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              aria-label={t('approvals.selectRequest')}
              className="mt-1 h-4 w-4"
            />
          )}
          <div>
            <p className="font-medium">
              {enumLabel(request.type)} ·{' '}
              {isTimeAdjustment
                ? `${formatDateTime(request.from)} – ${formatDateTime(request.to)}`
                : `${formatDate(request.from)} – ${formatDate(request.to)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {isTimeAdjustment
                ? `${Math.max(0, Math.round((new Date(request.to).getTime() - new Date(request.from).getTime()) / 60_000))} min`
                : `${Number(request.calculatedDays).toFixed(1)} Werktage`}
              {request.reason ? ` · ${request.reason}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {request.requiresApproval && (
            <Badge variant="destructive">{t('requests.specialApproval')}</Badge>
          )}
          <Badge variant="secondary">{enumLabel(request.workflowState)}</Badge>
          <Button variant="ghost" size="sm" onClick={() => onAudit(request.id)}>
            {t('approvals.history')}
          </Button>
        </div>
      </div>

      {((role === 'Manager' && inManagerInbox) ||
        (role === 'HRAdmin' && (inHrInbox || inManagerInbox))) && (
        <div className="rounded-md border bg-muted/30 p-3">
          <Label htmlFor={`note-${request.id}`} className="text-xs">
            Notiz
          </Label>
          <Input
            id={`note-${request.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            className="mt-1 h-8 text-sm"
          />
          {forcedHr && inManagerInbox && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('approvals.outsideFrame')}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {inManagerInbox && (
              <>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={hrChecked}
                    disabled={forcedHr}
                    onChange={(e) => setRequiresHr(e.target.checked)}
                  />
                  {t('approvals.hrRequired')}
                </label>
                <Button
                  size="sm"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate()}
                >
                  {t('common.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={reject.isPending}
                  onClick={() => reject.mutate()}
                >
                  {t('common.reject')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={returnIt.isPending}
                  onClick={() => returnIt.mutate()}
                >
                  {t('approvals.return')}
                </Button>
              </>
            )}
            {role === 'HRAdmin' && inHrInbox && (
              <>
                <Button
                  size="sm"
                  disabled={hrConfirm.isPending}
                  onClick={() => hrConfirm.mutate()}
                >
                  {t('approvals.hrConfirm')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={hrReject.isPending}
                  onClick={() => hrReject.mutate()}
                >
                  {t('common.reject')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function AuditTrail({ requestId }: { requestId: string }) {
  const { enumLabel, formatDate } = useI18n();
  const requestQuery = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => api.getRequest(requestId),
  });
  const eventsQuery = useQuery({
    queryKey: ['request-events', requestId],
    queryFn: () => api.getRequestEvents(requestId),
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>Audit-Verlauf</SheetTitle>
        <SheetDescription>
          {requestQuery.data
            ? `${enumLabel(requestQuery.data.type)} · ${formatDate(requestQuery.data.from)} – ${formatDate(requestQuery.data.to)}`
            : '…'}
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4">
        {eventsQuery.data && eventsQuery.data.length > 0 ? (
          <ol className="space-y-3 text-sm">
            {eventsQuery.data.map((ev) => (
              <li key={ev.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{enumLabel(ev.kind)}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ev.at).toLocaleString('de-DE')}
                  </span>
                </div>
                {ev.note && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ev.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Keine Events.</p>
        )}
      </div>
    </>
  );
}
