import { ROLE_LABELS } from '@shared/roles'
import { WEEKDAYS, WEEKDAY_LABELS } from '@shared/time'

/** Declarative description of the per-branch business settings (docs/hyber/BRANCH_SETTINGS.md). */

interface Base {
  path: string
  label: string
  help?: string
}

export type FieldDef =
  | (Base & { kind: 'number'; min?: number; max?: number; step?: number; suffix?: string })
  | (Base & { kind: 'boolean' })
  | (Base & { kind: 'select'; options: { value: string; label: string }[] })
  | (Base & { kind: 'multiselect'; options: { value: string; label: string }[] })
  | (Base & { kind: 'text'; multiline?: boolean })
  | (Base & { kind: 'list' })
  | (Base & { kind: 'hhmm' })
  | (Base & { kind: 'date' })
  | (Base & { kind: 'weekHours' })
  | (Base & { kind: 'range'; step?: number })

export interface SettingsSection {
  key: string
  title: string
  description: string
  fields: FieldDef[]
}

const SESSION_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'present', label: 'Present (log submitted)' },
  { value: 'no_show', label: 'No Show' },
  { value: 'canceled', label: 'Canceled' },
]

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: 'signup',
    title: 'Sign-up page',
    description: 'The public page where new tutors, parents and students request access with Google.',
    fields: [
      { kind: 'boolean', path: 'signup.enabled', label: 'Accept sign-up requests' },
      {
        kind: 'multiselect',
        path: 'signup.roles',
        label: 'Who can request access',
        options: (['tutor', 'parent', 'student'] as const).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
      },
      { kind: 'text', path: 'signup.welcomeMessage', label: 'Welcome message', multiline: true, help: 'Shown at the top of the sign-up page.' },
    ],
  },
  {
    key: 'schedule',
    title: 'Schedule',
    description: 'Opening hours, session defaults, capacity and automatic confirmation.',
    fields: [
      {
        kind: 'select',
        path: 'general.weekStartsOn',
        label: 'Weeks start on',
        options: WEEKDAYS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d] })),
        help: 'Closed days are hidden from the schedule.',
      },
      { kind: 'weekHours', path: 'schedule.defaultWeek', label: 'Default opening hours', help: 'Used for every date unless the day is edited on the schedule.' },
      { kind: 'number', path: 'schedule.defaultSessionMinutes', label: 'Default session length', min: 15, max: 480, step: 5, suffix: 'min' },
      { kind: 'number', path: 'schedule.snapMinutes', label: 'Time snap', min: 1, max: 60, step: 1, suffix: 'min', help: 'Clicks, drags and resizes snap to this step.' },
      { kind: 'number', path: 'schedule.maxConcurrentStudentsPerTutor', label: 'Students per tutor at once', min: 1, max: 10, step: 1 },
      {
        kind: 'select',
        path: 'schedule.defaultView',
        label: 'Default view',
        options: [
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ],
      },
      { kind: 'boolean', path: 'schedule.autoConfirm.enabled', label: 'Confirm pending sessions automatically' },
      { kind: 'number', path: 'schedule.autoConfirm.hoursBefore', label: 'Confirm this long before the start', min: 1, max: 168, suffix: 'hours' },
      { kind: 'boolean', path: 'schedule.noShow.countsTowardStudentHours', label: 'No Show sessions count toward the student’s hours' },
      { kind: 'select', path: 'schedule.pasteStatus', label: 'Status of pasted and duplicated sessions', options: SESSION_STATUS_OPTIONS.slice(0, 2) },
      { kind: 'list', path: 'schedule.events.titlePresets', label: 'Event title presets', help: 'One per line. Offered when adding an event.' },
      { kind: 'number', path: 'schedule.alerts.conferenceNoteDays', label: 'Bell: parent-conference note within', min: 0, max: 90, suffix: 'days' },
      { kind: 'boolean', path: 'schedule.alerts.firstSession', label: 'Bell: student’s first session' },
      { kind: 'number', path: 'trash.retentionDays', label: 'Keep deleted sessions in Trash for', min: 1, max: 365, suffix: 'days' },
    ],
  },
  {
    key: 'availability',
    title: 'Availability',
    description: 'How far ahead tutors must enter availability, and when it locks.',
    fields: [
      { kind: 'number', path: 'availability.leadTimeDays', label: 'Ask tutors to set availability at least', min: 0, max: 90, suffix: 'days ahead' },
      {
        kind: 'select',
        path: 'availability.leadTimeEnforcement',
        label: 'When a tutor is later than that',
        options: [
          { value: 'off', label: 'Do nothing' },
          { value: 'warn', label: 'Show a warning' },
          { value: 'block', label: 'Block the change' },
        ],
      },
      {
        kind: 'number',
        path: 'availability.lockWindowDays',
        label: 'Lock availability that starts within',
        min: 0,
        max: 60,
        suffix: 'days',
        help: 'Tutors can’t add, change or remove availability inside this window. Admins always can. 0 turns the lock off.',
      },
      { kind: 'number', path: 'availability.maxRangesPerDay', label: 'Time ranges per day', min: 1, max: 6 },
      { kind: 'number', path: 'availability.stepMinutes', label: 'Picker step', min: 5, max: 60, step: 5, suffix: 'min' },
      { kind: 'number', path: 'availability.minBlockMinutes', label: 'Shortest range', min: 5, max: 240, step: 5, suffix: 'min' },
      { kind: 'range', path: 'availability.pickerRange', label: 'Times offered in the picker', step: 30 },
    ],
  },
  {
    key: 'students',
    title: 'Students',
    description: 'Automatic status changes, parent conferences and billed hours.',
    fields: [
      { kind: 'boolean', path: 'students.autoStatus.enabled', label: 'Update student statuses automatically', help: 'Signed Up → Enrolled after the first session; Enrolled ↔ Paused by activity.' },
      { kind: 'number', path: 'students.autoStatus.inactivityPauseDays', label: 'Pause after no sessions for', min: 1, max: 180, suffix: 'days' },
      { kind: 'boolean', path: 'students.autoStatus.respectManual', label: 'Keep a status set by hand', help: 'A manual status stops the automatic changes until someone changes it again.' },
      { kind: 'number', path: 'students.conference.cycleHours', label: 'Parent conference every', min: 1, max: 200, suffix: 'hours' },
      {
        kind: 'select',
        path: 'students.hourRounding',
        label: 'Billed hours rounding',
        options: [
          { value: 'te_business', label: 'Business rounding (½-hour steps with grace)' },
          { value: 'exact_quarter', label: 'Nearest quarter hour' },
          { value: 'exact', label: 'Exact minutes' },
        ],
      },
      { kind: 'list', path: 'students.gradeOptions', label: 'Grades', help: 'One per line.' },
    ],
  },
  {
    key: 'sessionLogs',
    title: 'Session logs',
    description: 'What tutors fill in after each session.',
    fields: [
      { kind: 'list', path: 'sessionLogs.sessionTypes', label: 'Session types', help: 'One per line.' },
      { kind: 'list', path: 'sessionLogs.homeworkStatuses', label: 'Homework statuses', help: 'One per line.' },
      { kind: 'list', path: 'sessionLogs.ratingDimensions', label: 'Ratings (1–5)', help: 'One per line.' },
      { kind: 'multiselect', path: 'sessionLogs.allowForStatuses', label: 'Sessions that can be logged', options: SESSION_STATUS_OPTIONS.slice(0, 3) },
      { kind: 'boolean', path: 'sessionLogs.tutorsSeeAllLogs', label: 'Tutors can read other tutors’ logs' },
      { kind: 'boolean', path: 'sessionLogs.allowEditAfterSubmit', label: 'Tutors can edit a log after submitting' },
      { kind: 'boolean', path: 'sessionLogs.ai.enabled', label: 'AI summary, homework and next-session plan', help: 'Uses Google Gemini; the log (with the student’s name) is sent to Google.' },
      { kind: 'number', path: 'sessionLogs.autosaveSeconds', label: 'Autosave drafts every', min: 5, max: 300, suffix: 'sec' },
    ],
  },
  {
    key: 'payroll',
    title: 'Payroll & time clock',
    description: 'How clocked time is split and paid, pay periods and the automatic clock-out.',
    fields: [
      {
        kind: 'select',
        path: 'payroll.payModel',
        label: 'Pay model',
        options: [
          { value: 'teaching_admin_split', label: 'Teaching and admin rates (time in sessions = teaching)' },
          { value: 'single_rate', label: 'One rate for all clocked time' },
        ],
      },
      {
        kind: 'multiselect',
        path: 'payroll.teachingSessionStatuses',
        label: 'Sessions that count as teaching time',
        options: SESSION_STATUS_OPTIONS.slice(0, 4),
        help: 'By default only sessions whose log was submitted.',
      },
      { kind: 'boolean', path: 'payroll.adminStaffSingleRate', label: 'Pay admins one rate for the whole shift' },
      {
        kind: 'select',
        path: 'payroll.payPeriod.type',
        label: 'Pay period',
        options: [
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Every two weeks' },
          { value: 'semimonthly', label: 'Twice a month (1–15, 16–end)' },
          { value: 'monthly', label: 'Monthly' },
        ],
      },
      { kind: 'date', path: 'payroll.payPeriod.anchorDate', label: 'A pay period starts on', help: 'For weekly and two-week periods.' },
      { kind: 'boolean', path: 'timeClock.autoClockOut.enabled', label: 'Clock everyone out automatically' },
      { kind: 'hhmm', path: 'timeClock.autoClockOut.localTime', label: 'Automatic clock-out time' },
      { kind: 'number', path: 'timeClock.kiosk.pinLength', label: 'Kiosk PIN length', min: 4, max: 8 },
      { kind: 'number', path: 'timeEntries.stepMinutes', label: 'Time entry step', min: 1, max: 30, suffix: 'min' },
    ],
  },
  {
    key: 'notifications',
    title: 'Notifications',
    description: 'Push notifications arrive with the phone app; Hyber already records them.',
    fields: [
      { kind: 'number', path: 'notifications.sessionChangeWindowHours', label: 'Notify tutors of changes within', min: 1, max: 168, suffix: 'hours' },
      { kind: 'number', path: 'notifications.retentionDays', label: 'Keep notifications for', min: 1, max: 365, suffix: 'days' },
    ],
  },
]
