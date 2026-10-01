import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuPanelRight } from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours, rangesContain } from '@shared/availability'
import { isInactiveStudent } from '@shared/people'
import { buildDayRows, orderTutors } from '@shared/schedule/dayModel'
import { fitsCapacity } from '@shared/schedule/lanes'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import type { SessionStatus } from '@shared/settings/defaults'
import {
  type DateKey,
  addDays,
  addMonths,
  diffDays,
  formatDateKey,
  nowMinutes,
  startOfMonth,
  todayKey,
  weekDays,
} from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStaffList, useStudentList, useSubjects } from '@/features/data/hooks'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLoadWindow } from '@/lib/useLoadWindow'
import { cn } from '@/lib/utils'
import { type ScheduleCtx, createSession, deleteSession, reorderSessions, updateSession } from './api'
import { type BellItem, type ScheduleUi, ScheduleUiContext, type Selection } from './context'
import { DaySection } from './DaySection'
import { BellDialog } from './dialogs/BellDialog'
import { DayEditDialog } from './dialogs/DayEditDialog'
import { DuplicateDialog } from './dialogs/DuplicateDialog'
import { EventDialog, type EventDialogState } from './dialogs/EventDialog'
import { SessionDialog, type SessionDialogState } from './dialogs/SessionDialog'
import { TrashDialog } from './dialogs/TrashDialog'
import { TutorOrderDialog } from './dialogs/TutorOrderDialog'
import { moveEventTime } from './eventsApi'
import { MonthView } from './MonthView'
import { useScheduleData } from './useScheduleData'
import { useShifts } from '@/features/timeclock/api'
import type { ClockInterval } from '@shared/schedule/dayModel'
import { useScheduleRoute } from './useScheduleRoute'
import { WeekBar } from './WeekBar'
import { WeekEventHeader } from './WeekEventHeader'

