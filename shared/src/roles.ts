/**
 * A member's role in a branch. Owner decision (round 2): **one role per person**.
 * Owners are admins who also manage other admins and Access Control.
 */
export type Role = 'owner' | 'admin' | 'tutor' | 'parent' | 'student'

/** The portal a role opens. Owners use the admin portal. */
export type Portal = 'admin' | 'tutor' | 'parent' | 'student'

/** Display and priority order. */
export const ROLES: readonly Role[] = ['owner', 'admin', 'tutor', 'parent', 'student']

export const PORTALS: readonly Portal[] = ['admin', 'tutor', 'parent', 'student']

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  tutor: 'Tutor',
  parent: 'Parent',
  student: 'Student',
}

export const PORTAL_LABELS: Record<Portal, string> = {
  admin: 'Admin Portal',
  tutor: 'Tutor Portal',
  parent: 'Parent Portal',
  student: 'Student Portal',
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function portalOf(role: Role): Portal {
  return role === 'owner' ? 'admin' : role
}

/** Owners and admins run the branch. */
export function isAdminRole(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** Employees: they have a staff record (clock, pay). Only tutors teach. */
export function isStaffRole(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'tutor'
}

/**
 * The single role for a member saved before one-role-per-person (`roles[]` plus
 * `isOwner`): the strongest one they held.
 */
export function roleFromLegacy(roles: readonly string[] | undefined, isOwner?: boolean): Role | null {
  if (isOwner) return 'owner'
  for (const r of ['admin', 'tutor', 'parent', 'student'] as const) if (roles?.includes(r)) return r
  return null
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
