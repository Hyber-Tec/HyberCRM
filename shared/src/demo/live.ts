import { dayHours, effectiveRanges, fitRangesToDay, rangesContain } from '../availability'
import { stripHtmlToText } from '../comms'
import { COL, ROOT, availabilityDocId } from '../paths'
import { billedHours } from '../schedule/hours'
import { fitsCapacity } from '../schedule/lanes'
import { SESSION_STATUS_LABELS } from '../schedule/status'
import type { BusinessRules } from '../settings/businessRules'
import type { BranchSettings, DayHours, SessionStatus } from '../settings/defaults'
import { localLogAi } from '../sessions/logs'
import { cleanLogContent, logSubmitWrites } from '../sessions/submit'
import {
  type DateKey,
  type Weekday,
  addDays,
  dateKeyOf,
  diffDays,
  formatDateKey,
  formatMinutes,
  formatTimeRange,
  minutesOf,
  toInstant,
  todayKey,
  weekdayOf,
} from '../time'
import type { AvailabilityRange, DayConfig } from '../types'
import { DEMO_TEST_TUTOR_STAFF_ID } from './accounts'
import { demoLogContent } from './content'
import { DEMO_WEEKLY_POSTS } from './posts'
import { hashSeed, rngFor } from './random'

/**
 * The live demo (owner, 2026-10-04): keeps a sample center (Demo Academy, a branch with `liveDemo: true`) running by
 * itself, so it always looks like a tutoring center in operation.
 *
 * - Nightly: availability up to 6 weeks ahead, sessions up to 3 weeks ahead (pending; the auto-confirm job confirms
 *   them), and the past week settled: attendance, submitted logs, the odd no-show, and clocked shifts.
 * - Every 15 minutes: tutors clock in a little before their first session and out after their last one, today's
 *   sessions get their logs shortly after they end, and a news post goes out on Monday mornings. On most weekday
 *   mornings (~10:00) the test tutor's afternoon changes once: a session added, or one moved by 30 minutes. It is the
 *   same day's afternoon on purpose: only sessions starting within the notification window (24 hours) notify, so a
 *   real notification reaches the phone being tested.
 *
 * It only ever adds to what is there and never overwrites people's edits: availability only for a tutor and date
 * without any (and only once per date), sessions only for a tutor and date without any (any status, trashed
 * included), settling only seed or planner sessions still pending or confirmed with no log after they ended, shifts
 * only for a tutor and date without one. Only the sample people (`demo-…` IDs) are planned for. The test tutor's
 * last three days stay unlogged, for the owner to write those logs in the app.
 *
 * Pure: it reads a snapshot and returns the writes (paths and data, with `Date`s for timestamps) in small atomic
 * units, which the Cloud Functions (Admin SDK) and the scripts (REST) apply the same way. Everything random is
 * seeded by the branch, date and person, so a run is deterministic and running it again changes nothing.
 */

// ------------------------------------------------------------------ constants

const SAMPLE = 'demo-'
const SAMPLE_STUDENT = 'demo-student-'
const LIVE = 'demo-live'

/** How far the planner looks: availability and sessions ahead, settling behind (days). */
export const LIVE_DAYS = { availability: 42, sessions: 21, settle: 7 } as const
/** The test tutor's sessions from the last three days (and today) keep their logs open for the owner. */
export const TEST_TUTOR_OPEN_DAYS = 3
/** Other tutors' late logs stay missing for two days, then get written. */
const LATE_OPEN_DAYS = 2
/** The nightly job runs at this local hour. */
export const NIGHTLY_LOCAL_HOUR = 1

const LENGTHS = [110, 110, 110, 80, 50]
const NOTES = ['Bring last week’s practice test', 'Test on Friday: review first', 'Parent asked for extra homework', 'Start with the school worksheet']
const SYSTEM = { uid: 'system', email: 'system', name: 'System', role: 'system' }
const KIOSK = 'kiosk:system'

const slugOf = (staffId: string) => staffId.replace(/^demo-/, '')

/** Planner-made documents have stable IDs, so they are never written twice. */
export const liveSessionId = (dateKey: DateKey, staffId: string, n: number) => `${LIVE}-s-${dateKey}-${slugOf(staffId)}-${n}`
export const liveChangeSessionId = (dateKey: DateKey, staffId: string) => `${LIVE}-x-${dateKey}-${slugOf(staffId)}`
export const liveShiftId = (dateKey: DateKey, staffId: string) => `${LIVE}-shift-${dateKey}-${slugOf(staffId)}`
export const livePostId = (monday: DateKey) => `${LIVE}-a-${monday}`

/** The sample center's staff (`demo-maya-thompson`), not students. */
export const isSampleStaffId = (id: string) => id.startsWith(SAMPLE) && !id.startsWith(SAMPLE_STUDENT)
/** Sessions the seed or the planner made (people's sessions have random IDs). */
export const isSampleSessionId = (id: string) => id.startsWith('demo-s-') || id.startsWith(`${LIVE}-`) || id.startsWith('demo-ava-h-')
/** Shifts the seed or the planner made. */
export const isSampleShiftId = (id: string) => id.startsWith('demo-shift-') || id.startsWith(`${LIVE}-shift-`)

// ---------------------------------------------------------------------- types

/**
 * One document write. Timestamps are `Date`s. `create` fails if the document exists, `add` creates one with a new
 * random ID in `path` (a collection: audit entries), `update` merges top-level (or dotted) fields into an existing
 * document, and only if it is still at `ifVersion` when one is given.
 */
export type LiveWrite =
  | { op: 'create'; path: string; data: Record<string, unknown> }
  | { op: 'add'; path: string; data: Record<string, unknown> }
  | { op: 'set'; path: string; data: Record<string, unknown> }
  | { op: 'update'; path: string; data: Record<string, unknown>; increment?: Record<string, number>; ifVersion?: unknown }
  | { op: 'delete'; path: string }

export type LiveKind = 'availability' | 'session' | 'log' | 'no_show' | 'shift' | 'clock_in' | 'clock_out' | 'change' | 'announcement' | 'state'

/** Writes that belong together and are applied atomically (a session and its audit entry, a log and its effects…). */
export interface LiveUnit {
  key: string
  kind: LiveKind
  writes: LiveWrite[]
}

export interface LivePlan {
  today: DateKey
  units: LiveUnit[]
  /** How many of each kind, plus `left`: ended sessions deliberately left without a log for now. */
  counts: Partial<Record<LiveKind | 'left', number>>
  /** Plain lines for the logs (schedule change, news post). */
  notes: string[]
}

