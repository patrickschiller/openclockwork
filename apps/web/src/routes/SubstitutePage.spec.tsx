import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { api } from '../api/client';
import { SubstitutePage } from './SubstitutePage';

vi.mock('../api/client', () => ({ api: { listRequests: vi.fn() } }));
vi.mock('../app/auth', () => ({
  useCurrentUser: () => ({ id: 'substitute' }),
}));
vi.mock('../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    enumLabel: (value: string) => value,
    // Model a browser west of UTC. Calendar-only values retain their day;
    // actual instants are displayed on their local date, as useI18n specifies.
    formatDate: (raw: string) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
      }).format(
        new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00Z` : raw),
      ),
  }),
}));

describe('request calendar dates outside Europe', () => {
  it.each([
    ['Vacation', '6/12/2026 – 6/15/2026'],
    ['SpecialLeave', '6/12/2026 – 6/15/2026'],
    ['TimeAdjustment', '6/11/2026 – 6/14/2026'],
  ])('keeps %s dates distinct from timestamp dates', async (type, expected) => {
    vi.mocked(api.listRequests).mockResolvedValue([
      {
        id: 'request',
        type,
        from: '2026-06-12T00:00:00.000Z',
        to: '2026-06-15T00:00:00.000Z',
        calculatedDays: 2,
        workflowState: 'PendingSubstitute',
      },
    ] as Awaited<ReturnType<typeof api.listRequests>>);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <SubstitutePage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(expected)).toBeDefined();
  });
});
