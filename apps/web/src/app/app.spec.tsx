import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app';
import { CurrentEmployeeProvider } from './CurrentEmployee';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CurrentEmployeeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </CurrentEmployeeProvider>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = renderApp();
    expect(baseElement).toBeTruthy();
  });

  it('should render the OpenClockwork shell', () => {
    const { getAllByText } = renderApp();
    expect(getAllByText(/OpenClockwork/i).length).toBeGreaterThan(0);
  });
});
