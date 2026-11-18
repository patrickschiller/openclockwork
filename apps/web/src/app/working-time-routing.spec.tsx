import { screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import App from './app';

const state = vi.hoisted(() => ({ role: 'Manager' }));
vi.mock('./auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', role: state.role },
    logout: vi.fn(),
  }),
}));
vi.mock('./installation', () => ({
  useInstallation: () => ({
    data: { mode: 'Team', setupCompleted: true },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('./AppShell', () => ({ AppShell: () => <Outlet /> }));
vi.mock('../routes/AdminWorkingTimesPage', () => ({
  AdminWorkingTimesPage: () => <h1>Working-time comparison</h1>,
}));

beforeEach(() => {
  state.role = 'Manager';
});
it.each(['Manager', 'HRAdmin'])(
  'allows the direct working-time route for %s',
  async (role) => {
    state.role = role;
    renderWithProviders(<App />, { initialPath: '/admin/working-times' });
    expect(
      await screen.findByRole('heading', { name: 'Working-time comparison' }),
    ).toBeTruthy();
  },
);
it('does not expose the route to ordinary employees', async () => {
  state.role = 'Employee';
  renderWithProviders(<App />, { initialPath: '/admin/working-times' });
  expect(await screen.findByText('Diese Seite existiert nicht.')).toBeTruthy();
  expect(
    screen.queryByRole('heading', { name: 'Working-time comparison' }),
  ).toBeNull();
});
