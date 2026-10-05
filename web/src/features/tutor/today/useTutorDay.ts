import { query, where } from 'firebase/firestore'
import { useCallback, useMemo } from 'react'
import type { Announcement } from '@shared/comms'
import { availabilityGaps, dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import type { Conflict } from '@shared/schedule/conflicts'
import { unionMinutes } from '@shared/schedule/lanes'
import { canLog, logIsDue } from '@shared/sessions/logs'
import { type DateKey, addDays, nowMinutes, startOfWeek, todayKey } from '@shared/time'
import type { Availability, Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useMyAnnouncements, useMyReadIds } from '@/features/announcements/api'
import { useDayConfigs, useStudentList } from '@/features/data/hooks'
import { computeConflicts } from '@/features/schedule/conflicts'
import { type ClockShift, useShifts } from '@/features/timeclock/api'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'
import { useMyStaff } from '../hooks'

/** How far ahead Today looks for the next session and for sessions in conflict (four weeks, as admin Home). */
const AHEAD_DAYS = 28

export type NextUp =
  | { kind: 'now'; sessions: WithId<Session>[]; then: WithId<Session> | null }
  | { kind: 'later'; startMin: number; sessions: WithId<Session>[] }
  | { kind: 'day'; dateKey: DateKey; sessions: WithId<Session>[] }
  | { kind: 'none' }

export interface WeekDay {
  dateKey: DateKey
  sessions: number
  done: number
  minutes: number
  isOpen: boolean
}

export interface ClockState {
  open: WithId<ClockShift> | null
  /** Today's finished shifts. */
  closed: WithId<ClockShift>[]
  /** Minutes clocked today (the open shift counts up to now). */
  todayMinutes: number
  weekMinutes: number
}

const ms = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
const byTime = (a: WithId<Session>, b: WithId<Session>) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName)

/**
 * Everything the tutor's Today page shows, from their own sessions,
 * availability, clock shifts and the posts addressed to them: what's on now
 * and next, today's list, what's left to do and how the week looks. All
 * dates and times are the branch's.
 */
