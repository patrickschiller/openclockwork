import { useMemo, useState } from 'react';
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
import { ChevronDown, Download, LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from './auth';
import { useRealtimeInvalidation } from './realtime';
import { useInstallPrompt } from './use-install-prompt';
import { visibleNavItems, type NavItem } from './navigation';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useI18n } from './i18n';
import { DemoNotice } from './DemoNotice';

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
          <span className="text-lg font-semibold tracking-tight">
            OpenClockwork
          </span>
        </div>
        <nav className="flex-1 px-3 pb-6">
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
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-card/80 px-4 backdrop-blur md:px-6">
          <span className="text-base font-semibold md:hidden">
            OpenClockwork
          </span>
          <div className="flex-1" />
          <LanguageToggle />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                {user ? (
                  <span>
                    {user.firstName} {user.lastName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {enumLabel(user.role)}
                    </span>
                  </span>
                ) : (
                  <span>{t('shell.profile')}</span>
                )}
                <ChevronDown
                  className="h-4 w-4 opacity-60"
                  aria-hidden="true"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t('shell.signedInAs')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs text-muted-foreground"
                disabled
              >
                {user?.email}
              </DropdownMenuItem>
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

        <DemoNotice className="mx-4 mt-4 md:mx-6" />

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

        <nav className="fixed bottom-0 left-0 right-0 z-10 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
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
  active,
}: {
  items: NavItem[];
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={t('shell.moreAreas')}
          className="fixed bottom-20 right-3 z-20 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold">{t('shell.moreAreas')}</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
              aria-label={t('shell.closeMenu')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <ul className="mt-1 space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{t(item.labelKey)}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <button
        type="button"
        className={cn(
          'flex w-full flex-col items-center gap-1.5 py-2.5 text-sm font-medium',
          active || open ? 'text-primary' : 'text-muted-foreground',
        )}
        aria-label={open ? t('shell.closeMore') : t('shell.openMore')}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Menu className="h-7 w-7" aria-hidden="true" />
        <span>{t('shell.more')}</span>
      </button>
    </>
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
