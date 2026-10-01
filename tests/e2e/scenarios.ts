/** Who signs in, and which pages to check. Extend per feature. */
export interface Scenario {
  name: string
  email: string
  paths: string[]
  /** Text that must appear on each page (by path). */
  expect?: Record<string, string[]>
}

export const E2E_BRANCH = 'demo-academy'

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
    paths: ['/app', '/platform', '/platform/admins', `/platform/branches/${E2E_BRANCH}`, `${b}/admin/home`, `${b}/admin/account`, `${b}/admin/access-control`, `${b}/admin/settings`, `${b}/admin/scheduling/audit-log`],
    expect: {
      '/platform': ['Demo Academy'],
      [`${b}/admin/home`]: ['Super Admin'],
      [`${b}/admin/account`]: ['owner@e2e.test'],
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
    paths: ['/app', `${b}/admin/home`],
    expect: { '/app': ['Announcements'] },
  },
  { name: 'admin + tutor', email: 'multi@e2e.test', paths: ['/app', `${b}/tutor`] },
  { name: 'parent', email: 'parent@e2e.test', paths: ['/app'], expect: { '/app': ['Upcoming Sessions'] } },
  { name: 'student', email: 'student@e2e.test', paths: ['/app'], expect: { '/app': ['My Info'] } },
  { name: 'outsider', email: 'outsider@e2e.test', paths: ['/app'], expect: { '/app': ['No access yet'] } },
]
