import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { TeamCockpitPage, cockpitRefreshDelay } from './TeamCockpitPage';
import type { TeamCockpitDto } from '../api/client';
const mocks = vi.hoisted(() => ({
  user: { id: 'manager', role: 'Manager' },
  overview: vi.fn(),
  requests: vi.fn(),
  entries: vi.fn(),
}));
vi.mock('../api/client', () => ({
  api: {
    teamCockpit: mocks.overview,
    teamCockpitApprovalRequests: mocks.requests,
    timeEntryApprovals: mocks.entries,
  },
}));
vi.mock('../app/auth', () => ({ useCurrentUser: () => mocks.user }));
vi.mock('../components/team-cockpit/CockpitHistory', () => ({
  CockpitHistory: ({ employeeId }: { employeeId: string }) => (
    <p>History {employeeId}</p>
  ),
}));
vi.mock('../components/team-cockpit/CockpitProxyForms', () => ({
  CockpitProxyForms: ({
    employee,
    timeZone,
  }: {
    employee: { id: string };
    timeZone: string;
  }) => (
    <p>
      Proxy {employee.id} {timeZone}
    </p>
  ),
}));
function fixture(overrides: Partial<TeamCockpitDto> = {}): TeamCockpitDto {
  return {
    generatedAt: '2026-11-07T08:00:00Z',
    nextRefreshAt: '2026-11-07T09:00:00Z',
    today: '2026-11-07',
    timeZone: 'Europe/Berlin',
    scope: 'Team',
    employees: [
      {
        id: 'employee',
        firstName: 'Anna',
        lastName: 'Example',
        isActive: true,
        status: 'Missing',
        obligation: 'RequiredNow',
        contractKnown: true,
        scheduleName: null,
        openEntry: null,
        coreWindows: [],
        absences: [],
      },
    ],
    ...overrides,
  };
}
beforeEach(() => {
  mocks.user.id = 'manager';
  mocks.user.role = 'Manager';
  mocks.overview.mockReset().mockResolvedValue(fixture());
  mocks.requests.mockReset().mockResolvedValue([]);
  mocks.entries.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('Team cockpit overview', () => {
  it('uses only authoritative current status and selects the scoped employee for both full workflows', async () => {
    renderWithProviders(<TeamCockpitPage />);
    expect(
      await screen.findByText('Keine Buchung während erforderlicher Kernzeit'),
    ).toBeTruthy();
    expect(
      screen.getByText(/kein Nachweis physischer Anwesenheit/),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByLabelText('Person für Details und Vertretungsaktionen'),
      { target: { value: 'employee' } },
    );
    expect(screen.getByText('Proxy employee Europe/Berlin')).toBeTruthy();
    expect(screen.getByText('History employee')).toBeTruthy();
  });
  it.each([
    'PartialAbsenceUnknown',
    'UnknownContract',
    'UnknownSchedule',
    'Flexible',
    'Booked',
  ] as const)('does not invent Missing for %s', async (status) => {
    const data = fixture();
    data.employees[0].status = status;
    mocks.overview.mockResolvedValue(data);
    renderWithProviders(<TeamCockpitPage />);
    await screen.findByRole('button', { name: 'Anna Example' });
    expect(
      screen.queryByText('Keine Buchung während erforderlicher Kernzeit'),
    ).toBeNull();
  });
  it('keeps an open booking fact separate from a known holiday without inventing a duty', async () => {
    const data = fixture();
    data.employees[0] = {
      ...data.employees[0],
      status: 'Booked',
      obligation: 'NotRequiredNow',
      obligationReason: 'Holiday',
      openEntry: {
        id: 'entry',
        clockIn: data.generatedAt,
        requiresApproval: false,
        projectName: null,
        serviceOrderTitle: null,
      },
    };
    mocks.overview.mockResolvedValue(data);
    renderWithProviders(<TeamCockpitPage />);
    expect(
      await screen.findByText(
        'Feiertag laut bestätigtem Vertragskalender – keine Buchungspflicht.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText('Keine Buchung während erforderlicher Kernzeit'),
    ).toBeNull();
  });
  it('removes a revoked selection and never offers self as a proxy beneficiary', async () => {
    const data = fixture();
    data.employees.push({
      ...data.employees[0],
      id: 'manager',
      firstName: 'Self',
    });
    mocks.overview.mockResolvedValue(data);
    const view = renderWithProviders(<TeamCockpitPage />);
    await screen.findByRole('button', { name: 'Anna Example' });
    expect(screen.queryByRole('option', { name: 'Self Example' })).toBeNull();
    fireEvent.change(
      screen.getByLabelText('Person für Details und Vertretungsaktionen'),
      { target: { value: 'employee' } },
    );
    mocks.overview.mockResolvedValue(fixture({ employees: [] }));
    await act(async () => {
      await view.queryClient.invalidateQueries({ queryKey: ['team-cockpit'] });
    });
    await waitFor(() =>
      expect(screen.queryByText('History employee')).toBeNull(),
    );
  });
  it('isolates overview caches across actor and role changes', async () => {
    const view = renderWithProviders(<TeamCockpitPage />);
    await screen.findByRole('button', { name: 'Anna Example' });
    expect(
      view.queryClient.getQueryData([
        'team-cockpit',
        'manager',
        'Manager',
        'overview',
      ]),
    ).toBeTruthy();
    mocks.user.id = 'hr';
    mocks.user.role = 'HRAdmin';
    mocks.overview.mockResolvedValue(
      fixture({ scope: 'Organisation', employees: [] }),
    );
    view.rerender(<TeamCockpitPage />);
    expect(
      await screen.findByText('Aktive Personen der Organisation'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anna Example' })).toBeNull();
    expect(
      view.queryClient.getQueryData([
        'team-cockpit',
        'hr',
        'HRAdmin',
        'overview',
      ]),
    ).toBeTruthy();
  });
  it('blocks Employee at component boundary without loading privileged data', () => {
    mocks.user.role = 'Employee';
    renderWithProviders(<TeamCockpitPage />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(mocks.overview).not.toHaveBeenCalled();
    expect(mocks.requests).not.toHaveBeenCalled();
  });
  it('refreshes automatically at the server boundary and marks failed cached status unconfirmed', async () => {
    vi.useFakeTimers();
    mocks.overview.mockResolvedValue(
      fixture({ nextRefreshAt: '2026-11-07T08:00:01Z' }),
    );
    renderWithProviders(<TeamCockpitPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(
      screen.getByText('Keine Buchung während erforderlicher Kernzeit'),
    ).toBeTruthy();
    mocks.overview.mockRejectedValue(new Error('Offline'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(mocks.overview.mock.calls.length).toBeGreaterThan(1);
    expect(
      screen.queryByText('Keine Buchung während erforderlicher Kernzeit'),
    ).toBeNull();
    expect(screen.getByText('Aktueller Status nicht bestätigt')).toBeTruthy();
    expect(screen.getByText(/keine aktuelle Fehlend-Aussage/)).toBeTruthy();
  });
  it('keeps fallback polling without user interaction', async () => {
    vi.useFakeTimers();
    renderWithProviders(<TeamCockpitPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    mocks.overview.mockResolvedValue(fixture({ employees: [] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_010);
    });
    expect(mocks.overview.mock.calls.length).toBeGreaterThan(1);
    expect(
      screen.getByText('Keine berechtigten Teammitglieder vorhanden.'),
    ).toBeTruthy();
  });
  it('uses relative generatedAt offset with a 30-second fallback', () => {
    expect(
      cockpitRefreshDelay(fixture({ nextRefreshAt: '2026-11-07T08:00:02Z' })),
    ).toBe(2100);
    expect(cockpitRefreshDelay(fixture())).toBe(30_000);
    expect(cockpitRefreshDelay(fixture({ nextRefreshAt: 'invalid' }))).toBe(
      30_000,
    );
    expect(
      cockpitRefreshDelay(fixture({ nextRefreshAt: '2026-11-07T07:00:00Z' })),
    ).toBe(100);
  });
});
