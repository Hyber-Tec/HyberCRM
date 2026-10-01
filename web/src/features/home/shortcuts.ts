import { useCallback, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuCalendarClock,
  LuCalendarDays,
  LuChartLine,
  LuClipboardList,
  LuClock,
  LuGraduationCap,
  LuHistory,
  LuLayoutGrid,
  LuMegaphone,
  LuMonitorSmartphone,
  LuNotebookPen,
  LuSettings,
  LuShieldCheck,
  LuUserCog,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import type { RestrictablePage } from '@shared/roles'

export interface Shortcut {
  id: string
  label: string
  /** Relative to the admin portal, or absolute below the branch when `branchLevel`. */
  to: string
  icon: IconType
  restrict?: RestrictablePage
  branchLevel?: boolean
}

/** Home shortcuts (True Education's registry, minus Diagnostics and Curriculum). */
export const SHORTCUTS: Shortcut[] = [
  { id: 'schedule', label: 'Schedule', to: 'scheduling/schedule', icon: LuCalendarDays },
  { id: 'students', label: 'Student Directory', to: 'students/directory', icon: LuGraduationCap },
  { id: 'studentCalendar', label: 'Student Calendar', to: 'students/calendar', icon: LuCalendarClock },
  { id: 'employees', label: 'Employee Directory', to: 'employees/directory', icon: LuUsers },
  { id: 'employeeCalendar', label: 'Employee Calendar', to: 'employees/calendar', icon: LuClock },
  { id: 'subjects', label: 'Subjects', to: 'employees/subjects', icon: LuLayoutGrid },
  { id: 'payroll', label: 'Payroll', to: 'employees/payroll', icon: LuWallet, restrict: 'payroll' },
  { id: 'timeEntries', label: 'Time Entries', to: 'employees/time-entries', icon: LuClipboardList, restrict: 'timeEntries' },
  { id: 'sessionLog', label: 'Session Log', to: 'sessions/log', icon: LuNotebookPen },
  { id: 'progressReports', label: 'Progress Reports', to: 'sessions/progress-reports', icon: LuChartLine },
  { id: 'announcements', label: 'Announcements', to: 'announcements', icon: LuMegaphone },
  { id: 'auditLog', label: 'Audit Log', to: 'scheduling/audit-log', icon: LuHistory },
  { id: 'account', label: 'Account', to: 'account', icon: LuUserCog },
  { id: 'accessControl', label: 'Access Control', to: 'access-control', icon: LuShieldCheck, restrict: 'accessControl' },
  { id: 'settings', label: 'Settings', to: 'settings', icon: LuSettings },
  { id: 'kiosk', label: 'Kiosk', to: 'kiosk', icon: LuMonitorSmartphone, branchLevel: true },
]

const storageKey = (branchId: string, email: string) => `hyber:home-shortcuts:${branchId}:${email}`

function load(key: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null
  } catch {
    return null
  }
}

/** The person's shortcut IDs for this branch (saved in this browser), falling back to the branch default. */
export function useShortcutIds(branchId: string, email: string, defaults: string[]) {
  const key = storageKey(branchId, email)
  const [ids, setIds] = useState<string[]>(() => load(key) ?? defaults)
  const save = useCallback(
    (next: string[]) => {
      setIds(next)
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Storage can be unavailable (private mode); the change still applies to this visit.
      }
    },
    [key],
  )
  return [ids, save] as const
}
