import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  CloudOff,
  Link2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandMark } from '../app/BrandMark';
import { LanguageToggle } from '../app/LanguageToggle';
import { useAuth } from '../app/auth';
import { useI18n } from '../app/i18n';
import { useOnline } from '../app/use-online';
import {
  loadKioskState,
  pairTerminal,
  readTerminalDeviceToken,
  storeTerminalDeviceToken,
  type KioskStateDto,
} from '../api/terminal-device';

const REFRESH_SAFETY_MARGIN_MS = 5_000;
const RETRY_DELAY_MS = 10_000;

function readPairingCodeFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get('pairing') ?? url.searchParams.get('code');
}

function scrubPairingCodeFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('pairing') && !url.searchParams.has('code')) return;
  url.searchParams.delete('pairing');
  url.searchParams.delete('code');
  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', cleanUrl);
}

function formatKioskTime(
  now: Date,
  timeZone: string | undefined,
  locale: string,
): { time: string; date: string } {
  const options = timeZone ? { timeZone } : {};
  try {
    return {
      time: new Intl.DateTimeFormat(locale, {
        ...options,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(now),
      date: new Intl.DateTimeFormat(locale, {
        ...options,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(now),
    };
  } catch {
    return formatKioskTime(now, undefined, locale);
  }
}

export function KioskPage() {
  const { t, locale } = useI18n();
  const { logout } = useAuth();
  const online = useOnline();
  const [initialPairingCode] = useState(readPairingCodeFromUrl);
  const [deviceToken, setDeviceToken] = useState(readTerminalDeviceToken);
  const [pairingCode, setPairingCode] = useState('');
  const [state, setState] = useState<KioskStateDto | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoPairStarted = useRef(false);

  useEffect(() => {
    if (initialPairingCode) scrubPairingCodeFromUrl();
  }, [initialPairingCode]);

  const refresh = useCallback(async () => {
    if (!deviceToken || !online) {
      setQrDataUrl(null);
      return;
    }
    setLoading(true);
    try {
      const next = await loadKioskState(deviceToken);
      const parsedServerTime = Date.parse(next.serverTime);
      setServerOffsetMs(
        Number.isFinite(parsedServerTime) ? parsedServerTime - Date.now() : 0,
      );
      setState(next);
      setError(null);
    } catch (refreshError) {
      setQrDataUrl(null);
      setState(null);
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : t('kiosk.refreshFailed'),
      );
      if (!readTerminalDeviceToken()) setDeviceToken(null);
    } finally {
      setLoading(false);
    }
  }, [deviceToken, online, t]);

  const pair = useCallback(
    async (code: string) => {
      const normalized = code.trim();
      if (!normalized || !online) return;
      setPairing(true);
      setError(null);
      try {
        const result = await pairTerminal(normalized);
        storeTerminalDeviceToken(result.deviceToken);
        // A pairing is an explicit hand-over from an administrator to a
        // shared kiosk. Remove any employee/HR session from this browser so
        // navigating to `/` cannot expose an authenticated admin account.
        logout();
        setDeviceToken(result.deviceToken);
        setPairingCode('');
      } catch (pairError) {
        setError(
          pairError instanceof Error
            ? pairError.message
            : t('kiosk.pairFailed'),
        );
      } finally {
        setPairing(false);
      }
    },
    [logout, online, t],
  );

  useEffect(() => {
    const code = initialPairingCode;
    if (!deviceToken && code && !autoPairStarted.current) {
      autoPairStarted.current = true;
      void pair(code);
    }
  }, [deviceToken, initialPairingCode, pair]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const expiresAt = state ? new Date(state.challenge.expiresAt).getTime() : 0;
  const serverNowMs = now.getTime() + serverOffsetMs;
  const expired = !expiresAt || serverNowMs >= expiresAt;

  useEffect(() => {
    if (!state || !online) {
      setQrDataUrl(null);
      return;
    }
    const untilSafetyMargin =
      new Date(state.challenge.expiresAt).getTime() -
      (Date.now() + serverOffsetMs) -
      REFRESH_SAFETY_MARGIN_MS;
    const requestedRefresh = state.challenge.refreshAfterSeconds * 1_000;
    const delay = Math.max(250, Math.min(requestedRefresh, untilSafetyMargin));
    const timer = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [online, refresh, serverOffsetMs, state]);

  useEffect(() => {
    if (!error || !deviceToken || !online) return;
    const timer = window.setTimeout(() => void refresh(), RETRY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [deviceToken, error, online, refresh]);

  useEffect(() => {
    let cancelled = false;
    if (!state || !online || expired) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(state.challenge.payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 640,
      color: { dark: '#020617', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
          setError(t('kiosk.qrFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [expired, online, state, t]);

  const clock = useMemo(
    () =>
      formatKioskTime(
        new Date(serverNowMs),
        state?.terminal.timeZone,
        locale === 'de' ? 'de-DE' : 'en-US',
      ),
    [locale, serverNowMs, state?.terminal.timeZone],
  );

  if (!deviceToken || !state) {
    return (
      <KioskFrame>
        <div className="mx-auto flex min-h-dvh w-full max-w-lg items-center px-5 py-10">
          <Card className="w-full shadow-xl">
            <CardHeader className="space-y-4 text-center">
              <div className="flex justify-end">
                <LanguageToggle />
              </div>
              <BrandMark className="justify-center" />
              <CardTitle>
                <h1 className="text-2xl">{t('kiosk.setupTitle')}</h1>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('kiosk.setupDescription')}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {!online && (
                <Alert variant="destructive">
                  <CloudOff className="h-4 w-4" />
                  <AlertTitle>{t('kiosk.offlineTitle')}</AlertTitle>
                  <AlertDescription>
                    {t('kiosk.offlinePairing')}
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('kiosk.errorTitle')}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {deviceToken && loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t('kiosk.loading')}
                </div>
              ) : !deviceToken ? (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void pair(pairingCode);
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="pairing-code">
                      {t('kiosk.pairingCode')}
                    </Label>
                    <Input
                      id="pairing-code"
                      autoComplete="one-time-code"
                      autoCapitalize="characters"
                      inputMode="text"
                      value={pairingCode}
                      onChange={(event) => setPairingCode(event.target.value)}
                      placeholder={t('kiosk.pairingPlaceholder')}
                    />
                  </div>
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={!pairingCode.trim() || pairing || !online}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    {pairing ? t('kiosk.pairing') : t('kiosk.pair')}
                  </Button>
                </form>
              ) : (
                <Button className="w-full" onClick={() => void refresh()}>
                  {t('kiosk.retry')}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </KioskFrame>
    );
  }

  return (
    <KioskFrame>
      <main className="grid min-h-dvh grid-cols-1 md:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <section className="flex flex-col justify-between gap-8 bg-slate-950 px-8 py-10 text-white sm:px-12 lg:px-16 lg:py-14">
          <div className="flex items-start justify-between gap-4">
            {state.terminal.logoUrl ? (
              <img
                src={state.terminal.logoUrl}
                alt={state.terminal.name}
                className="max-h-24 max-w-[60%] object-contain object-left"
              />
            ) : (
              <BrandMark className="[&_span]:text-white" />
            )}
            <LanguageToggle />
          </div>

          <div className="space-y-6">
            <p className="text-xl font-medium text-slate-300">
              {state.terminal.locationLabel}
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {state.terminal.displayText || t('kiosk.defaultMessage')}
            </h1>
          </div>

          <div>
            <p className="tabular-nums text-3xl font-semibold sm:text-4xl lg:text-5xl">
              {clock.time}
            </p>
            <p className="mt-3 text-xl text-slate-300">{clock.date}</p>
          </div>
        </section>

        <section className="flex min-w-0 flex-col items-center justify-center gap-6 bg-slate-50 px-8 py-10 text-slate-950">
          <div className="text-center">
            <h2 className="text-3xl font-semibold">{t('kiosk.scanTitle')}</h2>
            <p className="mt-2 max-w-md text-slate-600">
              {t('kiosk.scanDescription')}
            </p>
          </div>

          {!online ? (
            <KioskUnavailable
              icon={<CloudOff className="h-14 w-14" />}
              title={t('kiosk.offlineTitle')}
              description={t('kiosk.offlineDescription')}
            />
          ) : expired || !qrDataUrl ? (
            <KioskUnavailable
              icon={<RefreshCw className="h-14 w-14 animate-spin" />}
              title={t('kiosk.refreshingTitle')}
              description={t('kiosk.refreshingDescription')}
            />
          ) : (
            <div className="w-full max-w-[430px] rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
              <img
                src={qrDataUrl}
                alt={t('kiosk.qrAlt')}
                className="aspect-square h-auto w-full"
              />
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <ShieldCheck className="h-4 w-4" />
            {t('kiosk.securityHint')}
          </div>
          {error && online && (
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('kiosk.retry')}
            </Button>
          )}
        </section>
      </main>
    </KioskFrame>
  );
}

function KioskFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = 'OpenClockwork Terminal';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex,nofollow,noarchive';
    document.head.appendChild(robots);

    // A dedicated manifest ensures an iPad home-screen installation always
    // starts in kiosk mode instead of falling through to the employee login.
    const previousManifests = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]'),
    );
    previousManifests.forEach((link) => link.remove());
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/kiosk.webmanifest';
    document.head.appendChild(manifest);

    const appleTitle = document.createElement('meta');
    appleTitle.name = 'apple-mobile-web-app-title';
    appleTitle.content = 'Clockwork Terminal';
    document.head.appendChild(appleTitle);
    return () => {
      robots.remove();
      manifest.remove();
      appleTitle.remove();
      previousManifests.forEach((link) => document.head.appendChild(link));
      document.title = 'OpenClockwork';
    };
  }, []);
  return <div className="min-h-dvh bg-slate-950">{children}</div>;
}

function KioskUnavailable({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className="flex aspect-square w-full max-w-[430px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-slate-500"
      role="status"
      aria-live="polite"
    >
      {icon}
      <p className="mt-5 text-xl font-semibold text-slate-800">{title}</p>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}
