import type { Role } from '../../shared/src/roles'

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
const FOUR_WEEKS_AGO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() - 28 * 86_400_000))
const PAYROLL_REPORT = `/${E2E_BRANCH}/admin/employees/payroll?employee=demo-maya-thompson&from=${FOUR_WEEKS_AGO}&to=${TODAY}`

export const E2E_MEMBERS: { email: string; role: Role; staffId?: string; studentId?: string; studentIds?: string[] }[] = [
  { email: 'owner@e2e.test', role: 'owner' },
  { email: 'admin@e2e.test', role: 'admin', staffId: 'demo-grace-liu' },
  { email: 'tutor@e2e.test', role: 'tutor', staffId: 'demo-maya-thompson' },
  { email: 'parent@e2e.test', role: 'parent', studentIds: ['demo-student-ava-patel'] },
  { email: 'student@e2e.test', role: 'student', studentId: 'demo-student-noah-nguyen' },
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
      PAYROLL_REPORT,
      `${b}/admin/settings/schedule`,
      `${b}/admin/settings/signup`,
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
      [`/platform/branches/${E2E_BRANCH}`]: ['Business rules', 'Teaching + Admin', 'from the start', 'Students per tutor at once', 'New owners get an email'],
      [`${b}/admin/settings`]: ['Business rules', 'Chosen by HyberTec', 'Every 25 tutoring hours'],
      [`${b}/admin/home`]: ['Admin Portal', 'Today’s sessions', 'Needs you', 'In the building', 'parent conferences due'],
      [`${b}/admin/announcements`]: ['Welcome to the new Demo Academy portal', 'Read: '],
      [`${b}/admin/announcements/demo-a-welcome`]: ['Looks great', 'Comments'],
      [`${b}/admin/announcements/new`]: ['Step 1 of 2'],
      [`${b}/admin/account`]: ['owner@e2e.test', 'Sign-up page', 'Status'],
      [`${b}/admin/employees/directory`]: ['Maya Thompson'],
      [`${b}/admin/employees/directory/demo-maya-thompson`]: ['Teaching rate', 'Internal notes'],
      [`${b}/admin/employees/subjects`]: ['Test Prep'],
      [`${b}/admin/employees/pay-rates`]: ['Daniel Kim'],
      [`${b}/admin/students`]: ['Ava Patel'],
      [`${b}/admin/students/demo-student-ava-patel/info`]: ['Parents / guardians'],
      [`${b}/admin/schedule/week/${TODAY}`]: ['EVENTS', 'All Teachers'],
      [`${b}/admin/schedule/month/${TODAY}`]: ['Payment Reminder'],
      [`${b}/admin/settings/audit-log`]: ['Audit Log', 'Everything'],
      [`${b}/admin/employees/payroll`]: ['Recent Payroll Records', '25 per page', 'Teaching'],
      [PAYROLL_REPORT]: ['Generated Payroll Records', 'TOTAL PAY', 'Teaching rate'],
      [`${b}/admin/settings/schedule`]: ['Opening hours by date', 'Apply to a range'],
      [`${b}/admin/settings/signup`]: ['Your sign-up page', 'Download QR code'],
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
      [`${b}/tutor/availability`]: ['Copy last week', 'closed days take no availability'],
    },
  },
  {
    name: 'regular admin',
    email: 'admin@e2e.test',
    // One role per person: an admin has no tutor portal.
    paths: ['/app', `${b}/tutor`, `${b}/admin/access-control`],
    expect: { '/app': ['Today’s sessions'], [`${b}/tutor`]: ['Today’s sessions'], [`${b}/admin/access-control`]: ['View only'] },
  },
  {
    name: 'parent',
    email: 'parent@e2e.test',
    paths: ['/app', `${b}/parent/progress-reports`, `${b}/progress-report/demo-r-ava-patel`],
    expect: {
      '/app': ['Upcoming sessions', 'Ava Patel'],
      [`${b}/parent/progress-reports`]: ['progress report', 'Shared', 'Open'],
      [`${b}/progress-report/demo-r-ava-patel`]: ['Ava Patel', 'at a glance', 'Strengths', 'Attendance and time', 'What we worked on', 'Learning habits', 'Goals for', 'Download PDF'],
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
  {
    name: 'outsider',
    email: 'outsider@e2e.test',
    paths: ['/app', `${b}/admin/home`],
    expect: { '/app': ['No access yet', 'Got an invitation email?'], [`${b}/admin/home`]: ['No access to Demo Academy', 'Request access'] },
  },
]
