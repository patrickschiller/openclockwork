import {
  CalendarDays,
  Clock,
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
  label: string;
  icon: LucideIcon;
  roles: Role[];
  showInBottomNav: boolean;
}

export const navItems: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/booking',
    label: 'Buchen',
    icon: Clock,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/calendar',
    label: 'Kalender',
    icon: CalendarDays,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/requests',
    label: 'Anträge',
    icon: ListChecks,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true,
  },
  {
    to: '/substitute',
    label: 'Vertretungen',
    icon: Handshake,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/absences',
    label: 'Abwesenheiten',
    icon: Stethoscope,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/admin/requests',
    label: 'Genehmigungen',
    icon: Inbox,
    roles: ['Manager', 'HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/admin/schedules',
    label: 'Arbeitszeitpläne',
    icon: Settings,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
  {
    to: '/admin/employees',
    label: 'Mitarbeiter',
    icon: Users,
    roles: ['HRAdmin'],
    showInBottomNav: false,
  },
];

export function visibleNavItems(role: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}