export interface LiveContext {
  branchId: string
  timezone: string
  settings: BranchSettings
  rules: Pick<BusinessRules, 'maxStudentsPerTutor'>
  /** The moment planned for: the real time, or a pretended one. */
  now: Date
  /** When the writes happen (`createdAt`, `updatedAt`, audit times); default `now`. Keeps pretend runs out of the future. */
  stamp?: Date
  /** The tutor whose phone gets the daily schedule change (default Maya Thompson). */
  testTutorId?: string
}

export interface LiveStaff {
  id: string
  name: string
  email?: string | null
  role: string
  status: string
  subjectIds?: (string | null)[] | null
}

export interface LiveStudent {
  id: string
  name: string
  grade?: string | null
  status: string
  statusSource?: string | null
  subjectIds?: (string | null)[] | null
  firstSessionDate?: DateKey | null
  lastSessionDate?: DateKey | null
}

export interface LiveSession {
  id: string
  tutorId: string
  tutorName: string
  studentId: string
  studentName: string
  studentGrade?: string | null
  subjectId?: string | null
  subject: string
  note?: string | null
  status: SessionStatus
  dateKey: DateKey
  startMin: number
  endMin: number
  logStatus?: string | null
  isDeleted?: boolean | null
  /** The document's update time as read (an opaque token): settling and moving only apply if it hasn't changed since. */
  version?: unknown
}

export interface LiveShift {
  id: string
  staffId: string
  dateKey: DateKey
  status: string
  /** The document's update time as read: a clock-out only applies to the shift as it was. */
  version?: unknown
}

/** `branches/{b}.liveDemoState`: how far the planner got, so it never refills what people removed. */
export interface LiveDemoState {
  availabilityThrough?: DateKey | null
  sessionsThrough?: DateKey | null
  changeDate?: DateKey | null
  announcementWeek?: DateKey | null
}

/** The branch fields the live demo uses (only the Super Admin can set `liveDemo`). */
export interface LiveDemoBranchFields {
  liveDemo?: boolean
  liveDemoState?: LiveDemoState | null
}

/** A snapshot of the branch (the window the job needs; see `nightlyWindows` and `tickWindows`). */
export interface LiveData {
  staff: LiveStaff[]
  students: LiveStudent[]
  /** Subject names; may be empty in a tick (names then come from existing sessions). */
  subjects: { id: string; name: string }[]
  dayConfigs: Pick<DayConfig, 'dateKey' | 'isOpen' | 'openMin' | 'closeMin'>[]
  availability: { staffId: string; dateKey: DateKey; ranges: AvailabilityRange[]; unavailable?: boolean | null }[]
  /** Every session in the window, trashed ones included. */
  sessions: LiveSession[]
  shifts: LiveShift[]
  openShifts: { staffId: string; shiftId: string }[]
  state: LiveDemoState | null
}

export interface LiveRange {
  from: DateKey
  to: DateKey
}

/** Date ranges each collection is read for. */
export interface LiveWindows {
  sessions: LiveRange
  availability: LiveRange
  shifts: LiveRange
  dayConfigs: LiveRange
}

export function liveToday(ctx: Pick<LiveContext, 'timezone' | 'now'>): { today: DateKey; nowMin: number } {
  return { today: todayKey(ctx.timezone, ctx.now), nowMin: minutesOf(ctx.now, ctx.timezone) }
}

export function nightlyWindows(today: DateKey): LiveWindows {
  const back = addDays(today, -LIVE_DAYS.settle)
  return {
    sessions: { from: back, to: addDays(today, LIVE_DAYS.sessions) },
    availability: { from: today, to: addDays(today, LIVE_DAYS.availability) },
    shifts: { from: back, to: today },
    dayConfigs: { from: back, to: addDays(today, LIVE_DAYS.availability) },
  }
}

export function tickWindows(today: DateKey): LiveWindows {
  const day = { from: today, to: today }
  return { sessions: day, availability: day, shifts: day, dayConfigs: day }
}

// ------------------------------------------------------------- working state

interface Work {
  ctx: LiveContext
  branchPath: string
  tz: string
  /** `toInstant` in the branch zone, memoized for the run (it is the costly part of planning). */
  at: (dateKey: DateKey, minutes: number) => Date
  /** `formatDateKey`, memoized. */
  label: (dateKey: DateKey, style: 'weekdayLong' | 'short' | 'weekdayMedium') => string
  today: DateKey
  nowMin: number
  stamp: Date
  settings: BranchSettings
  maxLanes: number
  testTutorId: string
  hours: (dateKey: DateKey) => DayHours
  tutors: LiveStaff[]
  staffById: Map<string, LiveStaff>
  students: Map<string, LiveStudent>
  enrolled: LiveStudent[]
  subjectName: Map<string, string>
  subjectIdByName: Map<string, string>
  byDate: Map<DateKey, LiveSession[]>
  avail: Map<string, { ranges: AvailabilityRange[]; unavailable: boolean }>
  shifts: LiveShift[]
  open: Map<string, string>
  state: LiveDemoState
  plan: LivePlan
}

const availKey = (staffId: string, dateKey: DateKey) => `${staffId}|${dateKey}`

function start(ctx: LiveContext, data: LiveData): Work {
  const { today, nowMin } = liveToday(ctx)
  const configs = new Map(data.dayConfigs.map((c) => [c.dateKey, c]))
  const staffById = new Map(data.staff.map((s) => [s.id, s]))
  const students = new Map(data.students.map((s) => [s.id, { ...s }]))
  const subjectName = new Map<string, string>()
  // Names from sessions first (a tick may not read the subject list), then the list itself wins.
  for (const s of data.sessions) if (s.subjectId && s.subject) subjectName.set(s.subjectId, s.subject)
  for (const s of data.subjects) subjectName.set(s.id, s.name)
  const byDate = new Map<DateKey, LiveSession[]>()
  for (const s of data.sessions) byDate.set(s.dateKey, [...(byDate.get(s.dateKey) ?? []), { ...s }])
  const instants = new Map<string, Date>()
  const labels = new Map<string, string>()
  return {
    ctx,
    branchPath: `${ROOT.branches}/${ctx.branchId}`,
    tz: ctx.timezone,
    at: (d, m) => {
      const k = `${d}|${m}`
      let v = instants.get(k)
      if (!v) instants.set(k, (v = toInstant(d, m, ctx.timezone)))
      return v
    },
    label: (d, style) => {
      const k = `${d}|${style}`
      let v = labels.get(k)
      if (v === undefined) labels.set(k, (v = formatDateKey(d, style)))
      return v
    },
    today,
    nowMin,
    stamp: ctx.stamp ?? ctx.now,
    settings: ctx.settings,
    maxLanes: Math.max(1, ctx.rules.maxStudentsPerTutor || 1),
    testTutorId: ctx.testTutorId ?? DEMO_TEST_TUTOR_STAFF_ID,
    hours: (d) => dayHours(d, ctx.settings, configs),
    tutors: data.staff.filter((s) => isSampleStaffId(s.id) && s.role === 'tutor' && s.status === 'active').sort((a, b) => a.id.localeCompare(b.id)),
    staffById,
    students,
    enrolled: [...students.values()].filter((s) => s.id.startsWith(SAMPLE_STUDENT) && s.status === 'enrolled').sort((a, b) => a.id.localeCompare(b.id)),
    subjectName,
    subjectIdByName: new Map([...subjectName.entries()].map(([id, name]) => [name, id])),
    byDate,
    avail: new Map(data.availability.map((a) => [availKey(a.staffId, a.dateKey), { ranges: a.ranges ?? [], unavailable: a.unavailable === true }])),
    shifts: [...data.shifts],
    open: new Map(data.openShifts.map((o) => [o.staffId, o.shiftId])),
    state: { ...(data.state ?? {}) },
    plan: { today, units: [], counts: {}, notes: [] },
  }
}

