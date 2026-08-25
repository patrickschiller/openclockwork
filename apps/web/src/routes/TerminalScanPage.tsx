import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import QrScanner from 'qr-scanner';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  CloudOff,
  LocateFixed,
  LogIn,
  LogOut,
  RotateCcw,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, type TerminalBookingAction } from '../api/client';
import type { TerminalBookingPayload } from '../api/client';
import { useI18n } from '../app/i18n';
import { useOnline } from '../app/use-online';

type ScanPhase =
  | 'idle'
  | 'starting-camera'
  | 'scanning'
  | 'locating'
  | 'booking';

function freshHighAccuracyPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('GEOLOCATION_UNAVAILABLE'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });
}

function qrHintsLocationRequired(qrPayload: string): boolean {
  // This is only a UX optimization. The server validates the complete token
  // and its current terminal configuration authoritatively.
  return !qrPayload.startsWith('ocw1.n.');
}

function positionPayload(
  position: GeolocationPosition,
): Pick<
  TerminalBookingPayload,
  'latitude' | 'longitude' | 'accuracyMeters' | 'positionTimestamp'
> {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    positionTimestamp: new Date(position.timestamp).toISOString(),
  };
}

const TERMINAL_ERROR_KEYS: Record<string, string> = {
  TERMINAL_QR_EXPIRED: 'terminalScan.errorExpired',
  TERMINAL_QR_INVALID: 'terminalScan.errorInvalid',
  TERMINAL_QR_REPLAYED: 'terminalScan.errorReplayed',
  TERMINAL_OUTSIDE_GEOFENCE: 'terminalScan.errorOutsideRadius',
  TERMINAL_GPS_INACCURATE: 'terminalScan.errorInaccurate',
  TERMINAL_INACTIVE: 'terminalScan.errorInactive',
  TERMINAL_ACTION_MISMATCH: 'terminalScan.errorActionMismatch',
  TERMINAL_BOOKING_CONFLICT: 'terminalScan.errorBookingConflict',
  TERMINAL_POSITION_STALE: 'terminalScan.errorPositionStale',
};

