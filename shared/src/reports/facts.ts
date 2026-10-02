import { type SessionLog, averageRating, ratingKey } from '../sessions/logs'
import type { SessionStatus } from '../settings/defaults'
import { type DateKey, addDays, diffDays, endOfMonth, formatDateKey, parseDateKey, startOfMonth } from '../time'
import type { Change, HomeworkKind, ReportFacts, ReportPreset, SessionPoint, SkillArea } from './types'

/** Subject colors (validated categorical palette), largest subject first; the rest fold into "Other". */
export const SUBJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
export const OTHER_COLOR = '#9a9893'

const r1 = (x: number) => Math.round(x * 10) / 10
const r2 = (x: number) => Math.round(x * 100) / 100
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)

/** What a homework status means, whatever the branch calls it. */
export function homeworkKind(label: string | null | undefined): HomeworkKind | null {
  const s = (label ?? '').trim().toLowerCase()
  if (!s) return null
  if (/not\s*assigned|no\s+homework|none|n\/a/.test(s)) return 'not_assigned'
  if (/partial|partly|some|half/.test(s)) return 'partial'
  if (/not\s*(done|complete)|incomplete|missing|didn.?t|undone/.test(s)) return 'not_done'
  if (/complete|done|finished/.test(s)) return 'completed'
  return null
}

/** "September 2026" for a whole month, else "Sep 2 – Oct 15, 2026". */
export function periodLabel(from: DateKey, to: DateKey): string {
  if (from === startOfMonth(from) && to === endOfMonth(from)) return formatDateKey(from, 'monthYear')
  const a = parseDateKey(from)
  const b = parseDateKey(to)
  if (from === to) return formatDateKey(from, 'medium')
  if (a.year !== b.year) return `${formatDateKey(from, 'medium')} – ${formatDateKey(to, 'medium')}`
  if (a.month === b.month) return `${formatDateKey(from, 'monthDay')} – ${b.day}, ${b.year}`
  return `${formatDateKey(from, 'monthDay')} – ${formatDateKey(to, 'monthDay')}, ${b.year}`
}

/** The dates a preset covers (custom keeps the given ones). */
export function presetPeriod(
  preset: ReportPreset,
  today: DateKey,
  o: { lastReportTo?: DateKey | null; lastConference?: DateKey | null; firstSession?: DateKey | null; from?: DateKey; to?: DateKey } = {},
): { from: DateKey; to: DateKey } {
  const fallback = o.firstSession && o.firstSession <= today ? o.firstSession : addDays(today, -29)
  switch (preset) {
    case 'since_last':
      return { from: o.lastReportTo && o.lastReportTo < today ? addDays(o.lastReportTo, 1) : fallback, to: today }
    case 'last_month': {
      const first = startOfMonth(addDays(startOfMonth(today), -1))
      return { from: first, to: endOfMonth(first) }
    }
    case 'this_month':
      return { from: startOfMonth(today), to: today }
    case 'last_30':
      return { from: addDays(today, -29), to: today }
    case 'last_90':
      return { from: addDays(today, -89), to: today }
    case 'since_conference':
      return { from: o.lastConference && o.lastConference < today ? addDays(o.lastConference, 1) : fallback, to: today }
    case 'custom':
      return { from: o.from ?? fallback, to: o.to ?? today }
  }
}

export interface FactsSession {
  id: string
  dateKey: DateKey
  startMin: number
  endMin: number
  endAtMs: number
  status: SessionStatus
  logStatus: string
  subject: string
  tutorName: string
}

export interface FactsInput {
  period: { from: DateKey; to: DateKey }
  nowMs: number
  today: DateKey
  student: { totalSessionHours: number; conferenceBaselineHours: number }
  /** The student's sessions in the period (trashed ones left out). */
  sessions: FactsSession[]
  /** The student's submitted logs in the period. */
  logs: SessionLog[]
  /** Booked sessions from today on (not canceled), for "Coming up". */
  upcoming: { dateKey: DateKey; startMin: number; subject: string; tutorName: string }[]
  dimensions: string[]
  loggableStatuses: readonly SessionStatus[]
  conference: { enabled: boolean; everyHours: number }
  previous: { reportId: string; periodLabel: string; facts: ReportFacts; goals: string[] } | null
}

