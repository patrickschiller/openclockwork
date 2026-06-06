import { useEffect, type ReactNode } from 'react';
import type { ThemePreference } from '../api/client';
import { useAuth } from './auth';

/**
 * Applies the user's themePreference to the document root.
 * - 'Light' / 'Dark': sets/removes the `dark` class on <html>.
 * - 'System': follows window.matchMedia('(prefers-color-scheme: dark)')
 *   and re-applies if the OS-level preference changes mid-session.
 * - No user (login page): mirrors the system preference so the login
 *   screen still respects "dark Mac at 8 pm".
 *
 * Pure side-effect provider — renders children verbatim.
 */

function applyTheme(preference: ThemePreference | null): void {
  const root = document.documentElement;
  const wantsDark =
    preference === 'Dark' ||
    (preference !== 'Light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', wantsDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const preference = user?.themePreference ?? null;

  useEffect(() => {
    applyTheme(preference);

    // System-mode (or no user) needs to react to OS-level changes.
    if (preference === 'Light' || preference === 'Dark') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(preference);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return <>{children}</>;
}
