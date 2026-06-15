import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type RequestDto } from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';

export function SubstitutePage() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const inboxQuery = useQuery({
    queryKey: ['requests', 'substitute-inbox', user.id],
    queryFn: () =>
      api.listRequests({
        substituteId: user.id,
        workflowState: 'PendingSubstitute',
      }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('substitute.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('substitute.description')}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {t('substitute.open', { count: inboxQuery.data?.length ?? 0 })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inboxQuery.data && inboxQuery.data.length > 0 ? (
            <ul className="divide-y text-sm">
              {inboxQuery.data.map((r) => (
                <SubstituteRow key={r.id} request={r} actorId={user.id} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('substitute.none')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SubstituteRow({
  request,
  actorId,
}: {
  request: RequestDto;
  actorId: string;
}) {
  const { t, enumLabel, formatDate } = useI18n();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['requests'] });

  const accept = useMutation({
    mutationFn: () =>
      api.substituteAccept(request.id, actorId, note || undefined),
    onSuccess: refresh,
  });
  const decline = useMutation({
    mutationFn: () =>
      api.substituteDecline(request.id, actorId, note || 'Abgelehnt'),
    onSuccess: refresh,
  });

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {formatDate(request.from)} – {formatDate(request.to)}
          </p>
          <p className="text-xs text-muted-foreground">
            {Number(request.calculatedDays).toFixed(1)} Werktage
            {request.reason ? ` · ${request.reason}` : ''}
          </p>
        </div>
        <Badge variant="secondary">{enumLabel(request.workflowState)}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
        <div className="flex-1">
          <Label htmlFor={`note-${request.id}`} className="text-xs">
            {t('substitute.noteRequired')}
          </Label>
          <Input
            id={`note-${request.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            className="mt-1 h-8 text-sm"
          />
        </div>
        <Button
          size="sm"
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {t('substitute.accept')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={decline.isPending || !note}
          onClick={() => decline.mutate()}
        >
          {t('common.reject')}
        </Button>
      </div>
    </li>
  );
}
