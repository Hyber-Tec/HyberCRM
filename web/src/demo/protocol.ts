/**
 * What the landing page and the demo window say to each other (postMessage,
 * same origin), and the demo's page addresses. No app code here: the landing
 * page imports it.
 */

/** A reserved branch ID (no real center can have it). */
export const DEMO_BRANCH_ID = 'hyber'

/** `source` of messages from the demo (`ready`, `route`) and from the landing page (`navigate`). */
export const DEMO_MESSAGE = 'hyber-demo'
export const LANDING_MESSAGE = 'hyber-landing'

/** Short names for demo pages (`/demo?page=schedule`). */
export const DEMO_PAGES = {
  home: 'admin/home',
  announcements: 'admin/announcements',
  schedule: 'admin/schedule',
  students: 'admin/students',
  student: 'admin/students/demo-student-ava-patel',
  employees: 'admin/employees/directory',
  calendar: 'admin/employees/calendar',
  subjects: 'admin/employees/subjects',
  'pay-rates': 'admin/employees/pay-rates',
  payroll: 'admin/employees/payroll',
  'time-entries': 'admin/employees/time-entries',
  'session-log': 'admin/sessions/log',
  'progress-reports': 'admin/sessions/progress-reports',
  report: 'progress-report/demo-r-ava-patel',
  kiosk: 'kiosk',
  settings: 'admin/settings',
} as const

export type DemoPage = keyof typeof DEMO_PAGES

/** Whose eyes the demo opens with (`/demo?as=tutor`): the owner by default. */
export const DEMO_ROLES = ['owner', 'tutor', 'parent', 'student'] as const
export type DemoRole = (typeof DEMO_ROLES)[number]
export const isDemoRole = (v: unknown): v is DemoRole => DEMO_ROLES.includes(v as DemoRole)

/** Each role's first page. */
export const ROLE_HOME: Record<DemoRole, string> = {
  owner: `/${DEMO_BRANCH_ID}/admin/home`,
  tutor: `/${DEMO_BRANCH_ID}/tutor/schedule`,
  parent: `/${DEMO_BRANCH_ID}/parent/home`,
  student: `/${DEMO_BRANCH_ID}/student/home`,
}

export const isDemoPath = (path: unknown): path is string => typeof path === 'string' && path.startsWith(`/${DEMO_BRANCH_ID}/`)

/** A page name or a full demo path → the path to open (null: the default). */
export function demoPath(page: string | null | undefined): string | null {
  if (!page) return null
  if (isDemoPath(page)) return page
  const known = DEMO_PAGES[page as DemoPage]
  return known ? `/${DEMO_BRANCH_ID}/${known}` : null
}
