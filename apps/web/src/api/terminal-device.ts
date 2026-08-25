import { ApiError, type TerminalDto } from './client';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export const TERMINAL_DEVICE_TOKEN_STORAGE_KEY =
  'openclockwork.terminalDeviceToken';

export type TerminalPublicDto = Pick<
  TerminalDto,
  'id' | 'name' | 'displayText' | 'locationLabel' | 'logoUrl' | 'timeZone'
>;

export interface TerminalChallengeDto {
  /** Signed challenge. Only the documented geofence marker may be inspected. */
  payload: string;
  expiresAt: string;
  refreshAfterSeconds: number;
}

export interface KioskStateDto {
  terminal: TerminalPublicDto;
  challenge: TerminalChallengeDto;
  serverTime: string;
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
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      storeTerminalDeviceToken(null);
    }
    throw error;
  }
}
