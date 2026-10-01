import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { isInactiveStudent } from '@shared/people'
import { addDays, dateKeyOf, todayKey } from '@shared/time'
import type { Session, SignupRequest, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type ClockShift, useShifts } from '@/features/timeclock/api'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'

export type AttentionItem =
  | { kind: 'missingLog'; id: string; at: number; session: WithId<Session> }
  | { kind: 'autoClockOut'; id: string; at: number; shift: WithId<ClockShift> }
  | { kind: 'signup'; id: string; at: number; request: WithId<SignupRequest> }

export interface NewStudent {
  student: WithId<Student>
  /** Sign-up date (or creation date), if known. */
  since: string | null
}

/**
 * What needs an admin's attention (True Education's Home badge): sessions
 * without a submitted log, unfixed automatic clock-outs, new students nobody
 * has opened yet, plus Hyber's pending sign-up requests. The sidebar badge and
 * the Home page run the same queries, so Firestore shares the listeners.
 */
export function useAttention(enabled = true) {
  const { branchId, timezone, settings } = useBranch()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const logFrom = addDays(today, -settings.home.missingLogLookbackDays)
  const clockFrom = addDays(today, -settings.home.clockLookbackDays)

  const sessionsQ = useMemo(
    () =>
      enabled
        ? query(
            branchCol(branchId, COL.sessions),
            where('logStatus', 'in', ['none', 'draft']),
            where('dateKey', '>=', logFrom),
            where('dateKey', '<=', today),
          )
        : null,
    [branchId, logFrom, today, enabled],
  )
  const sessions = useQuery<Session>(sessionsQ, `attn-sessions-${branchId}-${logFrom}-${today}`)
  const shifts = useShifts(clockFrom, today, null, enabled)
  const studentsQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.students), where('followUpReviewedAt', '==', null)) : null),
    [branchId, enabled],
  )
  const students = useQuery<Student>(studentsQ, `attn-students-${branchId}`)
  const requestsQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.signupRequests), where('status', '==', 'pending')) : null),
    [branchId, enabled],
  )
  const requests = useQuery<SignupRequest>(requestsQ, `attn-requests-${branchId}`)

  return useMemo(() => {
    const loggable = new Set<string>(settings.sessionLogs.allowForStatuses)
    const grace = settings.home.missingLogGraceMinutes * 60_000
    const missingLogs = sessions.data
      .filter((s) => !s.isDeleted && loggable.has(s.status) && s.startAt && s.startAt.toMillis() + grace <= now)
      .sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis())
    const autoClockOuts = shifts.data
      .filter((s) => s.autoClosed && !s.autoCorrected && s.status === 'closed')
      .sort((a, b) => b.clockInAt.toMillis() - a.clockInAt.toMillis())
    const pendingRequests = requests.data.slice().sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))

    const recentFrom = addDays(today, -14)
    const newStudents: NewStudent[] = students.data
      .map((student) => ({
        student,
        since: student.signUpDate ?? (student.createdAt ? dateKeyOf(student.createdAt.toDate(), timezone) : null),
      }))
      .filter(({ student, since }) => !isInactiveStudent(student.status) && (student.status === 'signed_up' || (since !== null && since >= recentFrom)))
      .sort((a, b) => (b.since ?? '').localeCompare(a.since ?? '') || a.student.name.localeCompare(b.student.name))

    const items: AttentionItem[] = [
      ...missingLogs.map((session) => ({ kind: 'missingLog' as const, id: `log-${session.id}`, at: session.startAt.toMillis(), session })),
      ...autoClockOuts.map((shift) => ({ kind: 'autoClockOut' as const, id: `clock-${shift.id}`, at: shift.clockInAt.toMillis(), shift })),
      ...pendingRequests.map((request) => ({ kind: 'signup' as const, id: `signup-${request.id}`, at: request.createdAt?.toMillis() ?? now, request })),
    ].sort((a, b) => b.at - a.at)

    return {
      items,
      missingLogs,
      autoClockOuts,
      pendingRequests,
      newStudents,
      shifts: shifts.data,
      total: items.length + newStudents.length,
      loading: sessions.loading || shifts.loading || students.loading || requests.loading,
      now,
      today,
    }
  }, [sessions, shifts, students, requests, settings, now, today, timezone])
}
