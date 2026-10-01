export type Role = 'admin' | 'tutor' | 'parent' | 'student'

/** Display and priority order. The first role a member holds is their default portal. */
export const ROLES: readonly Role[] = ['admin', 'tutor', 'parent', 'student']

export const STAFF_ROLES: readonly Role[] = ['admin', 'tutor']

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  tutor: 'Tutor',
  parent: 'Parent',
  student: 'Student',
}

export const PORTAL_LABELS: Record<Role, string> = {
  admin: 'Admin Portal',
  tutor: 'Tutor Portal',
  parent: 'Parent Portal',
  student: 'Student Portal',
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function sortRoles(roles: readonly Role[]): Role[] {
  return ROLES.filter((r) => roles.includes(r))
}

export function primaryPortal(roles: readonly Role[]): Role | null {
  return sortRoles(roles)[0] ?? null
}

export function isStaffRole(role: Role): boolean {
  return role === 'admin' || role === 'tutor'
}

export type MemberStatus = 'active' | 'disabled'

/** Admin pages an owner can block for a specific admin (TE "blockedPages"). Enforced in the rules too. */
export type RestrictablePage = 'payRates' | 'payroll' | 'timeEntries' | 'accessControl'

export const RESTRICTABLE_PAGES: readonly { key: RestrictablePage; label: string; description: string }[] = [
  { key: 'payRates', label: 'Pay Rates', description: 'See and change employee pay rates' },
  { key: 'payroll', label: 'Payroll', description: 'See payroll reports and lock pay periods' },
  { key: 'timeEntries', label: 'Time Entries', description: 'Add or change worked times' },
  { key: 'accessControl', label: 'Access Control', description: 'Change other admins’ restrictions' },
]