const CLIP_KEY = 'hyber:schedule-clipboard'
const ZOOM_KEY = 'hyber:schedule-zoom'

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
  const [zoom, setZoomState] = useState(() => Number(localStorage.getItem(ZOOM_KEY) ?? '0.8') || 0.8)
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

  const data = useScheduleData(range.from, range.to, view === 'month' ? null : tutorFilter, { eventsOnly: view === 'month', keepPrevious: view === 'month' })
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
    if (view === 'week') return weekDays(date, weekStartsOn).filter((d) => !isClosed(d))
    return []
  }, [view, date, weekStartsOn, isClosed])

  const maxLanes = branch.rules.maxStudentsPerTutor
  const sections = useMemo(
    () =>
      days.map((d) => {
        const hours = hoursOf(d)
        const rows = buildDayRows({
          dateKey: d,
          today,
          hours,
          tutors: visibleTutors,
          availability: (id) => {
            const a = data.availabilityByKey.get(`${id}|${d}`)
            return a ? { ranges: a.ranges, unavailable: a.unavailable, hidden: a.hidden } : null
          },
          sessions: data.sessionsByDate.get(d) ?? [],
          clocks: (id) => (clocksByKey.get(`${id}|${d}`) ?? []).map((c) => (c.open ? { ...c, endMin: d === today ? nowMin : 1440 } : c)),
          maxLanes,
          addEmptyLane: true,
          nameFor: (id) => staffMap.get(id)?.name ?? 'Former tutor',
        })
        return { dateKey: d, hours, rows, events: data.eventsByDate.get(d) ?? [] }
      }),
    [days, hoursOf, today, nowMin, visibleTutors, data.availabilityByKey, data.sessionsByDate, data.eventsByDate, maxLanes, staffMap, clocksByKey],
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
  const openLog = useCallback(
    (s: WithId<Session>) => window.open(`/${branchId}/session-log/${s.id}`, '_blank', 'noopener'),
    [branchId],
  )

  const moveSession = useCallback(
    (id: string, staffId: string, dateKey: DateKey, startMin: number) => {
      const s = sessionById.get(id)
      if (!s) return
      if (isLocked(s.dateKey) || isLocked(dateKey)) return toast.error('Past days can’t be changed.')
      const duration = Math.max(5, s.endMin - s.startMin)
      const endMin = startMin + duration
      const avail = data.availabilityByKey.get(`${staffId}|${dateKey}`)
      if (!avail || avail.unavailable || !rangesContain(avail.ranges, startMin, endMin)) {
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
    [sessionById, isLocked, data.availabilityByKey, data.sessionsByDate, maxLanes, staffMap, run, ctx],
  )

  const setStatus = useCallback(
    (s: WithId<Session>, status: SessionStatus) => {
      if (status === s.status) return
      if (isLocked(s.dateKey)) return toast.error('Past days can’t be changed.')
      if (s.status === 'canceled') {
        const others = (data.sessionsByDate.get(s.dateKey) ?? []).filter((x) => x.tutorId === s.tutorId && x.status !== 'canceled')
        if (!fitsCapacity(others, s.startMin, s.endMin, maxLanes, s.id)) return toast.error('It is already full.')
      }
      void run(() => updateSession(ctx, s, { status }), `Status changed to ${SESSION_STATUS_LABELS[status]}`)
    },
    [isLocked, data.sessionsByDate, maxLanes, run, ctx],
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

  // ------------------------------------------------------------- clipboard / hotkeys
  const copy = useCallback(() => {
    if (selection?.kind !== 'session') return
    const s = sessionById.get(selection.id)
    if (!s) return
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
  }, [selection, sessionById, studentMap])

  const paste = useCallback(() => {
    if (selection?.kind !== 'slot') return
    const clip = readClip()
    if (!clip) return toast.info('Copy a session first.')
    if (isLocked(selection.dateKey)) return toast.error('Past days can’t be changed.')
    const startMin = selection.startMin
    const endMin = startMin + clip.durationMin
    const avail = data.availabilityByKey.get(`${selection.staffId}|${selection.dateKey}`)
    if (!avail || !rangesContain(avail.ranges, startMin, endMin)) return toast.error('This start time does not fit the full session duration within the tutor’s availability.')
    const others = (data.sessionsByDate.get(selection.dateKey) ?? []).filter((x) => x.tutorId === selection.staffId && x.status !== 'canceled')
    if (!fitsCapacity(others, startMin, endMin, maxLanes)) return toast.error(`This tutor already has ${maxLanes} students at that time.`)
    const tutor = staffMap.get(selection.staffId)
    void run(() =>
      createSession(
        ctx,
        {
          ...clip,
          tutorId: selection.staffId,
          tutorName: tutor?.name ?? '',
          status: settings.schedule.pasteStatus,
          dateKey: selection.dateKey,
          startMin,
          endMin,
        },
        'paste',
      ),
    )
  }, [selection, isLocked, data.availabilityByKey, data.sessionsByDate, maxLanes, staffMap, run, ctx, settings.schedule.pasteStatus])

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
  const keysRef = useRef({ copy, paste, removeSelected, nav, anyDialog })
  keysRef.current = { copy, paste, removeSelected, nav, anyDialog }
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
        // True Education: Escape shows or hides the panel (and clears the selection).
        setSelection(null)
        setPanelOpen((o) => !o)
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
    showBell: (session, items) => setBell({ session, items }),
    createEvent: (dateKey, startMin) =>
      setEventDialog({ mode: 'create', dateKey, startMin, endMin: Math.min(startMin + settings.schedule.events.defaultMinutes, hoursOf(dateKey).closeMin) }),
    editEvent: (e) => setEventDialog({ mode: 'edit', event: e }),
    moveEvent: (e, startMin) => void run(() => moveEventTime(ctx, e, startMin)),
    editDay: (d) => setDayEdit(d),
  }

  const panel = (
    <WeekBar
      view={view}
      date={date}
      today={today}
      weekStartsOn={weekStartsOn}
      isClosed={isClosed}
      onView={(v) => {
        if (v === 'day' && view !== 'day') {
          const inWeek = weekDays(date, weekStartsOn).includes(today)
          let d = inWeek ? today : date
          for (let i = 0; i < 7 && isClosed(d); i++) d = addDays(d, 1)
          route.go({ view: v, date: d })
        } else route.go({ view: v })
      }}
      onDate={(d) => route.go({ date: d })}
      onPrev={nav.prev}
      onNext={nav.next}
      onToday={nav.today}
      tutors={tutors}
      tutorFilter={tutorFilter}
      onTutorFilter={setTutorFilter}
      zoom={zoom}
      onZoom={setZoom}
      onDuplicate={() => setDupOpen(true)}
      onTrash={() => setTrashOpen(true)}
      onTutorOrder={() => setOrderOpen(true)}
      topMonth={view === 'month' ? topMonth : null}
      onClose={isMobile ? undefined : () => setPanelOpen(false)}
    />
  )

  return (
    <ScheduleUiContext value={ui}>
      <div className="relative -m-4 h-[calc(100svh-var(--chrome-h)-3rem)] min-h-0 sm:-m-6 md:h-[calc(100svh-var(--chrome-h))]">
        <div
          className={cn('h-full min-w-0 bg-muted/40', view === 'month' ? 'flex flex-col overflow-hidden' : 'overflow-auto')}
          onMouseDown={(e) => e.target === e.currentTarget && setSelection(null)}
          data-testid="schedule-area"
        >
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
              className={cn('h-full', panelOpen && !isMobile && 'md:pr-[19.5rem]')}
            />
          ) : (
            // Room on the right so the floating panel never hides the end of a day.
            <div className={cn('w-max min-w-full p-3 sm:p-4', panelOpen && !isMobile && 'md:pr-[19.5rem]')} style={{ zoom }}>
              {view === 'week' ? (
                <WeekEventHeader
                  days={weekDays(date, weekStartsOn)}
                  today={today}
                  isClosed={isClosed}
                  eventsByDate={data.eventsByDate}
                  onDay={(d) => document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  onEditEvent={(e) => setEventDialog({ mode: 'edit', event: e })}
                />
              ) : null}
              <div className="flex flex-col gap-4">
                {sections.map((s) => (
                  <DaySection key={s.dateKey} sectionId={`day-${s.dateKey}`} dateKey={s.dateKey} hours={s.hours} rows={s.rows} events={s.events} />
                ))}
                {sections.length === 0 ? (
                  <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
                    {view === 'day' ? `Closed on ${formatDateKey(date, 'weekdayLong')}.` : 'The center is closed all week.'}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
        {isMobile ? (
          <>
            <Button variant="outline" size="icon" className="fixed right-4 bottom-20 z-30 rounded-full shadow-md" aria-label="Open schedule panel" onClick={() => setPanelOpen(true)}>
              <LuPanelRight />
            </Button>
            <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
              <SheetContent side="right" className="w-80 overflow-y-auto p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Schedule</SheetTitle>
                </SheetHeader>
                {panel}
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <>
            {/* True Education's floating panel: over the schedule, opened and closed with the button or Escape. */}
            <div
              className={cn(
                'absolute top-3 right-3 z-30 flex max-h-[calc(100%-1.5rem)] w-72 flex-col overflow-y-auto rounded-2xl border bg-background/95 shadow-xl backdrop-blur transition-[translate,opacity] duration-200 ease-out supports-[backdrop-filter]:bg-background/85',
                panelOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[calc(100%+1.5rem)] opacity-0',
              )}
              aria-hidden={!panelOpen}
              inert={!panelOpen}
              data-testid="schedule-panel"
            >
              {panel}
            </div>
            {!panelOpen ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="absolute top-3 right-3 z-20 rounded-xl bg-background shadow-md" aria-label="Show panel (Esc)" onClick={() => setPanelOpen(true)}>
                    <LuPanelRight />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Show panel (Esc)</TooltipContent>
              </Tooltip>
            ) : null}
          </>
        )}
      </div>

      <SessionDialog
        state={sessionDialog}
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

