import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type RequestDto } from '../api/client';
import { useCurrentUser } from '../app/auth';

export function SubstitutePage() {
  const user = useCurrentUser();
  const inboxQuery = useQuery({
    queryKey: ['requests', 'substitute-inbox', user.id],
    queryFn: () => api.listRequests({ substituteId: user.id, workflowState: 'PendingSubstitute' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Vertretungs-Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Anträge, in denen Du als Vertretung benannt bist
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Offen ({inboxQuery.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {inboxQuery.data && inboxQuery.data.length > 0 ? (
            <ul className="divide-y text-sm">
              {inboxQuery.data.map((r) => (
                <SubstituteRow key={r.id} request={r} actorId={user.id} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aktuell keine Vertretungs-Anfragen.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SubstituteRow({ request, actorId }: { request: RequestDto; actorId: string }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['requests'] });

  const accept = useMutation({
    mutationFn: () => api.substituteAccept(request.id, actorId, note || undefined),
    onSuccess: refresh,
  });
  const decline = useMutation({
    mutationFn: () => api.substituteDecline(request.id, actorId, note || 'Abgelehnt'),
    onSuccess: refresh,
  });

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {new Date(request.from).toLocaleDateString('de-DE')} –{' '}
            {new Date(request.to).toLocaleDateString('de-DE')}
          </p>
          <p className="text-xs text-muted-foreground">
            {Number(request.calculatedDays).toFixed(1)} Werktage
            {request.reason ? ` · ${request.reason}` : ''}
          </p>
        </div>
        <Badge variant="secondary">{request.workflowState}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
        <div className="flex-1">
          <Label htmlFor={`note-${request.id}`} className="text-xs">
            Notiz (Pflicht bei Ablehnung)
          </Label>
          <Input
            id={`note-${request.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            className="mt-1 h-8 text-sm"
          />
        </div>
        <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate()}>
          Annehmen
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={decline.isPending || !note}
          onClick={() => decline.mutate()}
        >
          Ablehnen
        </Button>
      </div>
    </li>
  );
}
