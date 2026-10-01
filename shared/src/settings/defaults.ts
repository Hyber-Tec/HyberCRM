import type { Role } from '../roles'
import type { Weekday } from '../time'

/**
 * Every business rule that can differ between branches. A branch stores only
 * its overrides (`branches/{b}.settings`); everything reads
 * `resolveSettings(branch.settings)`. Defaults follow True Education's
 * behavior, adjusted by the owner's decisions (docs/hyber/DECISIONS.md).
 */

export interface DayHours {
  isOpen: boolean
  /** Minutes after local midnight. */
  openMin: number
  closeMin: number
}

export type WeekHours = Record<Weekday, DayHours>

export interface MinuteRange {
  startMin: number
  endMin: number
}

export type LeadTimeEnforcement = 'off' | 'warn' | 'block'
export type PayModel = 'teaching_admin_split' | 'single_rate'
export type PayPeriodType = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
export type HourRounding = 'te_business' | 'exact_quarter' | 'exact'
export type ScheduleView = 'day' | 'week' | 'month'
export type SessionStatus = 'pending' | 'confirmed' | 'present' | 'no_show' | 'canceled'

export interface BranchSettings {
  general: {
    weekStartsOn: Weekday
    timeFormat: '12h' | '24h'
  }
  schedule: {
    defaultWeek: WeekHours
    snapMinutes: number
    defaultSessionMinutes: number
    minSessionMinutes: number
    maxConcurrentStudentsPerTutor: number
    defaultView: ScheduleView
    /** Ordered staff IDs; staff not listed follow alphabetically. */
    tutorOrder: string[]
    pasteStatus: SessionStatus
    autoConfirm: { enabled: boolean; hoursBefore: number }
    noShow: { countsTowardStudentHours: boolean }
    duplicate: { overwriteTargetDays: boolean; checkAvailability: boolean }
    events: { titlePresets: string[]; defaultMinutes: number; monthDefaultStartMin: number }
    alerts: { conferenceNoteDays: number; firstSession: boolean }
    /** Bounds of the day-hours editors. */
    editorRange: MinuteRange
  }
  trash: { retentionDays: number }
  availability: {
    /** Tutors are reminded to enter availability at least this many days ahead. */
    leadTimeDays: number
    leadTimeEnforcement: LeadTimeEnforcement
    /** Tutors can't create, change or delete availability that starts within this many days. 0 = no lock. */
    lockWindowDays: number
    stepMinutes: number
    pickerRange: MinuteRange
    minBlockMinutes: number
    maxRangesPerDay: number
  }
  students: {
    autoStatus: { enabled: boolean; inactivityPauseDays: number; respectManual: boolean }
    conference: { cycleHours: number }
    hourRounding: HourRounding
    gradeOptions: string[]
  }
  sessionLogs: {
    sessionTypes: string[]
    homeworkStatuses: string[]
    ratingDimensions: string[]
    studentFlags: { key: string; label: string }[]
    /** Session statuses a tutor may write a log for. */
    allowForStatuses: SessionStatus[]
    tutorsSeeAllLogs: boolean
    allowEditAfterSubmit: boolean
    ai: { enabled: boolean }
    autosaveSeconds: number
  }
  progressReports: {
    ai: { enabled: boolean }
    risk: {
      atRiskHomeworkBelow: number
      atRiskFocusBelow: number
      needsAttentionHomeworkBelow: number
      needsAttentionMotivationBelow: number
    }
    maxTopics: number
  }
  payroll: {
    payModel: PayModel
    /** Sessions in these statuses count as teaching time (owner: only logged sessions). */
    teachingSessionStatuses: SessionStatus[]
    /** Staff holding the admin role are paid one rate for the whole shift. */
    adminStaffSingleRate: boolean
    hoursDecimals: number
    payPeriod: { type: PayPeriodType; anchorDate: string }
  }
  timeClock: {
    autoClockOut: { enabled: boolean; localTime: string }
    kiosk: { pinLength: number; successReturnSeconds: number }
  }
  timeEntries: {
    stepMinutes: number
  }
  home: {
    upcomingDays: number
    missingLogLookbackDays: number
    /** Minutes after a session starts before its missing log is flagged (TE: 0). */
    missingLogGraceMinutes: number
    clockLookbackDays: number
    /** Shortcut IDs shown until a person customizes their Home. */
    defaultShortcuts: string[]
  }
  announcements: { defaultCategories: string[] }
  notifications: {
    retentionDays: number
    /** Window in which new sessions and changes notify the tutor (future phone app). */
    sessionChangeWindowHours: number
  }
  audit: { logPendingSessions: boolean }
  signup: {
    enabled: boolean
    roles: Role[]
    welcomeMessage: string
  }
  integrations: {
    googleCalendar: { enabled: boolean; calendarId: string | null }
  }
}

