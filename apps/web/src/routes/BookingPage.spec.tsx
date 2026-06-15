import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';

const timeEntriesMock = vi.fn().mockResolvedValue([]);
const clockInMock = vi.fn();
const clockOutMock = vi.fn();
const bookableProjectsMock = vi.fn().mockResolvedValue([]);
const updateTimeEntryMock = vi.fn();
const splitTimeEntryMock = vi.fn();
const bookProjectRangeMock = vi.fn();
const violationsMock = vi.fn().mockResolvedValue([]);

vi.mock('../api/client', () => ({
  api: {
    timeEntries: (...args: unknown[]) => timeEntriesMock(...args),
    clockIn: (...args: unknown[]) => clockInMock(...args),
    clockOut: (...args: unknown[]) => clockOutMock(...args),
    bookableProjects: (...args: unknown[]) => bookableProjectsMock(...args),
    updateTimeEntry: (...args: unknown[]) => updateTimeEntryMock(...args),
    splitTimeEntry: (...args: unknown[]) => splitTimeEntryMock(...args),
    bookProjectRange: (...args: unknown[]) => bookProjectRangeMock(...args),
    violations: (...args: unknown[]) => violationsMock(...args),
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
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
  }),
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
    serviceOrderId: null,
    serviceOrderNo: null,
    serviceOrderTitle: null,
    activity: null,
    summary: { grossMinutes: 480, breakMinutes: 30, netMinutes: 450 },
    ...overrides,
  };
}

const PROJECTS = [
  { id: 'p-1', code: 'PRJ-001', name: 'Website Relaunch', serviceOrders: [] },
  {
    id: 'p-2',
    code: 'PRJ-002',
    name: 'ERP-Einführung',
    serviceOrders: [
      { id: 'so-1', orderNo: 'SA-1', title: 'Datenmigration' },
      { id: 'so-2', orderNo: 'SA-2', title: 'Schulung' },
    ],
  },
];

