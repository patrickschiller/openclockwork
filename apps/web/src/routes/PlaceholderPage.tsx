import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useI18n } from '../app/i18n';

interface PlaceholderPageProps {
  title: string;
  hint?: string;
}

export function PlaceholderPage({ title, hint }: PlaceholderPageProps) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {t('placeholder.description')}
      </CardContent>
    </Card>
  );
}
