import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuCalendarCog, LuCalendarDays, LuPlus } from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours, effectiveRanges, rangesContain } from '@shared/availability'
import { isInactiveStudent } from '@shared/people'
import type { Conflict } from '@shared/schedule/conflicts'
import { buildDayRows, orderTutors } from '@shared/schedule/dayModel'
import { fitsCapacity, seatsLeft, unionMinutes } from '@shared/schedule/lanes'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import { canLog } from '@shared/sessions/logs'
import type { ScheduleView, SessionStatus } from '@shared/settings/defaults'
import {
  type DateKey,
  addDays,
  addMonths,
  diffDays,
  formatDateKey,
  formatTimeRange,
  nowMinutes,
  startOfMonth,
  todayKey,
  weekDays,
} from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useMembers, useStaffList, useStudentList, useSubjects } from '@/features/data/hooks'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLoadWindow } from '@/lib/useLoadWindow'
import { cn } from '@/lib/utils'
import { LOGGED_STAYS_PRESENT, type ScheduleCtx, createSession, deleteSession, reorderSessions, updateSession } from './api'
import { computeConflicts } from './conflicts'
import { writeAvailability } from '@/features/availability/api'
import { useNavigate } from 'react-router'
import { type BellItem, type ScheduleUi, ScheduleUiContext, type Selection } from './context'
import { DaySection } from './DaySection'
import { BellDialog } from './dialogs/BellDialog'
import { DayEditDialog } from './dialogs/DayEditDialog'
import { DuplicateDialog } from './dialogs/DuplicateDialog'
import { EventDialog, type EventDialogState } from './dialogs/EventDialog'
import { SessionDialog, type SessionDialogState } from './dialogs/SessionDialog'
import { TrashDialog } from './dialogs/TrashDialog'
import { TutorOrderDialog } from './dialogs/TutorOrderDialog'
import { deleteEvent, moveEventTime } from './eventsApi'
import { MonthView } from './MonthView'
import { useScheduleData } from './useScheduleData'
import { useShifts } from '@/features/timeclock/api'
import type { ClockInterval } from '@shared/schedule/dayModel'
import { useScheduleRoute } from './useScheduleRoute'
import { type RailNumbers, type RailTutor, ScheduleMenu, ScheduleRail, SlimRail, ViewSwitch } from './ScheduleRail'
import { WeekEventHeader } from './WeekEventHeader'

const CLIP_KEY = 'hyber:schedule-clipboard'
// The redesign starts everyone at 100% (the old key held True Education's 80%).
const ZOOM_KEY = 'hyber:schedule-zoom-v2'

interface Clip {
  studentId: string
  studentName: string
  studentGrade: string
  subjectId: string | null
  subject: string
  note: string
  durationMin: number
}

function readClip(): Clip | null {
  try {
    return JSON.parse(localStorage.getItem(CLIP_KEY) ?? 'null') as Clip | null
  } catch {
    return null
  }
}

const NO_CONFLICTS: Conflict[] = []

const PANEL_KEY = 'hyber:schedule-panel'

function readPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== 'closed'
  } catch {
    return true
  }
}

