/** Who signs in, and which pages to check. Extend per feature. */
export interface Scenario {
  name: string
  email: string
  paths: string[]
  /** Text that must appear on each page (by path). */
  expect?: Record<string, string[]>
}

export const E2E_BRANCH = 'demo-academy'

/** Today in the branch zone (the seed is relative to it). */
export const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

export const E2E_MEMBERS = [
  { email: 'owner@e2e.test', roles: ['admin'] as const, isOwner: true },
  { email: 'tutor@e2e.test', roles: ['tutor'] as const, staffId: 'demo-maya-thompson' },
  { email: 'multi@e2e.test', roles: ['admin', 'tutor'] as const, staffId: 'demo-daniel-kim' },
  { email: 'parent@e2e.test', roles: ['parent'] as const, studentIds: ['demo-student-ava-patel'] },
  { email: 'student@e2e.test', roles: ['student'] as const, studentId: 'demo-student-noah-nguyen' },
]

const b = `/${E2E_BRANCH}`

export const SCENARIOS: Scenario[] = [
  {
    name: 'super admin',
    email: 'goochoi913@gmail.com',
    paths: [
      '/app', '/platform', '/platform/admins', `/platform/branches/${E2E_BRANCH}`, `${b}/admin/home`, `${b}/admin/account`,
      `${b}/admin/access-control`, `${b}/admin/settings`, `${b}/admin/settings/audit-log`,
      `${b}/admin/employees/directory`, `${b}/admin/employees/directory/demo-maya-thompson`, `${b}/admin/employees/subjects`,
      `${b}/admin/employees/pay-rates`, `${b}/admin/students`, `${b}/admin/students/demo-student-ava-patel/info`,
      `${b}/admin/students/demo-student-ava-patel/school`, `${b}/admin/students/demo-student-ava-patel/conference`,
      `${b}/admin/students/demo-student-ava-patel/sessions`,
      `${b}/admin/employees/calendar?staff=demo-maya-thompson`,
      `${b}/admin/schedule`,
      `${b}/admin/schedule/week/${TODAY}`,
      `${b}/admin/schedule/month/${TODAY}`,
      `${b}/admin/scheduling/schedule/day/${TODAY}`,
      `${b}/admin/students/demo-student-ava-patel/calendar`,
      `${b}/admin/employees/calendar?staff=demo-maya-thompson&mode=scheduled`,
      `${b}/admin/employees/calendar?staff=demo-maya-thompson&mode=teaching`,
      `${b}/admin/employees/time-entries`,
      `${b}/admin/employees/payroll`,
      `${b}/kiosk`,
      `${b}/admin/sessions/log`,
      `${b}/admin/sessions/progress-reports`,
      `${b}/admin/announcements`,
      `${b}/admin/announcements/demo-a-welcome`,
      `${b}/admin/announcements/new`,
    ],
    expect: {
      '/app': ['Every tutoring center on Hyber', 'Demo Academy'],
      '/platform': ['Demo Academy'],
      [`${b}/admin/home`]: ['Super Admin', 'Upcoming Schedule & Events', 'Live Clock In / Out', 'Missing & Needs Attention', 'Conference Needed', 'New Students to Follow Up'],
      [`${b}/admin/announcements`]: ['Welcome to the new Demo Academy portal', 'Read: '],
      [`${b}/admin/announcements/demo-a-welcome`]: ['Looks great', 'Comments'],
      [`${b}/admin/announcements/new`]: ['Step 1 of 2'],
      [`${b}/admin/account`]: ['owner@e2e.test'],
      [`${b}/admin/employees/directory`]: ['Maya Thompson'],
      [`${b}/admin/employees/directory/demo-maya-thompson`]: ['Teaching rate', 'Internal notes'],
      [`${b}/admin/employees/subjects`]: ['Test Prep'],
      [`${b}/admin/employees/pay-rates`]: ['Daniel Kim'],
      [`${b}/admin/students`]: ['Ava Patel'],
      [`${b}/admin/students/demo-student-ava-patel/info`]: ['Parents / guardians'],
      [`${b}/admin/schedule/week/${TODAY}`]: ['EVENTS', 'All Teachers'],
      [`${b}/admin/schedule/month/${TODAY}`]: ['Payment Reminder'],
      [`${b}/admin/settings/audit-log`]: ['Audit Log', 'Everything'],
      [`${b}/admin/employees/payroll`]: ['TOTAL PAY', 'Maya Thompson'],
      [`${b}/kiosk`]: ['Tap anywhere to begin'],
    },
  },
  {
    name: 'owner admin',
    email: 'owner@e2e.test',
    paths: ['/app', `${b}/admin/account`, `${b}/admin/access-control`],
    expect: { '/app': ['Home'] },
  },
  {
    name: 'tutor',
    email: 'tutor@e2e.test',
    paths: ['/app', `${b}/admin/home`, `${b}/tutor/announcements/demo-a-welcome`, `${b}/tutor/students`, `${b}/tutor/my-info/profile`, `${b}/tutor/my-info/subjects`, `${b}/tutor/students/demo-student-ava-patel/info`, `${b}/tutor/availability`, `${b}/tutor/schedule`, `${b}/tutor/students/demo-student-ava-patel/calendar`, `${b}/tutor/payroll`],
    expect: {
      '/app': ['Announcements', 'Welcome to the new Demo Academy portal'],
      [`${b}/tutor/announcements/demo-a-welcome`]: ['Looks great', 'Post comment'],
      [`${b}/tutor/my-info/profile`]: ['Maya Thompson', 'Teaching rate'],
      [`${b}/tutor/my-info/subjects`]: ['Test Prep'],
      [`${b}/tutor/availability`]: ['THIS MONTH'],
    },
  },
  { name: 'admin + tutor', email: 'multi@e2e.test', paths: ['/app', `${b}/tutor`] },
  {
    name: 'parent',
    email: 'parent@e2e.test',
    paths: ['/app', `${b}/parent/progress-reports`, `${b}/progress-report/demo-r-ava-patel`],
    expect: {
      '/app': ['Upcoming sessions', 'Ava Patel'],
      [`${b}/parent/progress-reports`]: ['Progress report ·', 'Open'],
      [`${b}/progress-report/demo-r-ava-patel`]: ['Student Progress Report', 'Ava Patel'],
    },
  },
  {
    name: 'student',
    email: 'student@e2e.test',
    paths: ['/app', `${b}/student/calendar`, `${b}/student/profile`],
    expect: {
      '/app': ['NEXT SESSION', 'HOURS OF TUTORING', 'Coming up', 'Noah'],
      [`${b}/student/calendar`]: ['Click a session for details'],
      [`${b}/student/profile`]: ['Noah Nguyen', 'has on file for you'],
    },
  },
  { name: 'outsider', email: 'outsider@e2e.test', paths: ['/app'], expect: { '/app': ['No access yet'] } },
]