function add(w: Work, kind: LiveKind, key: string, writes: LiveWrite[]) {
  w.plan.units.push({ kind, key, writes })
  w.plan.counts[kind] = (w.plan.counts[kind] ?? 0) + 1
}

const col = (w: Work, name: string, id: string) => `${w.branchPath}/${name}/${id}`

/** Live sessions of a day (not trashed, not canceled). */
const liveOn = (w: Work, dateKey: DateKey) => (w.byDate.get(dateKey) ?? []).filter((s) => !s.isDeleted && s.status !== 'canceled')

/** The tutor's availability that counts on a date (inside that date's hours). */
function rangesOf(w: Work, staffId: string, dateKey: DateKey): AvailabilityRange[] {
  const a = w.avail.get(availKey(staffId, dateKey))
  if (!a || a.unavailable) return []
  return effectiveRanges(a.ranges, w.hours(dateKey))
}

/** "Monday, 10/5/2026 (4:00 PM - 5:50 PM)", as the schedule writes it in audit entries. */
function sessionContext(w: Work, s: Pick<LiveSession, 'dateKey' | 'startMin' | 'endMin'>) {
  return `${w.label(s.dateKey, 'weekdayLong').split(',')[0]}, ${w.label(s.dateKey, 'short')} (${formatTimeRange(s.startMin, s.endMin)})`
}

/** An audit entry for an automatic change (actor System), in the server's shape. */
function audit(
  w: Work,
  e: {
    action: string
    category: string
    entityType: string
    entityId: string
    summary: string
    context?: string
    dateKey?: DateKey | null
    studentId?: string | null
    studentName?: string | null
    tutorId?: string | null
    tutorName?: string | null
    changes?: { field: string; label: string; from: string | number | null; to: string | number | null }[]
    via?: 'function' | 'kiosk'
  },
): Record<string, unknown> {
  return {
    at: w.stamp,
    actorUid: SYSTEM.uid,
    actorEmail: SYSTEM.email,
    actorName: SYSTEM.name,
    actorRole: SYSTEM.role,
    action: e.action,
    category: e.category,
    entityType: e.entityType,
    entityId: e.entityId,
    summary: e.summary,
    context: e.context ?? '',
    dateKey: e.dateKey ?? null,
    studentId: e.studentId ?? null,
    studentName: e.studentName ?? null,
    tutorId: e.tutorId ?? null,
    tutorName: e.tutorName ?? null,
    changes: e.changes ?? [],
    via: e.via ?? 'function',
  }
}

/**
 * An audit entry with a new ID. Units stay idempotent through their main write (a `create`, or an `update` at the
 * version read), so a unit that already happened fails as a whole instead of logging twice.
 */
const auditWrite = (w: Work, data: Record<string, unknown>): LiveWrite => ({ op: 'add', path: `${w.branchPath}/${COL.auditLog}`, data })
/** The day's schedule change is marked by a fixed audit ID: whatever happens, it is made once. */
const changeMarker = (w: Work, data: Record<string, unknown>): LiveWrite => ({ op: 'create', path: col(w, COL.auditLog, `${LIVE}-change-${w.today}`), data })

// ------------------------------------------------------------- availability

type Pattern = 'full' | 'early' | 'late' | 'mid' | 'split'
const PATTERNS: readonly Pattern[] = ['full', 'early', 'late', 'mid', 'split']
const WEEKDAYS_MON_FRI: readonly Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

/** A pattern placed in a day's hours. On the standard weekday (2–9 PM) these are the seed's five patterns. */
function patternRanges(p: Pattern, h: DayHours): AvailabilityRange[] {
  const o = h.openMin
  const c = h.closeMin
  const span = c - o
  const r30 = (m: number) => Math.round(m / 30) * 30
  if (p === 'full' || span < 240) return [{ startMin: o, endMin: c }]
  if (p === 'early') return [{ startMin: o, endMin: o + r30((span * 4) / 7) }]
  if (p === 'late') return [{ startMin: c - r30((span * 5) / 7), endMin: c }]
  if (p === 'mid') return [{ startMin: o + 60, endMin: c - 60 }]
  if (span < 360) return [{ startMin: o, endMin: c }]
  return [
    { startMin: o, endMin: o + r30((span * 5) / 14) },
    { startMin: c - r30((span * 3) / 7), endMin: c },
  ]
}

/** Each tutor's usual week: a pattern per weekday, a regular day off for some, weekends for about half. */
function usualWeek(branchId: string, staffId: string): Record<Weekday, Pattern | null> {
  const r = rngFor(branchId, staffId, 'week')
  const dayOff = r() < 0.35 ? WEEKDAYS_MON_FRI[Math.floor(r() * 5)] : null
  const out = {} as Record<Weekday, Pattern | null>
  for (const wd of WEEKDAYS_MON_FRI) out[wd] = wd === dayOff ? null : PATTERNS[Math.floor(r() * PATTERNS.length)]
  const weekend: Pattern | null = r() < 0.45 ? (r() < 0.6 ? 'full' : r() < 0.5 ? 'early' : 'late') : null
  out.saturday = weekend
  out.sunday = weekend
  return out
}

