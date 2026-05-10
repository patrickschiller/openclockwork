import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCurrentEmployee } from './CurrentEmployee';
import { visibleNavItems, type NavItem } from './navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppShell() {
  const { current } = useCurrentEmployee();
  const role = current?.role ?? 'Employee';
  const items = useMemo(() => visibleNavItems(role), [role]);
  const bottomItems = useMemo(() => items.filter((i) => i.showInBottomNav), [items]);
  const location = useLocation();

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center px-6">
          <span className="text-lg font-semibold tracking-tight">OpenClockwork</span>
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
          <span className="text-base font-semibold md:hidden">OpenClockwork</span>
          <div className="flex-1" />
          <EmployeePicker />
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-8 md:pt-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-10 border-t bg-card md:hidden">
          <ul className="grid grid-cols-4">
            {bottomItems.map((item) => (
              <li key={item.to}>
                <BottomNavLink item={item} active={location.pathname === item.to} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
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
      <span>{item.label}</span>
    </NavLink>
  );
}

function BottomNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={cn(
        'flex flex-col items-center gap-1 py-2 text-xs',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

function EmployeePicker() {
  const { employees, current, setCurrentId, isLoading } = useCurrentEmployee();
  if (isLoading || employees.length === 0) {
    return <span className="text-sm text-muted-foreground">Lade Profile…</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {current ? (
            <span>
              {current.firstName} {current.lastName}
              <span className="ml-2 text-xs text-muted-foreground">{current.role}</span>
            </span>
          ) : (
            <span>Profil wählen</span>
          )}
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Angemeldet als</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {employees.map((e) => (
          <DropdownMenuItem
            key={e.id}
            onSelect={() => setCurrentId(e.id)}
            className="flex items-center justify-between gap-2"
          >
            <span>
              {e.firstName} {e.lastName}
            </span>
            <span className="text-xs text-muted-foreground">{e.role}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