const open = (openMin: number, closeMin: number): DayHours => ({ isOpen: true, openMin, closeMin })
const closed = (openMin = 840, closeMin = 1260): DayHours => ({ isOpen: false, openMin, closeMin })

export const DEFAULT_SETTINGS: BranchSettings = {
  general: {
    weekStartsOn: 'sunday',
    timeFormat: '12h',
  },
  schedule: {
    defaultWeek: {
      sunday: closed(),
      monday: open(840, 1260),
      tuesday: open(840, 1260),
      wednesday: open(840, 1260),
      thursday: open(840, 1260),
      friday: open(840, 1260),
      saturday: open(540, 1020),
    },
    snapMinutes: 5,
    defaultSessionMinutes: 110,
    minSessionMinutes: 5,
    maxConcurrentStudentsPerTutor: 3,
    defaultView: 'day',
    tutorOrder: [],
    pasteStatus: 'pending',
    autoConfirm: { enabled: true, hoursBefore: 24 },
    noShow: { countsTowardStudentHours: true },
    duplicate: { overwriteTargetDays: true, checkAvailability: false },
    events: {
      titlePresets: ['Consultation', 'Follow-up', 'Payment Reminder', 'Parent Meeting', 'Interview'],
      defaultMinutes: 60,
      monthDefaultStartMin: 840,
    },
    alerts: { conferenceNoteDays: 20, firstSession: true },
    editorRange: { startMin: 360, endMin: 1320 },
  },
  trash: { retentionDays: 14 },
  availability: {
    leadTimeDays: 14,
    leadTimeEnforcement: 'warn',
    lockWindowDays: 7,
    stepMinutes: 30,
    pickerRange: { startMin: 540, endMin: 1320 },
    minBlockMinutes: 30,
    maxRangesPerDay: 4,
  },
  students: {
    autoStatus: { enabled: true, inactivityPauseDays: 20, respectManual: true },
    conference: { cycleHours: 25 },
    hourRounding: 'te_business',
    gradeOptions: ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'College', 'Adult', 'Other'],
  },
  sessionLogs: {
    sessionTypes: ['School Help', 'SAT', 'PSAT', 'ACT', 'Skill Building', 'Homework Support', 'Other'],
    homeworkStatuses: ['Completed', 'Partially Done', 'Not Done', 'Not Assigned'],
    ratingDimensions: ['Effort', 'Motivation', 'Behavior', 'Focus', 'Confidence'],
    studentFlags: [
      { key: 'on_track', label: 'On Track' },
      { key: 'needs_attention', label: 'Needs Attention' },
      { key: 'at_risk', label: 'At Risk' },
    ],
    allowForStatuses: ['pending', 'confirmed', 'present'],
    tutorsSeeAllLogs: true,
    allowEditAfterSubmit: true,
    ai: { enabled: true },
    autosaveSeconds: 30,
  },
  progressReports: {
    ai: { enabled: true },
    risk: {
      atRiskHomeworkBelow: 50,
      atRiskFocusBelow: 3,
      needsAttentionHomeworkBelow: 70,
      needsAttentionMotivationBelow: 3.5,
    },
    maxTopics: 30,
  },
  payroll: {
    payModel: 'teaching_admin_split',
    teachingSessionStatuses: ['present'],
    adminStaffSingleRate: true,
    hoursDecimals: 2,
    payPeriod: { type: 'biweekly', anchorDate: '2026-01-04' },
  },
  timeClock: {
    autoClockOut: { enabled: true, localTime: '00:00' },
    kiosk: { pinLength: 4, successReturnSeconds: 3 },
  },
  timeEntries: { stepMinutes: 5 },
  home: {
    upcomingDays: 7,
    missingLogLookbackDays: 14,
    missingLogGraceMinutes: 0,
    clockLookbackDays: 7,
    defaultShortcuts: ['schedule', 'students', 'employeeCalendar', 'sessionLog', 'progressReports'],
  },
  announcements: { defaultCategories: ['General', 'Updates'] },
  notifications: { retentionDays: 14, sessionChangeWindowHours: 24 },
  audit: { logPendingSessions: true },
  signup: {
    enabled: true,
    roles: ['tutor', 'parent', 'student'],
    welcomeMessage: '',
  },
  integrations: {
    googleCalendar: { enabled: false, calendarId: null },
  },
}