/** The availability a tutor gives for a date: their usual pattern, with the odd day off, extra day or other time. */
export function plannedAvailability(branchId: string, staffId: string, dateKey: DateKey, hours: DayHours, settings: Pick<BranchSettings, 'availability'>): AvailabilityRange[] {
  if (!hours.isOpen) return []
  const usual = usualWeek(branchId, staffId)[weekdayOf(dateKey)]
  const r = rngFor(branchId, staffId, dateKey, 'availability')
  const x = r()
  let p: Pattern | null = usual
  if (usual && x < 0.1) p = null
  else if (usual && x < 0.25) p = PATTERNS[Math.floor(r() * PATTERNS.length)]
  else if (!usual && x < 0.05) p = 'mid'
  if (!p) return []
  const fit = fitRangesToDay(patternRanges(p, hours), hours, { minBlockMinutes: settings.availability.minBlockMinutes, maxRangesPerDay: settings.availability.maxRangesPerDay })
  return fit.ok ? fit.ranges : []
}

const describeRanges = (ranges: readonly AvailabilityRange[]) => ranges.map((r) => formatTimeRange(r.startMin, r.endMin)).join(', ')
const laterKey = (a: DateKey, b: DateKey | null | undefined) => (b && b > a ? b : a)

function planAvailability(w: Work) {
  const { branchId } = w.ctx
  const from = laterKey(w.today, w.state.availabilityThrough ? addDays(w.state.availabilityThrough, 1) : null)
  const to = addDays(w.today, LIVE_DAYS.availability)
  for (const t of w.tutors) {
    const days: { dateKey: DateKey; ranges: AvailabilityRange[] }[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (w.avail.has(availKey(t.id, d))) continue
      const ranges = plannedAvailability(branchId, t.id, d, w.hours(d), w.settings)
      if (ranges.length) days.push({ dateKey: d, ranges })
    }
    if (!days.length) continue
    const writes: LiveWrite[] = days.map((d) => ({
      op: 'create',
      path: col(w, COL.availability, availabilityDocId(t.id, d.dateKey)),
      data: {
        staffId: t.id,
        dateKey: d.dateKey,
        weekday: weekdayOf(d.dateKey),
        ranges: d.ranges,
        unavailable: false,
        hidden: false,
        dayStartAt: w.at(d.dateKey, 0),
        updatedVia: 'admin',
        updatedAt: w.stamp,
        updatedBy: SYSTEM.email,
      },
    }))
    const first = days[0]
    const last = days[days.length - 1]
    writes.push(
      auditWrite(
        w,
        audit(w, {
          action: 'availability.update',
          category: 'availability',
          entityType: 'availability',
          entityId: availabilityDocId(t.id, first.dateKey),
          summary:
            days.length === 1
              ? `Set ${t.name}’s availability on ${w.label(first.dateKey, 'weekdayMedium')}: ${describeRanges(first.ranges)}`
              : `Updated ${t.name}’s availability on ${days.length} days`,
          tutorId: t.id,
          tutorName: t.name,
          dateKey: first.dateKey,
        }),
      ),
    )
    for (const d of days) w.avail.set(availKey(t.id, d.dateKey), { ranges: d.ranges, unavailable: false })
    add(w, 'availability', `availability ${t.id} ${first.dateKey}…${last.dateKey}`, writes)
  }
  if (to > (w.state.availabilityThrough ?? '')) w.state.availabilityThrough = to
}

// ----------------------------------------------------------------- sessions

interface Subject {
  id: string | null
  name: string
}

/** The subjects a tutor teaches (by name); Homework Help when none are known. */
function subjectsOf(w: Work, t: LiveStaff): Subject[] {
  const out = (t.subjectIds ?? []).filter((id): id is string => !!id && w.subjectName.has(id)).map((id) => ({ id, name: w.subjectName.get(id)! }))
  return out.length ? out : [{ id: w.subjectIdByName.get('Homework Help') ?? null, name: 'Homework Help' }]
}

/**
 * A student for [startMin, endMin): enrolled, not booked at that time with anyone else, not already with this tutor
 * that day; students who study one of the tutor's subjects first. The subject is one they share, else the tutor's.
 */
function pickStudent(w: Work, r: () => number, tutorId: string, subjects: Subject[], dateKey: DateKey, startMin: number, endMin: number, extra: readonly LiveSession[] = []) {
  if (!w.enrolled.length) return null
  const ids = new Set(subjects.map((s) => s.id))
  const matching = w.enrolled.filter((s) => (s.subjectIds ?? []).some((id) => !!id && ids.has(id)))
  const day = [...liveOn(w, dateKey), ...extra]
  for (let tries = 0; tries < 8; tries++) {
    const pool = tries < 5 && matching.length ? matching : w.enrolled
    const st = pool[Math.floor(r() * pool.length)]
    const clash = day.some((o) => o.studentId === st.id && (o.tutorId === tutorId || (o.startMin < endMin && startMin < o.endMin)))
    if (clash) continue
    const shared = subjects.filter((s) => (st.subjectIds ?? []).includes(s.id))
    const options = shared.length ? shared : subjects
    return { student: st, subject: options[Math.floor(r() * options.length)] }
  }
  return null
}

function newSession(id: string, t: LiveStaff, dateKey: DateKey, startMin: number, endMin: number, pick: { student: LiveStudent; subject: Subject }, status: SessionStatus, note: string): LiveSession {
  return {
    id,
    tutorId: t.id,
    tutorName: t.name,
    studentId: pick.student.id,
    studentName: pick.student.name,
    studentGrade: pick.student.grade ?? '',
    subjectId: pick.subject.id,
    subject: pick.subject.name,
    note,
    status,
    dateKey,
    startMin,
    endMin,
    logStatus: 'none',
    isDeleted: false,
  }
}

const timeFields = (w: Work, dateKey: DateKey, startMin: number, endMin: number) => ({
  dateKey,
  weekday: weekdayOf(dateKey),
  startMin,
  endMin,
  startAt: w.at(dateKey, startMin),
  endAt: w.at(dateKey, endMin),
  // The next local midnight (`dayEndInstant`).
  dayEndAt: w.at(addDays(dateKey, 1), 0),
})

/** A new session document, in the shape the schedule writes. */
function sessionDoc(w: Work, s: LiveSession): Record<string, unknown> {
  return {
    tutorId: s.tutorId,
    tutorName: s.tutorName,
    studentId: s.studentId,
    studentName: s.studentName,
    studentGrade: s.studentGrade ?? '',
    subjectId: s.subjectId ?? null,
    subject: s.subject,
    note: s.note ?? '',
    status: s.status,
    ...timeFields(w, s.dateKey, s.startMin, s.endMin),
    visualOrder: 0,
    logStatus: 'none',
    logSubmittedAt: null,
    noShowAppliedHours: null,
    confirmedAt: null,
    confirmedBy: null,
    source: 'seed',
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: w.stamp,
    createdBy: SYSTEM.email,
    updatedAt: w.stamp,
    updatedBy: SYSTEM.email,
  }
}

