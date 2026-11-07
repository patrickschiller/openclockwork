import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { TeamCockpitPage } from './TeamCockpitPage';
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  targets: vi.fn(),
  history: vi.fn(),
  clockIn: vi.fn(),
  report: vi.fn(),
}));
vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({
    id: 'manager',
    role: 'Manager',
    firstName: 'Marc',
    lastName: 'Example',
  }),
}));
vi.mock('../app/use-online', () => ({ useOnline: () => true }));
vi.mock('../api/client', () => ({
  api: {
    teamCockpit: mocks.overview,
    teamCockpitApprovalRequests: async () => [],
    timeEntryApprovals: async () => [],
    teamCockpitBookingTargets: mocks.targets,
    teamCockpitHistory: mocks.history,
    teamCockpitClockIn: mocks.clockIn,
    workingTimeReport: mocks.report,
  },
}));
beforeEach(() => {
  const employee = {
    id: 'employee',
    firstName: 'Anna',
    lastName: 'Example',
    isActive: true,
  };
  mocks.overview
    .mockReset()
    .mockResolvedValue({
      generatedAt: '2026-11-07T08:00:00Z',
      nextRefreshAt: '2026-11-07T09:00:00Z',
      today: '2026-11-07',
      timeZone: 'Pacific/Auckland',
      scope: 'Team',
      employees: [
        {
          ...employee,
          status: 'UnknownContract',
          obligation: 'Unknown',
          contractKnown: false,
          scheduleName: null,
          coreWindows: [],
          openEntry: null,
          absences: [],
        },
      ],
    });
  mocks.targets
    .mockReset()
    .mockResolvedValue([
      {
        id: 'assigned-project',
        code: 'TEAM',
        name: 'Team project',
        serviceOrders: [],
      },
    ]);
  mocks.history
    .mockReset()
    .mockImplementation(async (_id, period) => ({
      employee,
      from: period.from,
      to: period.to,
      generatedAt: '2026-11-07T08:00:00Z',
      timeZone: 'Pacific/Auckland',
      nextCursor: null,
      items: [
        {
          id: 'absence',
          employeeId: employee.id,
          kind: 'Absence',
          from: '2026-11-07',
          to: '2026-11-07',
          allDay: true,
          classification: 'Sickness',
          status: 'Recorded',
          workflowState: null,
          halfDayStart: false,
          halfDayEnd: false,
          requiresApproval: false,
          projectName: null,
          serviceOrderTitle: null,
          grossMinutes: null,
          breakMinutes: null,
          netMinutes: null,
          reason: null,
          request: null,
          proxyActions: [
            {
              id: 'proxy-event',
              action: 'ProxyAbsence',
              actorId: 'manager',
              actorName: 'Marc Example',
              at: '2026-11-07T07:00:00Z',
              reason: 'Reported by phone',
            },
          ],
        },
      ],
    }));
  mocks.clockIn.mockReset().mockResolvedValue({ id: 'new-entry' });
  mocks.report
    .mockReset()
    .mockImplementation(async (from, to) => ({
      from,
      to,
      timeZone: 'Pacific/Auckland',
      comparisons: [
        {
          employeeId: 'employee',
          employeeName: 'Anna Example',
          targetStatus: 'Unknown',
          targetMinutes: null,
          actualMinutes: 120,
          differenceMinutes: null,
          indicator: 'Unknown',
          unknownDates: ['2026-11-07'],
          openEntryCount: 0,
        },
      ],
      rows: [],
      totals: {},
    }));
});
it('composes real overview, both approval lanes, selected-employee proxy targets and complete absence calendar/history', async () => {
  const view = renderWithProviders(<TeamCockpitPage />);
  expect(
    await screen.findByText('Vertragsdaten fehlen – nicht bestimmbar'),
  ).toBeTruthy();
  expect(screen.getByText('Korrekturanträge für Zeitbuchungen')).toBeTruthy();
  fireEvent.change(
    screen.getByLabelText('Person für Details und Vertretungsaktionen'),
    { target: { value: 'employee' } },
  );
  expect(
    await screen.findByRole('option', { name: 'TEAM · Team project' }),
  ).toBeTruthy();
  expect(mocks.targets).toHaveBeenCalledWith('employee');
  expect(await screen.findByText(/Vollständiger Verlauf: /)).toBeTruthy();
  expect(
    document.querySelector('[data-history-date="2026-11-07"]')?.textContent,
  ).toContain('Erfasst');
  expect(screen.getByText('Reported by phone')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'Soll/Ist-Vergleich für diesen Zeitraum anzeigen',
    }),
  );
  expect(
    await screen.findByRole('table', { name: 'Soll/Ist-Vergleich' }),
  ).toBeTruthy();
  expect(mocks.report).toHaveBeenCalledWith(
    '2026-11-01',
    '2026-11-30',
    'employee',
  );
  expect(
    screen.queryByText('Keine Buchung während erforderlicher Kernzeit'),
  ).toBeNull();
  const invalidate = vi.spyOn(view.queryClient, 'invalidateQueries');
  fireEvent.change(
    screen.getByLabelText('Betriebliche Begründung für die Stellvertretung'),
    { target: { value: 'Telephone request' } },
  );
  fireEvent.submit(screen.getByRole('form', { name: 'Im Auftrag erfassen' }));
  await waitFor(() =>
    expect(mocks.clockIn).toHaveBeenCalledWith(
      'employee',
      expect.objectContaining({ reason: 'Telephone request' }),
    ),
  );
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['team-cockpit'] }),
  );
  expect(mocks.history.mock.calls.length).toBeGreaterThan(1);
});
