import { vi } from 'vitest';
import {
  bookAtKiosk,
  identifyAtKiosk,
  readTerminalDeviceToken,
  storeTerminalDeviceToken,
} from './terminal-device';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it('sends kiosk credentials only with the device bearer and never refreshes an employee login', async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ code: 'TERMINAL_AUTH_FAILED', message: 'Denied' }),
      { status: 401 },
    ),
  );
  await expect(
    identifyAtKiosk('device', {
      method: 'PIN',
      challengePayload: 'challenge',
      personalNo: '0012',
      pin: '00123456',
    }),
  ).rejects.toMatchObject({ code: 'TERMINAL_AUTH_FAILED' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/terminals/kiosk/identify',
    expect.objectContaining({
      credentials: 'omit',
      cache: 'no-store',
      headers: expect.objectContaining({ Authorization: 'Bearer device' }),
    }),
  );
});

it('preserves pairing for incorrect PINs but clears a confirmed device revocation', async () => {
  const values = new Map<string, string>();
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as unknown as Storage);
  storeTerminalDeviceToken('device');
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ code: 'TERMINAL_AUTH_FAILED' }), {
      status: 401,
    }),
  );
  await expect(
    bookAtKiosk('device', { grant: 'grant', action: 'clock-in' }),
  ).rejects.toBeDefined();
  expect(readTerminalDeviceToken()).toBe('device');
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ code: 'TERMINAL_DEVICE_REVOKED' }), {
      status: 401,
    }),
  );
  await expect(
    bookAtKiosk('device', { grant: 'grant', action: 'clock-in' }),
  ).rejects.toBeDefined();
  expect(readTerminalDeviceToken()).toBeNull();
  vi.restoreAllMocks();
});