export function SchedulePage() {
  const branch = useBranch()
  const { branchId, settings, timezone, actor } = branch
  const isMobile = useIsMobile()
  const route = useScheduleRoute(`/${branchId}/admin/schedule`)
  const { view, date } = route
  const weekStartsOn = settings.general.weekStartsOn
  const [today, setToday] = useState(() => todayKey(timezone))
  const [nowMin, setNowMin] = useState(() => nowMinutes(timezone))
  useEffect(() => {
    const t = setInterval(() => {
      setToday(todayKey(timezone))
      setNowMin(nowMinutes(timezone))
    }, 15_000)
    return () => clearInterval(t)
  }, [timezone])

  const [tutorFilter, setTutorFilter] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  // The floating panel (TE's week bar): opened and closed by hand or with Escape; remembered in this browser.
  const [panelOpen, setPanelOpenState] = useState(() => readPanelOpen())
  const setPanelOpen = useCallback((open: boolean | ((o: boolean) => boolean)) => {
    setPanelOpenState((prev) => {
      const next = typeof open === 'function' ? open(prev) : open
      try {
        localStorage.setItem(PANEL_KEY, next ? 'open' : 'closed')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])
  const [topMonth, setTopMonth] = useState<DateKey | null>(null)
  const [zoom, setZoomState] = useState(() => {
    try {
      return Number(localStorage.getItem(ZOOM_KEY) ?? '1') || 1
    } catch {
      return 1
    }
  })
  const setZoom = (z: number) => {
    setZoomState(z)
    try {
      localStorage.setItem(ZOOM_KEY, String(z))
    } catch {
      /* ignore */
    }
  }

  const [sessionDialog, setSessionDialog] = useState<SessionDialogState>(null)
  const [eventDialog, setEventDialog] = useState<EventDialogState>(null)
  const [dayEdit, setDayEdit] = useState<DateKey | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [bell, setBell] = useState<{ session: WithId<Session>; items: BellItem[] } | null>(null)

  const { data: staff } = useStaffList()
  const { data: students } = useStudentList()
  const { data: subjects } = useSubjects()
  const { data: members } = useMembers()
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])

  // Visible range (Month view scrolls: it loads the months around what's on screen)
  const monthWindow = useLoadWindow(date)
  const range = useMemo(() => {
    if (view === 'day') return { from: date, to: date }
    if (view === 'week') {
      const days = weekDays(date, weekStartsOn)
      return { from: days[0], to: days[6] }
    }
    return { from: monthWindow.from, to: monthWindow.to }
  }, [view, date, weekStartsOn, monthWindow.from, monthWindow.to])

  // Every tutor's sessions load (the rail counts them all); the tutor filter only changes the rows shown.
  const data = useScheduleData(range.from, range.to, null, { eventsOnly: view === 'month', keepPrevious: view === 'month' })
  const { data: shifts } = useShifts(range.from, range.to, null, view !== 'month')
  const clocksByKey = useMemo(() => {
    const m = new Map<string, ClockInterval[]>()
    for (const sh of shifts) {
      const endMin = sh.status === 'open' ? -1 : sh.outDateKey && sh.outDateKey > sh.dateKey ? 1440 : (sh.outMin ?? sh.inMin)
      const key = `${sh.staffId}|${sh.dateKey}`
      m.set(key, [...(m.get(key) ?? []), { id: sh.id, startMin: sh.inMin, endMin, open: sh.status === 'open' }].sort((a, b) => a.startMin - b.startMin))
    }
    return m
  }, [shifts])
  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, data.dayConfigs), [settings, data.dayConfigs])
  const isClosed = useCallback((d: DateKey) => !hoursOf(d).isOpen, [hoursOf])
  const isLocked = useCallback((d: DateKey) => d < today, [today])

  const tutors = useMemo(
    () =>
      orderTutors(
        staff.filter((s) => s.role === 'tutor' && s.status !== 'finished'),
        settings.schedule.tutorOrder,
      ).map((s) => ({ id: s.id, name: s.name })),
    [staff, settings.schedule.tutorOrder],
  )
  const visibleTutors = tutorFilter ? tutors.filter((t) => t.id === tutorFilter) : tutors

  const days = useMemo(() => {
    if (view === 'day') return [date]
    // Closed days stay hidden unless sessions are still booked on them (they show as conflicts).
    if (view === 'week') return weekDays(date, weekStartsOn).filter((d) => !isClosed(d) || (data.sessionsByDate.get(d) ?? []).some((s) => s.status !== 'canceled'))
    return []
  }, [view, date, weekStartsOn, isClosed, data.sessionsByDate])

  const maxLanes = branch.rules.maxStudentsPerTutor
  const conflicts = useMemo(
    () =>
      computeConflicts({
        sessions: data.sessions,
        availabilityByKey: data.availabilityByKey,
        hoursOf,
        staffById: staffMap,
        members,
        studentsById: studentMap,
        maxPerTutor: maxLanes,
        today,
        nowMin,
      }),
    [data.sessions, data.availabilityByKey, hoursOf, staffMap, members, studentMap, maxLanes, today, nowMin],
  )
  const conflictsOf = useCallback((s: WithId<Session>) => conflicts.get(s.id) ?? NO_CONFLICTS, [conflicts])
  const sections = useMemo(
    () =>
      days.map((d) => {
        const hours = hoursOf(d)
        const rows = buildDayRows({
          dateKey: d,
          today,
          hours,
          tutors: visibleTutors,
          // Only the part of saved availability inside that date's opening hours counts.
          availability: (id) => {
            const a = data.availabilityByKey.get(`${id}|${d}`)
            return a ? { ranges: effectiveRanges(a.ranges, hours), unavailable: a.unavailable, hidden: a.hidden } : null
          },
          // Showing one tutor: only their sessions (others would get rows of their own).
          sessions: (data.sessionsByDate.get(d) ?? []).filter((s) => !tutorFilter || s.tutorId === tutorFilter),
          clocks: (id) => (clocksByKey.get(`${id}|${d}`) ?? []).map((c) => (c.open ? { ...c, endMin: d === today ? nowMin : 1440 } : c)),
          maxLanes,
          addEmptyLane: true,
          nameFor: (id) => staffMap.get(id)?.name ?? 'Former tutor',
        })
        return { dateKey: d, hours, rows, events: data.eventsByDate.get(d) ?? [] }
      }),
    [days, hoursOf, today, nowMin, visibleTutors, tutorFilter, data.availabilityByKey, data.sessionsByDate, data.eventsByDate, maxLanes, staffMap, clocksByKey],
  )

  const ctx: ScheduleCtx = useMemo(() => ({ branchId, actor, timezone, settings, maxStudentsPerTutor: maxLanes }), [branchId, actor, timezone, settings, maxLanes])
  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message.includes('permission') ? 'This change isn’t allowed (past day or no access).' : (e as Error).message)
    }
  }, [])

  // Sessions by id (visible range)
  const sessionById = useMemo(() => new Map(data.sessions.map((s) => [s.id, s])), [data.sessions])

  // ------------------------------------------------------------- bell items
  const firstSessionIds = useMemo(() => {
    const first = new Map<string, WithId<Session>>()
    for (const s of [...data.sessions].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)) {
      if (s.status === 'canceled' || first.has(s.studentId)) continue
      first.set(s.studentId, s)
    }
    return new Set([...first.values()].map((s) => s.id))
  }, [data.sessions])

  const bellFor = useCallback(
    (s: WithId<Session>): BellItem[] => {
      const st = studentMap.get(s.studentId)
      if (!st) return []
      const items: BellItem[] = []
      const noteDate = branch.rules.conferences.enabled ? st.conference?.lastNoteDate : null
      const days = settings.schedule.alerts.conferenceNoteDays
      if (noteDate && diffDays(noteDate, today) >= 0 && diffDays(noteDate, today) <= days) {
        items.push({ kind: 'conference', title: 'Parent conference note', subtitle: `Date: ${formatDateKey(noteDate, 'medium')}` })
      }
      if (settings.schedule.alerts.firstSession && s.status !== 'canceled') {
        const noHistory = !st.lastSessionDate && !(st.totalSessionHours > 0)
        const isFirst = st.firstSessionDate ? st.firstSessionDate === s.dateKey : firstSessionIds.has(s.id)
        if (noHistory && isFirst && !isInactiveStudent(st.status)) {
          items.push({ kind: 'first_session', title: 'First session', subtitle: 'This student is attending a first session.' })
        }
      }
      return items
    },
    [studentMap, settings.schedule.alerts, today, firstSessionIds, branch.rules.conferences.enabled],
  )

  // ------------------------------------------------------------- actions
  const navigate = useNavigate()
  const openLog = useCallback(
    (s: WithId<Session>) => {
      if (s.logStatus !== 'submitted' && !canLog(s.status, settings.sessionLogs.allowForStatuses)) {
        toast.info(`${SESSION_STATUS_LABELS[s.status]} sessions don’t take a session log.`)
        return
      }
      window.open(`/${branchId}/session-log/${s.id}`, '_blank', 'noopener')
    },
    [branchId, settings.sessionLogs.allowForStatuses],
  )
  const viewLog = useCallback(
    (s: WithId<Session>) => window.open(`/${branchId}/session-log/${s.id}/view`, '_blank', 'noopener'),
    [branchId],
  )

  const reassignOptions = useCallback(
    (s: WithId<Session>) => {
      // With one tutor shown, other tutors' sessions aren't loaded: the edit dialog checks instead.
      if (tutorFilter) return null
      const hours = hoursOf(s.dateKey)
      if (!hours.isOpen) return []
      return tutors.flatMap((t) => {
        if (t.id === s.tutorId || staffMap.get(t.id)?.status !== 'active') return []
        const a = data.availabilityByKey.get(`${t.id}|${s.dateKey}`)
        const ranges = a && !a.unavailable ? effectiveRanges(a.ranges, hours) : []
        if (!rangesContain(ranges, s.startMin, s.endMin)) return []
        const theirs = (data.sessionsByDate.get(s.dateKey) ?? []).filter((x) => x.tutorId === t.id && x.status !== 'canceled')
        const seats = seatsLeft(theirs, s.startMin, s.endMin, maxLanes)
        return seats > 0 ? [{ id: t.id, name: t.name, seats }] : []
      })
    },
    [tutorFilter, hoursOf, tutors, staffMap, data.availabilityByKey, data.sessionsByDate, maxLanes],
  )

  const moveSession = useCallback(
    (id: string, staffId: string, dateKey: DateKey, startMin: number) => {
      const s = sessionById.get(id)
      if (!s) return
      if (isLocked(s.dateKey) || isLocked(dateKey)) return toast.error('Past days can’t be changed.')
      const duration = Math.max(5, s.endMin - s.startMin)
      const endMin = startMin + duration
      const avail = data.availabilityByKey.get(`${staffId}|${dateKey}`)
      const ranges = avail && !avail.unavailable ? effectiveRanges(avail.ranges, hoursOf(dateKey)) : []
      if (!rangesContain(ranges, startMin, endMin)) {
        return toast.error('This start time does not fit the full session duration within the tutor’s availability.')
      }
      const others = (data.sessionsByDate.get(dateKey) ?? []).filter((x) => x.tutorId === staffId && x.status !== 'canceled')
      if (s.status !== 'canceled' && !fitsCapacity(others, startMin, endMin, maxLanes, s.id)) {
        return toast.error(`This tutor already has ${maxLanes} students at that time.`)
      }
      if (staffId === s.tutorId && dateKey === s.dateKey && startMin === s.startMin) return
      const tutor = staffMap.get(staffId)
      void run(() =>
        updateSession(ctx, s, { tutorId: staffId, tutorName: tutor?.name ?? s.tutorName, dateKey, startMin, endMin }),
      )
      setSelection({ kind: 'session', id })
    },
    [sessionById, isLocked, data.availabilityByKey, hoursOf, data.sessionsByDate, maxLanes, staffMap, run, ctx],
  )

  const setStatus = useCallback(
    (s: WithId<Session>, status: SessionStatus) => {
      if (status === s.status) return
      if (isLocked(s.dateKey)) return toast.error('Past days can’t be changed.')
      if (s.logStatus === 'submitted' && status !== 'present') return toast.error(LOGGED_STAYS_PRESENT)
      if (s.status === 'canceled') {
        const others = (data.sessionsByDate.get(s.dateKey) ?? []).filter((x) => x.tutorId === s.tutorId && x.status !== 'canceled')
        if (!fitsCapacity(others, s.startMin, s.endMin, maxLanes, s.id)) return toast.error('It is already full.')
      }
      void run(() => updateSession(ctx, s, { status }), `Status changed to ${SESSION_STATUS_LABELS[status]}`)
      if (s.status === 'canceled') {
        // Un-canceling checks seats only: say so when the session comes back in conflict.
        const back = computeConflicts({
          sessions: data.sessions.map((x) => (x.id === s.id ? { ...x, status } : x)),
          availabilityByKey: data.availabilityByKey,
          hoursOf,
          staffById: staffMap,
          members,
          studentsById: studentMap,
          maxPerTutor: maxLanes,
          today,
          nowMin,
        }).get(s.id)
        if (back?.length) toast.warning('The session is back, but it’s in conflict', { description: back[0].message })
      }
    },
    [isLocked, data.sessionsByDate, data.sessions, data.availabilityByKey, hoursOf, staffMap, members, studentMap, maxLanes, run, ctx, today, nowMin],
  )

  const reorder = useCallback(
    (draggedId: string, targetId: string) => {
      const a = sessionById.get(draggedId)
      const b = sessionById.get(targetId)
      if (!a || !b || a.tutorId !== b.tutorId || a.dateKey !== b.dateKey || isLocked(a.dateKey)) return
      if (a.status === 'canceled' || b.status === 'canceled' || a.endMin <= b.startMin || b.endMin <= a.startMin) return
      const lo = Math.max(a.startMin, b.startMin)
      const hi = Math.min(a.endMin, b.endMin)
      const group = (data.sessionsByDate.get(a.dateKey) ?? [])
        .filter((x) => x.tutorId === a.tutorId && x.status !== 'canceled' && x.startMin < hi && x.endMin > lo)
        .sort((x, y) => (x.visualOrder ?? 0) - (y.visualOrder ?? 0) || x.startMin - y.startMin || x.endMin - y.endMin)
      const without = group.filter((x) => x.id !== a.id)
      const idx = without.findIndex((x) => x.id === b.id)
      without.splice(idx, 0, a)
      const updates = without.map((x, i) => ({ id: x.id, visualOrder: i })).filter((u) => (sessionById.get(u.id)?.visualOrder ?? 0) !== u.visualOrder)
      if (updates.length) void run(() => reorderSessions(ctx, updates))
    },
    [sessionById, isLocked, data.sessionsByDate, run, ctx],
  )

  const reassign = useCallback(
    (s: WithId<Session>, staffId: string) => {
      if (isLocked(s.dateKey)) return toast.error('Past days can’t be changed.')
      const tutor = staffMap.get(staffId)
      void run(() => updateSession(ctx, s, { tutorId: staffId, tutorName: tutor?.name ?? s.tutorName }), `Session given to ${tutor?.name ?? 'the tutor'}`)
    },
    [isLocked, staffMap, run, ctx],
  )

  const makeAvailable = useCallback(
    (s: WithId<Session>) => {
      if (isLocked(s.dateKey)) return toast.error('Past days can’t be changed.')
      const a = data.availabilityByKey.get(`${s.tutorId}|${s.dateKey}`)
      const saved = a && !a.unavailable ? a.ranges : []
      const time = formatTimeRange(s.startMin, s.endMin)
      void run(
        () =>
          writeAvailability({
            branchId,
            actor,
            timezone,
            staffId: s.tutorId,
            staffName: s.tutorName,
            via: 'admin',
            days: [{ dateKey: s.dateKey, ranges: [...saved, { startMin: s.startMin, endMin: s.endMin }] }],
            summary: `Made ${s.tutorName} available ${time} on ${formatDateKey(s.dateKey, 'medium')} for ${s.studentName}’s session`,
          }),
        `${s.tutorName} is now available ${time}`,
      )
    },
    [isLocked, data.availabilityByKey, run, branchId, actor, timezone],
  )

  const duplicateSession = useCallback((s: WithId<Session>) => {
    setSessionDialog({
      mode: 'create',
      draft: {
        tutorId: s.tutorId,
        tutorName: s.tutorName,
        studentId: s.studentId,
        studentName: s.studentName,
        studentGrade: s.studentGrade,
        subjectId: s.subjectId,
        subject: s.subject,
        note: s.note,
        status: 'pending',
        dateKey: addDays(s.dateKey, 7),
        startMin: s.startMin,
        endMin: s.endMin,
      },
    })
  }, [])

  const trashSession = useCallback(
    (s: WithId<Session>) => {
      if (isLocked(s.dateKey)) return toast.error('Past days can’t be changed.')
      if (!window.confirm('Delete this session?')) return
      void run(() => deleteSession(ctx, s), 'Session moved to Trash')
      setSelection(null)
    },
    [isLocked, run, ctx],
  )

  // ------------------------------------------------------------- clipboard / hotkeys
  const copySession = useCallback(
    (s: WithId<Session>) => {
      const clip: Clip = {
        studentId: s.studentId,
        studentName: s.studentName,
        studentGrade: studentMap.get(s.studentId)?.grade ?? s.studentGrade,
        subjectId: s.subjectId,
        subject: s.subject,
        note: s.note,
        durationMin: Math.max(5, s.endMin - s.startMin),
      }
      localStorage.setItem(CLIP_KEY, JSON.stringify(clip))
      toast.success('Session copied — select a time and paste')
    },
    [studentMap],
  )

  const copy = useCallback(() => {
    if (selection?.kind !== 'session') return
    const s = sessionById.get(selection.id)
    if (!s) return
    copySession(s)
  }, [selection, sessionById, copySession])

  const pasteAt = useCallback(
    (staffId: string, dateKey: DateKey, startMin: number) => {
      const clip = readClip()
      if (!clip) return toast.info('Copy a session first.')
      if (isLocked(dateKey)) return toast.error('Past days can’t be changed.')
      const endMin = startMin + clip.durationMin
      const avail = data.availabilityByKey.get(`${staffId}|${dateKey}`)
      const ranges = avail && !avail.unavailable ? effectiveRanges(avail.ranges, hoursOf(dateKey)) : []
      if (!rangesContain(ranges, startMin, endMin)) return toast.error('This start time does not fit the full session duration within the tutor’s availability.')
      const others = (data.sessionsByDate.get(dateKey) ?? []).filter((x) => x.tutorId === staffId && x.status !== 'canceled')
      if (!fitsCapacity(others, startMin, endMin, maxLanes)) return toast.error(`This tutor already has ${maxLanes} students at that time.`)
      const tutor = staffMap.get(staffId)
      void run(() =>
        createSession(
          ctx,
          { ...clip, tutorId: staffId, tutorName: tutor?.name ?? '', status: settings.schedule.pasteStatus, dateKey, startMin, endMin },
          'paste',
        ),
      )
    },
    [isLocked, data.availabilityByKey, hoursOf, data.sessionsByDate, maxLanes, staffMap, run, ctx, settings.schedule.pasteStatus],
  )

  const paste = useCallback(() => {
    if (selection?.kind !== 'slot') return
    pasteAt(selection.staffId, selection.dateKey, selection.startMin)
  }, [selection, pasteAt])

  const removeSelected = useCallback(() => {
    if (selection?.kind !== 'session') return
    const s = sessionById.get(selection.id)
    if (!s) return
    if (isLocked(s.dateKey)) return toast.error('Past days can’t be changed.')
    if (!window.confirm('Delete this session?')) return
    void run(() => deleteSession(ctx, s), 'Session moved to Trash')
    setSelection(null)
  }, [selection, sessionById, isLocked, run, ctx])

  const nav = useMemo(() => {
    const step = (dir: 1 | -1) => {
      if (view === 'week') return route.go({ date: addDays(date, 7 * dir) })
      if (view === 'month') return route.go({ date: addMonths(startOfMonth(date), dir) })
      let d = date
      for (let i = 0; i < 14; i++) {
        d = addDays(d, dir)
        if (!isClosed(d)) return route.go({ date: d })
      }
      route.go({ date: addDays(date, dir) })
    }
    const goToday = () => {
      let d = today
      for (let i = 0; i < 7 && isClosed(d); i++) d = addDays(d, 1)
      route.go({ date: view === 'month' ? today : d })
      if (view === 'week') setTimeout(() => document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
    }
    return { prev: () => step(-1), next: () => step(1), today: goToday }
  }, [view, date, route, isClosed, today])

  const anyDialog = !!(sessionDialog || eventDialog || dayEdit || trashOpen || dupOpen || orderOpen || bell)
  const keysRef = useRef({ copy, paste, removeSelected, nav, anyDialog, hasSelection: !!selection })
  keysRef.current = { copy, paste, removeSelected, nav, anyDialog, hasSelection: !!selection }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keysRef.current
      if (k.anyDialog) return
      const t = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable || t.closest('[role="dialog"],[role="menu"],[role="listbox"]')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'c') {
        k.copy()
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        k.paste()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        k.removeSelected()
      } else if (e.key === 'Escape') {
        // Escape clears the selection; with nothing selected it folds or opens the side rail.
        if (k.hasSelection) setSelection(null)
        else setPanelOpen((o) => !o)
      } else if (e.key === 'ArrowLeft' && !mod) {
        k.nav.prev()
      } else if (e.key === 'ArrowRight' && !mod) {
        k.nav.next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPanelOpen])

  // Make the URL explicit on first load.
  useEffect(() => {
    if (!route.explicit) {
      let d = date
      if (view === 'day') for (let i = 0; i < 7 && isClosed(d); i++) d = addDays(d, 1)
      route.go({ view, date: d }, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ui: ScheduleUi = {
    mode: 'admin',
    today,
    nowMin,
    maxLanes,
    loggableStatuses: settings.sessionLogs.allowForStatuses,
    snap: settings.schedule.snapMinutes,
    defaultDuration: settings.schedule.defaultSessionMinutes,
    selection,
    select: setSelection,
    students: studentMap,
    isLocked,
    bellFor,
    conflictsOf,
    createAt: (staffId, dateKey, startMin, endMin) => {
      const t = staffMap.get(staffId)
      setSessionDialog({ mode: 'create', draft: { tutorId: staffId, tutorName: t?.name ?? '', dateKey, startMin, endMin, status: 'pending' } })
    },
    editSession: (s) => setSessionDialog({ mode: 'edit', session: s }),
    setStatus,
    moveSession,
    resizeSession: (s, startMin, endMin) => void run(() => updateSession(ctx, s, { startMin, endMin })),
    reorderSession: reorder,
    openLog,
    viewLog,
    openStudent: (s, newTab) => {
      const path = `/${branchId}/admin/students/${s.studentId}/info`
      if (newTab) window.open(path, '_blank', 'noopener')
      else navigate(path)
    },
    showBell: (session, items) => setBell({ session, items }),
    reassignOptions,
    reassign,
    makeAvailable,
    copySession,
    duplicateSession,
    trashSession,
    openEmployee: (staffId, newTab) => {
      const path = `/${branchId}/admin/employees/directory/${staffId}`
      if (newTab) window.open(path, '_blank', 'noopener')
      else navigate(path)
    },
    showOnlyTutor: (staffId) => setTutorFilter(staffId),
    pasteAt,
    hasClipboard: () => readClip() !== null,
    createEvent: (dateKey, startMin) =>
      setEventDialog({ mode: 'create', dateKey, startMin, endMin: Math.min(startMin + settings.schedule.events.defaultMinutes, hoursOf(dateKey).closeMin) }),
    editEvent: (e) => setEventDialog({ mode: 'edit', event: e }),
    moveEvent: (e, startMin) => void run(() => moveEventTime(ctx, e, startMin)),
    deleteEvent: (e) => {
      if (!window.confirm(e.recurrence ? 'Delete this recurring event? The entire series is removed.' : 'Delete this event?')) return
      void run(() => deleteEvent(ctx, e), 'Event deleted')
    },
    editDay: (d) => setDayEdit(d),
    tutorColor: (id) => staffMap.get(id)?.color,
  }

  // ------------------------------------------------------------- rail
  const shownDays = view === 'day' ? [date] : view === 'week' ? weekDays(date, weekStartsOn) : []
  const railTutors: RailTutor[] = useMemo(() => {
    const inRange = (d: DateKey) => shownDays.includes(d)
    return tutors.map((t) => {
      const own = data.sessions.filter((s) => s.tutorId === t.id && inRange(s.dateKey) && s.status !== 'canceled')
      const minutes = shownDays.reduce((n, d) => n + unionMinutes(own.filter((s) => s.dateKey === d)), 0)
      return {
        id: t.id,
        name: t.name,
        color: staffMap.get(t.id)?.color,
        sessions: own.length,
        minutes,
        conflicts: own.filter((s) => (conflicts.get(s.id) ?? []).length > 0).length,
        clockedIn: (clocksByKey.get(`${t.id}|${today}`) ?? []).some((c) => c.open),
        available: shownDays.some((d) => {
          const a = data.availabilityByKey.get(`${t.id}|${d}`)
          return !!a && !a.unavailable && effectiveRanges(a.ranges, hoursOf(d)).length > 0
        }),
      }
    })
    // shownDays is derived from view, date and weekStartsOn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutors, data.sessions, data.availabilityByKey, view, date, weekStartsOn, staffMap, conflicts, clocksByKey, today, hoursOf])
  const railNumbers: RailNumbers | null = useMemo(() => {
    if (view === 'month') return null
    const list = data.sessions.filter((s) => shownDays.includes(s.dateKey) && s.status !== 'canceled')
    const ended = (s: WithId<Session>) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin)
    return {
      label: view === 'day' ? (date === today ? 'Today' : formatDateKey(date, 'weekdayMedium')) : weekDays(date, weekStartsOn).includes(today) ? 'This week' : `Week of ${formatDateKey(shownDays[0], 'monthDay')}`,
      sessions: list.length,
      conflicts: list.filter((s) => (conflicts.get(s.id) ?? []).length > 0).length,
      pending: list.filter((s) => s.status === 'pending' && !ended(s)).length,
      missingLogs: list.filter((s) => ended(s) && s.logStatus !== 'submitted' && canLog(s.status, settings.sessionLogs.allowForStatuses)).length,
    }
    // shownDays is derived from view, date and weekStartsOn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date, weekStartsOn, data.sessions, today, nowMin, conflicts, settings.sessionLogs.allowForStatuses])

  const monthShown = view === 'month' && topMonth ? topMonth : date
  const railTitle =
    view === 'day'
      ? { title: formatDateKey(date, 'weekdayLong').split(',')[0], subtitle: formatDateKey(date, 'long') }
      : view === 'week'
        ? { title: `Week of ${formatDateKey(weekDays(date, weekStartsOn)[0], 'monthDay')}`, subtitle: `${formatDateKey(weekDays(date, weekStartsOn)[0], 'short')} – ${formatDateKey(weekDays(date, weekStartsOn)[6], 'short')}` }
        : { title: formatDateKey(monthShown, 'monthYear').split(' ')[0], subtitle: monthShown.slice(0, 4) }
  const headTitle =
    view === 'day'
      ? formatDateKey(date, 'weekdayLong').replace(/, \d{4}$/, '')
      : view === 'week'
        ? `${formatDateKey(weekDays(date, weekStartsOn)[0], 'monthDay')} – ${formatDateKey(weekDays(date, weekStartsOn)[6], 'medium')}`
        : formatDateKey(monthShown, 'monthYear')
  const onView = (v: ScheduleView) => {
    if (v === 'day' && view !== 'day') {
      const inWeek = weekDays(date, weekStartsOn).includes(today)
      let d = inWeek ? today : date
      for (let i = 0; i < 7 && isClosed(d); i++) d = addDays(d, 1)
      route.go({ view: v, date: d })
    } else route.go({ view: v })
  }
  const [sheetOpen, setSheetOpen] = useState(false)
  const tools = { zoom, onZoom: setZoom, onDuplicate: () => setDupOpen(true), onTrash: () => setTrashOpen(true), onTutorOrder: () => setOrderOpen(true) }
  const rail = (inSheet: boolean) => (
    <ScheduleRail
      view={view}
      date={date}
      today={today}
      weekStartsOn={weekStartsOn}
      isClosed={isClosed}
      title={railTitle.title}
      subtitle={railTitle.subtitle}
      onView={(v) => {
        onView(v)
        setSheetOpen(false)
      }}
      onDate={(d) => {
        route.go({ date: d })
        setSheetOpen(false)
      }}
      onPrev={nav.prev}
      onNext={nav.next}
      onToday={nav.today}
      tutors={railTutors}
      showNumbers={view !== 'month'}
      tutorFilter={tutorFilter}
      onTutorFilter={(id) => {
        setTutorFilter(id)
        setSheetOpen(false)
      }}
      numbers={railNumbers}
      topMonth={view === 'month' ? topMonth : null}
      onHide={inSheet ? undefined : () => setPanelOpen(false)}
      onClose={inSheet ? () => setSheetOpen(false) : undefined}
      {...tools}
    />
  )
  const filtered = tutorFilter ? staffMap.get(tutorFilter) : null
  const dayLocked = view === 'day' && isLocked(date)

  return (
    <ScheduleUiContext value={ui}>
      <div className="-m-4 flex h-[calc(100svh-3rem)] min-h-0 sm:-m-6 md:h-svh">
        {!isMobile ? (
          <div className={cn('shrink-0 border-r bg-muted/40', panelOpen ? 'w-72' : 'w-14')} data-testid="schedule-panel">
            {panelOpen ? (
              rail(false)
            ) : (
              <SlimRail tutors={railTutors} tutorFilter={tutorFilter} onTutorFilter={setTutorFilter} onShow={() => setPanelOpen(true)} onPrev={nav.prev} onNext={nav.next} />
            )}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b bg-background px-3 py-2.5 sm:px-4">
            {isMobile ? (
              <Button variant="ghost" size="icon" aria-label="Calendar and tutors" onClick={() => setSheetOpen(true)}>
                <LuCalendarDays className="size-5" />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold tracking-tight">
                  {view === 'day' ? (
                    <>
                      <span className="sm:hidden">{formatDateKey(date, 'weekdayMedium')}</span>
                      <span className="hidden sm:inline">{headTitle}</span>
                    </>
                  ) : (
                    headTitle
                  )}
                </h1>
                {view === 'day' && date === today ? <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">TODAY</span> : null}
                {view === 'day' && isClosed(date) ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">CLOSED</span> : null}
                {dayLocked ? <span className="hidden text-xs text-muted-foreground sm:inline">Past · view only</span> : null}
              </div>
              {filtered && view !== 'month' ? (
                <div className="text-xs text-muted-foreground">
                  Showing only {filtered.name} ·{' '}
                  <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setTutorFilter(null)}>
                    Show all
                  </button>
                </div>
              ) : null}
            </div>
            {isMobile || !panelOpen ? <ViewSwitch view={view} onView={onView} /> : null}
            {view === 'day' && !dayLocked ? (
              <>
                <Button variant="outline" size="sm" className="hidden rounded-full sm:inline-flex" onClick={() => setDayEdit(date)}>
                  <LuCalendarCog /> Edit day
                </Button>
                {hoursOf(date).isOpen ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden rounded-full lg:inline-flex"
                    onClick={() =>
                      setEventDialog({ mode: 'create', dateKey: date, startMin: hoursOf(date).openMin, endMin: Math.min(hoursOf(date).openMin + settings.schedule.events.defaultMinutes, hoursOf(date).closeMin) })
                    }
                  >
                    <LuPlus /> Event
                  </Button>
                ) : null}
              </>
            ) : view === 'day' ? (
              <Button variant="outline" size="sm" className="hidden rounded-full sm:inline-flex" onClick={() => setDayEdit(date)}>
                <LuCalendarCog /> Day details
              </Button>
            ) : null}
            <ScheduleMenu {...tools} />
          </div>
          {view === 'month' ? (
            <MonthView
              anchor={date}
              focusDate={date}
              eventsByDate={data.eventsByDate}
              isClosed={isClosed}
              today={today}
              onDay={(d) => route.go({ view: 'day', date: d })}
              onCreateEvent={(d) => setEventDialog({ mode: 'create', dateKey: d, startMin: settings.schedule.events.monthDefaultStartMin, endMin: settings.schedule.events.monthDefaultStartMin + 60 })}
              onEditEvent={(e) => setEventDialog({ mode: 'edit', event: e })}
              onVisibleRangeChange={monthWindow.onVisibleRangeChange}
              onTopMonthChange={setTopMonth}
              className="min-h-0 flex-1"
            />
          ) : (
            <>
              {view === 'week' ? (
                <div className="border-b bg-muted/30 px-3 py-2 sm:px-4">
                  <WeekEventHeader
                    days={weekDays(date, weekStartsOn)}
                    today={today}
                    isClosed={isClosed}
                    eventsByDate={data.eventsByDate}
                    onDay={(d) => document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    onEditEvent={(e) => setEventDialog({ mode: 'edit', event: e })}
                  />
                </div>
              ) : null}
              <div
                className={cn('min-h-0 flex-1 overflow-auto', view === 'week' ? 'bg-muted/30' : 'bg-background')}
                onMouseDown={(e) => e.target === e.currentTarget && setSelection(null)}
                data-testid="schedule-area"
              >
                <div className={cn('w-max min-w-full', view === 'week' && 'p-3 sm:p-4')} style={{ zoom }}>
                  <div className={cn('flex flex-col', view === 'week' && 'gap-6')}>
                    {sections.map((s) => (
                      <DaySection
                        key={s.dateKey}
                        sectionId={`day-${s.dateKey}`}
                        dateKey={s.dateKey}
                        hours={s.hours}
                        rows={s.rows}
                        events={s.events}
                        showHeader={view === 'week'}
                        stickyAxis={view === 'day'}
                      />
                    ))}
                    {sections.length === 0 ? (
                      <div className="m-4 rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
                        {view === 'day' ? `Closed on ${formatDateKey(date, 'weekdayLong')}.` : 'The center is closed all week.'}
                      </div>
                    ) : null}
                  </div>
                  <div className="h-6" />
                </div>
              </div>
            </>
          )}
        </div>
        {isMobile ? (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="left" className="w-[88%] max-w-80 gap-0 overflow-y-auto bg-muted p-0" showCloseButton={false}>
              <SheetHeader className="sr-only">
                <SheetTitle>Schedule</SheetTitle>
              </SheetHeader>
              {rail(true)}
            </SheetContent>
          </Sheet>
        ) : null}
      </div>

      <SessionDialog
        state={sessionDialog}
        conflicts={sessionDialog?.mode === 'edit' ? conflictsOf(sessionDialog.session) : NO_CONFLICTS}
        onClose={() => setSessionDialog(null)}
        students={students.filter((s) => s.status !== 'finished')}
        staff={staff}
        subjects={subjects}
        isLocked={isLocked}
        onSave={async (draft, existing) => {
          if (existing) await updateSession(ctx, existing, draft)
          else await createSession(ctx, draft)
          toast.success(existing ? 'Session updated' : 'Session created')
          if (!existing && draft.dateKey !== date && view === 'day') route.go({ date: draft.dateKey })
        }}
        onDelete={async (s) => {
          await deleteSession(ctx, s)
          toast.success('Session moved to Trash')
        }}
        onOpenLog={openLog}
      />
      <EventDialog state={eventDialog} onClose={() => setEventDialog(null)} ctx={ctx} />
      <DayEditDialog dateKey={dayEdit} onClose={() => setDayEdit(null)} ctx={ctx} tutors={tutors} sessions={dayEdit ? data.sessionsByDate.get(dayEdit) ?? [] : []} availabilityByKey={data.availabilityByKey} dayConfigs={data.dayConfigs} />
      <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} ctx={ctx} tutorFilter={tutorFilter} />
      <DuplicateDialog open={dupOpen} onOpenChange={setDupOpen} ctx={ctx} anchor={today} />
      <TutorOrderDialog open={orderOpen} onOpenChange={setOrderOpen} ctx={ctx} tutors={tutors} />
      <BellDialog state={bell} onClose={() => setBell(null)} />
      {data.error ? <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-destructive px-3 py-2 text-sm text-white">{data.error.message}</div> : null}
    </ScheduleUiContext>
  )
}