const change = (a: number | null, b: number | null, min: number): Change | null =>
  a === null || b === null ? null : b - a >= min ? 'up' : a - b >= min ? 'down' : 'steady'

/** Splits chronological items into an earlier and a later half (the middle one goes to the earlier half). */
function halves<T>(items: T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2)
  return [items.slice(0, mid), items.slice(mid)]
}

function practiceOf(logs: SessionLog[]) {
  let attempted = 0
  let correct = 0
  for (const l of logs) {
    if (!l.questionsAttempted || l.questionsAttempted < 1) continue
    attempted += l.questionsAttempted
    correct += Math.max(0, l.questionsAttempted - Math.max(0, l.questionsWrong ?? 0))
  }
  return { attempted, correct }
}

function homeworkOf(logs: SessionLog[]) {
  const c = { completed: 0, partial: 0, notDone: 0, notAssigned: 0 }
  for (const l of logs) {
    const k = homeworkKind(l.homeworkStatus)
    if (k === 'completed') c.completed++
    else if (k === 'partial') c.partial++
    else if (k === 'not_done') c.notDone++
    else if (k === 'not_assigned') c.notAssigned++
  }
  return { ...c, assigned: c.completed + c.partial + c.notDone }
}

function ratingAvg(logs: SessionLog[], key: string): number | null {
  const vals = logs.map((l) => l.ratings?.[key]).filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 5)
  return vals.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

function skillsOf(logs: SessionLog[]): SkillArea[] {
  const areas = new Map<string, { area: string; subject: string; skills: Map<string, Set<string>> }>()
  const add = (area: string, subject: string, skill: string, logId: string) => {
    const name = skill.trim()
    if (!name) return
    const a = areas.get(area) ?? { area, subject, skills: new Map() }
    const key = name.toLowerCase()
    const found = [...a.skills.keys()].find((k) => k.toLowerCase() === key) ?? name
    a.skills.set(found, (a.skills.get(found) ?? new Set()).add(logId))
    areas.set(area, a)
  }
  for (const l of logs) {
    const id = l.sessionId
    if (l.topics?.length) {
      const prefix = l.sessionType || l.subject || 'Topics'
      for (const path of l.topics) {
        const parts = path.split(' > ').map((p) => p.trim()).filter(Boolean)
        if (parts.length >= 3) add(`${prefix} ${parts[0]} › ${parts[1]}`, l.subject, parts.slice(2).join(' › '), id)
        else if (parts.length === 2) add(`${prefix} ${parts[0]}`, l.subject, parts[1], id)
        else if (parts.length === 1) add(prefix, l.subject, parts[0], id)
      }
    } else if (l.topicCovered?.trim()) {
      const subject = l.subject || l.sessionType || 'Topics'
      for (const t of l.topicCovered.split(/[;,]/)) add(subject, l.subject, t, id)
    }
  }
  return [...areas.values()]
    .map((a) => ({
      area: a.area,
      subject: a.subject,
      skills: [...a.skills.entries()].map(([name, ids]) => ({ name, sessions: ids.size })).sort((x, y) => y.sessions - x.sessions || x.name.localeCompare(y.name)),
    }))
    .sort((x, y) => y.skills.reduce((n, s) => n + s.sessions, 0) - x.skills.reduce((n, s) => n + s.sessions, 0) || x.area.localeCompare(y.area))
    .slice(0, 8)
    .map((a) => ({ ...a, skills: a.skills.slice(0, 6) }))
}

/**
 * Every figure a report shows, computed from the period's sessions and submitted
 * logs. Pure and deterministic: the AI never computes or changes any of it.
 */
