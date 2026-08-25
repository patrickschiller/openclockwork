import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_SESSION_EXPIRED_EVENT,
  REFRESH_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
} from '../api/client';
import { AuthProvider, useAuth } from './auth';

const USER_STORAGE_KEY = 'openclockwork.user';
const storedValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return storedValues.size;
  },
  clear: () => storedValues.clear(),
  getItem: (key) => storedValues.get(key) ?? null,
  key: (index) => Array.from(storedValues.keys())[index] ?? null,
  removeItem: (key) => storedValues.delete(key),
  setItem: (key, value) => storedValues.set(key, value),
};

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

function AuthStateProbe() {
  const { user, logout } = useAuth();
  return (
    <div>
      <span>{user?.email ?? 'logged-out'}</span>
      <button type="button" onClick={logout}>
        logout
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('clears the employee session and cached profile synchronously on logout', () => {
    localStorageMock.setItem(TOKEN_STORAGE_KEY, 'access-token');
    localStorageMock.setItem(REFRESH_STORAGE_KEY, 'refresh-token');
    localStorageMock.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        id: 'admin-1',
        email: 'admin@example.test',
        firstName: 'Ada',
        lastName: 'Admin',
        role: 'HRAdmin',
        themePreference: 'System',
      }),
    );

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('admin@example.test')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));

    expect(screen.getByText('logged-out')).toBeDefined();
    expect(localStorageMock.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(localStorageMock.getItem(REFRESH_STORAGE_KEY)).toBeNull();
    expect(localStorageMock.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  it('logs an admin tab out when a same-origin kiosk tab clears its access token', () => {
    localStorageMock.setItem(TOKEN_STORAGE_KEY, 'access-token');
    localStorageMock.setItem(REFRESH_STORAGE_KEY, 'refresh-token');
    localStorageMock.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        id: 'admin-1',
        email: 'admin@example.test',
        firstName: 'Ada',
        lastName: 'Admin',
        role: 'HRAdmin',
        themePreference: 'System',
      }),
    );

    const queryClient = new QueryClient();
    queryClient.setQueryData(['terminals'], [{ id: 'terminal-1' }]);
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('admin@example.test')).toBeDefined();
    localStorageMock.removeItem(TOKEN_STORAGE_KEY);
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: TOKEN_STORAGE_KEY,
        oldValue: 'access-token',
        newValue: null,
      }),
    );

    expect(screen.getByText('logged-out')).toBeDefined();
    expect(localStorageMock.getItem(REFRESH_STORAGE_KEY)).toBeNull();
    expect(localStorageMock.getItem(USER_STORAGE_KEY)).toBeNull();
    expect(queryClient.getQueryData(['terminals'])).toBeUndefined();
  });

  it('clears the visible profile when refresh failure expires this tab', () => {
    localStorageMock.setItem(TOKEN_STORAGE_KEY, 'access-token');
    localStorageMock.setItem(REFRESH_STORAGE_KEY, 'refresh-token');
    localStorageMock.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        id: 'admin-1',
        email: 'admin@example.test',
        firstName: 'Ada',
        lastName: 'Admin',
        role: 'HRAdmin',
        themePreference: 'System',
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    fireEvent(window, new Event(AUTH_SESSION_EXPIRED_EVENT));

    expect(screen.getByText('logged-out')).toBeDefined();
  });

  it('does not restore a cached profile without access or refresh tokens', () => {
    localStorageMock.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        id: 'admin-1',
        email: 'admin@example.test',
        firstName: 'Ada',
        lastName: 'Admin',
        role: 'HRAdmin',
        themePreference: 'System',
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('logged-out')).toBeDefined();
  });

  it('reconciles a bfcache-restored admin document after kiosk hand-over', () => {
    localStorageMock.setItem(TOKEN_STORAGE_KEY, 'access-token');
    localStorageMock.setItem(REFRESH_STORAGE_KEY, 'refresh-token');
    localStorageMock.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        id: 'admin-1',
        email: 'admin@example.test',
        firstName: 'Ada',
        lastName: 'Admin',
        role: 'HRAdmin',
        themePreference: 'System',
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('admin@example.test')).toBeDefined();
    // A frozen bfcache document does not necessarily observe the storage
    // events that occurred while another tab completed kiosk pairing.
    localStorageMock.clear();
    fireEvent(window, new Event('pageshow'));

    expect(screen.getByText('logged-out')).toBeDefined();
  });

  it('preserves kiosk query data when an already logged-out window regains focus', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['kiosk-state'], { terminalId: 'terminal-1' });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('logged-out')).toBeDefined();
    fireEvent(window, new Event('focus'));

    expect(queryClient.getQueryData(['kiosk-state'])).toEqual({
      terminalId: 'terminal-1',
    });
  });
});