function createSessionWrites(w: Work, s: LiveSession, marker = false): LiveWrite[] {
  return [
    { op: 'create', path: col(w, COL.sessions, s.id), data: sessionDoc(w, s) },
    (marker ? changeMarker : auditWrite)(
      w,
      audit(w, {
        action: 'session.create',
        category: 'schedule',
        entityType: 'session',
        entityId: s.id,
        summary: `Created a session for ${s.studentName} with ${s.tutorName}`,
        context: sessionContext(w, s),
        dateKey: s.dateKey,
        studentId: s.studentId,
        studentName: s.studentName,
        tutorId: s.tutorId,
        tutorName: s.tutorName,
        changes: [{ field: 'status', label: 'Status', from: null, to: SESSION_STATUS_LABELS[s.status] }],
      }),
    ),
  ]
}

/** A tutor's day like the seed's: 2 to 6 tries at a session inside their availability, within the students-at-once rule. */
function draftDay(w: Work, t: LiveStaff, dateKey: DateKey, ranges: AvailabilityRange[]): LiveSession[] {
  const r = rngFor(w.ctx.branchId, t.id, dateKey, 'sessions')
  const subjects = subjectsOf(w, t)
  const count = 2 + Math.floor(r() * 5)
  const out: LiveSession[] = []
  for (let n = 0; n < count; n++) {
    const range = ranges[Math.floor(r() * ranges.length)]
    const len = LENGTHS[Math.floor(r() * LENGTHS.length)]
    const latest = range.endMin - len
    if (latest < range.startMin) continue
    const startMin = range.startMin + Math.floor((r() * (latest - range.startMin)) / 30) * 30
    const endMin = startMin + len
    if (!fitsCapacity(out, startMin, endMin, w.maxLanes)) continue
    const pick = pickStudent(w, r, t.id, subjects, dateKey, startMin, endMin, out)
    if (!pick) continue
    const note = r() < 0.1 ? NOTES[Math.floor(r() * NOTES.length)] : ''
    out.push(newSession(liveSessionId(dateKey, t.id, n), t, dateKey, startMin, endMin, pick, 'pending', note))
  }
  return out
}

function planSessions(w: Work) {
  const from = laterKey(addDays(w.today, 1), w.state.sessionsThrough ? addDays(w.state.sessionsThrough, 1) : null)
  const to = addDays(w.today, LIVE_DAYS.sessions)
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const t of w.tutors) {
      // Any session at all (trashed or canceled included) means people have planned this day.
      if ((w.byDate.get(d) ?? []).some((s) => s.tutorId === t.id)) continue
      const ranges = rangesOf(w, t.id, d)
      if (!ranges.length) continue
      for (const s of draftDay(w, t, d, ranges)) {
        w.byDate.set(d, [...(w.byDate.get(d) ?? []), s])
        add(w, 'session', `session ${s.id}`, createSessionWrites(w, s))
      }
    }
  }
  if (to > (w.state.sessionsThrough ?? '')) w.state.sessionsThrough = to
}

// ------------------------------------------------------------------ settling

type Fate = { kind: 'log' | 'no_show'; at: Date } | { kind: 'open' }

/**
 * What happened to an ended session: most get their log shortly after (5–75 minutes), a few are no-shows, and a
 * few logs come late (missing for two days, then written). The test tutor's last days stay open for the owner.
 */
function fateOf(w: Work, s: LiveSession): Fate {
  const daysAgo = diffDays(s.dateKey, w.today)
  if (s.tutorId === w.testTutorId && daysAgo <= TEST_TUTOR_OPEN_DAYS) return { kind: 'open' }
  const r = rngFor(w.ctx.branchId, s.id, 'settle')
  const roll = r()
  const at = w.at(s.dateKey, s.endMin + 5 + Math.floor(r() * 71))
  if (roll < 0.06) return { kind: 'no_show', at }
  if (roll < 0.18) return daysAgo <= LATE_OPEN_DAYS ? { kind: 'open' } : { kind: 'log', at: w.ctx.now < at ? at : w.ctx.now }
  return { kind: 'log', at }
}

function planSettle(w: Work, from: DateKey, to: DateKey) {
  const list: LiveSession[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const s of w.byDate.get(d) ?? []) {
      if (!isSampleSessionId(s.id) || !isSampleStaffId(s.tutorId) || s.isDeleted) continue
      if ((s.status !== 'pending' && s.status !== 'confirmed') || (s.logStatus ?? 'none') !== 'none') continue
      list.push(s)
    }
  }
  list.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.id.localeCompare(b.id))
  for (const s of list) {
    if (w.ctx.now < w.at(s.dateKey, s.endMin)) continue
    const fate = fateOf(w, s)
    if (fate.kind === 'open') {
      w.plan.counts.left = (w.plan.counts.left ?? 0) + 1
      continue
    }
    if (w.ctx.now < fate.at) continue
    if (fate.kind === 'no_show') settleNoShow(w, s)
    else settleLog(w, s, fate.at)
  }
}

/** A submitted log with exactly the effects of `submitSessionLog`, credited to the session's tutor. */
function settleLog(w: Work, s: LiveSession, at: Date) {
  const staff = w.staffById.get(s.tutorId)
  const student = w.students.get(s.studentId) ?? null
  const content = cleanLogContent(demoLogContent(s.subject, rngFor(w.ctx.branchId, s.id, 'log')))
  const x = logSubmitWrites({
    sessionId: s.id,
    session: {
      ...s,
      note: s.note ?? '',
      subjectId: s.subjectId ?? null,
      startAt: w.at(s.dateKey, s.startMin),
      endAt: w.at(s.dateKey, s.endMin),
    },
    content,
    ai: localLogAi(content, s.subject),
    prev: null,
    student,
    settings: w.settings,
    author: { email: staff?.email || `${s.tutorId}@example.com`, name: s.tutorName, asAdmin: false },
    auditActor: SYSTEM,
    now: w.stamp,
    submittedAt: at,
  })
  const writes: LiveWrite[] = [
    // `create`: a draft the tutor started is never overwritten (the unit is skipped instead).
    { op: 'create', path: col(w, COL.sessionLogs, s.id), data: x.log },
    { op: 'update', path: col(w, COL.sessions, s.id), data: x.sessionPatch, ifVersion: s.version },
  ]
  if (student && x.studentPatch) {
    writes.push({ op: 'update', path: col(w, COL.students, student.id), data: x.studentPatch, ...(x.hoursDelta ? { increment: { totalSessionHours: x.hoursDelta } } : {}) })
    Object.assign(student, x.studentPatch)
  }
  writes.push(auditWrite(w, x.audit))
  s.status = 'present'
  s.logStatus = 'submitted'
  add(w, 'log', `log ${s.id}`, writes)
}

