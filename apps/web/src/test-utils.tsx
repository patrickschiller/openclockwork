import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** Path the MemoryRouter starts at. */
  initialPath?: string;
}

export type RenderWithProvidersResult = RenderResult & { queryClient: QueryClient };

/**
 * Wraps a component under test with the providers every route needs
 * (react-query + router) and a fresh QueryClient per test so caches don't
 * leak between cases. AuthProvider is intentionally NOT included — tests
 * that need auth should stub `useAuth` / `useCurrentUser` with vi.mock.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: Options = {},
): RenderWithProvidersResult {
  const { initialPath = '/', ...rest } = options;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper, ...rest }), queryClient };
}
