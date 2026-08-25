import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { KioskPage } from './KioskPage';

const loadKioskStateMock = vi.fn();
const pairTerminalMock = vi.fn();
const readTerminalDeviceTokenMock = vi.fn();
const storeTerminalDeviceTokenMock = vi.fn();
const toDataUrlMock = vi.fn();
const logoutMock = vi.fn();
let online = true;

vi.mock('qrcode', () => ({
  default: { toDataURL: (...args: unknown[]) => toDataUrlMock(...args) },
}));

vi.mock('../api/terminal-device', () => ({
  loadKioskState: (...args: unknown[]) => loadKioskStateMock(...args),
  pairTerminal: (...args: unknown[]) => pairTerminalMock(...args),
  readTerminalDeviceToken: (...args: unknown[]) =>
    readTerminalDeviceTokenMock(...args),
  storeTerminalDeviceToken: (...args: unknown[]) =>
    storeTerminalDeviceTokenMock(...args),
}));

vi.mock('../app/use-online', () => ({
  useOnline: () => online,
}));

vi.mock('../app/auth', () => ({
  useAuth: () => ({ logout: logoutMock }),
}));

function kioskState() {
  const now = Date.now();
  return {
    terminal: {
      id: 'terminal-1',
      name: 'Empfang',
      displayText: 'Willkommen',
      locationLabel: 'Würzburg',
      logoUrl: null,
      timeZone: 'Europe/Berlin',
    },
    challenge: {
      payload: 'opaque-signed-challenge-value',
      expiresAt: new Date(now + 60_000).toISOString(),
      refreshAfterSeconds: 40,
    },
    serverTime: new Date(now).toISOString(),
  };
}

describe('KioskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online = true;
    window.history.replaceState({}, '', '/kiosk');
    readTerminalDeviceTokenMock.mockReturnValue('device-token');
    loadKioskStateMock.mockResolvedValue(kioskState());
    toDataUrlMock.mockResolvedValue('data:image/png;base64,qr');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('renders only a fresh server challenge for a paired device', async () => {
    renderWithProviders(<KioskPage />, { initialPath: '/kiosk' });

    expect(
      await screen.findByRole('img', {
        name: 'Kurzzeitig gültiger QR-Code für dieses Terminal',
      }),
    ).toBeDefined();
    expect(loadKioskStateMock).toHaveBeenCalledWith('device-token');
    expect(toDataUrlMock).toHaveBeenCalledWith(
      'opaque-signed-challenge-value',
      expect.any(Object),
    );
    const clock = screen.getByText(/^\d{2}:\d{2}:\d{2}$/);
    expect(clock.classList.contains('text-3xl')).toBe(true);
    expect(clock.classList.contains('sm:text-4xl')).toBe(true);
    expect(clock.classList.contains('lg:text-5xl')).toBe(true);
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('uses a pairing URL once and immediately scrubs its code', async () => {
    readTerminalDeviceTokenMock.mockReturnValue(null);
    window.history.replaceState({}, '', '/kiosk?pairing=ABCD-1234');
    pairTerminalMock.mockResolvedValue({
      deviceToken: 'new-device-token',
      terminal: kioskState().terminal,
    });

    renderWithProviders(<KioskPage />, {
      initialPath: '/kiosk?pairing=ABCD-1234',
    });

    await waitFor(() =>
      expect(pairTerminalMock).toHaveBeenCalledWith('ABCD-1234'),
    );
    expect(window.location.search).toBe('');
    expect(storeTerminalDeviceTokenMock).toHaveBeenCalledWith(
      'new-device-token',
    );
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('uses server time to reject a challenge that only the iPad clock considers fresh', async () => {
    const localNow = Date.now();
    const staleState = kioskState();
    staleState.serverTime = new Date(localNow + 120_000).toISOString();
    staleState.challenge.expiresAt = new Date(localNow + 60_000).toISOString();
    loadKioskStateMock.mockResolvedValue(staleState);

    renderWithProviders(<KioskPage />, { initialPath: '/kiosk' });

    expect(await screen.findByText('Neuer QR-Code wird geladen')).toBeDefined();
    expect(toDataUrlMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('img', {
        name: 'Kurzzeitig gültiger QR-Code für dieses Terminal',
      }),
    ).toBeNull();
  });

  it('fails closed without a network connection', async () => {
    const rendered = renderWithProviders(<KioskPage />, {
      initialPath: '/kiosk',
    });
    expect(
      await screen.findByRole('img', {
        name: 'Kurzzeitig gültiger QR-Code für dieses Terminal',
      }),
    ).toBeDefined();

    online = false;
    rendered.rerender(<KioskPage />);

    await waitFor(() =>
      expect(
        screen.queryByRole('img', {
          name: 'Kurzzeitig gültiger QR-Code für dieses Terminal',
        }),
      ).toBeNull(),
    );
    expect(screen.getByText('Keine Verbindung')).toBeDefined();
  });
});
