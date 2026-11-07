import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils';
import { CockpitApprovals, canReviewCorrection } from './CockpitApprovals';
import type { RequestDto } from '../../api/client';
const mocks = vi.hoisted(() => ({
  user: { id: 'manager', role: 'Manager' },
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  confirm: vi.fn(),
  hrReject: vi.fn(),
}));
vi.mock('../../api/client', () => ({
  api: {
    teamCockpitApprovalRequests: mocks.list,
    managerApprove: mocks.approve,
    managerReject: mocks.reject,
    hrConfirm: mocks.confirm,
    hrReject: mocks.hrReject,
  },
}));
vi.mock('../../app/auth', () => ({ useCurrentUser: () => mocks.user }));
vi.mock('../timeentries/TimeEntryApprovals', () => ({
  TimeEntryApprovals: ({
    scope,
    pendingOnly,
  }: {
    scope: string;
    pendingOnly: boolean;
  }) => (
    <p>
      Normal approvals {scope} {String(pendingOnly)}
    </p>
  ),
}));
vi.mock('../../routes/RequestsPage', () => ({
  TimeAdjustmentDiff: () => <p>Original → proposed correction</p>,
}));
vi.mock('../../routes/AdminRequestsPage', () => ({
  AuditTrail: ({ requestId }: { requestId: string }) => (
    <p>Audit {requestId}</p>
  ),
}));
function request(extra: Partial<RequestDto> = {}): RequestDto {
  return {
    id: 'correction',
    employeeId: 'employee',
    employeeName: 'Anna Example',
    type: 'TimeAdjustment',
    workflowState: 'PendingManager',
    currentApproverId: 'manager',
    requiresApproval: true,
    from: '2026-11-06T08:00:00Z',
    to: '2026-11-06T16:00:00Z',
    updatedAt: '2026-11-06T17:00:00Z',
    ...extra,
  } as RequestDto;
}
beforeEach(() => {
  mocks.user.id = 'manager';
  mocks.user.role = 'Manager';
  mocks.list.mockReset().mockResolvedValue([request()]);
  mocks.approve.mockReset().mockResolvedValue({});
  mocks.reject.mockReset().mockResolvedValue({});
  mocks.confirm.mockReset().mockResolvedValue({});
  mocks.hrReject.mockReset().mockResolvedValue({});
});
describe('cockpit correction approvals', () => {
  it('includes normal pending-only approvals and original/proposed diff and request audit', async () => {
    renderWithProviders(<CockpitApprovals />);
    expect(
      await screen.findByText('Anna Example · Zeitkorrektur'),
    ).toBeTruthy();
    expect(screen.getByText('Normal approvals review true')).toBeTruthy();
    expect(screen.getByText('Original → proposed correction')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf' }));
    expect(await screen.findByText('Audit correction')).toBeTruthy();
  });
  it('manager approves only assigned PendingManager, with optional note and consistent invalidation', async () => {
    const view = renderWithProviders(<CockpitApprovals />);
    const invalidate = vi.spyOn(view.queryClient, 'invalidateQueries');
    const approve = await screen.findByRole('button', { name: 'Genehmigen' });
    fireEvent.change(
      screen.getByLabelText('Notiz (bei Ablehnung erforderlich)'),
      { target: { value: '  Checked  ' } },
    );
    mocks.list.mockResolvedValue([request({ workflowState: 'PendingHr' })]);
    fireEvent.click(approve);
    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith(
        'correction',
        'manager',
        'Checked',
        true,
        '2026-11-06T17:00:00Z',
      ),
    );
    await screen.findByText('Wartet auf HR');
    expect(screen.queryByRole('button', { name: 'Genehmigen' })).toBeNull();
    for (const key of [
      'team-cockpit',
      'requests',
      'time-entries',
      'time-entry-approvals',
      'account',
      'working-time-report',
    ])
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
  });
  it('requires a rejection reason and prevents repeat decisions while pending', async () => {
    let resolve: (() => void) | undefined;
    mocks.reject.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    renderWithProviders(<CockpitApprovals />);
    const reject = await screen.findByRole('button', { name: 'Ablehnen' });
    expect(reject.hasAttribute('disabled')).toBe(true);
    fireEvent.change(
      screen.getByLabelText('Notiz (bei Ablehnung erforderlich)'),
      { target: { value: ' Check dates ' } },
    );
    fireEvent.click(reject);
    fireEvent.click(reject);
    await waitFor(() => expect(mocks.reject).toHaveBeenCalledTimes(1));
    expect(mocks.reject).toHaveBeenCalledWith(
      'correction',
      'manager',
      'Check dates',
      '2026-11-06T17:00:00Z',
    );
    await act(async () => {
      resolve?.();
    });
  });
  it.each([
    ['Manager', 'PendingHr', 'manager', 'employee'],
    ['Manager', 'PendingManager', 'another-manager', 'employee'],
    ['HRAdmin', 'PendingManager', 'manager', 'employee'],
    ['Manager', 'PendingManager', 'manager', 'manager'],
  ])(
    'does not bypass stage/assignment/self guards (%s %s %s %s)',
    async (role, workflowState, currentApproverId, employeeId) => {
      mocks.user.role = role;
      mocks.list.mockResolvedValue([
        request({
          workflowState: workflowState as RequestDto['workflowState'],
          currentApproverId,
          employeeId,
        }),
      ]);
      renderWithProviders(<CockpitApprovals />);
      await screen.findByText('Original → proposed correction');
      expect(
        screen.queryByLabelText('Notiz (bei Ablehnung erforderlich)'),
      ).toBeNull();
    },
  );
  it('HR confirms only PendingHr using normal authorised API', async () => {
    mocks.user.id = 'hr';
    mocks.user.role = 'HRAdmin';
    mocks.list.mockResolvedValue([request({ workflowState: 'PendingHr' })]);
    renderWithProviders(<CockpitApprovals />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'HR-bestätigen' }),
    );
    await waitFor(() =>
      expect(mocks.confirm).toHaveBeenCalledWith(
        'correction',
        'hr',
        undefined,
        '2026-11-06T17:00:00Z',
      ),
    );
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it('shows stale/double-decision errors and refreshes current server stage', async () => {
    mocks.approve.mockRejectedValue(new Error('409 already decided'));
    renderWithProviders(<CockpitApprovals />);
    const approve = await screen.findByRole('button', { name: 'Genehmigen' });
    mocks.list.mockResolvedValue([request({ workflowState: 'PendingHr' })]);
    fireEvent.click(approve);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('409 already decided'),
    );
    await screen.findByText('Wartet auf HR');
    expect(screen.queryByRole('button', { name: 'Genehmigen' })).toBeNull();
  });
  it('guards HR self-approval even if a pending request is returned', () => {
    expect(
      canReviewCorrection(
        request({ employeeId: 'hr', workflowState: 'PendingHr' }),
        'hr',
        'HRAdmin',
      ),
    ).toBe(false);
  });
});

it('shows correction decision times in the declared cockpit timezone rather than the viewer timezone', async () => {
  renderWithProviders(<CockpitApprovals timeZone="Asia/Kathmandu" />);
  expect(await screen.findByText(/13:45:00.*21:45:00/)).toBeTruthy();
});
