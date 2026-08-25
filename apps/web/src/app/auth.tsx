import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AUTH_SESSION_EXPIRED_EVENT,
  api,
  REFRESH_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  type EmployeeRole,
  type ThemePreference,
} from '../api/client';

const USER_STORAGE_KEY = 'openclockwork.user';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: EmployeeRole;
  themePreference: ThemePreference;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Patch fields of the cached user in-place, e.g. after a preferences update. */
  patchUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage?.removeItem(key);
    else window.localStorage?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readStoredUser(): AuthUser | null {
  const user = readStored<AuthUser>(USER_STORAGE_KEY);
  if (!user) return null;

  // A cached profile is not an authenticated session on its own. This also
  // prevents a stale admin shell after another same-origin tab handed the
  // browser over to kiosk mode and removed the employee tokens.
  try {
    const hasToken =
      Boolean(window.localStorage?.getItem(TOKEN_STORAGE_KEY)) ||
      Boolean(window.localStorage?.getItem(REFRESH_STORAGE_KEY));
    return hasToken ? user : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    writeStored(USER_STORAGE_KEY, user ? JSON.stringify(user) : null);
  }, [user]);

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const result = await api.login({ email, password });
        writeStored(TOKEN_STORAGE_KEY, result.accessToken);
        writeStored(REFRESH_STORAGE_KEY, result.refreshToken);
        setUser(result.employee);
        queryClient.invalidateQueries();
      } finally {
        setLoading(false);
      }
    },
    [queryClient],
  );

  const clearSession = useCallback(() => {
    writeStored(TOKEN_STORAGE_KEY, null);
    writeStored(REFRESH_STORAGE_KEY, null);
    // Clear the cached profile synchronously as well. This matters when an
    // admin hands the same browser over to a shared paired kiosk and the page
    // is reloaded before React effects have a chance to run.
    writeStored(USER_STORAGE_KEY, null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const logout = clearSession;

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === USER_STORAGE_KEY) {
        setUser(readStoredUser());
        return;
      }

      if (
        (event.key === TOKEN_STORAGE_KEY ||
          event.key === REFRESH_STORAGE_KEY) &&
        event.newValue === null
      ) {
        clearSession();
      }
    };
    const handleExpiredSession = () => clearSession();
    const reconcileStoredSession = () => {
      const storedUser = readStoredUser();
      if (storedUser) setUser(storedUser);
      // A normal kiosk/login document has no employee user and may keep its
      // own React Query data. Only clear the cache when this React tree still
      // holds a stale authenticated profile that no longer has tokens.
      else if (user) clearSession();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
    // Safari can restore an older React tree from its back/forward cache.
    // Reconcile again when that document becomes active so it cannot retain
    // an editor whose tokens were cleared during a kiosk hand-over.
    window.addEventListener('pageshow', reconcileStoredSession);
    window.addEventListener('focus', reconcileStoredSession);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleExpiredSession,
      );
      window.removeEventListener('pageshow', reconcileStoredSession);
      window.removeEventListener('focus', reconcileStoredSession);
    };
  }, [clearSession, user]);

  const patchUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, patchUser }),
    [user, loading, login, logout, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useCurrentUser(): AuthUser {
  const { user } = useAuth();
  if (!user)
    throw new Error(
      'No authenticated user (this hook must be used inside an authenticated route)',
    );
  return user;
}
