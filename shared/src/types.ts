import type { MemberStatus, RestrictablePage, Role } from './roles'
import type { SessionStatus } from './settings/defaults'
import type { SettingsOverrides } from './settings/resolve'
import type { DateKey, Weekday } from './time'

/** Structural Firestore Timestamp (shared code doesn't depend on the Firebase SDK). */
export interface TimestampLike {
  seconds: number
  nanoseconds: number
  toDate(): Date
  toMillis(): number
}

/** A Firestore document with its ID. */
export type WithId<T> = T & { id: string }

export interface AuditStamp {
  createdAt?: TimestampLike | null
  createdBy?: string | null
  updatedAt?: TimestampLike | null
  updatedBy?: string | null
}

// ------------------------------------------------------------------ platform

export interface PlatformAdmin {
  email: string
  name?: string
  addedAt?: TimestampLike | null
  addedBy?: string | null
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  photoURL: string | null
  lastBranchId?: string | null
  lastPortal?: Role | null
  lastLoginAt?: TimestampLike | null
}

export type BranchStatus = 'active' | 'suspended' | 'archived'

export interface BranchBranding {
  logoUrl: string | null
  logoPath: string | null
  /** Hex color used for the brand mark and a few accents; the UI theme stays neutral. */
  accentColor: string | null
  sidebarTitle: string | null
}

export interface BranchContact {
  email: string
  phone: string
  address: string
  website: string
}

export interface Branch extends AuditStamp {
  name: string
  shortName: string
  status: BranchStatus
  timezone: string
  locale: string
  currency: string
  branding: BranchBranding
  contact: BranchContact
  settings: SettingsOverrides
  extensions: string[]
}

/** `branches/{b}/public/profile`: world-readable, used by the sign-up page and pickers. */
export interface BranchPublicProfile {
  name: string
  shortName: string
  status: BranchStatus
  logoUrl: string | null
  accentColor: string | null
  timezone: string
  signupEnabled: boolean
  signupRoles: Role[]
  signupMessage: string
}

// ------------------------------------------------------------- people/access

/** `branches/{b}/members/{emailLower}`: who may sign in to the branch, and as what. */
export interface Member extends AuditStamp {
  email: string
  displayName: string
  roles: Role[]
  status: MemberStatus
  staffId: string | null
  studentId: string | null
  studentIds: string[]
  isOwner: boolean
  restrictions: RestrictablePage[]
  uid: string | null
  photoURL: string | null
  firstLoginAt: TimestampLike | null
  lastLoginAt: TimestampLike | null
}

export type SignupRequestStatus = 'pending' | 'approved' | 'rejected'

/** `branches/{b}/signupRequests/{emailLower}`: written by the person on the branch sign-up page. */
export interface SignupRequest {
  email: string
  uid: string
  photoURL: string | null
  requestedRole: Role
  firstName: string
  lastName: string
  phone: string
  message: string
  /** Parents: the student(s) they're signing up for. */
  studentNames: string
  status: SignupRequestStatus
  createdAt: TimestampLike | null
  updatedAt: TimestampLike | null
  decidedAt?: TimestampLike | null
  decidedBy?: string | null
  decisionNote?: string | null
}

export type StaffRole = Extract<Role, 'admin' | 'tutor'>
export type StaffStatus = 'active' | 'on_hold' | 'finished'

export interface NotificationPrefs {
  announcements: boolean
  sessionCreated: boolean
  sessionChanged: boolean
  sessionCanceled: boolean
}

/** `branches/{b}/staff/{staffId}`: employee record. */
export interface Staff extends AuditStamp {
  firstName: string
  lastName: string
  name: string
  nameLower: string
  email: string
  phone: string
  roles: StaffRole[]
  status: StaffStatus
  subjectIds: string[]
  /** Calendar color for the schedule and Employee Calendar. */
  color: string
  startDate: DateKey | null
  endDate: DateKey | null
  dob: DateKey | null
  address: string
  hasKioskPin: boolean
  notificationPrefs: NotificationPrefs
}

/** `staff/{id}/private/notes`: admin-only. */
export interface StaffNotes {
  adminNote: string
  updatedAt?: TimestampLike | null
  updatedBy?: string | null
}

/** `staff/{id}/private/compensation`. */
export interface Compensation {
  /** Hourly rates by pay type key. */
  rates: { teaching: number; admin: number }
  /** Overrides the branch default for this person. */
  payModel: 'branch_default' | 'teaching_admin_split' | 'single_rate'
  history: { effectiveFrom: DateKey; rates: { teaching: number; admin: number }; setAt: string; setBy: string }[]
  updatedAt?: TimestampLike | null
  updatedBy?: string | null
}

export type StudentStatus = 'signed_up' | 'enrolled' | 'paused' | 'no_answer' | 'not_interested' | 'finished'

