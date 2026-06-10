import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';

const timeEntriesMock = vi.fn().mockResolvedValue([]);
const clockInMock = vi.fn();
const clockOutMock = vi.fn();
const bookableProjectsMock = vi.fn().mockResolvedValue([]);
const updateTimeEntryProjectMock = vi.fn();
const splitTimeEntryMock = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    timeEntries: (...args: unknown[]) => timeEntriesMock(...args),
    clockIn: (...args: unknown[]) => clockInMock(...args),
    clockOut: (...args: unknown[]) => clockOutMock(...args),
    bookableProjects: (...args: unknown[]) => bookableProjectsMock(...args),
    updateTimeEntryProject: (...args: unknown[]) => updateTimeEntryProjectMock(...args),
    splitTimeEntry: (...args: unknown[]) => splitTimeEntryMock(...args),
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

function entryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    employeeId: 'emp-1',
    clockIn: new Date('2026-05-04T08:00:00Z').toISOString(),
    clockOut: new Date('2026-05-04T16:00:00Z').toISOString(),
    source: 'web',
    status: 'Pending',
    requiresApproval: false,
    latitude: null,
    longitude: null,
    accuracyMeters: null,
    projectId: null,
    projectCode: null,
    projectName: null,
    summary: { grossMinutes: 480, breakMinutes: 30, netMinutes: 450 },
    ...overrides,
  };
}

const PROJECTS = [
  { id: 'p-1', code: 'PRJ-001', name: 'Website Relaunch' },
  { id: 'p-2', code: 'PRJ-002', name: 'ERP-Einführung' },
];

describe('BookingPage', () => {
  beforeEach(() => {
    timeEntriesMock.mockClear().mockResolvedValue([]);
    clockInMock.mockClear().mockResolvedValue(entryFixture({ clockOut: null, status: 'Open' }));
    clockOutMock.mockClear();
    bookableProjectsMock.mockClear().mockResolvedValue([]);
    updateTimeEntryProjectMock.mockClear();
    splitTimeEntryMock.mockClear();
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
      entryFixture({ clockOut: null, status: 'Open', summary: null }),
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

  it('sends the selected project with clock-in', async () => {
    bookableProjectsMock.mockResolvedValue(PROJECTS);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);

    const select = await screen.findByLabelText(/Projekt \(optional\)/i);
    fireEvent.change(select, { target: { value: 'p-1' } });

    const kommen = screen
      .getAllByRole('button')
      .find((b) => /Kommen/.test(b.textContent ?? ''));
    fireEvent.click(kommen as HTMLElement);

    await waitFor(() => {
      expect(clockInMock).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'emp-1', projectId: 'p-1' }),
      );
    });
  });

  it('hides the project selector when no bookable projects exist', async () => {
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    await waitFor(() => {
      expect(screen.getByText(/Nicht eingestempelt/i)).toBeDefined();
    });
    expect(screen.queryByLabelText(/Projekt \(optional\)/i)).toBeNull();
  });

  it('shows the project badge on booked entries', async () => {
    timeEntriesMock.mockResolvedValue([
      entryFixture({ projectId: 'p-1', projectCode: 'PRJ-001', projectName: 'Website Relaunch' }),
    ]);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    await waitFor(() => {
      expect(screen.getByText('PRJ-001')).toBeDefined();
    });
  });

  it('splits a closed entry via the dialog', async () => {
    bookableProjectsMock.mockResolvedValue(PROJECTS);
    timeEntriesMock.mockResolvedValue([entryFixture()]);
    splitTimeEntryMock.mockResolvedValue({
      first: entryFixture(),
      second: entryFixture({ id: 't-2' }),
    });
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);

    const splitButton = await screen.findByRole('button', { name: 'Aufteilen' });
    fireEvent.click(splitButton);
    // The dialog's default split point is the interval midpoint → valid.
    const confirm = await screen.findByRole('button', { name: /^Aufteilen$/ });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(splitTimeEntryMock).toHaveBeenCalledWith('t-1', expect.any(String), undefined);
    });
  });

  it('offers no project/split actions on approved entries', async () => {
    timeEntriesMock.mockResolvedValue([entryFixture({ status: 'Approved' })]);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    await waitFor(() => {
      expect(screen.getByText(/Letzte Buchungen/i)).toBeDefined();
      expect(screen.getByText('Approved')).toBeDefined();
    });
    expect(screen.queryByRole('button', { name: 'Projekt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aufteilen' })).toBeNull();
  });
});