/** No Show, as the schedule marks it: the rounded hours go to the student when the branch counts them. */
function settleNoShow(w: Work, s: LiveSession) {
  const counts = w.settings.schedule.noShow.countsTowardStudentHours
  const hours = billedHours(s.endMin - s.startMin, w.settings.students.hourRounding)
  const student = w.students.get(s.studentId)
  const writes: LiveWrite[] = [
    {
      op: 'update',
      path: col(w, COL.sessions, s.id),
      data: { status: 'no_show', ...(counts ? { noShowAppliedHours: hours } : {}), updatedAt: w.stamp, updatedBy: SYSTEM.email },
      ifVersion: s.version,
    },
  ]
  if (counts && student) writes.push({ op: 'update', path: col(w, COL.students, student.id), data: { updatedAt: w.stamp }, increment: { totalSessionHours: hours } })
  writes.push(
    auditWrite(
      w,
      audit(w, {
        action: 'session.status',
        category: 'schedule',
        entityType: 'session',
        entityId: s.id,
        summary: `Changed the status of ${s.studentName}’s session`,
        context: sessionContext(w, s),
        dateKey: s.dateKey,
        studentId: s.studentId,
        studentName: s.studentName,
        tutorId: s.tutorId,
        tutorName: s.tutorName,
        changes: [{ field: 'status', label: 'Status', from: SESSION_STATUS_LABELS[s.status], to: SESSION_STATUS_LABELS.no_show }],
      }),
    ),
  )
  s.status = 'no_show'
  add(w, 'no_show', `no-show ${s.id}`, writes)
}

// -------------------------------------------------------------------- clock

/**
 * When a tutor clocks in and out on a day: 5–15 minutes before the first session, 10–30 minutes after the last.
 * Now and then someone forgets to clock out (never the test tutor), and the automatic clock-out closes the shift.
 */
function clockPlan(w: Work, staffId: string, dateKey: DateKey, list: readonly LiveSession[]) {
  const r = rngFor(w.ctx.branchId, staffId, dateKey, 'clock')
  const inMin = Math.max(0, Math.min(...list.map((s) => s.startMin)) - (5 + Math.floor(r() * 11)))
  const outMin = Math.max(...list.map((s) => s.endMin)) + 10 + Math.floor(r() * 21)
  const forgets = staffId !== w.testTutorId && w.settings.timeClock.autoClockOut.enabled && r() < 0.04
  return { inMin, outMin, forgets }
}

function byTutor(w: Work, dateKey: DateKey) {
  const out = new Map<string, LiveSession[]>()
  for (const s of liveOn(w, dateKey)) if (isSampleStaffId(s.tutorId)) out.set(s.tutorId, [...(out.get(s.tutorId) ?? []), s])
  return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

const staffName = (w: Work, staffId: string, list: readonly LiveSession[]) => w.staffById.get(staffId)?.name || list[0]?.tutorName || staffId

/** The kiosk's shift document. */
function shiftDoc(w: Work, staffId: string, name: string, dateKey: DateKey, inMin: number, out: Date | null): Record<string, unknown> {
  return {
    staffId,
    staffName: name,
    dateKey,
    inMin,
    clockInAt: w.at(dateKey, inMin),
    clockOutAt: out,
    outDateKey: out ? dateKeyOf(out, w.tz) : null,
    outMin: out ? minutesOf(out, w.tz) : null,
    status: out ? 'closed' : 'open',
    source: 'kiosk',
    autoClosed: false,
    autoCorrected: false,
    forcedType: null,
    note: '',
    createdAt: w.stamp,
    createdBy: KIOSK,
    updatedAt: w.stamp,
    updatedBy: KIOSK,
  }
}

/** The kiosk's audit entry for a punch. */
function punchAudit(w: Work, shiftId: string, staffId: string, name: string, dir: 'in' | 'out', at: Date): LiveWrite {
  return auditWrite(
    w,
    audit(w, {
      action: dir === 'in' ? 'shift.clock_in' : 'shift.clock_out',
      category: 'pay',
      entityType: 'shift',
      entityId: shiftId,
      tutorId: staffId,
      tutorName: name,
      dateKey: dateKeyOf(at, w.tz),
      via: 'kiosk',
      summary: `${name} clocked ${dir} at ${formatMinutes(minutesOf(at, w.tz))}`,
    }),
  )
}

/** A whole day's shift at once (a day the clock wasn't run live, e.g. after a reset). */
function closedShift(w: Work, staffId: string, dateKey: DateKey, list: readonly LiveSession[], kind: LiveKind) {
  const { inMin, outMin } = clockPlan(w, staffId, dateKey, list)
  const name = staffName(w, staffId, list)
  const id = liveShiftId(dateKey, staffId)
  const out = w.at(dateKey, outMin)
  add(w, kind, `shift ${id}`, [
    { op: 'create', path: col(w, COL.clockShifts, id), data: shiftDoc(w, staffId, name, dateKey, inMin, out) },
    punchAudit(w, id, staffId, name, 'in', w.at(dateKey, inMin)),
    punchAudit(w, id, staffId, name, 'out', out),
  ])
  w.shifts.push({ id, staffId, dateKey, status: 'closed' })
}

/** Past days with sessions but no shift for the tutor get one. */
function planPastShifts(w: Work, from: DateKey, to: DateKey) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const [staffId, list] of byTutor(w, d)) {
      if (w.shifts.some((x) => x.staffId === staffId && x.dateKey === d)) continue
      closedShift(w, staffId, d, list, 'shift')
    }
  }
}

