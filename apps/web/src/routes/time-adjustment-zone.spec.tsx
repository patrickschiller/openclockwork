import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { TimeAdjustmentDiff } from './RequestsPage';
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
