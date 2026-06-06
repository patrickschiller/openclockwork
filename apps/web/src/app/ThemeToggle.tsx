import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type ThemePreference } from '../api/client';
import { useAuth } from './auth';

const ORDER: ThemePreference[] = ['Light', 'Dark', 'System'];

const META: Record<ThemePreference, { label: string; Icon: typeof Sun }> = {
  Light: { label: 'Hell', Icon: Sun },
  Dark: { label: 'Dunkel', Icon: Moon },
  System: { label: 'Systemeinstellung', Icon: Monitor },
};

function nextPreference(current: ThemePreference): ThemePreference {
  const idx = ORDER.indexOf(current);
  return ORDER[(idx + 1) % ORDER.length];
}

/**
 * Three-state cycling button: Hell → Dunkel → System → Hell. Optimistic
 * update so the UI flips instantly; the PATCH runs in the background.
 * On failure the cached preference is rolled back.
 */
export function ThemeToggle() {
  const { user, patchUser } = useAuth();
  const current = user?.themePreference ?? 'System';

  const mutation = useMutation({
    mutationFn: (next: ThemePreference) => api.updatePreferences(next),
    onMutate: (next) => {
      const previous = current;
      patchUser({ themePreference: next });
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx) patchUser({ themePreference: ctx.previous });
    },
    onSuccess: (profile) => {
      patchUser({ themePreference: profile.themePreference });
    },
  });

  const onClick = useCallback(() => {
    mutation.mutate(nextPreference(current));
  }, [current, mutation]);

  if (!user) return null;
  const { label, Icon } = META[current];

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={mutation.isPending}
      title={`Design: ${label} (klicken zum Wechseln)`}
      aria-label={`Design wechseln. Aktuell: ${label}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
