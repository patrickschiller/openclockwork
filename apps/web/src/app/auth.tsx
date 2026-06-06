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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStored<AuthUser>(USER_STORAGE_KEY));
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

  const logout = useCallback(() => {
    writeStored(TOKEN_STORAGE_KEY, null);
    writeStored(REFRESH_STORAGE_KEY, null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

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
  if (!user) throw new Error('No authenticated user (this hook must be used inside an authenticated route)');
  return user;
}
