import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import { AppShell } from './AppShell';
import { APP_VERSION } from './app-version';

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

  it('uses an icon-only account trigger and shows the complete account details', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'Kontomenü öffnen' });

    expect(trigger.textContent).toBe('');
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const accountMenu = await screen.findByRole('menu');
    expect(within(accountMenu).getByText('Marc Becker')).toBeDefined();
    expect(
      within(accountMenu).getByText('marc.becker@openclockwork.test'),
    ).toBeDefined();
    expect(within(accountMenu).getByText('Rolle: Vorgesetzte:r')).toBeDefined();
    expect(
      within(accountMenu).getByRole('menuitem', { name: 'Abmelden' }),
    ).toBeDefined();
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

    const trigger = screen.getByRole('button', {
      name: 'Weitere Bereiche öffnen',
    });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const overflowMenu = await screen.findByRole('menu');
    const calendarItem = within(overflowMenu).getByRole('menuitem', {
      name: 'Kalender',
    });
    await waitFor(() => expect(document.activeElement).toBe(calendarItem));

    fireEvent.keyDown(overflowMenu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);

    fireEvent.keyDown(trigger, { key: 'Enter' });
    const reopenedMenu = await screen.findByRole('menu');
    fireEvent.click(
      within(reopenedMenu).getByRole('menuitem', { name: 'Genehmigungen' }),
    );

    expect(await screen.findByText('Approval inbox')).toBeDefined();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the attribution footer on admin routes only', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/requests']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="admin/requests" element={<div>Approval inbox</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Crafted with ❤️ in Würzburg by Patrick Schiller'),
    ).toBeDefined();
    expect(
      screen.getByText(`OpenClockwork-Version ${APP_VERSION}`),
    ).toBeDefined();

    unmount();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.queryByText('Crafted with ❤️ in Würzburg by Patrick Schiller'),
    ).toBeNull();
    expect(
      screen.queryByText(`OpenClockwork-Version ${APP_VERSION}`),
    ).toBeNull();
  });

  it('constrains full Solo bottom labels in five narrow columns without shrinking touch targets', () => {
    render(
      <MemoryRouter>
        <AppShell solo />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Mobile Navigation' });
    expect(
      within(nav).getByRole('list').classList.contains('grid-cols-5'),
    ).toBe(true);
    for (const label of [
      'Übersicht',
      'Zeiten',
      'Kalender',
      'Berichte',
      'Mehr',
    ]) {
      const text = within(nav).getByText(label);
      expect(text.classList.contains('text-xs')).toBe(true);
      expect(text.classList.contains('min-[360px]:text-sm')).toBe(true);
      expect(text.classList.contains('leading-5')).toBe(true);
      expect(text.classList.contains('max-w-full')).toBe(true);
      expect(text.classList.contains('break-words')).toBe(true);
      expect(text.parentElement?.classList.contains('py-2.5')).toBe(true);
    }
  });

  it('preserves existing Team bottom label styling', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Mobile Navigation' });
    expect(
      within(nav).getByText('Dashboard').classList.contains('text-xs'),
    ).toBe(false);
    expect(within(nav).getByText('Mehr').classList.contains('text-xs')).toBe(
      false,
    );
  });
});
