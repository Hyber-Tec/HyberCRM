import { isInactiveStudent } from '../people'
import type { SessionStatus } from '../settings/defaults'
import type { DateKey } from '../time'
import type { StudentStatus } from '../types'

export interface FirstSessionCandidate {
  id: string
  studentId: string
  dateKey: DateKey
  startMin: number
  status: SessionStatus
  isDeleted?: boolean | null
}

export interface FirstSessionStudent {
  status: StudentStatus
  firstSessionDate: DateKey | null
  lastSessionDate: DateKey | null
  totalSessionHours: number
}

/**
 * The "first session" notice (True Education's bell, `schedule.alerts.firstSession`): the student has no history yet
 * (no logged session, no hours), is still coming, and this is their first session: on their recorded first-session
 * date, or else the earliest of `known` (the sessions the viewer can see for that student) that isn't canceled or
 * deleted. Canceled sessions never carry it.
 */
export function isFirstSession(session: FirstSessionCandidate, student: FirstSessionStudent, known: readonly FirstSessionCandidate[]): boolean {
  if (session.status === 'canceled' || session.isDeleted) return false
  if (student.lastSessionDate || student.totalSessionHours > 0) return false
  if (isInactiveStudent(student.status)) return false
  if (student.firstSessionDate) return student.firstSessionDate === session.dateKey
  const live = [...known, session].filter((s) => s.studentId === session.studentId && s.status !== 'canceled' && !s.isDeleted)
  const first = live.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.id.localeCompare(b.id))[0]
  return first?.id === session.id
}
