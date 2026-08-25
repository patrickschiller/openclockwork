import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { CircleUserRound, Download, LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from './auth';
import { useRealtimeInvalidation } from './realtime';
import { useInstallPrompt } from './use-install-prompt';
import { visibleNavItems, type NavItem } from './navigation';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useI18n } from './i18n';
import { DemoNotice } from './DemoNotice';
import { BrandMark } from './BrandMark';
import { APP_VERSION } from './app-version';

export function AppShell() {
  const { user, logout } = useAuth();
  const { t, enumLabel } = useI18n();
  useRealtimeInvalidation();
  const install = useInstallPrompt();
  const role = user?.role ?? 'Employee';
  const items = useMemo(() => visibleNavItems(role), [role]);
  const bottomItems = useMemo(
    () => items.filter((i) => i.showInBottomNav),
    [items],
  );
  const overflowItems = useMemo(
    () => items.filter((i) => !i.showInBottomNav),
    [items],
  );
  const location = useLocation();

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center px-6">
          <BrandMark />
        </div>
        <nav
          className="flex-1 px-3 pb-6"
          aria-label={t('shell.mainNavigation')}
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} />
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b bg-card/80 px-4 backdrop-blur sm:gap-4 md:px-6">
          <BrandMark
            className="md:hidden"
            iconClassName="h-8 w-8"
            textClassName="hidden text-base sm:inline"
          />
          <div className="flex-1" />
          <LanguageToggle />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label={t('shell.accountMenu')}
              >
                <CircleUserRound className="h-5 w-5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 max-w-[calc(100vw-2rem)]"
            >
              {user ? (
                <DropdownMenuLabel className="space-y-1 font-normal">
                  <p className="text-xs text-muted-foreground">
                    {t('shell.signedInAs')}
                  </p>
                  <p className="break-words font-medium text-foreground">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {user.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('common.role')}: {enumLabel(user.role)}
                  </p>
                </DropdownMenuLabel>
              ) : (
                <DropdownMenuLabel>{t('shell.profile')}</DropdownMenuLabel>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={logout}
                className="gap-2 text-destructive"
              >
                <LogOut className="h-4 w-4" /> {t('shell.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <DemoNotice className="mx-4 mt-4 w-auto md:mx-6" />

        {install.available && (
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-sm md:px-6">
            <Download className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="flex-1">{t('shell.installHint')}</span>
            <Button size="sm" onClick={() => install.prompt()}>
              {t('shell.install')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={install.dismiss}
              aria-label={t('shell.closeInstall')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <main className="flex-1 px-4 pb-32 pt-6 md:px-8 md:pb-8 md:pt-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>

        {location.pathname.startsWith('/admin/') && (
          <footer className="px-4 pb-28 text-center text-xs text-muted-foreground md:px-8 md:pb-5">
            <p>{t('shell.adminFooter')}</p>
            <p>{t('shell.adminVersion', { version: APP_VERSION })}</p>
          </footer>
        )}

        <nav
          className="fixed bottom-0 left-0 right-0 z-10 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label={t('shell.mobileNavigation')}
        >
          <ul
            className={cn(
              'grid',
              overflowItems.length > 0 ? 'grid-cols-5' : 'grid-cols-4',
            )}
          >
            {bottomItems.map((item) => (
              <li key={item.to}>
                <BottomNavLink
                  item={item}
                  active={location.pathname === item.to}
                />
              </li>
            ))}
            {overflowItems.length > 0 && (
              <li>
                <MobileOverflowMenu
                  items={overflowItems}
                  currentPath={location.pathname}
                  active={overflowItems.some(
                    (item) => location.pathname === item.to,
                  )}
                />
              </li>
            )}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function MobileOverflowMenu({
  items,
  currentPath,
  active,
}: {
  items: NavItem[];
  currentPath: string;
  active: boolean;
}) {
  const { t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full flex-col items-center gap-1.5 py-2.5 text-sm font-medium data-[state=open]:text-primary',
            active ? 'text-primary' : 'text-muted-foreground',
          )}
          aria-label={t('shell.openMore')}
        >
          <Menu className="h-7 w-7" aria-hidden="true" />
          <span>{t('shell.more')}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-64 max-w-[calc(100vw-1.5rem)]"
      >
        <DropdownMenuLabel>{t('shell.moreAreas')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.to} asChild>
              <NavLink
                to={item.to}
                className={cn(
                  'flex w-full items-center gap-3',
                  currentPath === item.to && 'bg-accent text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const { t } = useI18n();
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium transition-colors',
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          isActive && 'bg-accent text-accent-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{t(item.labelKey)}</span>
    </NavLink>
  );
}

function BottomNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const { t } = useI18n();
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={cn(
        'flex flex-col items-center gap-1.5 py-2.5 text-sm font-medium',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className="h-7 w-7" aria-hidden="true" />
      <span>{t(item.labelKey)}</span>
    </NavLink>
  );
}
