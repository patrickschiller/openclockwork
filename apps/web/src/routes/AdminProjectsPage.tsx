import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileBarChart, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  api,
  type EmployeeDirectoryDto,
  type ProjectAssignmentDto,
  type ProjectDto,
  type ProjectReportDto,
  type ServiceOrderDto,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';

interface ProjectDraft {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  planHours: string;
}

const EMPTY_DRAFT: ProjectDraft = {
  code: '',
  name: '',
  description: '',
  isActive: true,
  planHours: '',
};

function fromProject(p: ProjectDto): ProjectDraft {
  return {
    code: p.code,
    name: p.name,
    description: p.description ?? '',
    isActive: p.isActive,
    planHours: p.planHours !== null ? String(p.planHours) : '',
  };
}

function parsePlanHours(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function fmtHours(minutes: number, languageTag: string): string {
  return `${(minutes / 60).toLocaleString(languageTag, { maximumFractionDigits: 1 })} h`;
}

/** IST/PLAN progress bar; turns red once the booked hours exceed the plan. */
function PlanBar({
  planHours,
  bookedMinutes,
}: {
  planHours: number | null;
  bookedMinutes: number;
}) {
  const { t, languageTag } = useI18n();
  if (planHours === null || planHours <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('projects.noPlan', { hours: fmtHours(bookedMinutes, languageTag) })}
      </p>
    );
  }
  const bookedHours = bookedMinutes / 60;
  const over = bookedHours > planHours;
  const pct = Math.min(100, (bookedHours / planHours) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>
          {t('projects.planComparison', {
            actual: fmtHours(bookedMinutes, languageTag),
            planned: `${planHours.toLocaleString(languageTag, { maximumFractionDigits: 1 })} h`,
          })}
        </span>
        {over && (
          <span className="font-medium text-destructive">
            {t('projects.overbooked')}
          </span>
        )}
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(bookedHours * 10) / 10}
        aria-valuemax={planHours}
      >
        <div
          className={`h-full ${over ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AdminProjectsPage() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const isAuthorized = user.role === 'Manager' || user.role === 'HRAdmin';

  const qc = useQueryClient();
  const projects = useQuery({
    queryKey: ['projects', { includeInactive: true }],
    queryFn: () => api.projects(true),
    enabled: isAuthorized,
  });
  const employees = useQuery({
    queryKey: ['employee-directory'],
    queryFn: () => api.employeeDirectory(),
    enabled: isAuthorized,
  });
  const assignments = useQuery({
    queryKey: ['project-assignments'],
    queryFn: () => api.projectAssignments(),
    enabled: isAuthorized,
  });

  const [editing, setEditing] = useState<{
    id: string | null;
    draft: ProjectDraft;
  } | null>(null);
  const [reportProject, setReportProject] = useState<ProjectDto | null>(null);

  if (!isAuthorized) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Diese Seite ist Managern und HR-Admins vorbehalten.
        </AlertDescription>
      </Alert>
    );
  }

  const activeEmployees = employees.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t('projects.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('projects.description')}
          </p>
        </div>
        <Button onClick={() => setEditing({ id: null, draft: EMPTY_DRAFT })}>
          <Plus className="mr-2 h-4 w-4" /> {t('projects.new')}
        </Button>
      </div>

      <div className="grid gap-4">
        {projects.data?.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onEdit={() => setEditing({ id: p.id, draft: fromProject(p) })}
            onReport={() => setReportProject(p)}
            onChanged={() => qc.invalidateQueries({ queryKey: ['projects'] })}
          />
        ))}
        {projects.data && projects.data.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t('projects.none')}
            </CardContent>
          </Card>
        )}
      </div>

      <AssignmentMatrix
        projects={projects.data ?? []}
        employees={activeEmployees}
        assignments={assignments.data ?? []}
      />

      {editing && (
        <ProjectEditor
          state={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['projects'] });
            setEditing(null);
          }}
        />
      )}
      {reportProject && (
        <ProjectReportDialog
          project={reportProject}
          onClose={() => setReportProject(null)}
        />
      )}
    </div>
  );
}

interface ProjectCardProps {
  project: ProjectDto;
  onEdit: () => void;
  onReport: () => void;
  onChanged: () => void;
}

function ProjectCard({
  project,
  onEdit,
  onReport,
  onChanged,
}: ProjectCardProps) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: onChanged,
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('projects.deleteFailed')),
  });

  return (
    <Card className={project.isActive ? undefined : 'opacity-70'}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <span className="font-mono text-base">{project.code}</span>
          {project.name}
          {!project.isActive && (
            <Badge variant="secondary">{t('common.inactive')}</Badge>
          )}
          <Badge variant="outline">
            {t('schedules.employees', {
              count: project.assignedEmployeeCount,
            })}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {project.description && (
          <p className="text-muted-foreground">{project.description}</p>
        )}

        <PlanBar
          planHours={project.planHours}
          bookedMinutes={project.bookedMinutes}
        />

        <ServiceOrderList project={project} onChanged={onChanged} />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onReport}>
            <FileBarChart className="mr-1 h-4 w-4" /> {t('projects.report')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" /> {t('common.edit')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={remove.isPending}
            onClick={() => {
              setError(null);
              remove.mutate();
            }}
            title={t('projects.deleteHint')}
          >
            <Trash2 className="mr-1 h-4 w-4" /> {t('common.delete')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceOrderList({
  project,
  onChanged,
}: {
  project: ProjectDto;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ orderNo: '', title: '', planHours: '' });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createServiceOrder(project.id, {
        orderNo: draft.orderNo,
        title: draft.title,
        planHours: parsePlanHours(draft.planHours),
      }),
    onSuccess: () => {
      setDraft({ orderNo: '', title: '', planHours: '' });
      setError(null);
      onChanged();
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('projects.createFailed')),
  });

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('projects.serviceOrders')}
      </p>
      {project.serviceOrders.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('projects.noServiceOrders')}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {project.serviceOrders.map((o) => (
            <ServiceOrderRow
              key={o.id}
              projectId={project.id}
              order={o}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor={`so-no-${project.id}`} className="text-xs">
            {t('projects.orderNo')}
          </Label>
          <Input
            id={`so-no-${project.id}`}
            value={draft.orderNo}
            onChange={(e) => setDraft({ ...draft, orderNo: e.target.value })}
            placeholder="SA-001"
            className="mt-1 h-8 w-28 text-sm"
          />
        </div>
        <div className="flex-1">
          <Label htmlFor={`so-title-${project.id}`} className="text-xs">
            {t('projects.orderTitle')}
          </Label>
          <Input
            id={`so-title-${project.id}`}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t('projects.orderPlaceholder')}
            className="mt-1 h-8 text-sm"
          />
        </div>
        <div>
          <Label htmlFor={`so-plan-${project.id}`} className="text-xs">
            {t('projects.planHours')}
          </Label>
          <Input
            id={`so-plan-${project.id}`}
            value={draft.planHours}
            onChange={(e) => setDraft({ ...draft, planHours: e.target.value })}
            placeholder="40"
            inputMode="decimal"
            className="mt-1 h-8 w-20 text-sm"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={
            !draft.orderNo.trim() || !draft.title.trim() || create.isPending
          }
          onClick={() => create.mutate()}
        >
          <Plus className="mr-1 h-4 w-4" /> {t('common.add')}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ServiceOrderRow({
  projectId,
  order,
  onChanged,
}: {
  projectId: string;
  order: ServiceOrderDto;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    orderNo: order.orderNo,
    title: order.title,
    planHours: order.planHours !== null ? String(order.planHours) : '',
  });
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (payload: {
      orderNo: string;
      title: string;
      isActive: boolean;
      planHours: number | null;
    }) => api.updateServiceOrder(projectId, order.id, payload),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onChanged();
    },
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('common.saveFailed')),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteServiceOrder(projectId, order.id),
    onSuccess: onChanged,
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('common.deleteFailed')),
  });

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          value={draft.orderNo}
          onChange={(e) => setDraft({ ...draft, orderNo: e.target.value })}
          className="h-8 w-28 text-sm"
          aria-label={t('projects.orderNo')}
        />
        <Input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className="h-8 flex-1 text-sm"
          aria-label={t('projects.orderTitle')}
        />
        <Input
          value={draft.planHours}
          onChange={(e) => setDraft({ ...draft, planHours: e.target.value })}
          className="h-8 w-20 text-sm"
          inputMode="decimal"
          aria-label={t('projects.planHours')}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={
            !draft.orderNo.trim() || !draft.title.trim() || update.isPending
          }
          onClick={() =>
            update.mutate({
              orderNo: draft.orderNo,
              title: draft.title,
              isActive: order.isActive,
              planHours: parsePlanHours(draft.planHours),
            })
          }
        >
          {t('common.save')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </Button>
        {error && (
          <span className="w-full text-xs text-destructive">{error}</span>
        )}
      </li>
    );
  }

  return (
    <li className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{order.orderNo}</span>
        <span className={order.isActive ? '' : 'line-through opacity-60'}>
          {order.title}
        </span>
        {!order.isActive && (
          <Badge variant="secondary">{t('common.inactive')}</Badge>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              update.mutate({
                orderNo: order.orderNo,
                title: order.title,
                isActive: !order.isActive,
                planHours: order.planHours,
              })
            }
            title={
              order.isActive ? t('common.deactivate') : t('common.activate')
            }
          >
            {order.isActive ? t('common.deactivate') : t('common.activate')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label={t('common.edit')}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
            aria-label={t('common.delete')}
            title={t('projects.deleteOrderHint')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      </div>
      <PlanBar
        planHours={order.planHours}
        bookedMinutes={order.bookedMinutes}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

interface MatrixProps {
  projects: ProjectDto[];
  employees: EmployeeDirectoryDto[];
  assignments: ProjectAssignmentDto[];
}

function AssignmentMatrix({ projects, employees, assignments }: MatrixProps) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const assigned = useMemo(
    () => new Set(assignments.map((a) => `${a.employeeId}:${a.projectId}`)),
    [assignments],
  );

  const toggle = useMutation<
    void,
    Error,
    { projectId: string; employeeId: string; assign: boolean },
    { previous?: ProjectAssignmentDto[] }
  >({
    mutationFn: ({ projectId, employeeId, assign }) =>
      assign
        ? api.assignProject(projectId, employeeId)
        : api.unassignProject(projectId, employeeId),
    onMutate: async ({ projectId, employeeId, assign }) => {
      await qc.cancelQueries({ queryKey: ['project-assignments'] });
      const previous = qc.getQueryData<ProjectAssignmentDto[]>([
        'project-assignments',
      ]);
      qc.setQueryData<ProjectAssignmentDto[]>(
        ['project-assignments'],
        (old = []) =>
          assign
            ? [...old, { employeeId, projectId }]
            : old.filter(
                (a) =>
                  !(a.employeeId === employeeId && a.projectId === projectId),
              ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous)
        qc.setQueryData(['project-assignments'], context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project-assignments'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  if (projects.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('projects.assignments')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('projects.assignmentsHint')}
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">{t('common.employee')}</th>
              {projects.map((p) => (
                <th
                  key={p.id}
                  className={`px-2 py-2 text-center font-mono text-xs font-medium ${
                    p.isActive ? '' : 'opacity-50'
                  }`}
                  title={p.name}
                >
                  {p.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {emp.firstName} {emp.lastName}
                </td>
                {projects.map((p) => {
                  const isAssigned = assigned.has(`${emp.id}:${p.id}`);
                  return (
                    <td key={p.id} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        aria-label={`${emp.firstName} ${emp.lastName} – ${p.code}`}
                        onChange={() =>
                          toggle.mutate({
                            projectId: p.id,
                            employeeId: emp.id,
                            assign: !isAssigned,
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

interface ProjectEditorProps {
  state: { id: string | null; draft: ProjectDraft };
  onClose: () => void;
  onSaved: () => void;
}

function ProjectEditor({ state, onClose, onSaved }: ProjectEditorProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ProjectDraft>(state.draft);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        code: draft.code.trim(),
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        isActive: draft.isActive,
        planHours: parsePlanHours(draft.planHours),
      };
      return state.id
        ? api.updateProject(state.id, payload)
        : api.createProject(payload);
    },
    onSuccess: onSaved,
    onError: (e) =>
      setError(e instanceof Error ? e.message : t('common.saveFailed')),
  });

  const valid = draft.code.trim().length > 0 && draft.name.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state.id ? t('projects.edit') : t('projects.new')}
          </DialogTitle>
          <DialogDescription>
            {t('projects.editorDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-code">Code</Label>
            <Input
              id="p-code"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              placeholder="PRJ-001"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-name">{t('common.name')}</Label>
            <Input
              id="p-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-desc">{t('common.description')}</Label>
            <Input
              id="p-desc"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-plan">{t('projects.planHoursHint')}</Label>
            <Input
              id="p-plan"
              value={draft.planHours}
              inputMode="decimal"
              placeholder="120"
              onChange={(e) =>
                setDraft({ ...draft, planHours: e.target.value })
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) =>
                setDraft({ ...draft, isActive: e.target.checked })
              }
            />
            {t('projects.activeHint')}
          </label>

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
            disabled={!valid || save.isPending}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function csvEscape(value: string): string {
  return /[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function reportToCsv(
  report: ProjectReportDto,
  languageTag: string,
  t: (key: string) => string,
): string {
  const number = new Intl.NumberFormat(languageTag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
  const delimiter = number.format(1.5).includes(',') ? ';' : ',';
  const header = [
    t('projects.reportDate'),
    t('common.employee'),
    t('booking.serviceOrder'),
    t('common.hours'),
    t('common.activity'),
  ];
  const lines = report.rows.map((r) =>
    [
      r.date,
      r.employeeName,
      r.orderNo ? `${r.orderNo} ${r.orderTitle ?? ''}`.trim() : '',
      number.format(r.grossMinutes / 60),
      r.activity ?? '',
    ]
      .map(csvEscape)
      .join(delimiter),
  );
  const total = [
    t('projects.reportTotal'),
    '',
    '',
    number.format(report.totalGrossMinutes / 60),
    '',
  ];
  // Keep UTF-8 detectable in spreadsheet tools; match the selected decimal convention.
  return (
    '﻿' +
    [
      header.map(csvEscape).join(delimiter),
      ...lines,
      total.map(csvEscape).join(delimiter),
    ].join('\r\n')
  );
}

function ProjectReportDialog({
  project,
  onClose,
}: {
  project: ProjectDto;
  onClose: () => void;
}) {
  const { t, languageTag, formatDate } = useI18n();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
  const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : undefined;
  const report = useQuery({
    queryKey: ['project-report', project.id, fromIso ?? null, toIso ?? null],
    queryFn: () => api.projectReport(project.id, fromIso, toIso),
  });

  const downloadCsv = () => {
    if (!report.data) return;
    const blob = new Blob([reportToCsv(report.data, languageTag, t)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.code.toLowerCase()}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t('projects.report')} {project.code} · {project.name}
          </DialogTitle>
          <DialogDescription>
            {t('projects.reportDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="report-from">{t('common.from')}</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-to">{t('common.to')}</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!report.data || report.data.rows.length === 0}
            onClick={downloadCsv}
          >
            <Download className="mr-1 h-4 w-4" /> {t('projects.downloadCsv')}
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {report.data && report.data.rows.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">{t('projects.reportDate')}</th>
                  <th className="py-2 pr-3">{t('common.employee')}</th>
                  <th className="py-2 pr-3">{t('projects.reportOrder')}</th>
                  <th className="py-2 pr-3 text-right">{t('common.hours')}</th>
                  <th className="py-2">{t('common.activity')}</th>
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="py-2 pr-3">{r.employeeName}</td>
                    <td className="py-2 pr-3">{r.orderNo ?? '—'}</td>
                    <td className="py-2 pr-3 text-right">
                      {fmtHours(r.grossMinutes, languageTag)}
                    </td>
                    <td className="py-2">{r.activity ?? '—'}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2 pr-3" colSpan={3}>
                    {t('projects.reportTotal')}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {fmtHours(report.data.totalGrossMinutes, languageTag)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {report.isLoading
                ? t('common.loading')
                : t('projects.reportEmpty')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
