import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRealtimeInvalidation } from './realtime';
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  off: vi.fn(),
  disconnect: vi.fn(),
  user: { id: 'manager', role: 'Manager' },
}));
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (event: string, fn: () => void) => mocks.handlers.set(event, fn),
    off: mocks.off,
    removeAllListeners: vi.fn(),
    disconnect: mocks.disconnect,
  }),
}));
vi.mock('./auth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../api/client', () => ({ TOKEN_STORAGE_KEY: 'token' }));
beforeEach(() => {
  mocks.handlers.clear();
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem: () => 'test-token',
  } as unknown as Storage);
});
it('refreshes cockpit and existing workflow caches for request, time-entry, recorded-absence and project changes, and detaches listeners', async () => {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const view = renderHook(() => useRealtimeInvalidation(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(mocks.handlers.has('absence:created')).toBe(true));
  for (const event of [
    'request:transitioned',
    'time-entry:created',
    'time-entry:updated',
    'absence:created',
    'absence:updated',
    'project:changed',
  ]) {
    invalidate.mockClear();
    act(() => mocks.handlers.get(event)?.());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['team-cockpit'] });
  }
  invalidate.mockClear();
  act(() => mocks.handlers.get('time-entry:updated')?.());
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['working-time-report'],
  });
  view.unmount();
  expect(mocks.off).toHaveBeenCalledWith(
    'absence:created',
    expect.any(Function),
  );
});
