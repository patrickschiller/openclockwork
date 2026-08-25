import { useState, type InputHTMLAttributes } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  ExternalLink,
  Heart,
  Link2,
  MapPin,
  Pencil,
  Plus,
  PowerOff,
  Tablet,
  Trash2,
} from 'lucide-react';
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
  type TerminalDto,
  type TerminalPairingDto,
  type UpsertTerminalPayload,
} from '../api/client';
import { useCurrentUser } from '../app/auth';
import { useI18n } from '../app/i18n';
import { supportUrl } from '../app/runtime-config';
import { getBrowserTimeZone, getTimeZoneOptions } from '../app/time-zones';

type EditorState = { terminal: TerminalDto | null };
const MAX_LOGO_BYTES = 60 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function AdminTerminalsPage() {
  const user = useCurrentUser();
  const { t, formatDateTime } = useI18n();
  const queryClient = useQueryClient();
  const authorized = user.role === 'HRAdmin';
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pairing, setPairing] = useState<TerminalPairingDto | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const terminals = useQuery({
    queryKey: ['terminals'],
    queryFn: () => api.terminals(),
    enabled: authorized,
  });

  const maybeShowSupport = async () => {
    if (!supportUrl()) return;
    try {
      const status = await api.terminalSupportPrompt();
      if (status.shownAt) return;
      // Mark it as shown independently of either choice. No payment result is
      // ever sent back to OpenClockwork.
      setSupportOpen(true);
      void api.dismissTerminalSupportPrompt().catch(() => undefined);
    } catch {
      // A support prompt must never make terminal activation look unsuccessful.
    }
  };

  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivateTerminal(id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['terminals'] });
    },
    onError: (deleteError) =>
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('terminals.deactivateFailed'),
      ),
  });

  const deletePermanently = useMutation({
    mutationFn: (id: string) => api.deleteTerminalPermanently(id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['terminals'] });
    },
    onError: (deleteError) =>
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('terminals.deleteFailed'),
      ),
  });

  const createPairing = useMutation({
    mutationFn: (id: string) => api.createTerminalPairing(id),
    onSuccess: (result) => {
      setError(null);
      setPairing(result);
    },
    onError: (pairError) =>
      setError(
        pairError instanceof Error
          ? pairError.message
          : t('terminals.pairingFailed'),
      ),
  });

  const revokeDevice = useMutation({
    mutationFn: ({
      terminalId,
      deviceId,
    }: {
      terminalId: string;
      deviceId: string;
    }) => api.revokeTerminalDevice(terminalId, deviceId),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['terminals'] });
    },
    onError: (revokeError) =>
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : t('terminals.revokeFailed'),
      ),
  });

  if (!authorized) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('common.hrOnly')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t('terminals.title')}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t('terminals.description')}
          </p>
        </div>
        <Button onClick={() => setEditor({ terminal: null })}>
          <Plus className="h-4 w-4" /> {t('terminals.new')}
        </Button>
      </div>

      {(error || terminals.error) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error ??
              (terminals.error instanceof Error
                ? terminals.error.message
                : t('terminals.loadFailed'))}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {terminals.data?.map((terminal) => (
          <Card key={terminal.id}>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {terminal.logoUrl ? (
                    <img
                      src={terminal.logoUrl}
                      alt=""
                      className="h-11 w-11 rounded-md border object-contain"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-muted">
                      <Tablet className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <CardTitle className="truncate text-lg">
                      {terminal.name}
                    </CardTitle>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {terminal.locationLabel}
                    </p>
                  </div>
                </div>
                <Badge variant={terminal.isActive ? 'default' : 'secondary'}>
                  {terminal.isActive
                    ? t('common.active')
                    : t('common.inactive')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">{terminal.displayText}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">
                  {t('terminals.geofence')}
                </dt>
                <dd className="text-right">
                  {terminal.enforceGeofence
                    ? t('terminals.geofenceEnabled')
                    : t('terminals.geofenceDisabled')}
                </dd>
                {terminal.enforceGeofence &&
                  terminal.latitude !== null &&
                  terminal.longitude !== null &&
                  terminal.radiusMeters !== null &&
                  terminal.maxAccuracyMeters !== null && (
                    <>
                      <dt className="text-muted-foreground">
                        {t('terminals.coordinates')}
                      </dt>
                      <dd className="text-right tabular-nums">
                        {terminal.latitude.toFixed(6)},{' '}
                        {terminal.longitude.toFixed(6)}
                      </dd>
                      <dt className="text-muted-foreground">
                        {t('terminals.radius')}
                      </dt>
                      <dd className="text-right">
                        {t('terminals.metersValue', {
                          count: terminal.radiusMeters,
                        })}
                      </dd>
                      <dt className="text-muted-foreground">
                        {t('terminals.accuracy')}
                      </dt>
                      <dd className="text-right">
                        {t('terminals.metersValue', {
                          count: terminal.maxAccuracyMeters,
                        })}
                      </dd>
                    </>
                  )}
                <dt className="text-muted-foreground">
                  {t('terminals.device')}
                </dt>
                <dd className="text-right">
                  {terminal.isPaired
                    ? t('terminals.paired')
                    : t('terminals.notPaired')}
                </dd>
                {terminal.lastSeenAt && (
                  <>
                    <dt className="text-muted-foreground">
                      {t('terminals.lastSeen')}
                    </dt>
                    <dd className="text-right">
                      {formatDateTime(terminal.lastSeenAt)}
                    </dd>
                  </>
                )}
              </dl>
              {terminal.devices.some((device) => !device.revokedAt) && (
                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('terminals.pairedDevices')}
                  </p>
                  {terminal.devices
                    .filter((device) => !device.revokedAt)
                    .map((device) => (
                      <div
                        key={device.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {device.name || t('terminals.unnamedDevice')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {device.lastSeenAt
                              ? t('terminals.deviceLastSeen', {
                                  date: formatDateTime(device.lastSeenAt),
                                })
                              : t('terminals.deviceNeverSeen')}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={revokeDevice.isPending}
                          onClick={() => {
                            if (window.confirm(t('terminals.revokeConfirm'))) {
                              revokeDevice.mutate({
                                terminalId: terminal.id,
                                deviceId: device.id,
                              });
                            }
                          }}
                        >
                          {t('terminals.revokeDevice')}
                        </Button>
                      </div>
                    ))}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!terminal.isActive || createPairing.isPending}
                  onClick={() => createPairing.mutate(terminal.id)}
                >
                  <Link2 className="h-4 w-4" /> {t('terminals.pairDevice')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditor({ terminal })}
                >
                  <Pencil className="h-4 w-4" /> {t('common.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={t('common.deactivate')}
                  disabled={deactivate.isPending || !terminal.isActive}
                  onClick={() => {
                    if (
                      window.confirm(
                        t('terminals.deactivateConfirm', {
                          name: terminal.name,
                        }),
                      )
                    ) {
                      deactivate.mutate(terminal.id);
                    }
                  }}
                >
                  <PowerOff className="h-4 w-4 text-destructive" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletePermanently.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        t('terminals.deleteConfirm', {
                          name: terminal.name,
                        }),
                      )
                    ) {
                      deletePermanently.mutate(terminal.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('terminals.deletePermanently')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {terminals.isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('common.loading')}
        </p>
      )}
      {terminals.data?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Tablet className="mx-auto mb-3 h-8 w-8" />
            {t('terminals.none')}
          </CardContent>
        </Card>
      )}

      {editor && (
        <TerminalEditor
          terminal={editor.terminal}
          onClose={() => setEditor(null)}
          onSaved={async (activated) => {
            setEditor(null);
            await queryClient.invalidateQueries({ queryKey: ['terminals'] });
            if (activated) await maybeShowSupport();
          }}
        />
      )}

      {pairing && (
        <PairingDialog pairing={pairing} onClose={() => setPairing(null)} />
      )}

      <SupportDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}

function TerminalEditor({
  terminal,
  onClose,
  onSaved,
}: {
  terminal: TerminalDto | null;
  onClose: () => void;
  onSaved: (activated: boolean) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<UpsertTerminalPayload>({
    name: terminal?.name ?? '',
    displayText: terminal?.displayText ?? '',
    locationLabel: terminal?.locationLabel ?? '',
    logoUrl: terminal?.logoUrl ?? null,
    timeZone: terminal?.timeZone ?? getBrowserTimeZone(),
    enforceGeofence: terminal?.enforceGeofence ?? true,
    latitude: terminal?.latitude ?? null,
    longitude: terminal?.longitude ?? null,
    radiusMeters: terminal?.radiusMeters ?? null,
    maxAccuracyMeters: terminal?.maxAccuracyMeters ?? null,
    isActive: terminal?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const wasActive = terminal?.isActive ?? false;
  const timeZoneOptions = getTimeZoneOptions([draft.timeZone]);

  const save = useMutation({
    mutationFn: () => {
      const payload: UpsertTerminalPayload = draft.enforceGeofence
        ? draft
        : {
            ...draft,
            latitude: null,
            longitude: null,
            radiusMeters: null,
            maxAccuracyMeters: null,
          };
      return terminal
        ? api.updateTerminal(terminal.id, payload)
        : api.createTerminal(payload);
    },
    onSuccess: async () => {
      await onSaved(draft.isActive && !wasActive);
    },
    onError: (saveError) =>
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('terminals.saveFailed'),
      ),
  });

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setError(t('terminals.geolocationUnavailable'));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          maxAccuracyMeters: Math.max(
            current.maxAccuracyMeters ?? 0,
            Math.ceil(position.coords.accuracy),
          ),
          radiusMeters: current.radiusMeters ?? 100,
        }));
        setLocating(false);
      },
      () => {
        setError(t('terminals.geolocationFailed'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const loadLogo = (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setError(t('terminals.logoInvalidType'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t('terminals.logoTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError(t('terminals.logoInvalidType'));
        return;
      }
      setDraft((current) => ({ ...current, logoUrl: reader.result as string }));
      setError(null);
    };
    reader.onerror = () => setError(t('terminals.logoInvalidType'));
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {terminal ? t('terminals.edit') : t('terminals.new')}
          </DialogTitle>
          <DialogDescription>
            {t('terminals.editorDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          id="terminal-editor"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field
            id="terminal-name"
            label={t('terminals.name')}
            value={draft.name}
            maxLength={100}
            required
            onChange={(value) => setDraft({ ...draft, name: value })}
          />
          <Field
            id="terminal-location"
            label={t('terminals.locationLabel')}
            value={draft.locationLabel}
            maxLength={120}
            required
            onChange={(value) => setDraft({ ...draft, locationLabel: value })}
          />
          <div className="sm:col-span-2">
            <Field
              id="terminal-text"
              label={t('terminals.displayText')}
              value={draft.displayText}
              maxLength={240}
              required
              onChange={(value) => setDraft({ ...draft, displayText: value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="terminal-logo">{t('terminals.logoUrl')}</Label>
            <Input
              id="terminal-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => loadLogo(event.target.files?.[0])}
            />
            {draft.logoUrl && (
              <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                <img
                  src={draft.logoUrl}
                  alt=""
                  className="h-14 max-w-[60%] object-contain object-left"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ ...draft, logoUrl: null })}
                >
                  {t('terminals.removeLogo')}
                </Button>
              </div>
            )}
          </div>
          <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{t('terminals.geofence')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('terminals.geofenceHint')}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={draft.enforceGeofence}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      enforceGeofence: event.target.checked,
                    }))
                  }
                />
                {t('terminals.enforceGeofence')}
              </label>
            </div>
            {draft.enforceGeofence ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{t('terminals.position')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('terminals.positionHint')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locating}
                    onClick={captureLocation}
                  >
                    <MapPin className="h-4 w-4" />
                    {locating
                      ? t('terminals.locating')
                      : t('terminals.useCurrentPosition')}
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    id="terminal-latitude"
                    label={t('terminals.latitude')}
                    value={draft.latitude}
                    min={-90}
                    max={90}
                    step="any"
                    onChange={(value) =>
                      setDraft({ ...draft, latitude: value })
                    }
                  />
                  <NumberField
                    id="terminal-longitude"
                    label={t('terminals.longitude')}
                    value={draft.longitude}
                    min={-180}
                    max={180}
                    step="any"
                    onChange={(value) =>
                      setDraft({ ...draft, longitude: value })
                    }
                  />
                  <NumberField
                    id="terminal-radius"
                    label={t('terminals.radiusMeters')}
                    value={draft.radiusMeters}
                    min={10}
                    max={1000}
                    step={1}
                    onChange={(value) =>
                      setDraft({ ...draft, radiusMeters: value })
                    }
                  />
                  <NumberField
                    id="terminal-accuracy"
                    label={t('terminals.maxAccuracyMeters')}
                    value={draft.maxAccuracyMeters}
                    min={5}
                    max={500}
                    step={1}
                    onChange={(value) =>
                      setDraft({ ...draft, maxAccuracyMeters: value })
                    }
                  />
                </div>
              </>
            ) : (
              <p className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
                {t('terminals.geofenceDisabledHint')}
              </p>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="terminal-time-zone">
              {t('terminals.timeZone')}
            </Label>
            <select
              id="terminal-time-zone"
              value={draft.timeZone}
              required
              className="flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onChange={(event) =>
                setDraft({ ...draft, timeZone: event.target.value })
              }
            >
              {timeZoneOptions.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 self-end rounded-md border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) =>
                setDraft({ ...draft, isActive: event.target.checked })
              }
            />
            {t('terminals.activeHint')}
          </label>
          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="terminal-editor"
            disabled={save.isPending}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  ...inputProps
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  ...inputProps
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type' | 'value' | 'onChange'
>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value !== null && Number.isFinite(value) ? value : ''}
        onChange={(event) =>
          onChange(
            event.target.value === '' ? null : event.target.valueAsNumber,
          )
        }
        required
        {...inputProps}
      />
    </div>
  );
}

function PairingDialog({
  pairing,
  onClose,
}: {
  pairing: TerminalPairingDto;
  onClose: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const absoluteUrl = new URL(pairing.pairingUrl, window.location.origin).href;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('terminals.pairingTitle')}</DialogTitle>
          <DialogDescription>
            {t('terminals.pairingDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('terminals.pairingCode')}
            </p>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.25em]">
              {pairing.pairingCode}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pairing-url">{t('terminals.pairingUrl')}</Label>
            <div className="flex gap-2">
              <Input id="pairing-url" value={absoluteUrl} readOnly />
              <Button
                type="button"
                variant="outline"
                onClick={() => void copy()}
              >
                <Copy className="h-4 w-4" />
                <span className="sr-only">{t('terminals.copyUrl')}</span>
              </Button>
            </div>
            {copied && (
              <p className="text-xs text-primary">{t('terminals.copied')}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('terminals.pairingExpires', {
              date: formatDateTime(pairing.expiresAt),
            })}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const href = supportUrl();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            {t('terminals.supportTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('terminals.supportDescription')}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg bg-muted p-3 text-sm">
          {t('terminals.supportNoGate')}
        </p>
        <DialogFooter>
          <Button onClick={onClose}>
            {t('terminals.continueWithoutSupport')}
          </Button>
          {href && (
            <Button asChild variant="outline">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
              >
                {t('terminals.supportAction')}
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
