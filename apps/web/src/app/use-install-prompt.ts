import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = 'openclockwork.installPromptDismissedAt';
const DISMISS_TTL_DAYS = 14;

/**
 * Captures the browser's deferred `beforeinstallprompt` event and exposes a
 * stable `prompt()` you can call from a button. Returns `available = false`
 * when the browser already considers the app installed, when the user has
 * dismissed the prompt within the last two weeks, or when the browser
 * doesn't support installability (iOS Safari, etc.).
 */
export function useInstallPrompt(): {
  available: boolean;
  prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (dismissedRecently()) return;
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const installed = () => setDeferred(null);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === 'dismissed') markDismissed();
    return choice.outcome;
  }, [deferred]);

  const dismiss = useCallback(() => {
    markDismissed();
    setDeferred(null);
  }, []);

  return { available: !!deferred, prompt, dismiss };
}

function dismissedRecently(): boolean {
  try {
    const ts = window.localStorage.getItem(DISMISSED_KEY);
    if (!ts) return false;
    const ageDays = (Date.now() - Number(ts)) / 86_400_000;
    return ageDays < DISMISS_TTL_DAYS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // localStorage may be denied — degrade silently.
  }
}
