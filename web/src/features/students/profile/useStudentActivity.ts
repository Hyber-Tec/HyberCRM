import { orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { buildReportFacts } from '@shared/reports/facts'
import { progressStatus } from '@shared/reports/status'
import type { ReportFacts, ReportProgress } from '@shared/reports/types'
import { type SessionLog, averageRating } from '@shared/sessions/logs'
import { type DateKey, addDays, nowMinutes, startOfWeek, todayKey } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import type { AnyReport } from '@/features/reports/model'
import { branchCol, useQuery } from '@/lib/firestore'

export interface StudentTutor {
  id: string
  name: string
  subjects: string[]
  logs: number
}

export interface PracticeWeek {
  start: DateKey
  attempted: number
  accuracy: number
}

export interface StudentActivity {
  /** Submitted session logs, newest first. */
  logs: WithId<SessionLog>[]
  /** Sessions (not deleted), oldest first. */
  sessions: WithId<Session>[]
  reports: WithId<AnyReport>[]
  lastReportTo: Map<string, DateKey>
  /** The progress-report figures and status over every logged session. */
  summary: { facts: ReportFacts; progress: ReportProgress } | null
  attendance: { attended: number; missed: number; percent: number | null }
  avgRating: number | null
  /** The next session that will happen (not canceled or a no-show). */
  next: WithId<Session> | null
  tutors: StudentTutor[]
  /** Practice questions from the logs, by week (weeks with practice only). */
  practiceWeeks: PracticeWeek[]
  /** Average logged hours a week over the last four weeks. */
  weeklyHours: number
  today: DateKey
  nowMin: number
  loading: boolean
}

/**
 * Everything the student page shows about a student's sessions, logs and
 * reports, loaded once for the profile column and the tabs. Tutors see what
 * they may read: their own sessions, and every log only when the branch allows it.
 */
export function useStudentActivity(student: WithId<Student>, mode: 'admin' | 'tutor'): StudentActivity {
  const { branchId, staffId, settings, timezone } = useBranch()
  const seeAllLogs = mode === 'admin' || settings.sessionLogs.tutorsSeeAllLogs
  const logsQ = useMemo(() => {
    const base = branchCol(branchId, COL.sessionLogs)
    if (seeAllLogs) return query(base, where('studentId', '==', student.id), where('status', '==', 'submitted'), orderBy('dateKey', 'desc'))
    return staffId ? query(base, where('tutorId', '==', staffId), orderBy('dateKey', 'desc')) : null
  }, [branchId, student.id, seeAllLogs, staffId])
  const logsState = useQuery<SessionLog>(logsQ, `student-logs-${student.id}-${seeAllLogs}`)
  const reportsQ = useMemo(
    () =>
      mode === 'admin'
        ? query(branchCol(branchId, COL.progressReports), where('studentId', '==', student.id), orderBy('generatedAt', 'desc'))
        : query(branchCol(branchId, COL.progressReports), where('studentId', '==', student.id), where('sharedWithParents', '==', true), orderBy('generatedAt', 'desc')),
    [branchId, student.id, mode],
  )
  const reportsState = useQuery<AnyReport>(reportsQ, `student-reports-${student.id}-${mode}`)
  const sessQ = useMemo(() => {
    const base = branchCol(branchId, COL.sessions)
    if (mode === 'tutor') return staffId ? query(base, where('studentId', '==', student.id), where('tutorId', '==', staffId), orderBy('dateKey', 'desc')) : null
    return query(base, where('studentId', '==', student.id), orderBy('dateKey', 'desc'))
  }, [branchId, student.id, mode, staffId])
  const sessState = useQuery<Session>(sessQ, `student-sessions-${student.id}-${mode}`)

  const today = todayKey(timezone)
  const nowMin = nowMinutes(timezone)
  const logs = useMemo(
    () =>
      logsState.data
        .filter((l) => l.studentId === student.id && l.status === 'submitted')
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.startMin - a.startMin),
    [logsState.data, student.id],
  )
  const sessions = useMemo(
    () => sessState.data.filter((s) => !s.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin),
    [sessState.data],
  )

  // The same figures and status rule as progress reports, over every logged session.
  const summary = useMemo(() => {
    if (!logs.length) return null
    const first = logs.reduce((m, l) => (l.dateKey < m ? l.dateKey : m), logs[0].dateKey)
    const { facts } = buildReportFacts({
      period: { from: first, to: today > first ? today : first },
      // No sessions are passed, so "now" only matters for the period's end.
      nowMs: 0,
      today,
      student: { totalSessionHours: student.totalSessionHours ?? 0, conferenceBaselineHours: 0 },
      sessions: [],
      logs,
      upcoming: [],
      dimensions: settings.sessionLogs.ratingDimensions,
      loggableStatuses: settings.sessionLogs.allowForStatuses,
      conference: { enabled: false, everyHours: 0 },
      previous: null,
    })
    return { facts, progress: progressStatus(facts, logs, settings.progressReports.risk) }
  }, [logs, settings, today, student.totalSessionHours])

  const weekStartsOn = settings.general.weekStartsOn
  const derived = useMemo(() => {
    const happened = (s: Session) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin)
    const past = sessions.filter(happened)
    const attended = past.filter((s) => s.status === 'present').length
    const missed = past.filter((s) => s.status === 'no_show').length
    const next = sessions.find((s) => !happened(s) && s.status !== 'canceled' && s.status !== 'no_show') ?? null

    const ratings = logs.map((l) => averageRating(l.ratings)).filter((v): v is number => v !== null)
    const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null

    // Tutors who taught the student (by logs), then anyone else on their sessions.
    const byTutor = new Map<string, StudentTutor>()
    for (const l of logs) {
      const t = byTutor.get(l.tutorId) ?? { id: l.tutorId, name: l.tutorName, subjects: [], logs: 0 }
      t.logs++
      if (l.subject && !t.subjects.includes(l.subject)) t.subjects.push(l.subject)
      byTutor.set(l.tutorId, t)
    }
    for (const s of sessions) {
      if (s.status === 'canceled' || byTutor.has(s.tutorId)) continue
      byTutor.set(s.tutorId, { id: s.tutorId, name: s.tutorName, subjects: s.subject ? [s.subject] : [], logs: 0 })
    }
    const tutors = [...byTutor.values()].sort((a, b) => b.logs - a.logs || a.name.localeCompare(b.name))

    // Practice accuracy by week, from the questions tutors record in session logs.
    const weeks = new Map<DateKey, { attempted: number; correct: number }>()
    for (const l of logs) {
      const attempted = l.questionsAttempted ?? 0
      if (attempted <= 0) continue
      const w = startOfWeek(l.dateKey, weekStartsOn)
      const cur = weeks.get(w) ?? { attempted: 0, correct: 0 }
      cur.attempted += attempted
      cur.correct += Math.max(0, attempted - (l.questionsWrong ?? 0))
      weeks.set(w, cur)
    }
    const practiceWeeks = [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, v]) => ({ start, attempted: v.attempted, accuracy: Math.round((v.correct / v.attempted) * 100) }))

    const since = addDays(today, -28)
    const recent = logs.filter((l) => l.dateKey > since && l.dateKey <= today).reduce((n, l) => n + (l.usedHours ?? 0), 0)
    return {
      attendance: { attended, missed, percent: attended + missed ? Math.round((attended / (attended + missed)) * 100) : null },
      next,
      avgRating,
      tutors,
      practiceWeeks,
      weeklyHours: Math.round((recent / 4) * 10) / 10,
    }
  }, [sessions, logs, today, nowMin, weekStartsOn])

  const reports = reportsState.data
  const lastReportTo = useMemo(() => {
    const m = new Map<string, DateKey>()
    for (const r of reports) if (!m.has(r.studentId) || r.endDate > m.get(r.studentId)!) m.set(r.studentId, r.endDate)
    return m
  }, [reports])

  return {
    logs,
    sessions,
    reports,
    lastReportTo,
    summary,
    ...derived,
    today,
    nowMin,
    loading: logsState.loading || sessState.loading,
  }
}