export function TerminalScanPage() {
  const { t } = useI18n();
  const online = useOnline();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const handlingResult = useRef(false);
  const [action, setAction] = useState<TerminalBookingAction>('clock-in');
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TerminalBookingAction | null>(null);

  const stopScanner = () => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
  };

  useEffect(() => () => stopScanner(), []);

  useEffect(() => {
    if (!online) {
      stopScanner();
      handlingResult.current = false;
      setPhase('idle');
    }
  }, [online]);

  const reset = () => {
    stopScanner();
    handlingResult.current = false;
    setPhase('idle');
    setError(null);
    setSuccess(null);
  };

  const explainError = (bookingError: unknown): string => {
    if (bookingError instanceof ApiError && bookingError.code) {
      const key = TERMINAL_ERROR_KEYS[bookingError.code];
      if (key) return t(key);
    }
    const geolocationCode =
      typeof bookingError === 'object' &&
      bookingError !== null &&
      'code' in bookingError &&
      typeof bookingError.code === 'number'
        ? bookingError.code
        : null;
    if (geolocationCode !== null) {
      if (geolocationCode === 1) {
        return t('terminalScan.locationDenied');
      }
      if (geolocationCode === 3) {
        return t('terminalScan.locationTimeout');
      }
      return t('terminalScan.locationFailed');
    }
    if (
      bookingError instanceof Error &&
      bookingError.message === 'GEOLOCATION_UNAVAILABLE'
    ) {
      return t('terminalScan.locationUnavailable');
    }
    if (bookingError instanceof Error && bookingError.message) {
      return bookingError.message;
    }
    return t('terminalScan.bookingFailed');
  };

  const completeScan = async (qrPayload: string) => {
    if (handlingResult.current) return;
    handlingResult.current = true;
    stopScanner();
    setError(null);
    try {
      if (!online) throw new Error(t('terminalScan.offlineDescription'));
      const locationHint = qrHintsLocationRequired(qrPayload);
      let payload: TerminalBookingPayload = { qrPayload, action };
      if (locationHint) {
        setPhase('locating');
        payload = {
          ...payload,
          ...positionPayload(await freshHighAccuracyPosition()),
        };
      }
      setPhase('booking');
      try {
        await api.bookAtTerminal(payload);
      } catch (bookingError) {
        // A HRAdmin may enable the geofence while an older `n` challenge is
        // still on screen. Retry once with a fresh position; the first request
        // cannot have redeemed the challenge because GPS validation happens
        // before the booking transaction.
        if (
          locationHint ||
          !(bookingError instanceof ApiError) ||
          bookingError.code !== 'TERMINAL_GPS_REQUIRED'
        ) {
          throw bookingError;
        }
        setPhase('locating');
        payload = {
          ...payload,
          ...positionPayload(await freshHighAccuracyPosition()),
        };
        setPhase('booking');
        await api.bookAtTerminal(payload);
      }
      setSuccess(action);
      setPhase('idle');
      void queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (scanError) {
      setError(explainError(scanError));
      setPhase('idle');
    } finally {
      handlingResult.current = false;
    }
  };

  const startScanner = async () => {
    if (!videoRef.current || !online) return;
    reset();
    setPhase('starting-camera');
    try {
      const scanner = new QrScanner(
        videoRef.current,
        (result) => void completeScan(result.data),
        {
          preferredCamera: 'environment',
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
          maxScansPerSecond: 8,
        },
      );
      scannerRef.current = scanner;
      await scanner.start();
      setPhase('scanning');
    } catch (cameraError) {
      stopScanner();
      setPhase('idle');
      const name = cameraError instanceof Error ? cameraError.name : '';
      setError(
        name === 'NotAllowedError'
          ? t('terminalScan.cameraDenied')
          : t('terminalScan.cameraFailed'),
      );
    }
  };

  const pending =
    phase === 'starting-camera' || phase === 'locating' || phase === 'booking';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('terminalScan.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('terminalScan.description')}
        </p>
      </div>

      {!online && (
        <Alert variant="destructive">
          <CloudOff className="h-4 w-4" />
          <AlertTitle>{t('terminalScan.offlineTitle')}</AlertTitle>
          <AlertDescription>
            {t('terminalScan.offlineDescription')}
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('terminalScan.errorTitle')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>{t('terminalScan.successTitle')}</AlertTitle>
          <AlertDescription>
            {success === 'clock-in'
              ? t('terminalScan.clockInSuccess')
              : t('terminalScan.clockOutSuccess')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('terminalScan.actionTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            className="grid grid-cols-2 gap-3"
            role="group"
            aria-label={t('terminalScan.actionTitle')}
          >
            <Button
              type="button"
              size="lg"
              variant={action === 'clock-in' ? 'default' : 'outline'}
              disabled={phase !== 'idle'}
              aria-pressed={action === 'clock-in'}
              onClick={() => {
                setAction('clock-in');
                setSuccess(null);
              }}
            >
              <LogIn className="h-5 w-5" /> {t('booking.clockIn')}
            </Button>
            <Button
              type="button"
              size="lg"
              variant={action === 'clock-out' ? 'default' : 'outline'}
              disabled={phase !== 'idle'}
              aria-pressed={action === 'clock-out'}
              onClick={() => {
                setAction('clock-out');
                setSuccess(null);
              }}
            >
              <LogOut className="h-5 w-5" /> {t('booking.clockOut')}
            </Button>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              aria-label={t('terminalScan.cameraPreview')}
            />
            {phase !== 'scanning' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 px-6 text-center text-white">
                {phase === 'locating' ? (
                  <LocateFixed className="h-12 w-12 animate-pulse" />
                ) : phase === 'booking' ? (
                  <RotateCcw className="h-12 w-12 animate-spin" />
                ) : (
                  <Camera className="h-12 w-12" />
                )}
                <p className="mt-4 font-medium">
                  {phase === 'locating'
                    ? t('terminalScan.locating')
                    : phase === 'booking'
                      ? t('terminalScan.booking')
                      : t('terminalScan.cameraIdle')}
                </p>
              </div>
            )}
          </div>

          {phase === 'scanning' ? (
            <Button className="w-full" variant="outline" onClick={reset}>
              {t('common.cancel')}
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              disabled={!online || pending}
              onClick={() => void startScanner()}
            >
              <Camera className="h-5 w-5" />
              {pending ? t('terminalScan.working') : t('terminalScan.start')}
            </Button>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {t('terminalScan.privacyHint')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
