/** Firestore collection names. All branch data lives under `branches/{branchId}`. */
export const ROOT = {
  platformAdmins: 'platformAdmins',
  branches: 'branches',
  users: 'users',
  /** "Talk to us" requests from the landing page (Super Admin only; DECISIONS §3). */
  inquiries: 'inquiries',
} as const

export const COL = {
  public: 'public',
  members: 'members',
  signupRequests: 'signupRequests',
  staff: 'staff',
  students: 'students',
  subjectCategories: 'subjectCategories',
  subjects: 'subjects',
  sessions: 'sessions',
  availability: 'availability',
  dayConfigs: 'dayConfigs',
  events: 'events',
  auditLog: 'auditLog',
  clockShifts: 'clockShifts',
  openShifts: 'openShifts',
  clockEvents: 'clockEvents',
  kioskPins: 'kioskPins',
  payroll: 'payroll',
  payPeriods: 'payPeriods',
  sessionLogs: 'sessionLogs',
  progressReports: 'progressReports',
  announcements: 'announcements',
  conferenceCategories: 'conferenceCategories',
  notifications: 'notifications',
} as const

export type BranchCollection = (typeof COL)[keyof typeof COL]

/** Sub-documents with fixed IDs. */
export const DOC = {
  publicProfile: 'profile', // branches/{b}/public/profile
  privateProfile: 'profile', // students/{id}/private/profile
  compensation: 'compensation', // staff/{id}/private/compensation
  staffNotes: 'notes', // staff/{id}/private/notes
  payrollState: 'state', // branches/{b}/payroll/state
} as const

export function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

export function branchDocPath(branchId: string): string {
  return `${ROOT.branches}/${branchId}`
}

export function branchColPath(branchId: string, col: BranchCollection): string {
  return `${ROOT.branches}/${branchId}/${col}`
}

export function availabilityDocId(staffId: string, dateKey: string): string {
  return `${staffId}_${dateKey}`
}
