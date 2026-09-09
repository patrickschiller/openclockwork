import { useQuery } from '@tanstack/react-query';
import { soloApi } from '../api/solo';
import { useAuth } from './auth';

export function useInstallation() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['installation', user?.id],
    queryFn: soloApi.installation,
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
    retry: 1,
  });
}
