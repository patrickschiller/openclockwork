import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n, type Locale } from './i18n';

const LOCALES: Locale[] = ['de', 'en'];

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('language.change')}
          title={t('language.change')}
        >
          <Languages className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((candidate) => (
          <DropdownMenuItem
            key={candidate}
            onSelect={() => setLocale(candidate)}
            className={candidate === locale ? 'font-semibold' : undefined}
          >
            {t(`language.${candidate}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
