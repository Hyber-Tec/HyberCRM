import { limit, orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { SessionLog } from '@shared/sessions/logs'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'

/**
 * The student's earlier submitted logs (newest first, this session excluded):
 * all of them for admins and when tutors may read every log, otherwise the
 * tutor's own. They feed Prepare and the suggestions in the other steps.
 */
export function usePreviousLogs(session: Pick<WithId<Session>, 'id' | 'studentId'>) {
  const { branchId, settings, isAdmin, staffId } = useBranch()
  const seeAll = isAdmin || settings.sessionLogs.tutorsSeeAllLogs
  const q = useMemo(() => {
    const base = branchCol(branchId, COL.sessionLogs)
    if (seeAll) return query(base, where('studentId', '==', session.studentId), orderBy('dateKey', 'desc'), limit(60))
    return staffId ? query(base, where('studentId', '==', session.studentId), where('tutorId', '==', staffId), orderBy('dateKey', 'desc'), limit(60)) : null
  }, [branchId, session.studentId, seeAll, staffId])
  const { data, loading } = useQuery<SessionLog>(q, `prev-logs-${session.studentId}-${seeAll ? 'all' : staffId}`)
  const logs = useMemo(
    () =>
      data
        .filter((l) => l.id !== session.id && l.status === 'submitted')
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.startMin - a.startMin),
    [data, session.id],
  )
  return { logs, loading }
}

/** Whether an earlier log was in the session's subject (by subject ID when both have one, else by name). */
export function sameSubject(log: Pick<SessionLog, 'subjectId' | 'subject'>, session: Pick<Session, 'subjectId' | 'subject'>) {
  if (session.subjectId && log.subjectId) return log.subjectId === session.subjectId
  const name = (session.subject || '').trim().toLowerCase()
  return !!name && (log.subject || '').trim().toLowerCase() === name
}

/** The earlier log to show by default: same subject (by ID, then name), else the newest. */
export function matchingLog(logs: readonly WithId<SessionLog>[], session: Pick<Session, 'subjectId' | 'subject'>) {
  if (session.subjectId) {
    const byId = logs.find((l) => l.subjectId === session.subjectId)
    if (byId) return byId
  }
  const name = (session.subject || '').trim().toLowerCase()
  return (name && logs.find((l) => (l.subject || '').trim().toLowerCase() === name)) || logs[0] || null
}
