import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import { AppShell } from './AppShell';

const runtimeWindow = window as Window & {
  __OPENClockwork_CONFIG__?: { demoMode?: boolean };
};

vi.mock('./auth', () => ({
  useAuth: () => ({
    user: {
      id: 'manager-1',
      email: 'marc.becker@openclockwork.test',
      firstName: 'Marc',
      lastName: 'Becker',
      role: 'Manager',
      themePreference: 'System',
    },
    logout: vi.fn(),
    patchUser: vi.fn(),
  }),
}));

vi.mock('./realtime', () => ({
  useRealtimeInvalidation: vi.fn(),
}));

vi.mock('./use-install-prompt', () => ({
  useInstallPrompt: () => ({
    available: false,
    prompt: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

describe('AppShell', () => {
  afterEach(() => {
    delete runtimeWindow.__OPENClockwork_CONFIG__;
  });

  it('keeps the demo notice within the available page width', () => {
    runtimeWindow.__OPENClockwork_CONFIG__ = { demoMode: true };

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const demoNotice = screen.getByRole('alert');

    expect(demoNotice.classList.contains('w-auto')).toBe(true);
    expect(demoNotice.classList.contains('w-full')).toBe(false);
  });

  it('makes the manager approval inbox reachable from the overflow menu', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>Dashboard content</div>} />
            <Route path="admin/requests" element={<div>Approval inbox</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Weitere Bereiche öffnen' }),
    );
    const overflowMenu = await screen.findByRole('dialog', {
      name: 'Weitere Bereiche',
    });
    fireEvent.click(
      within(overflowMenu).getByRole('link', { name: 'Genehmigungen' }),
    );

    expect(await screen.findByText('Approval inbox')).toBeDefined();
    expect(
      screen.queryByRole('dialog', { name: 'Weitere Bereiche' }),
    ).toBeNull();
  });
});
