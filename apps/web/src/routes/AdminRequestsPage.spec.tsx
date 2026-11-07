import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { AdminRequestsPage } from './AdminRequestsPage';

const request = {
  id: 'request-42',
  employeeId: 'owner',
  employeeName: 'Anna Example',
  type: 'Vacation',
  workflowState: 'PendingManager',
  status: 'Submitted',
  currentApproverId: 'manager',
  from: '2026-05-04T00:00:00.000Z',
  to: '2026-05-08T00:00:00.000Z',
  calculatedDays: 5,
};
vi.mock('../api/client', () => ({
  api: {
    listRequests: vi
      .fn()
      .mockImplementation(async (filter) =>
        filter.currentApproverId ? [request] : [],
      ),
    getRequest: vi.fn().mockImplementation(async () => request),
    getRequestEvents: vi
      .fn()
      .mockResolvedValue([
        { id: 'event', kind: 'Resubmitted', at: '2026-05-01T12:00:00.000Z' },
      ]),
  },
}));
vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({
    id: 'manager',
    firstName: 'Marc',
    lastName: 'Example',
    role: 'Manager',
  }),
}));

describe('request identity in approval context (#42)', () => {
  it('shows the employee name in the inbox and retained audit trail', async () => {
    renderWithProviders(<AdminRequestsPage />);
    expect(await screen.findByText(/Anna Example · Urlaub/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf' }));
    expect(
      await screen.findByText(/Anna Example · Urlaub · 4.5.2026/),
    ).toBeDefined();
    expect(await screen.findByText('Erneut eingereicht')).toBeDefined();
  });
});