describe('BookingPage', () => {
  beforeEach(() => {
    timeEntriesMock.mockClear().mockResolvedValue([]);
    clockInMock
      .mockClear()
      .mockResolvedValue(entryFixture({ clockOut: null, status: 'Open' }));
    clockOutMock.mockClear();
    bookableProjectsMock.mockClear().mockResolvedValue([]);
    updateTimeEntryMock.mockClear();
    splitTimeEntryMock.mockClear();
    bookProjectRangeMock.mockClear();
    violationsMock.mockClear().mockResolvedValue([]);
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
    expect(
      screen.getByText(/Buchungen sind aktuell deaktiviert/i),
    ).toBeDefined();
    const buttons = screen.getAllByRole('button');
    const kommen = buttons.find((b) => /Kommen/.test(b.textContent ?? ''));
    const gehen = buttons.find((b) => /Gehen/.test(b.textContent ?? ''));
    expect(kommen?.hasAttribute('disabled')).toBe(true);
    expect(gehen?.hasAttribute('disabled')).toBe(true);
  });

  it('sends project, service order, and activity with clock-in', async () => {
    bookableProjectsMock.mockResolvedValue(PROJECTS);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);

    const projectSelect = await screen.findByLabelText('Projekt');
    fireEvent.change(projectSelect, { target: { value: 'p-2' } });
    const orderSelect = await screen.findByLabelText(/Service-Auftrag/i);
    fireEvent.change(orderSelect, { target: { value: 'so-1' } });
    fireEvent.change(screen.getByLabelText(/Tätigkeit/i), {
      target: { value: 'Daten migriert' },
    });

    const kommen = screen
      .getAllByRole('button')
      .find((b) => /Kommen/.test(b.textContent ?? ''));
    fireEvent.click(kommen as HTMLElement);

    await waitFor(() => {
      expect(clockInMock).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-1',
          projectId: 'p-2',
          serviceOrderId: 'so-1',
          activity: 'Daten migriert',
        }),
      );
    });
  });

  it('disables "Kommen" until the mandatory service order is chosen', async () => {
    bookableProjectsMock.mockResolvedValue(PROJECTS);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);

    const projectSelect = await screen.findByLabelText('Projekt');
    fireEvent.change(projectSelect, { target: { value: 'p-2' } });

    const kommen = screen
      .getAllByRole('button')
      .find((b) => /Kommen/.test(b.textContent ?? ''));
    expect(kommen?.hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByText(/erfordert die Auswahl eines Service-Auftrags/i),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText(/Service-Auftrag/i), {
      target: { value: 'so-2' },
    });
    await waitFor(() => {
      expect(kommen?.hasAttribute('disabled')).toBe(false);
    });
  });

  it('hides the project selector when no bookable projects exist', async () => {
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    await waitFor(() => {
      expect(screen.getByText(/Nicht eingestempelt/i)).toBeDefined();
    });
    expect(screen.queryByLabelText('Projekt')).toBeNull();
  });

  it('shows badge and activity on booked entries', async () => {
    timeEntriesMock.mockResolvedValue([
      entryFixture({
        projectId: 'p-2',
        projectCode: 'PRJ-002',
        projectName: 'ERP-Einführung',
        serviceOrderId: 'so-1',
        serviceOrderNo: 'SA-1',
        serviceOrderTitle: 'Datenmigration',
        activity: 'Importskripte getestet',
      }),
    ]);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    await waitFor(() => {
      expect(screen.getByText('PRJ-002 · SA-1')).toBeDefined();
      expect(screen.getByText('Importskripte getestet')).toBeDefined();
    });
  });

  it('shows core-time violation details for the current year', async () => {
    violationsMock.mockResolvedValue([
      {
        employeeId: 'emp-1',
        date: '2026-06-12',
        kind: 'LateArrival',
        boundary: '10:00–11:00',
        deltaMinutes: 60,
        windowLabel: 'Vormittag',
      },
    ]);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);

    expect(
      await screen.findByText(/Kernzeitverstöße im laufenden Jahr \(1\)/i),
    ).toBeDefined();
    expect(
      screen.getByText(/12\.06\.2026 · Vormittag 10:00–11:00/i),
    ).toBeDefined();
    expect(
      screen.getByText(/Kernzeit zu spät begonnen · 60 Minuten/i),
    ).toBeDefined();
  });

  it('splits a closed entry via the dialog (object payload)', async () => {
    bookableProjectsMock.mockResolvedValue(PROJECTS);
    timeEntriesMock.mockResolvedValue([entryFixture()]);
    splitTimeEntryMock.mockResolvedValue({
      first: entryFixture(),
      second: entryFixture({ id: 't-2' }),
    });
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);

    const splitButton = await screen.findByRole('button', {
      name: 'Aufteilen',
    });
    fireEvent.click(splitButton);
    const confirm = await screen.findByRole('button', { name: /^Aufteilen$/ });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(splitTimeEntryMock).toHaveBeenCalledWith('t-1', {
        at: expect.any(String),
      });
    });
  });

  it('offers project/split actions on approved entries too (lock removed)', async () => {
    timeEntriesMock.mockResolvedValue([entryFixture({ status: 'Approved' })]);
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);
    await waitFor(() => {
      expect(screen.getByText('Genehmigt')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: 'Projekt' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Aufteilen' })).toBeDefined();
  });

  it('books a retroactive range through the Nachtrag dialog', async () => {
    bookableProjectsMock.mockResolvedValue(PROJECTS);
    bookProjectRangeMock.mockResolvedValue({ entries: [entryFixture()] });
    const { BookingPage } = await import('./BookingPage');
    renderWithProviders(<BookingPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Nachtragen' }));
    // Two "Projekt" selects exist now (clock-in card + dialog) — pick the dialog's.
    const projectSelects = await screen.findAllByLabelText('Projekt');
    const dialogSelect = projectSelects.find((el) => el.id === 'range-project');
    fireEvent.change(dialogSelect as HTMLElement, { target: { value: 'p-1' } });
    fireEvent.change(screen.getByLabelText(/Tätigkeit/i), {
      target: { value: 'Review nachgetragen' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Nachtragen$/ }));

    await waitFor(() => {
      expect(bookProjectRangeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-1',
          projectId: 'p-1',
          serviceOrderId: null,
          activity: 'Review nachgetragen',
          from: expect.any(String),
          to: expect.any(String),
        }),
      );
    });
  });
});