export function useTutorDay() {
  const { branchId, staffId, settings, rules, timezone } = useBranch()
  const now = useNow(20_000)
  const today = todayKey(timezone, now)
  const nowMin = nowMinutes(timezone, new Date(now))
  const weekStart = startOfWeek(today, settings.general.weekStartsOn)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const lookback = addDays(today, -settings.home.missingLogLookbackDays)
  const from = lookback < weekStart ? lookback : weekStart
  const to = addDays(today, Math.max(AHEAD_DAYS, settings.availability.leadTimeDays + 1))

  const me = useMyStaff()
  const sessionsQ = useMemo(
    () => (staffId ? query(branchCol(branchId, COL.sessions), where('tutorId', '==', staffId), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [branchId, staffId, from, to],
  )
  const sessionsState = useQuery<Session>(sessionsQ, `tutor-today-sessions-${staffId}-${from}-${to}`)
  const availQ = useMemo(
    () => (staffId ? query(branchCol(branchId, COL.availability), where('staffId', '==', staffId), where('dateKey', '>=', today), where('dateKey', '<=', to)) : null),
    [branchId, staffId, today, to],
  )
  const avail = useQuery<Availability>(availQ, `tutor-today-avail-${staffId}-${today}-${to}`)
  const { map: dayConfigs } = useDayConfigs(from, to)
  const students = useStudentList(!!staffId)
  // From the day before the week (or yesterday): a shift still open from last night counts.
  const shiftFrom = addDays(weekStart < today ? weekStart : today, -1)
  const shifts = useShifts(shiftFrom, today, staffId, !!staffId)
  const feed = useMyAnnouncements(!!staffId)
  const reads = useMyReadIds(!!staffId)

  const studentsById = useMemo(() => new Map(students.data.map((s) => [s.id, s])), [students.data])
  const sessions = useMemo(() => sessionsState.data.filter((s) => !s.isDeleted).sort(byTime), [sessionsState.data])
  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, dayConfigs), [settings, dayConfigs])
  const allowed = settings.sessionLogs.allowForStatuses

  const conflicts = useMemo(
    () =>
      computeConflicts({
        sessions,
        availabilityByKey: new Map(avail.data.map((a) => [`${a.staffId}|${a.dateKey}`, a])),
        hoursOf,
        staffById: null,
        studentsById,
        maxPerTutor: rules.maxStudentsPerTutor,
        today,
        nowMin,
      }),
    [sessions, avail.data, hoursOf, studentsById, rules.maxStudentsPerTutor, today, nowMin],
  )

  const day = useMemo(() => {
    const todays = sessions.filter((s) => s.dateKey === today)
    const active = todays.filter((s) => s.status !== 'canceled')
    const canceled = todays.filter((s) => s.status === 'canceled')
    const current = active.filter((s) => s.startMin <= nowMin && s.endMin > nowMin && s.status !== 'no_show')
    const later = active.filter((s) => s.startMin > nowMin)
    const earlier = active.filter((s) => s.endMin <= nowMin)

    let next: NextUp = { kind: 'none' }
    if (current.length) next = { kind: 'now', sessions: current, then: later[0] ?? null }
    else if (later.length) next = { kind: 'later', startMin: later[0].startMin, sessions: later.filter((s) => s.startMin === later[0].startMin) }
    else {
      const upcoming = sessions.filter((s) => s.dateKey > today && s.status !== 'canceled')
      if (upcoming.length) next = { kind: 'day', dateKey: upcoming[0].dateKey, sessions: upcoming.filter((s) => s.dateKey === upcoming[0].dateKey) }
    }
    return { todays, active, canceled, current, later, earlier, next }
  }, [sessions, today, nowMin])

  const todo = useMemo(() => {
    const logs = sessions.filter((s) => s.dateKey >= lookback && logIsDue(s, today, nowMin, allowed)).sort((a, b) => byTime(b, a))
    const waiting = sessions.filter((s) => conflicts.has(s.id))
    const ranges = new Map(avail.data.map((a) => [a.dateKey, a.ranges]))
    const gaps = availabilityGaps({ today, timeZone: timezone, settings, dayConfigs, rangesOn: (d) => ranges.get(d), now: new Date(now) })
    // Until both lists are in, nothing counts as unread (as the News badge).
    const unread: WithId<Announcement>[] =
      feed.loading || reads.loading
        ? []
        : feed.data.filter((a) => !reads.ids.has(a.id)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || ms(b.createdAt) - ms(a.createdAt))
    return { logs, waiting, gaps, unread, total: logs.length + waiting.length + gaps.length + unread.length }
  }, [sessions, lookback, today, nowMin, allowed, conflicts, avail.data, timezone, settings, dayConfigs, now, reads.ids, reads.loading, feed.data, feed.loading])

  const week = useMemo(() => {
    const days: WeekDay[] = weekDays.map((d) => {
      const list = sessions.filter((s) => s.dateKey === d && s.status !== 'canceled')
      const ended = list.filter((s) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin))
      return {
        dateKey: d,
        sessions: list.length,
        done: ended.length,
        // Booked time is the tutor's: sessions side by side count once.
        minutes: unionMinutes(list),
        isOpen: hoursOf(d).isOpen,
      }
    })
    const inWeek = sessions.filter((s) => s.dateKey >= weekStart && s.dateKey <= weekDays[6] && s.status !== 'canceled')
    const ended = inWeek.filter((s) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin))
    const loggable = ended.filter((s) => canLog(s.status, allowed) || s.logStatus === 'submitted')
    return {
      days,
      sessions: inWeek.length,
      done: ended.length,
      minutes: days.reduce((m, d) => m + d.minutes, 0),
      logged: loggable.filter((s) => s.logStatus === 'submitted').length,
      loggable: loggable.length,
    }
  }, [weekDays, sessions, today, nowMin, hoursOf, weekStart, allowed])

  const clock = useMemo<ClockState>(() => {
    const minutesOf = (s: WithId<ClockShift>) => Math.max(0, ((s.status === 'open' ? now : ms(s.clockOutAt)) - ms(s.clockInAt)) / 60_000)
    const open = shifts.data.find((s) => s.status === 'open') ?? null
    const closed = shifts.data.filter((s) => s.status !== 'open' && s.dateKey === today).sort((a, b) => ms(a.clockInAt) - ms(b.clockInAt))
    const todayMinutes = [...closed, ...(open ? [open] : [])].reduce((m, s) => m + minutesOf(s), 0)
    const weekMinutes = shifts.data.filter((s) => s.dateKey >= weekStart).reduce((m, s) => m + minutesOf(s), 0)
    return { open, closed, todayMinutes, weekMinutes }
  }, [shifts.data, today, now, weekStart])

  return {
    me: me.data,
    now,
    today,
    nowMin,
    weekStart,
    day,
    todo,
    week,
    clock,
    /** Opening hours of a date (per-date hours included). */
    hoursOf,
    conflictsOf: (id: string): Conflict[] => conflicts.get(id) ?? [],
    student: (id: string): WithId<Student> | undefined => studentsById.get(id),
    /** Sessions loaded for the page (the last two weeks to four weeks ahead), for first-session checks. */
    sessions,
    loading: me.loading || sessionsState.loading,
    todoLoading: sessionsState.loading || avail.loading || feed.loading || reads.loading,
  }
}

export type TutorDay = ReturnType<typeof useTutorDay>
