import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { soloApi, type Customer } from '../../api/solo';
import { useI18n } from '../../app/i18n';
import {
  Check,
  Feedback,
  Field,
  QueryError,
  SoloConfirmDialog,
  textareaClass,
  useSoloAction,
} from './SoloUi';

export function SoloCustomersPage() {
  const { t } = useI18n();
  const action = useSoloAction();
  const customers = useQuery({
    queryKey: ['solo-customers'],
    queryFn: soloApi.customers,
  });
  const [editing, setEditing] = useState<{ customer: Customer | null } | null>(
    null,
  );
  const [archived, setArchived] = useState(false);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{t('solo.customers')}</h1>
        <Button onClick={() => setEditing({ customer: null })}>
          {t('solo.customerNew')}
        </Button>
      </div>
      <Feedback action={action} />
      <QueryError error={customers.error} retry={customers.refetch} />
      <Check
        label={t('solo.showArchived')}
        checked={archived}
        onChange={setArchived}
      />
      {customers.isLoading && <p>{t('common.loading')}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {customers.data
          ?.filter((customer) => archived || customer.isActive)
          .map((customer) => (
            <Card key={customer.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 break-words text-lg font-semibold">
                    {customer.name}
                  </h2>
                  {!customer.isActive && (
                    <span className="text-xs text-muted-foreground">
                      {t('solo.archived')}
                    </span>
                  )}
                </div>
                {customer.code && <p className="text-sm">{customer.code}</p>}
                {customer.note && (
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {customer.note}
                  </p>
                )}
                <p className="text-xs">
                  {t('nav.projects')}: {customer.projectCount}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({ customer })}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(() =>
                        soloApi.saveCustomer(customer.id, {
                          name: customer.name,
                          code: customer.code,
                          note: customer.note,
                          isActive: !customer.isActive,
                        }),
                      )
                    }
                  >
                    {t(
                      customer.isActive ? 'solo.archive' : 'common.reactivate',
                    )}
                  </Button>
                  {customer.projectCount === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={action.pending}
                      onClick={() => setDeleting(customer)}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
      {customers.data?.length === 0 && (
        <p className="text-muted-foreground">{t('solo.noCustomers')}</p>
      )}
      {editing && (
        <CustomerEditor
          customer={editing.customer}
          close={() => setEditing(null)}
        />
      )}
      {deleting && (
        <SoloConfirmDialog
          title={t('solo.deleteConfirm')}
          description={t('solo.deletePermanentHint')}
          target={`${t('solo.customers')}: ${deleting.name}${deleting.code ? ` · ${deleting.code}` : ''}`}
          onConfirm={() => soloApi.deleteCustomer(deleting.id)}
          close={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
function CustomerEditor({
  customer,
  close,
}: {
  customer: Customer | null;
  close: () => void;
}) {
  const { t } = useI18n();
  const action = useSoloAction();
  const [name, setName] = useState(customer?.name ?? '');
  const [code, setCode] = useState(customer?.code ?? '');
  const [note, setNote] = useState(customer?.note ?? '');
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
            {t(customer ? 'solo.customerEdit' : 'solo.customerNew')}
          </DialogTitle>
          <DialogDescription>{t('solo.customerNote')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              () =>
                soloApi.saveCustomer(customer?.id ?? null, {
                  name: name.trim(),
                  code: code.trim() || null,
                  note: note.trim() || null,
                  isActive: customer?.isActive ?? true,
                }),
              close,
            );
          }}
        >
          <Feedback action={action} />
          <Field label={t('common.name')}>
            <Input
              required
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t('solo.customerCode')}>
            <Input
              maxLength={80}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field label={t('solo.customerNote')}>
            <textarea
              className={textareaClass}
              maxLength={4000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
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
