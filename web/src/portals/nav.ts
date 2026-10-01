import type { IconType } from 'react-icons'
import {
  LuCalendarClock,
  LuCalendarDays,
  LuChartLine,
  LuGraduationCap,
  LuHouse,
  LuMegaphone,
  LuNotebookPen,
  LuSettings,
  LuShieldCheck,
  LuUser,
  LuUserCog,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import type { Portal, RestrictablePage } from '@shared/roles'

export interface NavLeaf {
  key: string
  label: string
  /** Relative to the portal root, e.g. "employees/payroll". */
  to: string
  icon?: IconType
  restrict?: RestrictablePage
}

export interface NavGroup {
  key: string
  label: string
  icon: IconType
  children: NavLeaf[]
}

export type NavItem = NavLeaf | NavGroup

export function isGroup(item: NavItem): item is NavGroup {
  return 'children' in item
}

export interface PortalNav {
  main: NavItem[]
  secondary: NavLeaf[]
  /** Bottom tabs on phones (tutor PWA). */
  mobileTabs?: NavLeaf[]
}

export const ADMIN_NAV: PortalNav = {
  main: [
    { key: 'home', label: 'Home', to: 'home', icon: LuHouse },
    { key: 'announcements', label: 'Announcements', to: 'announcements', icon: LuMegaphone },
    { key: 'schedule', label: 'Schedule', to: 'schedule', icon: LuCalendarDays },
    { key: 'students', label: 'Students', to: 'students', icon: LuGraduationCap },
    {
      key: 'employees',
      label: 'Employees',
      icon: LuUsers,
      children: [
        { key: 'employeeDirectory', label: 'Directory', to: 'employees/directory' },
        { key: 'employeeCalendar', label: 'Calendar', to: 'employees/calendar' },
        { key: 'subjects', label: 'Subjects', to: 'employees/subjects' },
        { key: 'payRates', label: 'Pay Rates', to: 'employees/pay-rates', restrict: 'payRates' },
        { key: 'payroll', label: 'Payroll', to: 'employees/payroll', restrict: 'payroll' },
        { key: 'timeEntries', label: 'Time Entries', to: 'employees/time-entries', restrict: 'timeEntries' },
      ],
    },
    {
      key: 'sessions',
      label: 'Sessions',
      icon: LuNotebookPen,
      children: [
        { key: 'sessionLog', label: 'Session Log', to: 'sessions/log' },
        { key: 'progressReports', label: 'Progress Reports', to: 'sessions/progress-reports' },
      ],
    },
  ],
  secondary: [
    { key: 'account', label: 'Account', to: 'account', icon: LuUserCog },
    { key: 'accessControl', label: 'Access Control', to: 'access-control', icon: LuShieldCheck, restrict: 'accessControl' },
    { key: 'settings', label: 'Settings', to: 'settings', icon: LuSettings },
  ],
}

export const TUTOR_NAV: PortalNav = {
  main: [
    { key: 'announcements', label: 'Announcements', to: 'announcements', icon: LuMegaphone },
    { key: 'schedule', label: 'Schedule', to: 'schedule', icon: LuCalendarDays },
    { key: 'availability', label: 'Availability', to: 'availability', icon: LuCalendarClock },
    {
      key: 'sessions',
      label: 'Sessions',
      icon: LuNotebookPen,
      children: [
        { key: 'sessionLog', label: 'Session Log', to: 'sessions/log' },
        { key: 'progressReports', label: 'Progress Reports', to: 'sessions/progress-reports' },
      ],
    },
    { key: 'students', label: 'Students', to: 'students', icon: LuGraduationCap },
    { key: 'payroll', label: 'Payroll', to: 'payroll', icon: LuWallet },
    {
      key: 'myInfo',
      label: 'My Info',
      icon: LuUser,
      children: [
        { key: 'profile', label: 'Profile', to: 'my-info/profile' },
        { key: 'mySubjects', label: 'Subjects', to: 'my-info/subjects' },
      ],
    },
  ],
  secondary: [],
  mobileTabs: [
    { key: 'announcements', label: 'News', to: 'announcements', icon: LuMegaphone },
    { key: 'availability', label: 'Availability', to: 'availability', icon: LuCalendarClock },
    { key: 'schedule', label: 'Schedule', to: 'schedule', icon: LuCalendarDays },
    { key: 'profile', label: 'Profile', to: 'my-info/profile', icon: LuUser },
  ],
}

export const PARENT_NAV: PortalNav = {
  main: [
    { key: 'home', label: 'Upcoming Sessions', to: 'home', icon: LuCalendarDays },
    { key: 'progressReports', label: 'Progress Reports', to: 'progress-reports', icon: LuChartLine },
  ],
  secondary: [],
  mobileTabs: [
    { key: 'home', label: 'Sessions', to: 'home', icon: LuCalendarDays },
    { key: 'progressReports', label: 'Reports', to: 'progress-reports', icon: LuChartLine },
  ],
}

export const STUDENT_NAV: PortalNav = {
  main: [
    { key: 'home', label: 'Home', to: 'home', icon: LuHouse },
    { key: 'calendar', label: 'Calendar', to: 'calendar', icon: LuCalendarDays },
    { key: 'profile', label: 'My Info', to: 'profile', icon: LuUser },
  ],
  secondary: [],
  mobileTabs: [
    { key: 'home', label: 'Home', to: 'home', icon: LuHouse },
    { key: 'calendar', label: 'Calendar', to: 'calendar', icon: LuCalendarDays },
    { key: 'profile', label: 'My Info', to: 'profile', icon: LuUser },
  ],
}

export const PORTAL_NAV: Record<Portal, PortalNav> = {
  admin: ADMIN_NAV,
  tutor: TUTOR_NAV,
  parent: PARENT_NAV,
  student: STUDENT_NAV,
}

/** Flattened leaves, for page titles and access checks. */
export function navLeaves(nav: PortalNav): NavLeaf[] {
  return [...nav.main.flatMap((i) => (isGroup(i) ? i.children : [i])), ...nav.secondary]
}
