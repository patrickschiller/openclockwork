import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, type EmployeeDto, type TerminalPinStatus } from '../api/client';
import { useI18n } from '../app/i18n';

export function TerminalPinDialog({
  employee,
  onClose,
}: {
  employee: EmployeeDto;
  onClose: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const [status, setStatus] = useState<TerminalPinStatus | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const epoch = useRef(0);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    const current = ++epoch.current;
    void api
      .terminalCredentials(employee.id, abort.signal)
      .then((next) => {
        if (epoch.current === current) setStatus(next);
      })
      .catch(() => {
        if (epoch.current === current) setError('terminalPin.adminLoadFailed');
      });
    return () => {
      epoch.current += 1;
      abort.abort();
      controller.current?.abort();
    };
  }, [employee.id]);

  useEffect(() => {
    const close = () => {
      epoch.current += 1;
      controller.current?.abort();
      setPin(null);
      closeCallback.current();
    };
    const visibility = () => {
      if (document.hidden) close();
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) close();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', close);
    window.addEventListener('pageshow', pageshow);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', close);
      window.removeEventListener('pageshow', pageshow);
    };
  }, []);

  const close = () => {
    epoch.current += 1;
    controller.current?.abort();
    setPin(null);
    onClose();
  };

  const change = async (operation: 'reset' | 'disable' | 'unlock') => {
    if (busy.current) return;
    if (
      operation !== 'unlock' &&
      !window.confirm(
        t(
          operation === 'reset'
            ? 'terminalPin.resetConfirm'
            : 'terminalPin.disableConfirm',
        ),
      )
    )
      return;
    busy.current = true;
    setPending(true);
    setError(null);
    setUpdated(false);
    setPin(null);
    controller.current?.abort();
    const current = ++epoch.current;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    try {
      // No useMutation: its cached result would retain the one-time PIN.
      if (operation === 'reset') {
        const response = await api.resetTerminalPin(employee.id, signal);
        if (epoch.current !== current) return;
        setPin(response.pin);
        setStatus(response.credential);
      } else {
        const next = await (operation === 'disable'
          ? api.disableTerminalPin(employee.id, signal)
          : api.unlockTerminalPin(employee.id, signal));
        if (epoch.current !== current) return;
        setStatus(next);
      }
      setUpdated(true);
    } catch {
      if (epoch.current !== current) return;
      setError('terminalPin.adminFailed');
      // A lost response cannot recover a PIN; reload status without retrying reset.
      try {
        const next = await api.terminalCredentials(employee.id, signal);
        if (epoch.current === current) setStatus(next);
      } catch {
        /* Keep the explicit failure message. */
      }
    } finally {
      if (epoch.current === current) {
        busy.current = false;
        setPending(false);
      }
    }
  };

  const locked =
    !!status?.lockedUntil && Date.parse(status.lockedUntil) > Date.now();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('terminalPin.manage')}</DialogTitle>
          <DialogDescription>
            {t('terminalPin.manageFor', {
              name: `${employee.firstName} ${employee.lastName}`,
            })}
          </DialogDescription>
        </DialogHeader>
        {status ? (
          <p className="text-sm">
            {t(
              locked
                ? 'terminalPin.locked'
                : status.enabled
                  ? 'terminalPin.active'
                  : 'terminalPin.inactive',
            )}
            {locked && status.lockedUntil
              ? ` (${formatDateTime(status.lockedUntil)})`
              : ''}
          </p>
        ) : (
          !error && <p>{t('common.loading')}</p>
        )}
        {pin && (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">{t('terminalPin.newPin')}</p>
            <output
              aria-label={t('terminalPin.newPin')}
              className="block text-center font-mono text-3xl tracking-widest"
            >
              {pin}
            </output>
            <p className="text-sm text-muted-foreground">
              {t('terminalPin.once')}
            </p>
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        )}
        {updated && !pin && <p role="status">{t('terminalPin.updated')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || !status || !employee.isActive}
            onClick={() => void change('reset')}
          >
            {t('terminalPin.reset')}
          </Button>
          <Button
            variant="outline"
            disabled={pending || !status?.enabled}
            onClick={() => void change('disable')}
          >
            {t('terminalPin.disable')}
          </Button>
          <Button
            variant="outline"
            disabled={pending || !locked || !status?.enabled}
            onClick={() => void change('unlock')}
          >
            {t('terminalPin.unlock')}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
