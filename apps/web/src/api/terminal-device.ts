import {
  ApiError,
  type TerminalDto,
  type TerminalBookingAction,
} from './client';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export const TERMINAL_DEVICE_TOKEN_STORAGE_KEY =
  'openclockwork.terminalDeviceToken';

export type TerminalPublicDto = Pick<
  TerminalDto,
  | 'id'
  | 'name'
  | 'displayText'
  | 'locationLabel'
  | 'logoUrl'
  | 'timeZone'
  | 'allowedAuthMethods'
  | 'authConfigVersion'
>;

export interface TerminalChallengeDto {
  /** Signed challenge. Only the documented geofence marker may be inspected. */
  payload: string;
  expiresAt: string;
  refreshAfterSeconds: number;
}

export interface KioskStateDto {
  terminal: TerminalPublicDto;
  challenge: TerminalChallengeDto | null;
  serverTime: string;
  configRefreshAfterSeconds: number;
  requiresLocation: boolean;
  pinAvailable: boolean;
}

export interface TerminalIdentifyResult {
  grant: string;
  expiresAt: string;
  displayName: string;
  action: TerminalBookingAction;
  requiresLocation: boolean;
}

export interface KioskBookingPayload {
  grant: string;
  action: TerminalBookingAction;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  positionTimestamp?: string;
}

export interface KioskBookingResult {
  code: 'TERMINAL_BOOKED';
  action: TerminalBookingAction;
  bookedAt: string;
  receiptId: string;
}

export interface PairTerminalResultDto {
  deviceToken: string;
  terminal: TerminalPublicDto;
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readTerminalDeviceToken(): string | null {
  return (
    localStorageOrNull()?.getItem(TERMINAL_DEVICE_TOKEN_STORAGE_KEY) ?? null
  );
}

export function storeTerminalDeviceToken(token: string | null): void {
  const storage = localStorageOrNull();
  if (!storage) return;
  if (token) storage.setItem(TERMINAL_DEVICE_TOKEN_STORAGE_KEY, token);
  else storage.removeItem(TERMINAL_DEVICE_TOKEN_STORAGE_KEY);
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string | string[];
        code?: string;
        error?: string;
      };
      code = body.code;
      if (Array.isArray(body.message)) message = body.message.join('; ');
      else if (typeof body.message === 'string') message = body.message;
      else if (typeof body.error === 'string') message = body.error;
    } catch {
      // An unavailable reverse proxy may return HTML. Keep the status message.
    }
    throw new ApiError(response.status, message, code);
  }
  return (await response.json()) as T;
}

export async function pairTerminal(
  pairingCode: string,
): Promise<PairTerminalResultDto> {
  const response = await fetch(`${baseUrl}/api/terminals/pair`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({ pairingCode }),
  });
  return parseResponse<PairTerminalResultDto>(response);
}

export async function loadKioskState(
  deviceToken: string,
): Promise<KioskStateDto> {
  const response = await fetch(`${baseUrl}/api/terminals/kiosk`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${deviceToken}`,
      'Cache-Control': 'no-store',
    },
  });
  try {
    return await parseResponse<KioskStateDto>(response);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'TERMINAL_DEVICE_REVOKED') {
      storeTerminalDeviceToken(null);
    }
    throw error;
  }
}

/** Device-only transport: never attach employee tokens or refresh a login. */
async function kioskPost<T>(
  token: string,
  path: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const response = await fetch(`${baseUrl}/api/terminals/kiosk/${path}`, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return await parseResponse<T>(response);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'TERMINAL_DEVICE_REVOKED') {
      storeTerminalDeviceToken(null);
    }
    throw error;
  }
}

export const createKioskChallenge = (token: string, signal?: AbortSignal) =>
  kioskPost<{ payload: string; expiresAt: string }>(
    token,
    'challenge',
    {},
    signal,
  );

export const identifyAtKiosk = (
  token: string,
  payload: {
    method: 'PIN';
    challengePayload: string;
    personalNo: string;
    pin: string;
  },
  signal?: AbortSignal,
) => kioskPost<TerminalIdentifyResult>(token, 'identify', payload, signal);

export const bookAtKiosk = (
  token: string,
  payload: KioskBookingPayload,
  signal?: AbortSignal,
) => kioskPost<KioskBookingResult>(token, 'book', payload, signal);