/** Today: clock tutors in before their first session and out after their last, as the kiosk would. */
function planClock(w: Work) {
  const d = w.today
  const tutors = byTutor(w, d)
  const own = (staffId: string) => liveShiftId(d, staffId)
  // Our own open shifts whose sessions were all canceled are closed too.
  const ids = new Set([...tutors.keys(), ...[...w.open.entries()].filter(([staffId, shiftId]) => shiftId === own(staffId)).map(([staffId]) => staffId)])
  for (const staffId of [...ids].sort()) {
    const list = tutors.get(staffId) ?? []
    const name = staffName(w, staffId, list)
    const id = own(staffId)
    const pointer = w.open.get(staffId)
    // Clocked in some other way (the kiosk, a person, a shift from another day): leave it alone.
    if (pointer && pointer !== id) continue
    if (pointer === id) {
      const plan = list.length ? clockPlan(w, staffId, d, list) : null
      const out = plan ? w.at(d, plan.outMin) : w.ctx.now
      if (plan?.forgets || w.ctx.now < out) continue
      const shift = w.shifts.find((x) => x.id === id)
      add(w, 'clock_out', `clock out ${id}`, [
        {
          op: 'update',
          path: col(w, COL.clockShifts, id),
          data: { clockOutAt: out, outDateKey: dateKeyOf(out, w.tz), outMin: minutesOf(out, w.tz), status: 'closed', updatedAt: w.stamp, updatedBy: KIOSK },
          ifVersion: shift?.version,
        },
        { op: 'delete', path: col(w, COL.openShifts, staffId) },
        punchAudit(w, id, staffId, name, 'out', out),
      ])
      w.open.delete(staffId)
      continue
    }
    if (!list.length || w.shifts.some((x) => x.staffId === staffId && x.dateKey === d)) continue
    const plan = clockPlan(w, staffId, d, list)
    const inAt = w.at(d, plan.inMin)
    if (w.ctx.now < inAt) continue
    if (!plan.forgets && w.ctx.now >= w.at(d, plan.outMin)) {
      closedShift(w, staffId, d, list, 'clock_out')
      continue
    }
    add(w, 'clock_in', `clock in ${id}`, [
      { op: 'create', path: col(w, COL.clockShifts, id), data: shiftDoc(w, staffId, name, d, plan.inMin, null) },
      // `create`: if the kiosk opened a shift meanwhile, this unit is skipped.
      { op: 'create', path: col(w, COL.openShifts, staffId), data: { shiftId: id, clockInAt: inAt } },
      punchAudit(w, id, staffId, name, 'in', inAt),
    ])
    w.shifts.push({ id, staffId, dateKey: d, status: 'open' })
    w.open.set(staffId, id)
  }
}

// ----------------------------------------------------------- daily change

/** When the day's change for the test tutor happens (~10:00) and whether it does (most weekdays). */
function changeOf(branchId: string, dateKey: DateKey) {
  const r = rngFor(branchId, dateKey, 'change')
  return { atMin: 585 + Math.floor(r() * 60), happens: r() < 0.8, moveFirst: r() < 0.5 }
}

/** Whether this tick should make today's change (the runner then also reads the subject list). */
export function dailyChangeDue(ctx: Pick<LiveContext, 'branchId' | 'timezone' | 'now'>, state: LiveDemoState | null): boolean {
  const { today, nowMin } = liveToday(ctx)
  if (!WEEKDAYS_MON_FRI.includes(weekdayOf(today)) || state?.changeDate === today) return false
  const c = changeOf(ctx.branchId, today)
  return c.happens && nowMin >= c.atMin
}

/** One of the test tutor's confirmed sessions later today, 30 minutes earlier or later, where nothing conflicts. */
function tryMove(w: Work, t: LiveStaff): string | null {
  const d = w.today
  const r = rngFor(w.ctx.branchId, d, 'move')
  const ranges = rangesOf(w, t.id, d)
  const mine = liveOn(w, d)
    .filter((s) => s.tutorId === t.id && s.status === 'confirmed' && (s.logStatus ?? 'none') === 'none' && isSampleSessionId(s.id) && s.startMin >= w.nowMin + 60)
    .sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id))
  const order = mine.map((s) => ({ s, k: r() })).sort((a, b) => a.k - b.k)
  for (const { s } of order) {
    const deltas = r() < 0.5 ? [30, -30] : [-30, 30]
    for (const delta of deltas) {
      const startMin = s.startMin + delta
      const endMin = s.endMin + delta
      if (startMin < w.nowMin + 60 || !rangesContain(ranges, startMin, endMin)) continue
      const others = liveOn(w, d).filter((o) => o.id !== s.id)
      if (!fitsCapacity(others.filter((o) => o.tutorId === t.id), startMin, endMin, w.maxLanes)) continue
      if (others.some((o) => o.studentId === s.studentId && o.startMin < endMin && startMin < o.endMin)) continue
      const before = { ...s }
      add(w, 'change', `move ${s.id}`, [
        { op: 'update', path: col(w, COL.sessions, s.id), data: { ...timeFields(w, d, startMin, endMin), updatedAt: w.stamp, updatedBy: SYSTEM.email }, ifVersion: s.version },
        changeMarker(
          w,
          audit(w, {
            action: 'session.move',
            category: 'schedule',
            entityType: 'session',
            entityId: s.id,
            summary: `Moved ${s.studentName}’s session`,
            context: sessionContext(w, before),
            dateKey: d,
            studentId: s.studentId,
            studentName: s.studentName,
            tutorId: s.tutorId,
            tutorName: s.tutorName,
            changes: [{ field: 'time', label: 'Time', from: formatTimeRange(before.startMin, before.endMin), to: formatTimeRange(startMin, endMin) }],
          }),
        ),
      ])
      s.startMin = startMin
      s.endMin = endMin
      return `Moved ${s.studentName}’s session with ${t.name} today from ${formatMinutes(before.startMin)} to ${formatMinutes(startMin)}`
    }
  }
  return null
}

/** A new session for the test tutor later today, inside their availability, where nothing conflicts. */
function tryNew(w: Work, t: LiveStaff): string | null {
  const d = w.today
  const r = rngFor(w.ctx.branchId, d, 'new')
  const id = liveChangeSessionId(d, t.id)
  if ((w.byDate.get(d) ?? []).some((s) => s.id === id)) return null
  const earliest = Math.ceil((w.nowMin + 90) / 30) * 30
  const slots: { startMin: number; len: number; k: number }[] = []
  for (const range of rangesOf(w, t.id, d)) {
    for (const len of [110, 80, 50]) {
      for (let m = Math.max(range.startMin, earliest); m + len <= range.endMin; m += 30) slots.push({ startMin: m, len, k: r() })
    }
  }
  slots.sort((a, b) => a.k - b.k)
  const mine = liveOn(w, d).filter((s) => s.tutorId === t.id)
  const subjects = subjectsOf(w, t)
  for (const slot of slots) {
    const endMin = slot.startMin + slot.len
    if (!fitsCapacity(mine, slot.startMin, endMin, w.maxLanes)) continue
    const pick = pickStudent(w, r, t.id, subjects, d, slot.startMin, endMin)
    if (!pick) continue
    // Created Pending inside the auto-confirm window, the server confirms it and notifies the tutor; otherwise Confirmed.
    const ac = w.settings.schedule.autoConfirm
    const startsAt = w.at(d, slot.startMin).getTime()
    const status: SessionStatus = ac.enabled && startsAt <= w.ctx.now.getTime() + ac.hoursBefore * 3_600_000 ? 'pending' : 'confirmed'
    const s = newSession(id, t, d, slot.startMin, endMin, pick, status, '')
    w.byDate.set(d, [...(w.byDate.get(d) ?? []), s])
    add(w, 'change', `new ${id}`, createSessionWrites(w, s, true))
    return `New session for ${t.name} today: ${s.studentName}, ${s.subject}, ${formatTimeRange(s.startMin, s.endMin)}`
  }
  return null
}

