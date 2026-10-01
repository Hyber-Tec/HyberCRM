import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { type ScheduleEvent, occursOn } from '@shared/schedule/events'
import { type DateKey, dateRange } from '@shared/time'
import type { Availability, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useDayConfigs } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'

export type EventDoc = ScheduleEvent & { isRecurring: boolean; createdBy?: string; updatedAt?: unknown }

/** Live schedule data for a date range (sessions, availability, day configs, events). */
export function useScheduleData(from: DateKey, to: DateKey, tutorFilter: string | null) {
  const { branchId } = useBranch()

  const sessionsQ = useMemo(() => {
    const base = branchCol(branchId, COL.sessions)
    return tutorFilter
      ? query(base, where('tutorId', '==', tutorFilter), where('dateKey', '>=', from), where('dateKey', '<=', to))
      : query(base, where('dateKey', '>=', from), where('dateKey', '<=', to))
  }, [branchId, from, to, tutorFilter])
  const sessions = useQuery<Session>(sessionsQ, `sched-sessions-${branchId}-${from}-${to}-${tutorFilter}`)

  const availQ = useMemo(
    () => query(branchCol(branchId, COL.availability), where('dateKey', '>=', from), where('dateKey', '<=', to)),
    [branchId, from, to],
  )
  const availability = useQuery<Availability>(availQ, `sched-avail-${branchId}-${from}-${to}`)
  const dayConfigs = useDayConfigs(from, to)

  const oneOffQ = useMemo(
    () =>
      query(branchCol(branchId, COL.events), where('isRecurring', '==', false), where('dateKey', '>=', from), where('dateKey', '<=', to)),
    [branchId, from, to],
  )
  const recurringQ = useMemo(() => query(branchCol(branchId, COL.events), where('isRecurring', '==', true)), [branchId])
  const oneOff = useQuery<EventDoc>(oneOffQ, `sched-events-${branchId}-${from}-${to}`)
  const recurring = useQuery<EventDoc>(recurringQ, `sched-revents-${branchId}`)

  const live = useMemo(() => sessions.data.filter((s) => !s.isDeleted), [sessions.data])

  const sessionsByDate = useMemo(() => {
    const m = new Map<DateKey, WithId<Session>[]>()
    for (const s of live) m.set(s.dateKey, [...(m.get(s.dateKey) ?? []), s])
    return m
  }, [live])

  const availabilityByKey = useMemo(() => new Map(availability.data.map((a) => [`${a.staffId}|${a.dateKey}`, a])), [availability.data])

  const eventsByDate = useMemo(() => {
    const m = new Map<DateKey, WithId<EventDoc>[]>()
    const all = [...oneOff.data, ...recurring.data]
    for (const d of dateRange(from, to)) {
      const list = all.filter((e) => occursOn(e, d)).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
      if (list.length) m.set(d, list)
    }
    return m
  }, [oneOff.data, recurring.data, from, to])

  return {
    sessions: live,
    sessionsByDate,
    availabilityByKey,
    dayConfigs: dayConfigs.map,
    eventsByDate,
    loading: sessions.loading || availability.loading,
    error: sessions.error ?? availability.error ?? oneOff.error ?? recurring.error,
  }
}
