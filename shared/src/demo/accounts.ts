import type { Role } from '../roles'

/**
 * Demo Academy's sign-ins (owner, 2026-10-04): the sample center's own people, signing in with an email and a
 * password (scripts/demo-accounts.ts creates them; the password is kept out of the repository). The addresses are on
 * HyberTec's domain, which receives no mail, so nothing is ever emailed to them (`isReservedEmail`).
 */
export const DEMO_EMAIL_DOMAIN = 'demo.hybercrm.com'

export interface DemoAccount {
  email: string
  role: Extract<Role, 'tutor' | 'parent' | 'student'>
  displayName: string
  staffId?: string
  studentId?: string
  studentIds?: string[]
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: `tutor@${DEMO_EMAIL_DOMAIN}`, role: 'tutor', displayName: 'Maya Thompson', staffId: 'demo-maya-thompson' },
  { email: `parent@${DEMO_EMAIL_DOMAIN}`, role: 'parent', displayName: 'Ava Patel’s parent', studentIds: ['demo-student-ava-patel'] },
  { email: `student@${DEMO_EMAIL_DOMAIN}`, role: 'student', displayName: 'Ava Patel', studentId: 'demo-student-ava-patel' },
]

/** The tutor the live demo makes schedule changes for, so pushes reach the phone being tested. */
export const DEMO_TEST_TUTOR_STAFF_ID = 'demo-maya-thompson'