function planChange(w: Work) {
  if (!dailyChangeDue(w.ctx, w.state)) return
  const t = w.tutors.find((x) => x.id === w.testTutorId)
  if (t) {
    const c = changeOf(w.ctx.branchId, w.today)
    const note = c.moveFirst ? (tryMove(w, t) ?? tryNew(w, t)) : (tryNew(w, t) ?? tryMove(w, t))
    if (note) w.plan.notes.push(note)
  }
  // Tried once a day, whatever the outcome.
  add(w, 'state', 'state change', [{ op: 'update', path: w.branchPath, data: { 'liveDemoState.changeDate': w.today } }])
  w.state.changeDate = w.today
}

// ------------------------------------------------------------- weekly news

/** Mondays around 9:00 (8:45–9:45): the week's post. */
function postAt(branchId: string, monday: DateKey) {
  return 525 + Math.floor(rngFor(branchId, monday, 'post')() * 60)
}

/** The week's post: the pool in turn, starting at a place that depends on the branch. */
export function weeklyPost(branchId: string, monday: DateKey) {
  const n = DEMO_WEEKLY_POSTS.length
  const week = Math.floor(diffDays('2026-01-05', monday) / 7)
  return DEMO_WEEKLY_POSTS[(((week + hashSeed(branchId)) % n) + n) % n]
}

function planPost(w: Work) {
  const d = w.today
  if (weekdayOf(d) !== 'monday' || w.state.announcementWeek === d || w.nowMin < postAt(w.ctx.branchId, d)) return
  const post = weeklyPost(w.ctx.branchId, d)
  const id = livePostId(d)
  add(w, 'announcement', `post ${id}`, [
    {
      op: 'create',
      path: col(w, COL.announcements, id),
      data: {
        title: post.title,
        contentHtml: post.contentHtml,
        contentText: stripHtmlToText(post.contentHtml),
        category: post.category,
        audienceType: 'all',
        audienceKeys: [],
        commentsEnabled: post.commentsEnabled,
        attachments: [],
        pinned: false,
        pinnedAt: null,
        archived: false,
        // Notifies the tutors (inbox and phones) through the announcement trigger.
        notifyRequestedAt: w.stamp,
        authorKey: 'grace.liu@example.com',
        authorName: 'Grace Liu',
        readCount: 0,
        commentCount: 0,
        createdAt: w.stamp,
        createdBy: SYSTEM.email,
        updatedAt: w.stamp,
        updatedBy: SYSTEM.email,
      },
    },
    auditWrite(w, audit(w, { action: 'announcement.create', category: 'announcements', entityType: 'announcement', entityId: id, summary: `Published “${post.title}”` })),
  ])
  add(w, 'state', 'state post', [{ op: 'update', path: w.branchPath, data: { 'liveDemoState.announcementWeek': d } }])
  w.state.announcementWeek = d
  w.plan.notes.push(`Posted “${post.title}”`)
}

// ------------------------------------------------------------------ entry points

/**
 * The nightly run: availability through today+42, sessions through today+21, the past week settled (logs,
 * no-shows) and clocked. Read the snapshot with `nightlyWindows(today)`.
 */
export function planNightly(ctx: LiveContext, data: LiveData): LivePlan {
  const w = start(ctx, data)
  const before = { ...w.state }
  planAvailability(w)
  planSessions(w)
  const back = addDays(w.today, -LIVE_DAYS.settle)
  const yesterday = addDays(w.today, -1)
  planSettle(w, back, yesterday)
  planPastShifts(w, back, yesterday)
  const patch: Record<string, unknown> = {}
  if (w.state.availabilityThrough !== before.availabilityThrough) patch['liveDemoState.availabilityThrough'] = w.state.availabilityThrough
  if (w.state.sessionsThrough !== before.sessionsThrough) patch['liveDemoState.sessionsThrough'] = w.state.sessionsThrough
  if (Object.keys(patch).length) add(w, 'state', 'state nightly', [{ op: 'update', path: w.branchPath, data: patch }])
  return w.plan
}

/**
 * The 15-minute tick: today's logs shortly after sessions end, clock-ins and clock-outs, the test tutor's daily
 * change and the Monday post. Read the snapshot with `tickWindows(today)`.
 */
export function planTick(ctx: LiveContext, data: LiveData): LivePlan {
  const w = start(ctx, data)
  planSettle(w, w.today, w.today)
  planClock(w)
  planChange(w)
  planPost(w)
  return w.plan
}

/** Splits units into batches of at most `maxWrites` writes (a unit is never split). */
export function batchUnits(units: readonly LiveUnit[], maxWrites = 450): LiveUnit[][] {
  const out: LiveUnit[][] = []
  let cur: LiveUnit[] = []
  let size = 0
  for (const u of units) {
    if (cur.length && size + u.writes.length > maxWrites) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(u)
    size += u.writes.length
  }
  if (cur.length) out.push(cur)
  return out
}

/**
 * Applies units with a batch committer: each batch in one commit, and when a batch fails (a document changed or
 * appeared meanwhile), its units one by one, so one bad document only skips its own unit. Never throws.
 */
export async function applyUnits(units: readonly LiveUnit[], commit: (writes: LiveWrite[]) => Promise<void>, onSkip?: (unit: LiveUnit, error: unknown) => void) {
  let applied = 0
  let skipped = 0
  for (const batch of batchUnits(units)) {
    try {
      await commit(batch.flatMap((u) => u.writes))
      applied += batch.length
      continue
    } catch {
      // Find the unit (or units) at fault.
    }
    for (const u of batch) {
      try {
        await commit(u.writes)
        applied++
      } catch (e) {
        skipped++
        onSkip?.(u, e)
      }
    }
  }
  return { applied, skipped }
}

/** "7 tutors given availability, 12 sessions, 20 logs, 1 no-shows, …" */
export function describePlan(plan: LivePlan): string {
  const labels: [keyof LivePlan['counts'], string][] = [
    ['availability', 'tutors given availability'],
    ['session', 'sessions'],
    ['log', 'logs'],
    ['no_show', 'no-shows'],
    ['left', 'left without a log'],
    ['shift', 'past shifts'],
    ['clock_in', 'clock-ins'],
    ['clock_out', 'clock-outs'],
    ['change', 'schedule change'],
    ['announcement', 'post'],
  ]
  const parts = labels.filter(([k]) => plan.counts[k]).map(([k, label]) => `${plan.counts[k]} ${label}`)
  return parts.length ? parts.join(', ') : 'nothing to do'
}
