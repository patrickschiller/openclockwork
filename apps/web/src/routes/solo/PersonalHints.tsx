import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { soloApi } from '../../api/solo';
import { useI18n } from '../../app/i18n';
import { useInstallation } from '../../app/installation';
import { dateInZone } from '../../app/solo-time';
import { QueryError } from './SoloUi';

export function PersonalHints() {
  const { t, languageTag } = useI18n();
  const { data: installation } = useInstallation();
  const today = dateInZone(installation?.timeZone ?? 'UTC');
  const hints = useQuery({
    queryKey: ['solo-hints', today],
    queryFn: () => soloApi.hints(`${today.slice(0, 7)}-01`, today),
    enabled: Boolean(installation?.capabilities.coreTimeHints),
  });
  if (!installation?.capabilities.coreTimeHints) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('solo.personalHints')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <QueryError error={hints.error} retry={hints.refetch} />
        {hints.isLoading && <p>{t('common.loading')}</p>}
        {hints.data?.hints.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('solo.noHints')}</p>
        )}
        <ul className="space-y-2">
          {hints.data?.hints.map((hint, index) => (
            <li
              key={`${hint.date}-${hint.kind}-${index}`}
              className="rounded bg-muted/40 p-3 text-sm"
            >
              <strong>{hint.date}</strong> · {t(`solo.hint.${hint.kind}`)}
              <p className="text-muted-foreground">
                {hint.windowLabel ? `${hint.windowLabel} · ` : ''}
                {hint.boundary} ·{' '}
                {hint.deltaMinutes.toLocaleString(languageTag, {
                  maximumFractionDigits: 1,
                })}{' '}
                {t('common.minutes')}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
