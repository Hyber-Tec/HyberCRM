import { createContext, use } from 'react'
import type { Conflict } from '@shared/schedule/conflicts'
import type { SessionStatus } from '@shared/settings/defaults'
import type { DateKey } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import type { EventDoc } from './useScheduleData'

export type Selection =
  | { kind: 'session'; id: string }
  | { kind: 'slot'; staffId: string; dateKey: DateKey; startMin: number; endMin: number }
  | { kind: 'event'; id: string }
  | null

export interface BellItem {
  kind: 'conference' | 'first_session'
  title: string
  subtitle: string
}

export interface ScheduleUi {
  mode: 'admin' | 'tutor'
  today: DateKey
  nowMin: number
  maxLanes: number
  /** Statuses a log can be written for (settings.sessionLogs.allowForStatuses). */
  loggableStatuses?: string[]
  snap: number
  defaultDuration: number
  selection: Selection
  select: (s: Selection) => void
  students: Map<string, WithId<Student>>
  isLocked: (dateKey: DateKey) => boolean
  bellFor: (s: WithId<Session>) => BellItem[]
  /** Why a session may not happen as booked (empty when it's fine). */
  conflictsOf: (s: WithId<Session>) => Conflict[]
  // session actions (admin)
  createAt: (staffId: string, dateKey: DateKey, startMin: number, endMin: number) => void
  editSession: (s: WithId<Session>) => void
  setStatus: (s: WithId<Session>, status: SessionStatus) => void
  moveSession: (id: string, staffId: string, dateKey: DateKey, startMin: number) => void
  resizeSession: (s: WithId<Session>, startMin: number, endMin: number) => void
  reorderSession: (draggedId: string, targetId: string) => void
  openLog: (s: WithId<Session>) => void
  /** A submitted log, read-only. */
  viewLog: (s: WithId<Session>) => void
  openStudent: (s: WithId<Session>, newTab?: boolean) => void
  showBell: (s: WithId<Session>, items: BellItem[]) => void
  /** Tutors free at the session's time with a seat left; null when the schedule can't tell (one tutor shown). */
  reassignOptions: (s: WithId<Session>) => { id: string; name: string; seats: number }[] | null
  reassign: (s: WithId<Session>, staffId: string) => void
  /** Adds the session's time to its tutor's availability that day. */
  makeAvailable: (s: WithId<Session>) => void
  copySession: (s: WithId<Session>) => void
  /** Opens "Create session" with the same student, tutor and time a week later. */
  duplicateSession: (s: WithId<Session>) => void
  trashSession: (s: WithId<Session>) => void
  // tutor rows and empty time
  openEmployee: (staffId: string, newTab?: boolean) => void
  showOnlyTutor: (staffId: string | null) => void
  pasteAt: (staffId: string, dateKey: DateKey, startMin: number) => void
  hasClipboard: () => boolean
  // events
  createEvent: (dateKey: DateKey, startMin: number) => void
  editEvent: (e: WithId<EventDoc>, dateKey: DateKey) => void
  moveEvent: (e: WithId<EventDoc>, startMin: number) => void
  deleteEvent: (e: WithId<EventDoc>) => void
  // day
  editDay: (dateKey: DateKey) => void
  /** A tutor's color, for their avatar on the row (when known). */
  tutorColor?: (staffId: string) => string | undefined
}

export const ScheduleUiContext = createContext<ScheduleUi | null>(null)

export function useScheduleUi(): ScheduleUi {
  const ctx = use(ScheduleUiContext)
  if (!ctx) throw new Error('useScheduleUi must be used inside the schedule')
  return ctx
}
