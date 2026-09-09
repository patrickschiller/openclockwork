import { screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import { vi } from 'vitest';
import { renderWithProviders } from '../test-utils';
import App from './app';

const state = vi.hoisted(() => ({ setupCompleted: true, unavailable: false }));
vi.mock('./auth', () => ({
  useAuth: () => ({ user: { id: 'owner', role: 'HRAdmin' }, logout: vi.fn() }),
}));
vi.mock('./installation', () => ({
  useInstallation: () => ({
    data: state.unavailable
      ? undefined
      : { mode: 'Solo', setupCompleted: state.setupCompleted },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('./AppShell', () => ({ AppShell: () => <Outlet /> }));
vi.mock('../routes/solo/SoloDashboardPage', () => ({
  SoloDashboardPage: () => <h1>Personal overview</h1>,
}));
vi.mock('../routes/solo/SoloSettingsPage', () => ({
  SoloSettingsPage: () => <h1>Personal setup</h1>,
}));
vi.mock('../routes/AdminEmployeesPage', () => ({
  AdminEmployeesPage: () => <h1>Team employees</h1>,
}));

beforeEach(() => {
  state.setupCompleted = true;
  state.unavailable = false;
});
describe('installation-driven routing', () => {
  it('redirects direct Team administration URLs to the personal overview', async () => {
    renderWithProviders(<App />, { initialPath: '/admin/employees' });
    expect(
      await screen.findByRole('heading', { name: 'Personal overview' }),
    ).toBeDefined();
    expect(screen.queryByText('Team employees')).toBeNull();
  });
  it('requires setup completion before opening the personal workflow', async () => {
    state.setupCompleted = false;
    renderWithProviders(<App />, { initialPath: '/booking' });
    expect(
      await screen.findByRole('heading', { name: 'Personal setup' }),
    ).toBeDefined();
  });
  it('does not assume Team mode when installation settings are unavailable', () => {
    state.unavailable = true;
    renderWithProviders(<App />, { initialPath: '/admin/employees' });
    expect(screen.getByRole('alert').textContent).toContain(
      'Die Installation konnte nicht geladen werden.',
    );
    expect(screen.queryByText('Team employees')).toBeNull();
  });
});
