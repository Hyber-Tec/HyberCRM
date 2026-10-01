import { DEFAULT_SETTINGS } from './settings/defaults'
import type { Branch, BranchPublicProfile, Member } from './types'

/** Plain data for a new branch. Timestamps are filled in by the writer. */
export function newBranchData(input: {
  name: string
  timezone: string
  createdBy: string
  shortName?: string
}): Omit<Branch, 'createdAt' | 'updatedAt'> {
  return {
    name: input.name.trim(),
    shortName: (input.shortName ?? input.name).trim(),
    status: 'active',
    timezone: input.timezone,
    locale: 'en-US',
    currency: 'USD',
    branding: { logoUrl: null, logoPath: null, accentColor: null, sidebarTitle: null },
    contact: { email: '', phone: '', address: '', website: '' },
    settings: {},
    extensions: [],
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  }
}

export function publicProfileFor(branch: Pick<Branch, 'name' | 'shortName' | 'status' | 'timezone' | 'branding' | 'settings'>): BranchPublicProfile {
  const signup = { ...DEFAULT_SETTINGS.signup, ...(branch.settings?.signup ?? {}) }
  return {
    name: branch.name,
    shortName: branch.shortName,
    status: branch.status,
    logoUrl: branch.branding?.logoUrl ?? null,
    accentColor: branch.branding?.accentColor ?? null,
    timezone: branch.timezone,
    signupEnabled: signup.enabled !== false,
    signupRoles: (signup.roles ?? DEFAULT_SETTINGS.signup.roles).filter(Boolean) as BranchPublicProfile['signupRoles'],
    signupMessage: signup.welcomeMessage ?? '',
  }
}

export function newMemberData(input: {
  email: string
  displayName?: string
  role: Member['role']
  createdBy: string
  staffId?: string | null
  studentId?: string | null
  studentIds?: string[]
}): Omit<Member, 'createdAt' | 'updatedAt'> {
  return {
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName?.trim() ?? '',
    role: input.role,
    status: 'active',
    staffId: input.staffId ?? null,
    studentId: input.studentId ?? null,
    studentIds: input.studentIds ?? [],
    restrictions: [],
    uid: null,
    photoURL: null,
    firstLoginAt: null,
    lastLoginAt: null,
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  }
}
