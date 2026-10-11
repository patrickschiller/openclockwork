import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  api,
  type TerminalAuditPage,
  type TerminalAuthMethod,
} from '../api/client';
import { catalogs, useI18n } from '../app/i18n';

export function TerminalAuditPanel() {
  const { t, formatDateTime } = useI18n();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<TerminalAuthMethod | ''>('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [page, setPage] = useState<TerminalAuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const cursor = cursors.at(-1);
  const eventLabel = (kind: 'event' | 'result', value: string) => {
    const key = `terminalPin.${kind}.${value}`;
    return key in catalogs.en ? t(key) : value;
  };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setFailed(false);
    setPage(null);
    void api
      .terminalAuditEvents(
        { method: method || undefined, cursor },
        controller.signal,
      )
      .then((result) => {
        if (active) setPage(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [open, method, cursor, revision]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('terminalPin.audit')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('terminalPin.auditDescription')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t('terminalPin.auditLoad')}
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="terminal-audit-method">
                  {t('terminalPin.auditMethod')}
                </Label>
                <select
                  id="terminal-audit-method"
                  className="block rounded-md border bg-background p-2"
                  value={method}
                  onChange={(event) => {
                    setCursors([]);
                    setMethod(event.target.value as TerminalAuthMethod | '');
                  }}
                >
                  <option value="">{t('terminalPin.auditAll')}</option>
                  <option value="QR">{t('terminalPin.method.QR')}</option>
                  <option value="PIN">{t('terminalPin.method.PIN')}</option>
                </select>
              </div>
              <Button
                variant="outline"
                onClick={() => setRevision((value) => value + 1)}
                disabled={loading}
              >
                {t('terminalPin.auditLoad')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setPage(null);
                }}
              >
                {t('common.close')}
              </Button>
            </div>
            {loading && <p role="status">{t('common.loading')}</p>}
            {failed && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t('terminalPin.auditFailed')}
                </AlertDescription>
              </Alert>
            )}
            {page && page.items.length === 0 && (
              <p>{t('terminalPin.auditEmpty')}</p>
            )}
            {page && page.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2">{t('terminalPin.auditTime')}</th>
                      <th className="p-2">{t('terminals.name')}</th>
                      <th className="p-2">{t('terminalPin.auditMethod')}</th>
                      <th className="p-2">{t('terminalPin.auditEvent')}</th>
                      <th className="p-2">{t('terminalPin.auditResult')}</th>
                      <th className="p-2">{t('terminalPin.auditEmployee')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((event) => (
                      <tr key={event.id} className="border-b">
                        <td className="whitespace-nowrap p-2">
                          {formatDateTime(event.occurredAt)}
                        </td>
                        <td className="p-2">{event.terminalName ?? '—'}</td>
                        <td className="p-2">
                          {event.method
                            ? t(`terminalPin.method.${event.method}`)
                            : '—'}
                        </td>
                        <td className="p-2" title={event.event}>
                          {eventLabel('event', event.event)}
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {eventLabel('result', event.result)}
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {event.employeeId ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                disabled={loading || cursors.length === 0}
                onClick={() => setCursors((value) => value.slice(0, -1))}
              >
                {t('terminalPin.auditPrevious')}
              </Button>
              <Button
                variant="outline"
                disabled={loading || !page?.nextCursor}
                onClick={() => {
                  const next = page?.nextCursor;
                  if (next) setCursors((value) => [...value, next]);
                }}
              >
                {t('terminalPin.auditNext')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
