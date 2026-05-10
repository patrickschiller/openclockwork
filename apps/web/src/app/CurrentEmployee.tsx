import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type EmployeeDto } from '../api/client';

const STORAGE_KEY = 'openclockwork.currentEmployeeId';

function readStoredId(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage?.getItem(STORAGE_KEY) ?? null : null;
  } catch {
    return null;
  }
}

function writeStoredId(id: string): void {
  try {
    window.localStorage?.setItem(STORAGE_KEY, id);
  } catch {
    // ignore — storage may be unavailable (private mode, SSR, etc.)
  }
}

interface CurrentEmployeeContextValue {
  employees: EmployeeDto[];
  current: EmployeeDto | null;
  setCurrentId: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
}

const CurrentEmployeeContext = createContext<CurrentEmployeeContextValue | undefined>(undefined);

export function CurrentEmployeeProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees(),
    retry: false,
  });

  const [currentId, setCurrentIdState] = useState<string | null>(() => readStoredId());

  useEffect(() => {
    if (!data || data.length === 0) return;
    if (currentId && data.some((e) => e.id === currentId)) return;
    const fallback = data.find((e) => e.role === 'HRAdmin') ?? data[0];
    setCurrentIdState(fallback.id);
    writeStoredId(fallback.id);
  }, [data, currentId]);

  const setCurrentId = useCallback((id: string) => {
    setCurrentIdState(id);
    writeStoredId(id);
  }, []);

  const value = useMemo<CurrentEmployeeContextValue>(() => {
    const employees = data ?? [];
    const current = employees.find((e) => e.id === currentId) ?? null;
    return {
      employees,
      current,
      setCurrentId,
      isLoading,
      error: (error as Error | null) ?? null,
    };
  }, [data, currentId, setCurrentId, isLoading, error]);

  return (
    <CurrentEmployeeContext.Provider value={value}>{children}</CurrentEmployeeContext.Provider>
  );
}

export function useCurrentEmployee(): CurrentEmployeeContextValue {
  const ctx = useContext(CurrentEmployeeContext);
  if (!ctx)
    throw new Error('useCurrentEmployee must be used within CurrentEmployeeProvider');
  return ctx;
}
