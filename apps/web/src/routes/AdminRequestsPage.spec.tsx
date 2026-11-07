import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { AdminRequestsPage } from './AdminRequestsPage';
import { api } from '../api/client';

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
    timeEntryApprovals: vi.fn().mockResolvedValue([]),
    listRequests: vi
      .fn()
      .mockImplementation(async (filter) =>
        filter.currentApproverId ? [request] : [],
      ),
    requestTimeEntryAudit: vi.fn().mockResolvedValue([]),
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

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('request identity in approval context (#42)', () => {
  it('shows the employee name in the inbox and retained audit trail', async () => {
    renderWithProviders(<AdminRequestsPage />);
    expect(await screen.findByText(/Anna Example · Urlaub/)).toBeDefined();
    expect(await screen.findByText('Zeitbuchungen')).toBeDefined();
    expect(api.timeEntryApprovals).toHaveBeenCalledWith('review');
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf' }));
    expect(
      await screen.findByText(/Anna Example · Urlaub · 4.5.2026/),
    ).toBeDefined();
    expect(await screen.findByText('Erneut eingereicht')).toBeDefined();
  });
  it('shows the immutable correction before/proposed diff in both inbox and audit trail, with request-scoped final audit', async () => {
    vi.stubEnv('TZ', 'Europe/Berlin');
    const before = {
      id: 'original-entry',
      revision: 4,
      clockIn: '2026-10-25T00:50:23.456Z',
      clockOut: '2026-10-25T01:10:45.789Z',
    };
    const correction = {
      ...request,
      type: 'TimeAdjustment',
      targetTimeEntryId: before.id,
      expectedTargetRevision: 4,
      targetTimeEntryBefore: before,
      from: before.clockIn,
      to: '2026-10-25T02:10:45.789Z',
    };
    vi.mocked(api.listRequests).mockImplementation(
      async (filter) =>
        (filter?.currentApproverId ? [correction] : []) as never,
    );
    vi.mocked(api.getRequest).mockResolvedValue(correction as never);
    vi.mocked(api.requestTimeEntryAudit).mockResolvedValue([
      {
        id: 'audit',
        timeEntryId: before.id,
        requestId: request.id,
        action: 'FrameRequestCorrected',
        before,
        after: { ...before, clockOut: correction.to },
        reason: 'Correction',
        occurredAt: '2026-10-26T12:00:00Z',
        actorId: 'hr',
        actorName: 'Hannah Reviewer',
      },
    ]);
    renderWithProviders(<AdminRequestsPage />);
    expect(
      await screen.findByText('Buchung original-entry · Revision 4'),
    ).toBeDefined();
    expect(
      screen.getByText('Bruttodauer: 1.222,333 s → 4.822,333 s (Δ 3.600 s)'),
    ).toBeDefined();
    expect(screen.getAllByTitle(before.clockIn)).toHaveLength(2);
    expect(screen.getAllByText(/02:50:23[,.]456.*UTC\+02:00/)).toHaveLength(2);
    expect(screen.getByTitle(before.clockOut)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf' }));
    expect(
      await screen.findByText(
        'Buchung original-entry durch Antrag request-42 korrigiert',
      ),
    ).toBeDefined();
    expect(api.requestTimeEntryAudit).toHaveBeenCalledWith('request-42');
    expect(screen.getByText('Angewendet von Hannah Reviewer')).toBeDefined();
    expect(
      screen.getAllByText('Bruttodauer: 1.222,333 s → 4.822,333 s (Δ 3.600 s)'),
    ).toHaveLength(3);
  });
});
