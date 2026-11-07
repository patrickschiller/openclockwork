import { screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import App from './app';
import { visibleNavItems } from './navigation';
const state = vi.hoisted(() => ({ role: 'Manager', mode: 'Team' }));
vi.mock('./auth', () => ({
  useAuth: () => ({ user: { id: 'actor', role: state.role }, logout: vi.fn() }),
}));
vi.mock('./installation', () => ({
  useInstallation: () => ({
    data: { mode: state.mode, setupCompleted: true },
    isLoading: false,
  }),
}));
vi.mock('./AppShell', () => ({ AppShell: () => <Outlet /> }));
vi.mock('../routes/TeamCockpitPage', () => ({
  TeamCockpitPage: () => <h1>Scoped cockpit</h1>,
}));
vi.mock('../routes/solo/SoloDashboardPage', () => ({
  SoloDashboardPage: () => <h1>Personal overview</h1>,
}));
beforeEach(() => {
  state.role = 'Manager';
  state.mode = 'Team';
});
it.each(['Manager', 'HRAdmin'])(
  'exposes cockpit navigation and direct route for %s',
  async (role) => {
    state.role = role;
    renderWithProviders(<App />, { initialPath: '/team-cockpit' });
    expect(
      await screen.findByRole('heading', { name: 'Scoped cockpit' }),
    ).toBeTruthy();
    expect(
      visibleNavItems(role as 'Manager').some(
        (item) => item.to === '/team-cockpit',
      ),
    ).toBe(true);
  },
);
it('does not expose cockpit route or navigation to Employee', async () => {
  state.role = 'Employee';
  renderWithProviders(<App />, { initialPath: '/team-cockpit' });
  expect(await screen.findByText('Diese Seite existiert nicht.')).toBeTruthy();
  expect(
    visibleNavItems('Employee').some((item) => item.to === '/team-cockpit'),
  ).toBe(false);
});
it('blocks direct Team cockpit route in Solo even for HR', async () => {
  state.role = 'HRAdmin';
  state.mode = 'Solo';
  renderWithProviders(<App />, { initialPath: '/team-cockpit' });
  expect(
    await screen.findByRole('heading', { name: 'Personal overview' }),
  ).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Scoped cockpit' })).toBeNull();
  expect(
    visibleNavItems('HRAdmin', true).some(
      (item) => item.to === '/team-cockpit',
    ),
  ).toBe(false);
});
