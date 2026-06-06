import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';

const accountMock = vi.fn();
const vacationBalanceMock = vi.fn();
const violationsMock = vi.fn();
const listRequestsMock = vi.fn();
const timeEntriesMock = vi.fn().mockResolvedValue([]);

vi.mock('../api/client', () => ({
  api: {
    account: (...args: unknown[]) => accountMock(...args),
    vacationBalance: (...args: unknown[]) => vacationBalanceMock(...args),
    violations: (...args: unknown[]) => violationsMock(...args),
    listRequests: (...args: unknown[]) => listRequestsMock(...args),
    timeEntries: (...args: unknown[]) => timeEntriesMock(...args),
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

describe('DashboardPage', () => {
  beforeEach(() => {
    accountMock.mockReset().mockResolvedValue({
      employeeId: 'emp-1',
      overtimeMinutes: 125,
      vacationDaysTotal: 30,
      vacationDaysUsed: 7,
      vacationDaysRemaining: 23,
      asOf: new Date().toISOString(),
    });
    vacationBalanceMock.mockReset().mockResolvedValue({
      employeeId: 'emp-1',
      year: new Date().getUTCFullYear(),
      baseDays: 30,
      carryOverDays: 0,
      adjustmentDays: 0,
      totalEntitlement: 30,
      approvedDays: 7,
      pendingDays: 0,
      remainingDays: 23,
      carryOverExpiresOn: null,
      adjustmentReason: null,
    });
    violationsMock.mockReset().mockResolvedValue([]);
    listRequestsMock.mockReset().mockResolvedValue([]);
    timeEntriesMock.mockReset().mockResolvedValue([]);
  });

  it('shows the vacation widget with the remaining-days headline', async () => {
    const { DashboardPage } = await import('./DashboardPage');
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Resturlaub/i)).toBeDefined();
      // 23.0 Tage shows up both in the KPI hint and the widget headline.
      expect(screen.getAllByText(/23\.0 Tage/i).length).toBeGreaterThan(0);
    });
  });

  it('shows the carry-over notice when the allowance has unused prior-year days', async () => {
    const expires = new Date();
    expires.setUTCMonth(2, 31); // March 31
    vacationBalanceMock.mockResolvedValueOnce({
      employeeId: 'emp-1',
      year: new Date().getUTCFullYear(),
      baseDays: 30,
      carryOverDays: 3,
      adjustmentDays: 0,
      totalEntitlement: 33,
      approvedDays: 0,
      pendingDays: 0,
      remainingDays: 33,
      carryOverExpiresOn: expires.toISOString(),
      adjustmentReason: null,
    });
    const { DashboardPage } = await import('./DashboardPage');
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Übertrag verfällt bald/i)).toBeDefined();
    });
  });

  it('surfaces a destructive alert when core-time violations exist', async () => {
    violationsMock.mockResolvedValueOnce([
      { kind: 'LateArrival', date: '2026-05-04', minutesLate: 12 },
    ]);
    const { DashboardPage } = await import('./DashboardPage');
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText(/Kernzeitverletzungen erkannt/i)).toBeDefined();
    });
  });
});
