import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type RequestDto } from '../api/client';
import { useCurrentUser } from '../app/auth';

export function AdminRequestsPage() {
  const user = useCurrentUser();
  const isAuthorized = user.role === 'Manager' || user.role === 'HRAdmin';
  const qc = useQueryClient();
  const [drawerId, setDrawerId] = useState<string | null>(null);

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

  if (!isAuthorized) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Diese Seite ist Manager:innen und HR-Admins vorbehalten.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Genehmigungen</h1>
        <p className="text-sm text-muted-foreground">
          {user.role === 'HRAdmin'
            ? 'HR-Inbox: alle Anträge im Status PendingHr'
            : 'Manager-Inbox: Anträge, in denen Du der/die nächste Approver:in bist'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posteingang ({inbox.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {inbox.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine offenen Anträge.</p>
          ) : (
            <RequestList items={inbox} role={user.role} actorId={user.id} onAudit={(id) => setDrawerId(id)} qc={qc} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letzte Aktivität</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestList items={others} role={user.role} actorId={user.id} onAudit={(id) => setDrawerId(id)} qc={qc} />
        </CardContent>
      </Card>

      <Sheet open={!!drawerId} onOpenChange={(open) => !open && setDrawerId(null)}>
        <SheetContent side="right" className="w-full max-w-md sm:w-[480px]">
          {drawerId && <AuditTrail requestId={drawerId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface RequestListProps {
  items: RequestDto[];
  role: 'Employee' | 'Manager' | 'HRAdmin';
  actorId: string;
  onAudit: (id: string) => void;
  qc: ReturnType<typeof useQueryClient>;
}

function RequestList({ items, role, actorId, onAudit, qc }: RequestListProps) {
  return (
    <ul className="divide-y text-sm">
      {items.map((r) => (
        <RequestRow key={r.id} request={r} role={role} actorId={actorId} onAudit={onAudit} qc={qc} />
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
}

function RequestRow({ request, role, actorId, onAudit, qc }: RequestRowProps) {
  const [note, setNote] = useState('');
  const [requiresHr, setRequiresHr] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ['requests'] });

  const approve = useMutation({
    mutationFn: () => api.managerApprove(request.id, actorId, note || undefined, requiresHr),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: () => api.managerReject(request.id, actorId, note || undefined),
    onSuccess: refresh,
  });
  const returnIt = useMutation({
    mutationFn: () => api.returnRequest(request.id, actorId, note || 'Bitte überarbeiten'),
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
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {request.type} · {new Date(request.from).toLocaleDateString('de-DE')} –{' '}
            {new Date(request.to).toLocaleDateString('de-DE')}
          </p>
          <p className="text-xs text-muted-foreground">
            {Number(request.calculatedDays).toFixed(1)} Werktage
            {request.reason ? ` · ${request.reason}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {request.requiresApproval && <Badge variant="destructive">Sondergenehmigung</Badge>}
          <Badge variant="secondary">{request.workflowState}</Badge>
          <Button variant="ghost" size="sm" onClick={() => onAudit(request.id)}>
            Verlauf
          </Button>
        </div>
      </div>

      {((role === 'Manager' && inManagerInbox) || (role === 'HRAdmin' && (inHrInbox || inManagerInbox))) && (
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {inManagerInbox && (
              <>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={requiresHr}
                    onChange={(e) => setRequiresHr(e.target.checked)}
                  />
                  HR-Bestätigung erforderlich
                </label>
                <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
                  Genehmigen
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={reject.isPending}
                  onClick={() => reject.mutate()}
                >
                  Ablehnen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={returnIt.isPending}
                  onClick={() => returnIt.mutate()}
                >
                  Zur Korrektur
                </Button>
              </>
            )}
            {role === 'HRAdmin' && inHrInbox && (
              <>
                <Button size="sm" disabled={hrConfirm.isPending} onClick={() => hrConfirm.mutate()}>
                  HR-bestätigen
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={hrReject.isPending}
                  onClick={() => hrReject.mutate()}
                >
                  HR-ablehnen
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
            ? `${requestQuery.data.type} · ${new Date(requestQuery.data.from).toLocaleDateString('de-DE')} – ${new Date(requestQuery.data.to).toLocaleDateString('de-DE')}`
            : '…'}
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4">
        {eventsQuery.data && eventsQuery.data.length > 0 ? (
          <ol className="space-y-3 text-sm">
            {eventsQuery.data.map((ev) => (
              <li key={ev.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{ev.kind}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ev.at).toLocaleString('de-DE')}
                  </span>
                </div>
                {ev.note && <p className="mt-1 text-xs text-muted-foreground">{ev.note}</p>}
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