/** `branches/{b}/students/{id}`: the basic record every staff member may read. */
export interface Student extends AuditStamp {
  firstName: string
  lastName: string
  name: string
  nameLower: string
  grade: string
  school: string
  status: StudentStatus
  statusSource: 'auto' | 'manual'
  subjectIds: string[]
  /** Visible to tutors: learning needs, focus areas. */
  learningNote: string
  signUpDate: DateKey | null
  firstSessionDate: DateKey | null
  lastSessionDate: DateKey | null
  nextSessionDate: DateKey | null
  totalSessionHours: number
  conference: StudentConference
  schoolRecord: StudentSchool
  /** Set when an admin first opens a new student (Home "new students to follow up"). */
  followUpReviewedAt: TimestampLike | null
}

export interface StudentConference {
  /** Student hours when the last conference was held or the cycle was restarted. */
  baselineHours: number
  /** Date of the latest conference note. */
  lastNoteDate: DateKey | null
  lastResetAt: TimestampLike | null
}

export interface StudentSchool {
  /** Grade column ("1"…"12") → course names, one per row. */
  courses: Record<string, string[]>
  /** Dated report-card snapshots: course name → grade. */
  gradeSnapshots: { date: DateKey; grades: Record<string, string> }[]
  plan: string
}

/** `students/{id}/conferenceNotes/{noteId}`: admin-only. */
export interface ConferenceNote extends AuditStamp {
  date: DateKey
  text: string
  categoryId: string | null
  authorName: string
}

export interface ConferenceCategory {
  name: string
  color: string
}

export interface ParentContact {
  name: string
  email: string
  phone: string
  relation: string
}

/** `students/{id}/private/profile`: admin-only contact and sensitive data. */
export interface StudentPrivateProfile {
  email: string
  phone: string
  dob: DateKey | null
  address: string
  parents: ParentContact[]
  schoolLogin: string
  adminNote: string
  customFields: Record<string, string>
}

// ------------------------------------------------------------------ catalogs

export interface SubjectCategory {
  name: string
  order: number
}

export interface Subject extends AuditStamp {
  name: string
  categoryId: string
  order: number
}

// --------------------------------------------------------------- scheduling

export type LogStatus = 'none' | 'draft' | 'submitted'

export interface Session extends AuditStamp {
  tutorId: string
  tutorName: string
  studentId: string
  studentName: string
  studentGrade: string
  subjectId: string | null
  subject: string
  note: string
  status: SessionStatus
  dateKey: DateKey
  weekday: Weekday
  startMin: number
  endMin: number
  startAt: TimestampLike
  endAt: TimestampLike
  /** Start of the next local day; rules refuse client edits once it has passed. */
  dayEndAt: TimestampLike
  visualOrder: number
  logStatus: LogStatus
  logSubmittedAt: TimestampLike | null
  noShowAppliedHours: number | null
  confirmedAt: TimestampLike | null
  confirmedBy: string | null
  source: 'manual' | 'paste' | 'duplicate_week' | 'master' | 'student_calendar' | 'seed'
  isDeleted: boolean
  deletedAt: TimestampLike | null
  deletedBy: string | null
}

export interface AvailabilityRange {
  startMin: number
  endMin: number
}

/** `availability/{staffId}_{dateKey}`. */
export interface Availability extends AuditStamp {
  staffId: string
  dateKey: DateKey
  weekday: Weekday
  ranges: AvailabilityRange[]
  /** Explicitly not available that day. */
  unavailable: boolean
  /** Hide the row on the schedule when there is nothing on it. */
  hidden: boolean
  /** First instant of the day; rules use it for the tutor lock window. */
  dayStartAt: TimestampLike
  updatedVia: 'tutor' | 'admin'
}

export interface DayConfig extends AuditStamp {
  dateKey: DateKey
  isOpen: boolean
  openMin: number
  closeMin: number
}

// -------------------------------------------------------------------- audit

export type AuditCategory = 'schedule' | 'event' | 'availability' | 'people' | 'pay' | 'sessions' | 'settings' | 'access'

export interface AuditChange {
  field: string
  label: string
  from: string | number | boolean | null
  to: string | number | boolean | null
}

/** `branches/{b}/auditLog/{id}`: append-only. */
export interface AuditEntry {
  at: TimestampLike | null
  actorUid: string
  actorEmail: string
  actorName: string
  actorRole: Role | 'super_admin' | 'system'
  action: string
  category: AuditCategory
  entityType: string
  entityId: string
  summary: string
  context: string
  dateKey: DateKey | null
  studentId: string | null
  studentName: string | null
  tutorId: string | null
  tutorName: string | null
  changes: AuditChange[]
  via: 'web' | 'function' | 'kiosk'
}
