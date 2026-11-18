import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AuditTrail } from './AdminRequestsPage';
import { Sheet, SheetContent } from '../components/ui/sheet';
import { renderWithProviders } from '../test-utils';
import { TimeAdjustmentDiff } from './RequestsPage';

vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({ id: 'manager', role: 'Manager' }),
}));
vi.mock('../api/client', () => ({
  api: {
    getRequest: async () => ({
      id: 'request',
      employeeName: 'Anna Example',
      type: 'TimeAdjustment',
      from: '2026-11-06T20:30:00Z',
      to: '2026-11-06T21:00:00Z',
    }),
    getRequestEvents: async () => [],
    requestTimeEntryAudit: async () => [],
  },
}));
it('can render the immutable correction diff in the declared history zone including exact milliseconds and offset', () => {
  renderWithProviders(
    <TimeAdjustmentDiff
      timeZone="Asia/Kathmandu"
      request={{
        from: '2026-10-25T00:50:23.456Z',
        to: '2026-10-25T01:10:45.789Z',
        targetTimeEntryId: 'entry',
        expectedTargetRevision: 4,
        targetTimeEntryBefore: {
          clockIn: '2026-10-25T00:50:23.456Z',
          clockOut: '2026-10-25T01:00:00.000Z',
        },
      }}
    />,
  );
  expect(screen.getAllByText(/06:35:23[,.]456.*UTC\+05:45/)).toHaveLength(2);
  expect(screen.getByText(/06:55:45[,.]789.*UTC\+05:45/)).toBeTruthy();
  expect(screen.getAllByTitle('2026-10-25T00:50:23.456Z')).toHaveLength(2);
});

it('uses the declared cockpit zone for the audit date header across midnight as well as the detailed instants', async () => {
  renderWithProviders(
    <Sheet open>
      <SheetContent>
        <AuditTrail requestId="request" timeZone="Asia/Kathmandu" />
      </SheetContent>
    </Sheet>,
  );
  expect(
    await screen.findByText(
      'Anna Example · Zeitkorrektur · 7.11.2026 – 7.11.2026',
    ),
  ).toBeTruthy();
  expect(screen.getByText(/02:15:00[,.]000.*UTC\+05:45/)).toBeTruthy();
});
