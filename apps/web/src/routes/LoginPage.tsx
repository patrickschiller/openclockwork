import { useState, type FormEvent } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '../app/auth';
import { LanguageToggle } from '../app/LanguageToggle';
import { useI18n } from '../app/i18n';
import { DemoNotice } from '../app/DemoNotice';
import { BrandMark } from '../app/BrandMark';
import { isDemoMode } from '../app/runtime-config';
import { ApiError } from '../api/client';

const DEMO_EMAIL = 'hannah.roth@openclockwork.test';
const DEMO_PASSWORD = 'openclockwork';

function loginErrorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return t('login.invalidCredentials');
    if (error.status >= 500) return t('login.serverUnavailable');
    return t('login.failed');
  }
  if (error instanceof TypeError) return t('login.connectionFailed');
  return t('login.failed');
}

export function LoginPage() {
  const { login, loading } = useAuth();
  const { t } = useI18n();
  const demoMode = isDemoMode();
  const [email, setEmail] = useState(demoMode ? DEMO_EMAIL : '');
  const [password, setPassword] = useState(demoMode ? DEMO_PASSWORD : '');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(loginErrorMessage(err, t));
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <DemoNotice />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                <BrandMark iconClassName="h-10 w-10" />
              </CardTitle>
              <LanguageToggle />
            </div>
            <CardDescription>{t('login.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('login.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('login.submitting') : t('login.submit')}
              </Button>
              {demoMode && (
                <p className="text-xs text-muted-foreground">
                  {t('login.demoCredentials')}: <code>{DEMO_EMAIL}</code> /{' '}
                  <code>{DEMO_PASSWORD}</code>
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
