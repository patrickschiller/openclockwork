import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';

const timeEntriesMock = vi.fn().mockResolvedValue([]);
const clockInMock = vi.fn();
const clockOutMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    timeEntries: (...args: unknown[]) => timeEntriesMock(...args),
    clockIn: (...args: unknown[]) => clockInMock(...args),
    clockOut: (...args: unknown[]) => clockOutMock(...args),
  },
}));

vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({
    id: 'emp-1',
    email: 'e@test',
    firstName: 'Test',
    lastName: 'User',
    role: 'Employee',
  }),
  useAuth: () => ({ user: null, login: vi.fn(), logout: vi.fn(), loading: false }),
}));

let onlineState = true;
vi.mock('../app/use-online', () => ({
  useOnline: () => onlineState,
}));

describe('BookingPage', () => {
  beforeEach(() => {
    timeEntriesMock.mockClear().mockResolvedValue([]);
    clockInMock.mockClear();
    clockOutMock.mockClear();
    onlineState = true;
  });

  it('renders the "not clocked in" state when there is no open entry', async () => {
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    await waitFor(() => {
      expect(screen.getByText(/Nicht eingestempelt/i)).toBeDefined();
    });
  });

  it('renders the open entry state when there is one', async () => {
    timeEntriesMock.mockResolvedValueOnce([
      {
        id: 't-1',
        employeeId: 'emp-1',
        clockIn: new Date('2026-05-04T08:00:00Z').toISOString(),
        clockOut: null,
        source: 'web',
        status: 'Open',
        requiresApproval: false,
        latitude: null,
        longitude: null,
        accuracyMeters: null,
        summary: null,
      },
    ]);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/Eingestempelt/i).length).toBeGreaterThan(0);
    });
  });

  it('shows the offline banner and disables both buttons when offline', async () => {
    onlineState = false;
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    expect(screen.getByText(/Offline/i)).toBeDefined();
    expect(screen.getByText(/Buchungen sind aktuell deaktiviert/i)).toBeDefined();
    const buttons = screen.getAllByRole('button');
    const kommen = buttons.find((b) => /Kommen/.test(b.textContent ?? ''));
    const gehen = buttons.find((b) => /Gehen/.test(b.textContent ?? ''));
    expect(kommen?.hasAttribute('disabled')).toBe(true);
    expect(gehen?.hasAttribute('disabled')).toBe(true);
  });
});