export function buildReportFacts(input: FactsInput): { facts: ReportFacts; series: SessionPoint[] } {
  const { period, logs: rawLogs, dimensions } = input
  const logs = rawLogs
    .filter((l) => l.status === 'submitted' && l.dateKey >= period.from && l.dateKey <= period.to)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)
  const logBySession = new Map(logs.map((l) => [l.sessionId, l]))

  // ---- sessions, attendance, chart points
  const points: SessionPoint[] = []
  let missed = 0
  let canceled = 0
  let unlogged = 0
  for (const s of [...input.sessions].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)) {
    if (s.dateKey < period.from || s.dateKey > period.to) continue
    const log = logBySession.get(s.id)
    const base = { dateKey: s.dateKey, startMin: s.startMin, subject: s.subject, hours: 0, attempted: null, accuracy: null, homework: null, rating: null }
    if (log) continue // added from the log below
    if (s.status === 'no_show') {
      missed++
      points.push({ ...base, status: 'missed' })
    } else if (s.status === 'canceled') {
      canceled++
      points.push({ ...base, status: 'canceled' })
    } else if (s.status === 'present') {
      // Marked present without a log: attended, no notes.
      points.push({ ...base, status: 'attended', hours: 0 })
    } else if (s.endAtMs <= input.nowMs && input.loggableStatuses.includes(s.status)) {
      unlogged++
      points.push({ ...base, status: 'unlogged' })
    }
  }
  for (const l of logs) {
    const attempted = l.questionsAttempted && l.questionsAttempted > 0 ? l.questionsAttempted : null
    const correct = attempted ? Math.max(0, attempted - Math.max(0, l.questionsWrong ?? 0)) : null
    points.push({
      dateKey: l.dateKey,
      startMin: l.startMin,
      status: 'attended',
      subject: l.subject || l.sessionType || 'General',
      hours: r2(l.usedHours ?? 0),
      attempted,
      accuracy: attempted && correct !== null ? Math.round((correct / attempted) * 100) : null,
      homework: homeworkKind(l.homeworkStatus),
      rating: averageRating(l.ratings),
    })
  }
  points.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)
  const attendedPoints = points.filter((p) => p.status === 'attended')
  const attended = attendedPoints.length

  // ---- hours
  const subjectHours = new Map<string, number>()
  for (const l of logs) {
    const subj = l.subject || l.sessionType || 'General'
    subjectHours.set(subj, (subjectHours.get(subj) ?? 0) + (l.usedHours ?? 0))
  }
  const ranked = [...subjectHours.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const bySubject = ranked.slice(0, SUBJECT_COLORS.length).map(([subject, hours], i) => ({ subject, hours: r2(hours), color: SUBJECT_COLORS[i] }))
  const restHours = ranked.slice(SUBJECT_COLORS.length).reduce((n, [, h]) => n + h, 0)
  if (restHours > 0) bySubject.push({ subject: 'Other', hours: r2(restHours), color: OTHER_COLOR })
  const total = r2(logs.reduce((n, l) => n + (l.usedHours ?? 0), 0))
  const minutes = logs.map((l) => l.endMin - l.startMin).filter((m) => m > 0)

  // ---- consistency
  const days = diffDays(period.from, period.to) + 1
  const weeksInPeriod = Math.max(1, Math.ceil(days / 7))
  const weeks = new Set(attendedPoints.map((p) => Math.floor(diffDays(period.from, p.dateKey) / 7)))

  // ---- homework
  const hw = homeworkOf(logs)
  const [hwA, hwB] = halves(logs)
  const hwFirst = homeworkOf(hwA)
  const hwSecond = homeworkOf(hwB)
  const firstHalfPercent = hwFirst.assigned >= 2 ? pct(hwFirst.completed, hwFirst.assigned) : null
  const secondHalfPercent = hwSecond.assigned >= 2 ? pct(hwSecond.completed, hwSecond.assigned) : null

  // ---- engagement
  const [early, late] = halves(logs)
  const engagement = dimensions.map((d) => {
    const key = ratingKey(d)
    const a = early.length >= 2 && late.length >= 2 ? ratingAvg(early, key) : null
    const b = early.length >= 2 && late.length >= 2 ? ratingAvg(late, key) : null
    return { dimension: d, key, average: ratingAvg(logs, key), firstHalf: a, secondHalf: b, change: change(a, b, 0.3) }
  })

  // ---- practice
  const pr = practiceOf(logs)
  const practiced = logs.filter((l) => (l.questionsAttempted ?? 0) > 0)
  const [prA, prB] = halves(practiced)
  const pA = practiceOf(prA)
  const pB = practiceOf(prB)
  const earlyPercent = prA.length >= 2 && pA.attempted >= 10 ? pct(pA.correct, pA.attempted) : null
  const latePercent = prB.length >= 2 && pB.attempted >= 10 ? pct(pB.correct, pB.attempted) : null

  // ---- resources and people
  const resources = new Map<string, { label: string; url: string; ids: Set<string> }>()
  for (const l of logs) {
    for (const m of l.materials ?? []) {
      const label = m.label?.trim()
      if (!label) continue
      const key = `${label.toLowerCase()}|${m.url ?? ''}`
      const r = resources.get(key) ?? { label, url: m.url ?? '', ids: new Set<string>() }
      r.ids.add(l.sessionId)
      resources.set(key, r)
    }
  }
  const tutorCounts = new Map<string, number>()
  for (const l of logs) if (l.tutorName) tutorCounts.set(l.tutorName, (tutorCounts.get(l.tutorName) ?? 0) + 1)

  // ---- what's next
  const upcoming = input.upcoming
    .filter((u) => u.dateKey >= input.today)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)
  const horizon = addDays(input.today, 27)

  // ---- comparison with the previous report
  const prev = input.previous
  const attendancePercent = pct(attended, attended + missed)
  const homeworkPercent = pct(hw.completed, hw.assigned)
  const practicePercent = pr.attempted ? pct(pr.correct, pr.attempted) : null
  const delta = (a: number | null, b: number | null | undefined) => (a === null || b === null || b === undefined ? null : r1(a - b))

  const facts: ReportFacts = {
    attendance: { attended, missed, canceled, unlogged, scheduled: attended + missed, percent: attendancePercent },
    hours: {
      total,
      bySubject,
      toDate: r1(input.student.totalSessionHours ?? 0),
      averageSessionMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
    },
    consistency: { sessionsPerWeek: attended ? r1(attended / weeksInPeriod) : null, weeksWithSessions: weeks.size, weeksInPeriod },
    homework: {
      assigned: hw.assigned,
      completed: hw.completed,
      partial: hw.partial,
      notDone: hw.notDone,
      notAssigned: hw.notAssigned,
      percent: homeworkPercent,
      firstHalfPercent,
      secondHalfPercent,
      change: change(firstHalfPercent, secondHalfPercent, 10),
    },
    engagement,
    practice: pr.attempted
      ? { attempted: pr.attempted, correct: pr.correct, percent: practicePercent, earlyPercent, latePercent, change: change(earlyPercent, latePercent, 5), sessions: practiced.length }
      : null,
    skills: skillsOf(logs),
    resources: [...resources.values()]
      .map((r) => ({ label: r.label, url: r.url, sessions: r.ids.size }))
      .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label))
      .slice(0, 12),
    tutors: [...tutorCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n),
    subjects: ranked.map(([s]) => s),
    next: {
      session: upcoming[0] ? { dateKey: upcoming[0].dateKey, startMin: upcoming[0].startMin, subject: upcoming[0].subject, tutorName: upcoming[0].tutorName } : null,
      bookedNext4Weeks: upcoming.filter((u) => u.dateKey <= horizon).length,
    },
    conference: {
      enabled: input.conference.enabled,
      hoursUntil: input.conference.enabled
        ? Math.max(0, Math.round((input.conference.everyHours - ((input.student.totalSessionHours ?? 0) - (input.student.conferenceBaselineHours ?? 0))) * 2) / 2)
        : null,
    },
    previous: prev
      ? {
          reportId: prev.reportId,
          periodLabel: prev.periodLabel,
          hours: prev.facts.hours.total,
          attendancePercent: prev.facts.attendance.percent,
          homeworkPercent: prev.facts.homework.percent,
          accuracyPercent: prev.facts.practice?.percent ?? null,
          goals: prev.goals,
        }
      : null,
    deltas: {
      hours: prev ? delta(total, prev.facts.hours.total) : null,
      attendance: prev ? delta(attendancePercent, prev.facts.attendance.percent) : null,
      homework: prev ? delta(homeworkPercent, prev.facts.homework.percent) : null,
      accuracy: prev ? delta(practicePercent, prev.facts.practice?.percent ?? null) : null,
    },
  }
  return { facts, series: points }
}
