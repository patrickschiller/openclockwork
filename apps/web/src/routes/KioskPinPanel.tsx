import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError, type TerminalBookingAction } from '../api/client';
import {
  bookAtKiosk,
  createKioskChallenge,
  identifyAtKiosk,
  type KioskBookingPayload,
  type KioskBookingResult,
  type TerminalIdentifyResult,
} from '../api/terminal-device';
import { useI18n } from '../app/i18n';

type Phase =
  | 'idle'
  | 'entering'
  | 'identifying'
  | 'confirming'
  | 'locating'
  | 'submitting'
  | 'uncertain'
  | 'success';
const IDLE_MS = 30_000;
const RETRY_MS = 120_000;

function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('location'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    });
  });
}

function errorKey(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  switch (code) {
    case 'TERMINAL_AUTH_RATE_LIMITED':
      return 'terminalPin.rateLimited';
    case 'TERMINAL_GRANT_EXPIRED':
    case 'TERMINAL_GRANT_INVALID':
    case 'TERMINAL_GRANT_REVOKED':
    case 'TERMINAL_CHALLENGE_INVALID':
    case 'TERMINAL_QR_EXPIRED':
      return 'terminalPin.expired';
    case 'TERMINAL_DEVICE_REVOKED':
    case 'TERMINAL_DEVICE_INVALID':
      return 'terminalPin.revoked';
    case 'TERMINAL_METHOD_DISABLED':
    case 'TERMINAL_PIN_UNAVAILABLE':
      return 'terminalPin.unavailable';
    case 'TERMINAL_ACTION_MISMATCH':
    case 'TERMINAL_BOOKING_CONFLICT':
    case 'TERMINAL_GRANT_CONSUMED':
    case 'TERMINAL_CHALLENGE_REPLAYED':
      return 'terminalPin.conflict';
    case 'TERMINAL_OUTSIDE_GEOFENCE':
    case 'TERMINAL_GPS_INACCURATE':
    case 'TERMINAL_POSITION_STALE':
      return 'terminalPin.locationFailed';
    default:
      return 'terminalPin.failed';
  }
}

