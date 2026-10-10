import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { LoginPage } from './LoginPage';
import { ApiError } from '../api/client';

const loginMock = vi.fn();
const runtimeWindow = window as Window & {
  __OPENClockwork_CONFIG__?: { demoMode?: boolean };
};
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

vi.mock('../app/auth', () => ({
  useAuth: () => ({
    login: loginMock,
    loading: false,
    user: null,
    logout: vi.fn(),
  }),
  useCurrentUser: () => ({
    id: 'x',
    email: 'x',
    firstName: 'x',
    lastName: 'x',
    role: 'Employee',
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset();
    runtimeWindow.__OPENClockwork_CONFIG__ = undefined;
    localStorageMock.clear();
  });

  it('renders email + password fields and the submit button', () => {
    renderWithProviders(<LoginPage />);
    expect((screen.getByLabelText(/E-Mail/i) as HTMLInputElement).value).toBe(
      '',
    );
    expect((screen.getByLabelText(/Passwort/i) as HTMLInputElement).value).toBe(
      '',
    );
    expect(screen.getByRole('button', { name: /Anmelden/i })).toBeDefined();
    expect(screen.queryByText(/Demo-Zugang/i)).toBeNull();
  });

  it('calls login() with whatever is in the email + password fields', async () => {
    loginMock.mockResolvedValueOnce(undefined);
    renderWithProviders(<LoginPage />);
    const email = screen.getByLabelText(/E-Mail/i) as HTMLInputElement;
    const password = screen.getByLabelText(/Passwort/i) as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'a@b.c' } });
    fireEvent.change(password, { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: /Anmelden/i }));
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith('a@b.c', 'hunter2'),
    );
  });

  it('shows a localized message for invalid credentials', async () => {
    loginMock.mockRejectedValueOnce(new ApiError(401, 'Invalid credentials'));
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/E-Mail/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.change(screen.getByLabelText(/Passwort/i), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Anmelden/i }));
    await waitFor(() => {
      expect(
        screen.getByText('E-Mail-Adresse oder Passwort ist falsch.'),
      ).toBeDefined();
      expect(screen.queryByText('Invalid credentials')).toBeNull();
    });
  });

  it('does not expose a technical API message for server errors', async () => {
    loginMock.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/E-Mail/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.change(screen.getByLabelText(/Passwort/i), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Anmelden/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/wegen eines Serverproblems derzeit nicht möglich/i),
      ).toBeDefined();
      expect(screen.queryByText('Internal server error')).toBeNull();
    });
  });

  it('shows a localized connection error when the server cannot be reached', async () => {
    loginMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/E-Mail/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.change(screen.getByLabelText(/Passwort/i), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Anmelden/i }));
    await waitFor(() => {
      expect(screen.getByText(/Server ist nicht erreichbar/i)).toBeDefined();
      expect(screen.queryByText('Failed to fetch')).toBeNull();
    });
  });

  it('shows the server error in English when English is selected', async () => {
    localStorageMock.setItem('openclockwork.locale', 'en');
    loginMock.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/currently unavailable because of a server problem/i),
      ).toBeDefined();
      expect(screen.queryByText('Internal server error')).toBeNull();
    });
  });

  it('shows the notice and pre-fills credentials only in demo mode', () => {
    runtimeWindow.__OPENClockwork_CONFIG__ = { demoMode: true };
    renderWithProviders(<LoginPage />);
    expect(
      screen.getByText(/keine echten personenbezogenen Daten/i),
    ).toBeDefined();
    expect((screen.getByLabelText(/E-Mail/i) as HTMLInputElement).value).toBe(
      'hannah.roth@openclockwork.test',
    );
    expect((screen.getByLabelText(/Passwort/i) as HTMLInputElement).value).toBe(
      'openclockwork',
    );
    expect(screen.getByText(/Demo-Zugang/i)).toBeDefined();
  });
});
