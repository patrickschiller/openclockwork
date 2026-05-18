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
import { api, type RequestType } from '../api/client';
import { useCurrentUser } from '../app/auth';

const TYPES: RequestType[] = ['Vacation', 'HomeOffice', 'SpecialLeave', 'TimeAdjustment'];

const TYPE_LABEL: Record<RequestType, string> = {
  Vacation: 'Urlaub',
  HomeOffice: 'Home-Office',
  SpecialLeave: 'Sonderurlaub',
  TimeAdjustment: 'Zeitkorrektur',
};

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRange(type: RequestType, fromIso: string, toIso: string): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  if (type === 'TimeAdjustment') {
    return `${f.toLocaleString('de-DE')} – ${t.toLocaleString('de-DE')}`;
  }
  return `${f.toLocaleDateString('de-DE')} – ${t.toLocaleDateString('de-DE')}`;
}

function minutesBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

export function RequestsPage() {
  const user = useCurrentUser();
  const employeeId = user.id;
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const requests = useQuery({
    queryKey: ['requests', { employeeId }],
    queryFn: () => api.listRequests({ employeeId }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Anträge</h1>
          <p className="text-sm text-muted-foreground">
            Urlaub, Home-Office, Sonderurlaub, Zeitkorrekturen
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>Neuer Antrag</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <NewRequestForm
              onClose={() => {
                setDialogOpen(false);
                qc.invalidateQueries({ queryKey: ['requests'] });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eigene Anträge</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.data && requests.data.length > 0 ? (
            <ul className="divide-y text-sm">
              {requests.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {TYPE_LABEL[r.type as RequestType]} · {formatRange(r.type as RequestType, r.from, r.to)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.type === 'TimeAdjustment'
                        ? `${minutesBetween(r.from, r.to)} min`
                        : `${Number(r.calculatedDays).toFixed(1)} Werktage`}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.requiresApproval && <Badge variant="destructive">Sondergenehmigung</Badge>}
                    <Badge variant="secondary">{r.workflowState}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Noch keine Anträge.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface NewRequestFormProps {
  onClose: () => void;
}

function isoDateTimeLocalNow(): string {
  const d = new Date();
  // datetime-local needs YYYY-MM-DDTHH:mm in *local* time
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewRequestForm({ onClose }: NewRequestFormProps) {
  const user = useCurrentUser();
  const employeeId = user.id;
  const today = isoDateOnly(new Date());
  const [type, setType] = useState<RequestType>('Vacation');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [fromDt, setFromDt] = useState(isoDateTimeLocalNow);
  const [toDt, setToDt] = useState(isoDateTimeLocalNow);
  const [reason, setReason] = useState('');
  const [substituteId, setSubstituteId] = useState<string>('');
  const [halfDayStart, setHalfDayStart] = useState(false);
  const [halfDayEnd, setHalfDayEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employees = useQuery({ queryKey: ['employees'], queryFn: () => api.employees() });

  const fromDate = useMemo(() => new Date(`${from}T00:00:00.000Z`), [from]);
  const year = fromDate.getUTCFullYear();
  const balance = useQuery({
    queryKey: ['vacation-balance', employeeId, year],
    queryFn: () => api.vacationBalance(employeeId, year),
    enabled: type === 'Vacation',
  });

  const isTimeAdjustment = type === 'TimeAdjustment';

  const isOffHours = useMemo(() => {
    if (!isTimeAdjustment) return false;
    // datetime-local strings are interpreted as local time when passed to Date.
    const f = new Date(fromDt);
    const t = new Date(toDt);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return false;
    if (f.getHours() < 7) return true;
    if (t.getHours() > 23 || (t.getHours() === 23 && t.getMinutes() > 0)) return true;
    if (
      t.getFullYear() !== f.getFullYear() ||
      t.getMonth() !== f.getMonth() ||
      t.getDate() !== f.getDate()
    ) {
      return true; // crosses midnight
    }
    return false;
  }, [isTimeAdjustment, fromDt, toDt]);

  const invalidRange = useMemo(() => {
    if (isTimeAdjustment) return new Date(toDt).getTime() <= new Date(fromDt).getTime();
    return new Date(to).getTime() < new Date(from).getTime();
  }, [isTimeAdjustment, from, to, fromDt, toDt]);

  const create = useMutation({
    mutationFn: () => {
      if (type === 'Vacation') {
        return api.createVacationRequest({
          employeeId,
          from: new Date(`${from}T00:00:00.000Z`).toISOString(),
          to: new Date(`${to}T00:00:00.000Z`).toISOString(),
          substituteId: substituteId || null,
          reason: reason || null,
          halfDayStart,
          halfDayEnd,
        });
      }
      const fromIso = isTimeAdjustment
        ? new Date(fromDt).toISOString()
        : new Date(`${from}T00:00:00.000Z`).toISOString();
      const toIso = isTimeAdjustment
        ? new Date(toDt).toISOString()
        : new Date(`${to}T00:00:00.000Z`).toISOString();
      return api.createRequest({
        employeeId,
        type,
        from: fromIso,
        to: toIso,
        reason: reason || null,
      });
    },
    onSuccess: () => onClose(),
    onError: (e) => setError(e instanceof Error ? e.message : 'Antrag fehlgeschlagen'),
  });

  const insufficientVacation =
    type === 'Vacation' &&
    balance.data !== undefined &&
    balance.data.remainingDays < 1;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Neuer Antrag</DialogTitle>
        <DialogDescription>Wähle Typ und Zeitraum</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="type">Typ</Label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as RequestType)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="from">Von</Label>
            {isTimeAdjustment ? (
              <Input
                id="from"
                type="datetime-local"
                value={fromDt}
                onChange={(e) => setFromDt(e.target.value)}
              />
            ) : (
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">Bis</Label>
            {isTimeAdjustment ? (
              <Input
                id="to"
                type="datetime-local"
                value={toDt}
                onChange={(e) => setToDt(e.target.value)}
              />
            ) : (
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">Begründung (optional)</Label>
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {type === 'Vacation' && employees.data && (
          <div className="space-y-2">
            <Label htmlFor="substitute">Vertretung (optional)</Label>
            <select
              id="substitute"
              value={substituteId}
              onChange={(e) => setSubstituteId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— keine —</option>
              {employees.data
                .filter((e) => e.id !== employeeId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.role})
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
              Erster Tag halb
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={halfDayEnd}
                onChange={(e) => setHalfDayEnd(e.target.checked)}
              />
              Letzter Tag halb
            </label>
          </div>
        )}

        {type === 'Vacation' && balance.data && (
          <Alert>
            <AlertDescription>
              <strong>{balance.data.remainingDays.toFixed(1)} Tage</strong> verfügbar (
              {balance.data.totalEntitlement.toFixed(1)} gesamt − {balance.data.approvedDays.toFixed(1)} genehmigt
              − {balance.data.pendingDays.toFixed(1)} eingereicht).
            </AlertDescription>
          </Alert>
        )}

        {isOffHours && (
          <Alert variant="destructive">
            <AlertDescription>
              Zeit liegt außerhalb der Rahmenarbeitszeit 07:00–23:00.
              Der/die Vorgesetzte muss zuerst die <strong>Sondergenehmigung</strong> für die
              Zeiten außerhalb erteilen, anschließend bestätigt HR die eigentliche
              Zeitkorrektur (zweistufiger Workflow).
            </AlertDescription>
          </Alert>
        )}

        {invalidRange && (
          <Alert variant="destructive">
            <AlertDescription>
              {isTimeAdjustment
                ? '"Bis" muss nach "Von" liegen.'
                : '"Bis" darf nicht vor "Von" liegen.'}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          disabled={create.isPending || insufficientVacation || invalidRange}
          onClick={() => {
            setError(null);
            create.mutate();
          }}
        >
          {create.isPending ? 'Speichere…' : 'Antrag stellen'}
        </Button>
      </DialogFooter>
    </>
  );
}