/** A grant lives only in this mounted session, never in a query/mutation cache. */
export function KioskPinPanel({
  deviceToken,
  online,
  serverOffsetMs,
  authConfigVersion = 0,
  onDeviceRevoked,
}: {
  deviceToken: string;
  online: boolean;
  serverOffsetMs: number;
  authConfigVersion?: number;
  onDeviceRevoked: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [personalNo, setPersonalNo] = useState('');
  const [pin, setPin] = useState('');
  const [identity, setIdentity] = useState<Pick<
    TerminalIdentifyResult,
    'displayName' | 'action'
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KioskBookingResult | null>(null);
  const grant = useRef<TerminalIdentifyResult | null>(null);
  const submitted = useRef<KioskBookingPayload | null>(null);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const activityAt = useRef(Date.now());
  const submittedAt = useRef(0);
  const successAt = useRef(0);
  const busy = useRef(false);
  const version = useRef(authConfigVersion);
  const restoreFocus = useRef(false);
  const personalInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const clear = useCallback(
    (message: string | null = null) => {
      epoch.current += 1;
      controller.current?.abort();
      controller.current = null;
      grant.current = null;
      submitted.current = null;
      busy.current = false;
      setPersonalNo('');
      setPin('');
      setIdentity(null);
      setResult(null);
      setError(message);
      setPhase('idle');
    },
    [setPhase],
  );

  useEffect(() => {
    const forget = () =>
      clear(submitted.current ? 'terminalPin.abandoned' : null);
    const visibility = () => {
      if (document.hidden) forget();
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) forget();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', forget);
    window.addEventListener('pageshow', pageshow);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', forget);
      window.removeEventListener('pageshow', pageshow);
      epoch.current += 1;
      controller.current?.abort();
      grant.current = null;
      submitted.current = null;
    };
  }, [clear]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = phaseRef.current;
      if (current === 'idle') return;
      if (current === 'success') {
        if (Date.now() - successAt.current >= 5_000) clear();
        return;
      }
      const expired =
        grant.current &&
        !submitted.current &&
        Date.now() + serverOffsetMs >= Date.parse(grant.current.expiresAt);
      if (
        expired ||
        Date.now() - activityAt.current >= IDLE_MS ||
        (submitted.current && Date.now() - submittedAt.current >= RETRY_MS)
      ) {
        clear(
          submitted.current ? 'terminalPin.abandoned' : 'terminalPin.expired',
        );
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [clear, serverOffsetMs]);

  useEffect(() => {
    if (online) return;
    if (submitted.current) {
      // Losing connectivity after dispatch does not establish a failed booking.
      // Invalidate the old response and retain only this request for explicit retry.
      epoch.current += 1;
      controller.current?.abort();
      busy.current = false;
      grant.current = null;
      setIdentity(null);
      setPhase('uncertain');
    } else {
      clear('terminalPin.offline');
    }
  }, [online, clear, setPhase]);

  useEffect(() => {
    if (version.current !== authConfigVersion) {
      version.current = authConfigVersion;
      clear(
        submitted.current ? 'terminalPin.abandoned' : 'terminalPin.expired',
      );
    }
  }, [authConfigVersion, clear]);

  useEffect(() => {
    if (phase === 'entering') personalInput.current?.focus();
    if (phase === 'confirming') heading.current?.focus();
    if (phase === 'idle' && restoreFocus.current) {
      restoreFocus.current = false;
      startButton.current?.focus();
    }
  }, [phase]);

  const revoked = (caught: unknown) => {
    if (caught instanceof ApiError && caught.code === 'TERMINAL_DEVICE_REVOKED')
      onDeviceRevoked();
  };

  const identify = async () => {
    if (busy.current || !online || phaseRef.current !== 'entering') return;
    if (!personalNo || !/^\d{8}$/.test(pin)) return;
    busy.current = true;
    const currentEpoch = ++epoch.current;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const credentials = { personalNo, pin };
    setPin('');
    setPersonalNo('');
    setError(null);
    setPhase('identifying');
    activityAt.current = Date.now();
    try {
      const challenge = await createKioskChallenge(deviceToken, signal);
      if (epoch.current !== currentEpoch || signal.aborted) return;
      if (Date.parse(challenge.expiresAt) <= Date.now() + serverOffsetMs) {
        clear('terminalPin.expired');
        return;
      }
      const next = await identifyAtKiosk(
        deviceToken,
        {
          method: 'PIN',
          challengePayload: challenge.payload,
          ...credentials,
        },
        signal,
      );
      if (epoch.current !== currentEpoch || signal.aborted) return;
      if (Date.parse(next.expiresAt) <= Date.now() + serverOffsetMs) {
        clear('terminalPin.expired');
        return;
      }
      grant.current = next;
      setIdentity({ displayName: next.displayName, action: next.action });
      activityAt.current = Date.now();
      setPhase('confirming');
    } catch (caught) {
      if (epoch.current !== currentEpoch) return;
      clear(errorKey(caught));
      revoked(caught);
    } finally {
      credentials.pin = '';
      credentials.personalNo = '';
      if (epoch.current === currentEpoch) busy.current = false;
    }
  };

  const book = async (action: TerminalBookingAction, retry = false) => {
    if (busy.current || !online) return;
    const auth = grant.current;
    let payload: KioskBookingPayload;
    if (retry) {
      if (!submitted.current || phaseRef.current !== 'uncertain') return;
      payload = { ...submitted.current };
    } else {
      if (!auth || phaseRef.current !== 'confirming') return;
      if (Date.now() + serverOffsetMs >= Date.parse(auth.expiresAt)) {
        clear('terminalPin.expired');
        return;
      }
      payload = { grant: auth.grant, action };
    }
    busy.current = true;
    const currentEpoch = ++epoch.current;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    activityAt.current = Date.now();
    setError(null);
    try {
      if (!retry && auth?.requiresLocation) {
        setPhase('locating');
        let position: GeolocationPosition;
        try {
          position = await locate();
        } catch {
          if (epoch.current === currentEpoch) {
            setError('terminalPin.locationFailed');
            setPhase('confirming');
          }
          return;
        }
        if (epoch.current !== currentEpoch || signal.aborted) return;
        payload = {
          ...payload,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          positionTimestamp: new Date(position.timestamp).toISOString(),
        };
      }
      if (epoch.current !== currentEpoch || signal.aborted) return;
      if (!retry) submittedAt.current = Date.now();
      submitted.current = payload;
      setPhase('submitting');
      const receipt = await bookAtKiosk(deviceToken, payload, signal);
      if (epoch.current !== currentEpoch || signal.aborted) return;
      grant.current = null;
      submitted.current = null;
      setIdentity(null);
      setResult(receipt);
      successAt.current = Date.now();
      setPhase('success');
    } catch (caught) {
      if (epoch.current !== currentEpoch) return;
      if (
        caught instanceof ApiError &&
        caught.code === 'TERMINAL_GPS_REQUIRED' &&
        auth
      ) {
        submitted.current = null;
        auth.requiresLocation = true;
        setError('terminalPin.locationRequired');
        setPhase('confirming');
      } else if (!(caught instanceof ApiError) || caught.status >= 500) {
        // A transport/proxy failure cannot prove whether the transaction committed.
        // Keep the exact request, with no visible identity or reusable PIN.
        grant.current = null;
        setIdentity(null);
        setPhase('uncertain');
      } else {
        clear(errorKey(caught));
        revoked(caught);
      }
    } finally {
      if (epoch.current === currentEpoch) busy.current = false;
    }
  };

  const cancel = () => {
    restoreFocus.current = true;
    clear(submitted.current ? 'terminalPin.abandoned' : null);
  };

  return (
    <div
      className="w-full max-w-md space-y-4 rounded-2xl border bg-white p-5 text-slate-950"
      onPointerDown={() => {
        activityAt.current = Date.now();
      }}
      onKeyDown={() => {
        activityAt.current = Date.now();
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      )}
      {phase === 'idle' ? (
        <Button
          ref={startButton}
          className="w-full"
          disabled={!online}
          onClick={() => {
            clear();
            activityAt.current = Date.now();
            setPhase('entering');
          }}
        >
          {t('terminalPin.start')}
        </Button>
      ) : phase === 'entering' ? (
        <form
          className="space-y-4"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            void identify();
          }}
        >
          <h2 className="text-xl font-semibold">{t('terminalPin.title')}</h2>
          <p className="text-sm text-slate-600">
            {t('terminalPin.description')}
          </p>
          <div className="space-y-1">
            <Label htmlFor="kiosk-personal-no">
              {t('terminalPin.personalNo')}
            </Label>
            <Input
              ref={personalInput}
              id="kiosk-personal-no"
              value={personalNo}
              maxLength={100}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setPersonalNo(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kiosk-pin">{t('terminalPin.pin')}</Label>
            <Input
              id="kiosk-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              maxLength={8}
              onChange={(event) => setPin(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!online || !personalNo || !/^\d{8}$/.test(pin)}
          >
            {t('terminalPin.identify')}
          </Button>
        </form>
      ) : phase === 'confirming' && identity ? (
        <div className="space-y-4">
          <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">
            {t('terminalPin.confirm', { name: identity.displayName })}
          </h2>
          <p className="text-sm text-slate-600">
            {t('terminalPin.confirmHint')}
          </p>
          <Button
            className="w-full"
            disabled={!online}
            onClick={() => void book(identity.action)}
          >
            {t(
              identity.action === 'clock-in'
                ? 'terminalPin.clockIn'
                : 'terminalPin.clockOut',
            )}
          </Button>
        </div>
      ) : phase === 'uncertain' ? (
        <div className="space-y-4" role="status">
          <p>{t('terminalPin.uncertain')}</p>
          <Button
            className="w-full"
            disabled={!online}
            onClick={() => {
              const previous = submitted.current;
              if (previous) void book(previous.action, true);
            }}
          >
            {t('terminalPin.retry')}
          </Button>
        </div>
      ) : phase === 'success' && result ? (
        <div role="status" className="space-y-2 text-center">
          <p className="text-xl font-semibold">
            {t(
              result.action === 'clock-in'
                ? 'terminalPin.successIn'
                : 'terminalPin.successOut',
            )}
          </p>
          <p className="text-sm">
            {t('terminalPin.successTime', {
              time: formatDateTime(result.bookedAt),
            })}
          </p>
        </div>
      ) : (
        <p role="status">
          {t(
            phase === 'identifying'
              ? 'terminalPin.identifying'
              : phase === 'locating'
                ? 'terminalPin.locating'
                : 'terminalPin.submitting',
          )}
        </p>
      )}
      {phase !== 'idle' && (
        <Button
          className="w-full"
          type="button"
          variant="outline"
          onClick={cancel}
        >
          {t('terminalPin.cancel')}
        </Button>
      )}
    </div>
  );
}
