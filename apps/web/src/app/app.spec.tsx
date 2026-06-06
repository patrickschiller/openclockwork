import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app';
import { AuthProvider } from './auth';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('shows the login page when no user is authenticated', () => {
    try {
      window.localStorage?.clear();
    } catch {
      /* localStorage might be unavailable in some test environments */
    }
    const { getAllByText } = renderApp();
    expect(getAllByText(/OpenClockwork/i).length).toBeGreaterThan(0);
  });
});
