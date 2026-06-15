import {
  CalendarDays,
  Clock,
  FolderKanban,
  Handshake,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { EmployeeRole } from '../api/client';

export type Role = EmployeeRole;

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles: Role[];
  showInBottomNav: boolean;
}

export const navItems: NavItem[] = [
  {
    to: '/',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/booking',
    labelKey: 'nav.booking',
    icon: Clock,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarDays,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/requests',
    labelKey: 'nav.requests',
    icon: ListChecks,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/substitute',
    labelKey: 'nav.substitute',
    icon: Handshake,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/absences',
    labelKey: 'nav.absences',
    icon: Stethoscope,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/admin/requests',
    labelKey: 'nav.approvals',
    icon: Inbox,
    roles: ['Manager', 'HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/admin/projects',
    labelKey: 'nav.projects',
    icon: FolderKanban,
    roles: ['Manager', 'HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/admin/schedules',
    labelKey: 'nav.schedules',
    icon: Settings,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/admin/employees',
    labelKey: 'nav.employees',
    icon: Users,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
];

export function visibleNavItems(role: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}
