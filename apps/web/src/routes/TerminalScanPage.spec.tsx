import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { ApiError } from '../api/client';
import { renderWithProviders } from '../test-utils';
import { TerminalScanPage } from './TerminalScanPage';

const scanner = vi.hoisted(() => ({
  callback: null as ((result: { data: string }) => void) | null,
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(),
  destroy: vi.fn(),
}));
const bookAtTerminalMock = vi.hoisted(() => vi.fn());

vi.mock('qr-scanner', () => ({
  default: class MockQrScanner {
    constructor(
      _video: HTMLVideoElement,
      callback: (result: { data: string }) => void,
    ) {
      scanner.callback = callback;
    }

    start = scanner.start;
    stop = scanner.stop;
    destroy = scanner.destroy;
  },
}));

vi.mock('../api/client', () => {
  class MockApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
    ) {
      super(message);
    }
  }
  return {
    api: {
      bookAtTerminal: (...args: unknown[]) => bookAtTerminalMock(...args),
    },
    ApiError: MockApiError,
  };
});

vi.mock('../app/use-online', () => ({ useOnline: () => true }));

describe('TerminalScanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scanner.callback = null;
    scanner.start.mockResolvedValue(undefined);
    bookAtTerminalMock.mockResolvedValue({ action: 'clock-in' });
  });

  it('uses a fresh high-accuracy position after scanning', async () => {
    const positionTimestamp = Date.now();
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 49.7913,
          longitude: 9.9534,
          accuracy: 12,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: positionTimestamp,
        toJSON: () => ({}),
      }),
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    renderWithProviders(<TerminalScanPage />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Kamera öffnen und QR-Code scannen',
      }),
    );
    await waitFor(() => expect(scanner.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      scanner.callback?.({ data: 'x'.repeat(40) });
    });

    await waitFor(() =>
      expect(bookAtTerminalMock).toHaveBeenCalledWith({
        qrPayload: 'x'.repeat(40),
        action: 'clock-in',
        latitude: 49.7913,
        longitude: 9.9534,
        accuracyMeters: 12,
        positionTimestamp: new Date(positionTimestamp).toISOString(),
      }),
    );
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
    expect(
      await screen.findByText('Du wurdest erfolgreich eingestempelt.'),
    ).toBeDefined();
  });

  it('fails closed when location permission is denied', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure: PositionErrorCallback,
        ) =>
          failure({ code: 1, message: 'denied' } as GeolocationPositionError),
      },
    });

    renderWithProviders(<TerminalScanPage />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Kamera öffnen und QR-Code scannen',
      }),
    );
    await waitFor(() => expect(scanner.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      scanner.callback?.({ data: 'x'.repeat(40) });
    });

    expect(
      await screen.findByText(/Der Standortzugriff wurde abgelehnt/),
    ).toBeDefined();
    expect(bookAtTerminalMock).not.toHaveBeenCalled();
  });

  it('books an n-marked challenge without requesting geolocation', async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
    const qrPayload = `ocw1.n.${'x'.repeat(43)}`;

    renderWithProviders(<TerminalScanPage />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Kamera öffnen und QR-Code scannen',
      }),
    );
    await waitFor(() => expect(scanner.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      scanner.callback?.({ data: qrPayload });
    });

    await waitFor(() =>
      expect(bookAtTerminalMock).toHaveBeenCalledWith({
        qrPayload,
        action: 'clock-in',
      }),
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('retries with fresh GPS if the geofence was enabled after QR creation', async () => {
    const positionTimestamp = Date.now();
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 49.7913,
          longitude: 9.9534,
          accuracy: 12,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: positionTimestamp,
        toJSON: () => ({}),
      }),
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
    bookAtTerminalMock
      .mockRejectedValueOnce(
        new ApiError(
          400,
          'A fresh GPS position is required',
          'TERMINAL_GPS_REQUIRED',
        ),
      )
      .mockResolvedValueOnce({ action: 'clock-in' });
    const qrPayload = `ocw1.n.${'x'.repeat(43)}`;

    renderWithProviders(<TerminalScanPage />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Kamera öffnen und QR-Code scannen',
      }),
    );
    await waitFor(() => expect(scanner.start).toHaveBeenCalledTimes(1));
    await act(async () => {
      scanner.callback?.({ data: qrPayload });
    });

    await waitFor(() => expect(bookAtTerminalMock).toHaveBeenCalledTimes(2));
    expect(bookAtTerminalMock).toHaveBeenNthCalledWith(1, {
      qrPayload,
      action: 'clock-in',
    });
    expect(bookAtTerminalMock).toHaveBeenNthCalledWith(2, {
      qrPayload,
      action: 'clock-in',
      latitude: 49.7913,
      longitude: 9.9534,
      accuracyMeters: 12,
      positionTimestamp: new Date(positionTimestamp).toISOString(),
    });
  });
});
