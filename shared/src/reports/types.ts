import type { DateKey } from '../time'

/** The computed progress status (never set by AI). Keys are True Education's. */
export type ProgressLevel = 'on_track' | 'needs_attention' | 'at_risk'
export type Change = 'up' | 'down' | 'steady'
export type HomeworkKind = 'completed' | 'partial' | 'not_done' | 'not_assigned'

export type ReportPreset = 'since_last' | 'last_month' | 'this_month' | 'last_30' | 'last_90' | 'since_conference' | 'custom'

export interface ReportPeriod {
  from: DateKey
  to: DateKey
  preset: ReportPreset
  /** "September 2026" for a whole month, else "Sep 2 – Oct 15, 2026". */
  label: string
}

/** One scheduled session of the period, for the charts (compact). */
export interface SessionPoint {
  dateKey: DateKey
  startMin: number
  status: 'attended' | 'missed' | 'canceled' | 'unlogged'
  subject: string
  /** Billed hours of an attended session. */
  hours: number
  attempted: number | null
  accuracy: number | null
  homework: HomeworkKind | null
  /** Average of the session's ratings (1–5). */
  rating: number | null
}

export interface EngagementFact {
  dimension: string
  key: string
  average: number | null
  firstHalf: number | null
  secondHalf: number | null
  change: Change | null
}

export interface SkillArea {
  /** "SAT Math › Algebra", or the subject for free-text topics. */
  area: string
  subject: string
  skills: { name: string; sessions: number }[]
}

export interface ReportFacts {
  attendance: {
    attended: number
    missed: number
    canceled: number
    /** Past sessions with no log and no attendance mark (staff warning only). */
    unlogged: number
    /** Attended + missed. */
    scheduled: number
    percent: number | null
  }
  hours: {
    total: number
    bySubject: { subject: string; hours: number; color: string }[]
    /** The student's lifetime tutoring hours when the report was made. */
    toDate: number
    averageSessionMinutes: number | null
  }
  consistency: { sessionsPerWeek: number | null; weeksWithSessions: number; weeksInPeriod: number }
  homework: {
    assigned: number
    completed: number
    partial: number
    notDone: number
    notAssigned: number
    percent: number | null
    firstHalfPercent: number | null
    secondHalfPercent: number | null
    change: Change | null
  }
  engagement: EngagementFact[]
  practice: {
    attempted: number
    correct: number
    percent: number | null
    earlyPercent: number | null
    latePercent: number | null
    change: Change | null
    sessions: number
  } | null
  skills: SkillArea[]
  resources: { label: string; url: string; sessions: number }[]
  tutors: string[]
  subjects: string[]
  next: {
    session: { dateKey: DateKey; startMin: number; subject: string; tutorName: string } | null
    bookedNext4Weeks: number
  }
  conference: { enabled: boolean; hoursUntil: number | null }
  previous: {
    reportId: string
    periodLabel: string
    hours: number
    attendancePercent: number | null
    homeworkPercent: number | null
    accuracyPercent: number | null
    goals: string[]
  } | null
  /** Differences from the previous report (null without one). */
  deltas: { hours: number | null; attendance: number | null; homework: number | null; accuracy: number | null }
}

export interface ProgressDriver {
  code: string
  label: string
  value: number
  threshold: number
}

export interface ReportProgress {
  /** null: fewer than two attended sessions. */
  level: ProgressLevel | null
  drivers: ProgressDriver[]
  rule: 'share' | 'any'
}

export interface ReportGoal {
  goal: string
  measure: string
}

export interface PreviousGoal {
  goal: string
  status: 'met' | 'progress' | 'not_yet'
  note: string
}

/** The written parts of a report (AI draft or template text, then staff-edited). */
export interface ReportNarrative {
  overview: string
  academicProgress: string
  practice: string
  engagement: string
  homework: string
  strengths: string[]
  focusAreas: string[]
  goals: ReportGoal[]
  previousGoals: PreviousGoal[]
  homeSupport: string[]
  tutorNote: string
}

export type NarrativeKey = keyof ReportNarrative

export const NARRATIVE_KEYS: NarrativeKey[] = [
  'overview',
  'academicProgress',
  'practice',
  'engagement',
  'homework',
  'strengths',
  'focusAreas',
  'goals',
  'previousGoals',
  'homeSupport',
  'tutorNote',
]

/** Staff-facing names of the written sections (editor, history). */
export const NARRATIVE_LABELS: Record<NarrativeKey, string> = {
  overview: 'Overview',
  academicProgress: 'What we worked on',
  practice: 'Practice results',
  engagement: 'Learning habits',
  homework: 'Homework',
  strengths: 'Strengths',
  focusAreas: 'Focus areas',
  goals: 'Goals',
  previousGoals: 'Last period’s goals',
  homeSupport: 'How you can help at home',
  tutorNote: 'A note from your tutor',
}

export interface SectionMeta {
  source: 'ai' | 'template' | 'staff'
  editedBy?: string
  editedAt?: unknown
  /** A check found something staff should look at (e.g. a number not in the facts). */
  needsReview?: boolean
  reasons?: string[]
}

export interface ReportOptions {
  showStatus: boolean
  showPractice: boolean
  showResources: boolean
  showConference: boolean
}

export interface ReportPerson {
  email: string
  name: string
  role?: string
  staffId?: string | null
}

/** `branches/{b}/progressReports/{id}` (schema version 2). */
export interface ProgressReportDoc {
  schemaVersion: 2
  status: 'draft' | 'shared'
  /** Mirrors `status == 'shared'` (family queries and rules). */
  sharedWithParents: boolean
  studentId: string
  studentName: string
  student: { name: string; firstName: string; lastName: string; grade: string; school: string }
  period: ReportPeriod
  /** The period again, for simple queries and older readers. */
  startDate: DateKey
  endDate: DateKey
  sessionCount: number
  generatedAt: unknown
  generatedBy: ReportPerson
  updatedAt: unknown
  updatedBy: string
  sharedAt: unknown | null
  sharedBy: ReportPerson | null
  /** The family's first view of the shared report. */
  firstViewedAt: unknown | null
  notify: { status: 'sent' | 'not_configured' | 'failed' | 'skipped'; at: unknown; recipients: string[]; error: string | null } | null
  source: { sessionIds: string[]; logCount: number; fingerprint: string }
  snapshot: {
    ratingDimensions: string[]
    accentColor: string | null
    branchName: string
    logoUrl: string | null
    contact: { phone: string; email: string; website: string; address: string }
    aiDisclosure: boolean
  }
  facts: ReportFacts
  series: { sessions: SessionPoint[] }
  progress: ReportProgress
  narrative: ReportNarrative
  /** The last AI or template version, for "Restore draft". */
  narrativeOriginal: ReportNarrative
  narrativeMeta: { source: 'ai' | 'template'; generatedAt: unknown; sections: Partial<Record<NarrativeKey, SectionMeta>> }
  options: ReportOptions
  customName: string | null
}
