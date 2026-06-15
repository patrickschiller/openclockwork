import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useI18n } from './i18n';
import { isDemoMode } from './runtime-config';

export function DemoNotice({ className }: { className?: string }) {
  const { t } = useI18n();
  if (!isDemoMode()) return null;

  return (
    <Alert className={className}>
      <AlertTitle>{t('demo.title')}</AlertTitle>
      <AlertDescription>{t('demo.description')}</AlertDescription>
    </Alert>
  );
}
