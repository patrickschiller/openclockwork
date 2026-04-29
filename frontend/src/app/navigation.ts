import type { ComponentType } from 'react';
import {
  CalendarMonthOutlined,
  DashboardOutlined,
  FactCheckOutlined,
  InboxOutlined,
  PunchClockOutlined
} from '@mui/icons-material';

export type Role = 'Employee' | 'Manager' | 'HRAdmin';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType;
  roles: Role[];
  showInBottomNav: boolean;
}

export const navItems: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: DashboardOutlined,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true
  },
  {
    to: '/booking',
    label: 'Buchen',
    icon: PunchClockOutlined,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true
  },
  {
    to: '/calendar',
    label: 'Kalender',
    icon: CalendarMonthOutlined,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true
  },
  {
    to: '/requests',
    label: 'Anträge',
    icon: FactCheckOutlined,
    roles: ['Employee', 'Manager', 'HRAdmin'],
    showInBottomNav: true
  },
  {
    to: '/admin/requests',
    label: 'Genehmigungen',
    icon: InboxOutlined,
    roles: ['Manager', 'HRAdmin'],
    showInBottomNav: false
  }
];

export function visibleNavItems(role: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}
