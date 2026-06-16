import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import { LoginPage } from './LoginPage';

const loginMock = vi.fn();
const runtimeWindow = window as Window & {
  __OPENClockwork_CONFIG__?: { demoMode?: boolean };
};

vi.mock('../app/auth', () => ({
  useAuth: () => ({ login: loginMock, loading: false, user: null, logout: vi.fn() }),
  useCurrentUser: () => ({ id: 'x', email: 'x', firstName: 'x', lastName: 'x', role: 'Employee' }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset();
    runtimeWindow.__OPENClockwork_CONFIG__ = undefined;
  });

  it('renders email + password fields and the submit button', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText(/E-Mail/i)).toBeDefined();
    expect(screen.getByLabelText(/Passwort/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Anmelden/i })).toBeDefined();
  });

  it('calls login() with whatever is in the email + password fields', async () => {
    loginMock.mockResolvedValueOnce(undefined);
    renderWithProviders(<LoginPage />);
    const email = screen.getByLabelText(/E-Mail/i) as HTMLInputElement;
    const password = screen.getByLabelText(/Passwort/i) as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'a@b.c' } });
    fireEvent.change(password, { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: /Anmelden/i }));
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('a@b.c', 'hunter2'));
  });

  it('shows an error alert when login() throws', async () => {
    loginMock.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderWithProviders(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /Anmelden/i }));
    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/)).toBeDefined();
    });
  });

  it('warns visitors not to enter personal data in demo mode', () => {
    runtimeWindow.__OPENClockwork_CONFIG__ = { demoMode: true };
    renderWithProviders(<LoginPage />);
    expect(screen.getByText(/keine echten personenbezogenen Daten/i)).toBeDefined();
  });
});
