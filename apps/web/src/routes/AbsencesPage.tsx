import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { api, type AbsenceKind, type EmployeeDto } from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';

const KIND_OPTIONS: AbsenceKind[] = ['Sickness', 'Training', 'Flextime'];

const KIND_BADGE: Record<AbsenceKind, 'destructive' | 'secondary' | 'outline'> =
  {
    Sickness: 'destructive',
    Training: 'secondary',
    Flextime: 'outline',
  };

export function toLocalDateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoToday(): string {
  return toLocalDateInputValue(new Date());
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function AbsencesPage() {
  const user = useCurrentUser();
  const { t, enumLabel, formatDate } = useI18n();
  const canManageOthers = user.role === 'Manager' || user.role === 'HRAdmin';
  const qc = useQueryClient();

  const [employeeFilter, setEmployeeFilter] = useState<string>(user.id);
  const [createOpen, setCreateOpen] = useState(false);

  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees(),
    enabled: canManageOthers,
  });

  const absences = useQuery({
    queryKey: ['absences', employeeFilter],
    queryFn: () => api.absences({ employeeId: employeeFilter || undefined }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAbsence(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['absences'] }),
  });

  const employeeName = (id: string) => {
    const e = (employees.data ?? []).find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : '';
  };

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t('absences.title')}
          </h1>
          <p className="break-words text-sm text-muted-foreground">
            {t('absences.description')}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="w-full shrink-0 sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> {t('absences.create')}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
            <NewAbsenceForm
              defaultEmployeeId={user.id}
              employees={employees.data ?? []}
              canPickOther={canManageOthers}
              onClose={() => {
                setCreateOpen(false);
                qc.invalidateQueries({ queryKey: ['absences'] });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {canManageOthers && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">{t('absences.show')}</CardTitle>
            <CardDescription>{t('absences.employeeHint')}</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <Label htmlFor="absence-employee-filter" className="sr-only">
              {t('absences.employeeFilter')}
            </Label>
            <select
              id="absence-employee-filter"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('common.all')}</option>
              {employees.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({enumLabel(e.role)})
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>
            {t('absences.entries', { count: absences.data?.length ?? 0 })}
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {absences.data && absences.data.length > 0 ? (
            <ul className="divide-y text-sm">
              {absences.data.map((a) => (
                <li
                  key={a.id}
                  className="flex min-w-0 flex-col items-stretch gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                      <Badge variant={KIND_BADGE[a.kind]}>
                        {enumLabel(a.kind)}
                      </Badge>
                      <span>
                        {formatDate(a.from)} – {formatDate(a.to)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {daysBetween(a.from, a.to)} {t('common.calendarDays')}
                      </span>
                    </div>
                    <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {canManageOthers && a.employeeId !== user.id && (
                        <span>{employeeName(a.employeeId)} · </span>
                      )}
                      {a.note ?? <em>{t('absences.noNote')}</em>}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 self-end sm:self-auto">
                    {a.kind === 'Sickness' && a.certified && (
                      <Badge variant="secondary">
                        {t('absences.certificateProvided')}
                      </Badge>
                    )}
                    {a.kind === 'Sickness' && !a.certified && (
                      <Badge variant="outline">
                        {t('absences.withoutCertificate')}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('common.delete')}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(t('absences.deleteConfirm'))) {
                          remove.mutate(a.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('absences.none')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface NewAbsenceFormProps {
  defaultEmployeeId: string;
  employees: EmployeeDto[];
  canPickOther: boolean;
  onClose: () => void;
}

function NewAbsenceForm({
  defaultEmployeeId,
  employees,
  canPickOther,
  onClose,
}: NewAbsenceFormProps) {
  const { t, enumLabel } = useI18n();
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [kind, setKind] = useState<AbsenceKind>('Sickness');
  const [from, setFrom] = useState(isoToday);
  const [to, setTo] = useState(isoToday);
  const [certified, setCertified] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const valid = !!employeeId && from <= to;

  const create = useMutation({
    mutationFn: () =>
      api.createAbsence({
        employeeId,
        kind,
        from: new Date(from + 'T00:00:00.000Z').toISOString(),
        to: new Date(to + 'T00:00:00.000Z').toISOString(),
        certified: kind === 'Sickness' ? certified : false,
        note: note || null,
      }),
    onSuccess: onClose,
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('common.saveFailed')),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('absences.create')}</DialogTitle>
        <DialogDescription>{t('absences.editorDescription')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {canPickOther && (
          <div className="space-y-2">
            <Label htmlFor="emp">{t('common.employee')}</Label>
            <select
              id="emp"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({enumLabel(e.role)})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="kind">{t('common.type')}</Label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AbsenceKind)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {enumLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="from">{t('common.from')}</Label>
            <Input
              id="from"
              type="date"
              value={from}
              className="min-w-0"
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">{t('common.to')}</Label>
            <Input
              id="to"
              type="date"
              value={to}
              className="min-w-0"
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {kind === 'Sickness' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={certified}
              onChange={(e) => setCertified(e.target.checked)}
            />
            {t('absences.certificate')}
          </label>
        )}
        <div className="space-y-2">
          <Label htmlFor="note">{t('absences.noteOptional')}</Label>
          <Input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {kind === 'Flextime' && (
          <Alert>
            <AlertDescription>{t('absences.flextimeNotice')}</AlertDescription>
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
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!valid || create.isPending}
          onClick={() => {
            setError(null);
            create.mutate();
          }}
        >
          {create.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </DialogFooter>
    </>
  );
}
