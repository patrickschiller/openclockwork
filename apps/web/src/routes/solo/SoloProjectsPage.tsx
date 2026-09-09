import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '../../api/client';
import {
  soloApi,
  type SoloProject,
  type SoloOrder,
  type Customer,
} from '../../api/solo';
import { useI18n } from '../../app/i18n';
import {
  Check,
  Feedback,
  Field,
  Minutes,
  QueryError,
  SoloConfirmDialog,
  selectClass,
  textareaClass,
  useSoloAction,
} from './SoloUi';

function projectPayload(project: SoloProject) {
  return {
    code: project.code,
    name: project.name,
    description: project.description,
    isActive: project.isActive,
    planHours: project.planHours,
    customerId: project.customerId,
    defaultBillable: project.defaultBillable,
  };
}
function orderPayload(order: SoloOrder) {
  return {
    orderNo: order.orderNo,
    title: order.title,
    isActive: order.isActive,
    planHours: order.planHours,
    defaultBillable: order.defaultBillable,
  };
}
export function SoloProjectsPage() {
  const { t } = useI18n();
  const action = useSoloAction();
  const projects = useQuery({
    queryKey: ['solo-projects'],
    queryFn: soloApi.projects,
  });
  const customers = useQuery({
    queryKey: ['solo-customers'],
    queryFn: soloApi.customers,
  });
  const [editing, setEditing] = useState<{
    project: SoloProject | null;
  } | null>(null);
  const [orderEdit, setOrderEdit] = useState<{
    project: SoloProject;
    order: SoloOrder | null;
  } | null>(null);
  const [archived, setArchived] = useState(false);
  const [deleting, setDeleting] = useState<{
    project: SoloProject;
    order?: SoloOrder;
  } | null>(null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-3xl font-semibold">{t('nav.projects')}</h1>
        <Button onClick={() => setEditing({ project: null })}>
          {t('solo.projectNew')}
        </Button>
      </div>
      <Feedback action={action} />
      <QueryError
        error={projects.error || customers.error}
        retry={() => {
          void projects.refetch();
          void customers.refetch();
        }}
      />
      <Check
        label={t('solo.showArchived')}
        checked={archived}
        onChange={setArchived}
      />
      {projects.isLoading && <p>{t('common.loading')}</p>}
      <div className="space-y-4">
        {projects.data
          ?.filter((project) => archived || project.isActive)
          .map((project) => (
            <Card key={project.id}>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-semibold">
                      {project.code} · {project.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {project.customerName ?? t('solo.internal')} ·{' '}
                      {t(project.isActive ? 'common.active' : 'solo.archived')}
                    </p>
                    {project.description && (
                      <p className="break-words text-sm">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <div className="text-sm">
                    {t('solo.net')}:{' '}
                    <Minutes value={project.bookedNetMinutes ?? 0} />
                    {project.planHours != null && (
                      <p>
                        {t('solo.budget')}: {project.planHours} h
                      </p>
                    )}
                  </div>
                </div>
                {project.planHours != null && project.planHours > 0 && (
                  <progress
                    className="h-2 w-full accent-primary"
                    aria-label={t('solo.budget')}
                    value={Math.min(
                      project.bookedNetMinutes ?? 0,
                      project.planHours * 60,
                    )}
                    max={project.planHours * 60}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({ project })}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(() =>
                        soloApi.saveProject(project.id, {
                          ...projectPayload(project),
                          isActive: !project.isActive,
                        }),
                      )
                    }
                  >
                    {t(project.isActive ? 'solo.archive' : 'common.reactivate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOrderEdit({ project, order: null })}
                  >
                    {t('solo.orderNew')}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/reports?projectId=${project.id}`}>
                      {t('solo.reports')}
                    </Link>
                  </Button>
                  {project.bookedMinutes === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={action.pending}
                      onClick={() => setDeleting({ project })}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                </div>
                {project.serviceOrders.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <h3 className="text-sm font-medium">{t('solo.orders')}</h3>
                    {project.serviceOrders
                      .filter((order) => archived || order.isActive)
                      .map((order) => (
                        <div
                          key={order.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/40 p-3"
                        >
                          <div className="min-w-0 break-words text-sm">
                            {order.orderNo} · {order.title}
                            <p className="text-xs text-muted-foreground">
                              <Minutes value={order.bookedNetMinutes ?? 0} />
                              {order.planHours != null
                                ? ` / ${order.planHours} h`
                                : ''}
                              {!order.isActive
                                ? ` · ${t('solo.archived')}`
                                : ''}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setOrderEdit({ project, order })}
                            >
                              {t('common.edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={action.pending}
                              onClick={() =>
                                void action.run(() =>
                                  soloApi.saveOrder(project.id, order.id, {
                                    ...orderPayload(order),
                                    isActive: !order.isActive,
                                  }),
                                )
                              }
                            >
                              {t(
                                order.isActive
                                  ? 'solo.archive'
                                  : 'common.reactivate',
                              )}
                            </Button>
                            {order.bookedMinutes === 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={action.pending}
                                onClick={() => setDeleting({ project, order })}
                              >
                                {t('common.delete')}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
      </div>
      {projects.data?.length === 0 && <p>{t('solo.noProjects')}</p>}
      {editing && (
        <ProjectEditor
          project={editing.project}
          customers={customers.data ?? []}
          close={() => setEditing(null)}
        />
      )}
      {orderEdit && (
        <OrderEditor {...orderEdit} close={() => setOrderEdit(null)} />
      )}
      {deleting && (
        <SoloConfirmDialog
          title={t('solo.deleteConfirm')}
          description={t('solo.deletePermanentHint')}
          target={`${deleting.project.code} · ${deleting.project.name}${deleting.order ? ` / ${deleting.order.orderNo} · ${deleting.order.title}` : ''}`}
          onConfirm={() =>
            deleting.order
              ? api.deleteServiceOrder(deleting.project.id, deleting.order.id)
              : api.deleteProject(deleting.project.id)
          }
          close={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
function ProjectEditor({
  project,
  customers,
  close,
}: {
  project: SoloProject | null;
  customers: Customer[];
  close: () => void;
}) {
  const { t } = useI18n();
  const action = useSoloAction();
  const [code, setCode] = useState(project?.code ?? '');
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [customerId, setCustomerId] = useState(project?.customerId ?? '');
  const [plan, setPlan] = useState(project?.planHours?.toString() ?? '');
  const [billable, setBillable] = useState(project?.defaultBillable ?? false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(project ? 'solo.projectEdit' : 'solo.projectNew')}
          </DialogTitle>
          <DialogDescription>{t('solo.projectCustomerHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              () =>
                soloApi.saveProject(project?.id ?? null, {
                  code: code.trim(),
                  name: name.trim(),
                  description: description.trim() || null,
                  isActive: project?.isActive ?? true,
                  customerId: customerId || null,
                  planHours: plan === '' ? null : Number(plan),
                  defaultBillable: billable,
                }),
              close,
            );
          }}
        >
          <Feedback action={action} />
          <Field label={t('solo.projectCode')}>
            <Input
              required
              maxLength={40}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label={t('common.name')}>
            <Input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t('solo.customer')}>
            <select
              className={selectClass}
              value={customerId}
              disabled={Boolean(project && project.bookedMinutes > 0)}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">{t('solo.internal')}</option>
              {customers
                .filter((c) => c.isActive || c.id === customerId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t('common.description')}>
            <textarea
              className={textareaClass}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label={t('projects.planHoursHint')}>
            <Input
              type="number"
              min={0}
              step="0.25"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            />
          </Field>
          <Check
            label={t('solo.defaultBillable')}
            checked={billable}
            onChange={setBillable}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button disabled={action.pending || !action.online}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function OrderEditor({
  project,
  order,
  close,
}: {
  project: SoloProject;
  order: SoloOrder | null;
  close: () => void;
}) {
  const { t } = useI18n();
  const action = useSoloAction();
  const [orderNo, setOrderNo] = useState(order?.orderNo ?? '');
  const [title, setTitle] = useState(order?.title ?? '');
  const [plan, setPlan] = useState(order?.planHours?.toString() ?? '');
  const [billable, setBillable] = useState(
    order?.defaultBillable == null ? '' : String(order.defaultBillable),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(order ? 'solo.orderEdit' : 'solo.orderNew')}
          </DialogTitle>
          <DialogDescription>{project.name}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              () =>
                soloApi.saveOrder(project.id, order?.id ?? null, {
                  orderNo: orderNo.trim(),
                  title: title.trim(),
                  planHours: plan === '' ? null : Number(plan),
                  isActive: order?.isActive ?? true,
                  defaultBillable: billable === '' ? null : billable === 'true',
                }),
              close,
            );
          }}
        >
          <Feedback action={action} />
          <Field label={t('projects.orderNo')}>
            <Input
              required
              maxLength={80}
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
            />
          </Field>
          <Field label={t('projects.orderTitle')}>
            <Input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={t('projects.planHoursHint')}>
            <Input
              type="number"
              min={0}
              step="0.25"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            />
          </Field>
          <Field label={t('solo.billable')}>
            <select
              className={selectClass}
              value={billable}
              onChange={(e) => setBillable(e.target.value)}
            >
              <option value="">{t('solo.inheritBillable')}</option>
              <option value="true">{t('solo.billable')}</option>
              <option value="false">{t('solo.nonBillable')}</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button disabled={action.pending || !action.online}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
