import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { ApiError } from '../api/client';
import { renderWithProviders } from '../test-utils';
import { KioskPinPanel } from './KioskPinPanel';

const challenge = vi.fn();
const identify = vi.fn();
const book = vi.fn();
vi.mock('../api/terminal-device', () => ({
  createKioskChallenge: (...args: unknown[]) => challenge(...args),
  identifyAtKiosk: (...args: unknown[]) => identify(...args),
  bookAtKiosk: (...args: unknown[]) => book(...args),
}));
const onDeviceRevoked = vi.fn();
const props = {
  deviceToken: 'device-only',
  online: true,
  serverOffsetMs: 0,
  onDeviceRevoked,
};
const receipt = {
  code: 'TERMINAL_BOOKED',
  action: 'clock-in',
  bookedAt: '2026-09-30T08:00:00Z',
  receiptId: 'receipt',
};

beforeEach(() => {
  vi.clearAllMocks();
  challenge.mockResolvedValue({
    payload: 'fresh-challenge',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  identify.mockResolvedValue({
    grant: 'secret-grant',
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    displayName: 'Alex E.',
    action: 'clock-in',
    requiresLocation: false,
  });
  book.mockResolvedValue(receipt);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function enterPin() {
  fireEvent.click(screen.getByRole('button', { name: 'Mit PIN anmelden' }));
  fireEvent.change(screen.getByLabelText('Personalnummer'), {
    target: { value: '0012' },
  });
  fireEvent.change(screen.getByLabelText('Terminal-PIN'), {
    target: { value: '00123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Anmeldung prüfen' }));
}

it('preserves lexical credentials and requires a separate explicit booking confirmation', async () => {
  const rendered = renderWithProviders(<KioskPinPanel {...props} />);
  enterPin();
  const confirm = await screen.findByRole('button', {
    name: 'Jetzt einstempeln',
  });
  expect(identify).toHaveBeenCalledWith(
    'device-only',
    {
      method: 'PIN',
      challengePayload: 'fresh-challenge',
      personalNo: '0012',
      pin: '00123456',
    },
    expect.any(AbortSignal),
  );
  expect(book).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Terminal-PIN')).toBeNull();
  expect(rendered.queryClient.getMutationCache().getAll()).toHaveLength(0);
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await screen.findByText('Einstempeln bestätigt');
  expect(book).toHaveBeenCalledTimes(1);
  expect(book).toHaveBeenCalledWith(
    'device-only',
    { grant: 'secret-grant', action: 'clock-in' },
    expect.any(AbortSignal),
  );
  expect(screen.queryByText(/Alex E\./)).toBeNull();
});

it('retries only the original booking after a lost response, without another identification', async () => {
  book.mockRejectedValueOnce(new TypeError('network failed'));
  renderWithProviders(<KioskPinPanel {...props} />);
  enterPin();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Jetzt einstempeln' }),
  );
  const retry = await screen.findByRole('button', {
    name: 'Dieselbe Buchung erneut prüfen',
  });
  expect(screen.queryByText(/Alex E\./)).toBeNull();
  fireEvent.click(retry);
  await screen.findByText('Einstempeln bestätigt');
  expect(identify).toHaveBeenCalledTimes(1);
  expect(book).toHaveBeenCalledTimes(2);
  expect(book.mock.calls[1][1]).toEqual(book.mock.calls[0][1]);
});

it('does not restore identity or a grant from an identification completed after cancellation', async () => {
  let finish!: (value: unknown) => void;
  identify.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  renderWithProviders(<KioskPinPanel {...props} />);
  enterPin();
  await waitFor(() => expect(identify).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Vorgang beenden' }));
  await act(async () => {
    finish({
      grant: 'late-secret',
      displayName: 'Late Name',
      action: 'clock-in',
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      requiresLocation: false,
    });
  });
  expect(screen.queryByText(/Late Name/)).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Jetzt einstempeln' }),
  ).toBeNull();
  expect(book).not.toHaveBeenCalled();
});

it('uses a neutral credential error without revoking the paired device', async () => {
  identify.mockRejectedValueOnce(
    new ApiError(
      401,
      'employee-sensitive-server-message',
      'TERMINAL_AUTH_FAILED',
    ),
  );
  renderWithProviders(<KioskPinPanel {...props} />);
  enterPin();
  await screen.findByText(/Anmeldung nicht möglich/);
  expect(screen.queryByText('employee-sensitive-server-message')).toBeNull();
  expect(onDeviceRevoked).not.toHaveBeenCalled();
  expect(book).not.toHaveBeenCalled();
});

it('requires a new explicit confirmation if location becomes mandatory', async () => {
  const position = vi.fn((resolve: PositionCallback) =>
    resolve({
      coords: { latitude: 49, longitude: 9, accuracy: 10 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  );
  const locationNavigator = Object.create(navigator);
  Object.defineProperty(locationNavigator, 'geolocation', {
    value: { getCurrentPosition: position },
  });
  vi.stubGlobal('navigator', locationNavigator);
  book.mockRejectedValueOnce(
    new ApiError(400, 'location required', 'TERMINAL_GPS_REQUIRED'),
  );
  renderWithProviders(<KioskPinPanel {...props} />);
  enterPin();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Jetzt einstempeln' }),
  );
  await screen.findByText(/Für diese Buchung ist jetzt/);
  expect(book).toHaveBeenCalledTimes(1);
  expect(position).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Jetzt einstempeln' }));
  await screen.findByText('Einstempeln bestätigt');
  expect(position).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
  );
  expect(book.mock.calls[1][1]).toMatchObject({
    grant: 'secret-grant',
    action: 'clock-in',
    latitude: 49,
    longitude: 9,
  });
  vi.unstubAllGlobals();
});

it('removes a pending identity when the terminal configuration changes', async () => {
  const rendered = renderWithProviders(
    <KioskPinPanel {...props} authConfigVersion={1} />,
  );
  enterPin();
  await screen.findByRole('button', { name: 'Jetzt einstempeln' });
  rendered.rerender(<KioskPinPanel {...props} authConfigVersion={2} />);
  await waitFor(() => expect(screen.queryByText(/Alex E\./)).toBeNull());
  expect(
    screen.queryByRole('button', { name: 'Jetzt einstempeln' }),
  ).toBeNull();
  expect(book).not.toHaveBeenCalled();
});

it('forgets identity and blocks a late response after the kiosk moves to the background', async () => {
  let finish!: (value: unknown) => void;
  identify.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  renderWithProviders(<KioskPinPanel {...props} />);
  enterPin();
  await waitFor(() => expect(identify).toHaveBeenCalledTimes(1));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => {
    finish({
      grant: 'background-secret',
      displayName: 'Hidden Person',
      action: 'clock-in',
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      requiresLocation: false,
    });
  });
  expect(screen.queryByText(/Hidden Person/)).toBeNull();
  expect(screen.queryByLabelText('Terminal-PIN')).toBeNull();
  expect(book).not.toHaveBeenCalled();
});

it('treats going offline after dispatch as uncertain and safely retries after reconnecting', async () => {
  book.mockImplementationOnce(() => new Promise(() => undefined));
  const rendered = renderWithProviders(<KioskPinPanel {...props} />);
  enterPin();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Jetzt einstempeln' }),
  );
  await waitFor(() => expect(book).toHaveBeenCalledTimes(1));
  rendered.rerender(<KioskPinPanel {...props} online={false} />);
  expect(
    screen
      .getByRole('button', { name: 'Dieselbe Buchung erneut prüfen' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.queryByText(/Alex E\./)).toBeNull();
  rendered.rerender(<KioskPinPanel {...props} online />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Dieselbe Buchung erneut prüfen' }),
  );
  await screen.findByText('Einstempeln bestätigt');
  expect(book.mock.calls[1][1]).toEqual(book.mock.calls[0][1]);
  expect(identify).toHaveBeenCalledTimes(1);
});

it('forgets entered credentials after inactivity and never authenticates offline', async () => {
  vi.useFakeTimers();
  const rendered = renderWithProviders(<KioskPinPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mit PIN anmelden' }));
  fireEvent.change(screen.getByLabelText('Personalnummer'), {
    target: { value: '0012' },
  });
  fireEvent.change(screen.getByLabelText('Terminal-PIN'), {
    target: { value: '00123456' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_500);
  });
  expect(screen.queryByLabelText('Terminal-PIN')).toBeNull();
  rendered.rerender(<KioskPinPanel {...props} online={false} />);
  expect(
    screen
      .getByRole('button', { name: 'Mit PIN anmelden' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(identify).not.toHaveBeenCalled();
});
