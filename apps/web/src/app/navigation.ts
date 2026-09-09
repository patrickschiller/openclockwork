import {
  CalendarDays,
  Clock,
  FileBarChart,
  FolderKanban,
  Handshake,
  Inbox,
  LayoutDashboard,
  ListChecks,
  QrCode,
  Settings,
  Stethoscope,
  Tablet,
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
    to: '/terminal',
    labelKey: 'nav.terminalScan',
    icon: QrCode,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarDays,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: false,
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
    to: '/admin/working-times',
    labelKey: 'nav.workingTimes',
    icon: FileBarChart,
    roles: ['HRAdmin'],
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
  {
    to: '/admin/settings/terminals',
    labelKey: 'nav.terminals',
    icon: Tablet,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/settings',
    labelKey: 'solo.settings',
    icon: Settings,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
];

export const soloNavItems: NavItem[] = [
  {
    to: '/',
    labelKey: 'solo.overview',
    icon: LayoutDashboard,
    roles: ['HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/booking',
    labelKey: 'solo.times',
    icon: Clock,
    roles: ['HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarDays,
    roles: ['HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/customers',
    labelKey: 'solo.customers',
    icon: Users,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/projects',
    labelKey: 'nav.projects',
    icon: FolderKanban,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/reports',
    labelKey: 'solo.reports',
    icon: FileBarChart,
    roles: ['HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/settings',
    labelKey: 'solo.settings',
    icon: Settings,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
];

export function visibleNavItems(role: Role, solo = false): NavItem[] {
  if (solo) return soloNavItems;
  return navItems.filter((item) => item.roles.includes(role));
}
