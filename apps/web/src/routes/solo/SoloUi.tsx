import { useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '../../app/i18n';
import { useOnline } from '../../app/use-online';
import { formatSoloActionError } from '../../app/solo-errors';
import { localCandidates, offsetLabel } from '../../app/solo-time';

export const selectClass =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
export const textareaClass =
  'min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm';
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block min-w-0 space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {hint && (
        <span className="block text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
export function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        className="mt-1 h-4 w-4 shrink-0 accent-primary"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}
export function useSoloAction() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const online = useOnline();
  const qc = useQueryClient();
  const { t } = useI18n();
  async function run<T>(
    operation: () => Promise<T>,
    after?: (result: T) => void,
    invalidate = true,
  ) {
    if (pending) return;
    setError('');
    setSuccess(false);
    if (!online) {
      setError(t('solo.offline'));
      return;
    }
    setPending(true);
    try {
      const result = await operation();
      if (invalidate) await qc.invalidateQueries();
      setSuccess(true);
      after?.(result);
    } catch (err) {
      setError(formatSoloActionError(err, t));
    } finally {
      setPending(false);
    }
  }
  return {
    run,
    error,
    success,
    pending,
    online,
    reset: () => {
      setError('');
      setSuccess(false);
    },
  };
}
export function Feedback({
  action,
  successMessage,
}: {
  action: Pick<
    ReturnType<typeof useSoloAction>,
    'error' | 'success' | 'online'
  >;
  successMessage?: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2" aria-live="polite">
      {!action.online && (
        <Alert>
          <AlertDescription>{t('solo.offline')}</AlertDescription>
        </Alert>
      )}
      {action.error && (
        <Alert variant="destructive">
          <AlertDescription className="break-words">
            {action.error}
          </AlertDescription>
        </Alert>
      )}
      {action.success && successMessage !== null && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-400"
        >
          {successMessage ?? t('solo.saved')}
        </p>
      )}
    </div>
  );
}
export function SoloConfirmDialog({
  title,
  target,
  description,
  onConfirm,
  close,
}: {
  title: string;
  target: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  close: () => void;
}) {
  const { t } = useI18n();
  const action = useSoloAction();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-busy={action.pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (action.pending) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <p className="break-words font-medium">{target}</p>
        <Feedback action={action} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            ref={cancelRef}
            variant="outline"
            disabled={action.pending}
            onClick={close}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={action.pending || !action.online}
            onClick={() => void action.run(onConfirm, close)}
          >
            {action.pending ? t('common.loading') : t('solo.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function QueryError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => unknown;
}) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {t('solo.loadFailed')}{' '}
        <Button variant="outline" size="sm" onClick={() => retry()}>
          {t('solo.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
export function Minutes({ value }: { value: number | null | undefined }) {
  const { languageTag } = useI18n();
  return value == null
    ? '—'
    : `${(value / 60).toLocaleString(languageTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}
export interface WallTime {
  local: string;
  choice: string;
  original?: string;
}
export function resolveWallTime(
  value: WallTime,
  timeZone: string,
  t: (key: string) => string,
): string {
  // Editing an allocation must not round an unchanged server timestamp to minutes.
  if (value.original) {
    const originalMinute = new Date(
      Math.floor(Date.parse(value.original) / 60_000) * 60_000,
    ).toISOString();
    if (
      value.choice === originalMinute &&
      localCandidates(value.local, timeZone).includes(originalMinute)
    )
      return value.original;
  }
  const candidates = localCandidates(value.local, timeZone);
  if (!candidates.length) throw new Error(t('solo.invalidTime'));
  if (candidates.length === 1) return candidates[0];
  if (candidates.includes(value.choice)) return value.choice;
  throw new Error(t('solo.ambiguousTime'));
}
export function WallTimeField({
  label,
  value,
  onChange,
  timeZone,
}: {
  label: string;
  value: WallTime;
  onChange: (value: WallTime) => void;
  timeZone: string;
}) {
  const { t } = useI18n();
  const candidates = localCandidates(value.local, timeZone);
  return (
    <div className="space-y-2">
      <Field label={`${label} · ${timeZone}`}>
        <Input
          type="datetime-local"
          required
          value={value.local}
          onChange={(event) =>
            onChange({ local: event.target.value, choice: '' })
          }
        />
      </Field>
      {candidates.length > 1 && (
        <Field label={t('solo.offset')} hint={t('solo.ambiguousTime')}>
          <select
            className={selectClass}
            required
            value={value.choice}
            onChange={(event) =>
              onChange({ ...value, choice: event.target.value })
            }
          >
            <option value="">{t('common.select')}</option>
            {candidates.map((instant) => (
              <option key={instant} value={instant}>
                {offsetLabel(instant, value.local)}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}
