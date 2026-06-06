import { useEffect, useState } from 'react';

/**
 * Reactively tracks `navigator.onLine`. SSR-safe: returns `true` until the
 * effect mounts so we don't flash the offline banner during hydration.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
