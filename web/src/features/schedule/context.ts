import { createContext, use } from 'react'
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
  master: boolean
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
  // session actions (admin)
  createAt: (staffId: string, dateKey: DateKey, startMin: number, endMin: number) => void
  editSession: (s: WithId<Session>) => void
  setStatus: (s: WithId<Session>, status: SessionStatus) => void
  moveSession: (id: string, staffId: string, dateKey: DateKey, startMin: number) => void
  resizeSession: (s: WithId<Session>, startMin: number, endMin: number) => void
  reorderSession: (draggedId: string, targetId: string) => void
  openLog: (s: WithId<Session>) => void
  showBell: (s: WithId<Session>, items: BellItem[]) => void
  // events
  createEvent: (dateKey: DateKey, startMin: number) => void
  editEvent: (e: WithId<EventDoc>, dateKey: DateKey) => void
  moveEvent: (e: WithId<EventDoc>, startMin: number) => void
  // day
  editDay: (dateKey: DateKey) => void
}

export const ScheduleUiContext = createContext<ScheduleUi | null>(null)

export function useScheduleUi(): ScheduleUi {
  const ctx = use(ScheduleUiContext)
  if (!ctx) throw new Error('useScheduleUi must be used inside the schedule')
  return ctx
}
