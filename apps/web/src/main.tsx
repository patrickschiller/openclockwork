import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/app';
import { CurrentEmployeeProvider } from './app/CurrentEmployee';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CurrentEmployeeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </CurrentEmployeeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
