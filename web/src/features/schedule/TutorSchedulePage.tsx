import { query, where } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuTriangleAlert } from 'react-icons/lu'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { dayHours, effectiveRanges } from '@shared/availability'
import { COL } from '@shared/paths'
import type { Conflict } from '@shared/schedule/conflicts'
import { buildDayRows } from '@shared/schedule/dayModel'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import { canLog } from '@shared/sessions/logs'
import { type DateKey, addDays, formatDateKey, isDateKey, nowMinutes, todayKey, weekDays } from '@shared/time'
import type { Availability, Session, Staff, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDayConfigs, useStudentList } from '@/features/data/hooks'
import { useIsMobile } from '@/hooks/use-mobile'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { useShifts } from '@/features/timeclock/api'
import { weekRange } from '@/features/tutor/sessionUi'
import { computeConflicts } from './conflicts'
import { type ScheduleUi, ScheduleUiContext } from './context'
import { DaySection } from './DaySection'
import { TutorWeekList } from './TutorWeekList'

/**
 * The tutor's own schedule. Computers: read-only rows by day (week or day);
 * clicking a session opens its log in a new tab. Phones: the week as a list.
 */
export function TutorSchedulePage() {
  const { branchId, staffId, settings, rules, timezone } = useBranch()
  const isMobile = useIsMobile()
  const [view, setView] = useState<'day' | 'week'>('week')
  const [today, setToday] = useState(() => todayKey(timezone))
  const [nowMin, setNowMin] = useState(() => nowMinutes(timezone))
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const dateParam = search.get('date')
  const [anchor, setAnchor] = useState(() => (dateParam && isDateKey(dateParam) ? dateParam : today))
  // Notifications link here with ?date=… to jump to the session's week.
  useEffect(() => {
    if (dateParam && isDateKey(dateParam)) setAnchor(dateParam)
  }, [dateParam])
  useEffect(() => {
    const t = setInterval(() => {
      setToday(todayKey(timezone))
      setNowMin(nowMinutes(timezone))
    }, 30_000)
    return () => clearInterval(t)
  }, [timezone])

  const weekStartsOn = settings.general.weekStartsOn
  const week = weekDays(anchor, weekStartsOn)
  // Phones always show a week.
  const days = isMobile || view === 'week' ? week : [anchor]
  const from = days[0]
  const to = days[days.length - 1]

  const meRef = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  const { data: me } = useDoc<Staff>(meRef)
  const sessQ = useMemo(
    () => (staffId ? query(branchCol(branchId, COL.sessions), where('tutorId', '==', staffId), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [branchId, staffId, from, to],
  )
  const availQ = useMemo(
    () => (staffId ? query(branchCol(branchId, COL.availability), where('staffId', '==', staffId), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [branchId, staffId, from, to],
  )
  const { data: sessionsRaw } = useQuery<Session>(sessQ, `tutor-sched-${staffId}-${from}-${to}`)
  const { data: avail } = useQuery<Availability>(availQ, `tutor-avail-${staffId}-${from}-${to}`)
  const { map: dayConfigs } = useDayConfigs(from, to)
  const { data: students } = useStudentList()
  const { data: shifts } = useShifts(from, to, staffId, !!staffId)
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const sessions = useMemo(() => sessionsRaw.filter((s) => !s.isDeleted), [sessionsRaw])
  const loggable = (s: WithId<Session>) => canLog(s.status, settings.sessionLogs.allowForStatuses)
  const openLog = (s: WithId<Session>) => {
    if (s.logStatus !== 'submitted' && !loggable(s)) {
      toast.info(`${SESSION_STATUS_LABELS[s.status]} sessions don’t take a session log.`)
      return
    }
    window.open(`/${branchId}/session-log/${s.id}`, '_blank', 'noopener')
  }

  // Sessions that may not happen as booked: shown as waiting for the admin.
  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, dayConfigs), [settings, dayConfigs])
  const conflicts = useMemo(
    () =>
      computeConflicts({
        sessions,
        availabilityByKey: new Map(avail.map((a) => [`${a.staffId}|${a.dateKey}`, a])),
        hoursOf,
        staffById: null,
        studentsById: studentMap,
        maxPerTutor: rules.maxStudentsPerTutor,
        today,
        nowMin,
      }),
    [sessions, avail, hoursOf, studentMap, rules.maxStudentsPerTutor, today, nowMin],
  )
  const conflictsOf = useCallback((s: WithId<Session>): Conflict[] => conflicts.get(s.id) ?? [], [conflicts])
  const waiting = conflicts.size
  const waitingNote =
    waiting > 0 ? (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" data-testid="tutor-conflicts">
        <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
        <p>
          <span className="font-semibold">
            {waiting === 1 ? 'One of your sessions is' : `${waiting} of your sessions are`} waiting for the admin.
          </span>{' '}
          {waiting > 1 ? 'They’re' : 'It’s'} marked in red because something changed since booking (for example your availability). The admin will move,
          reassign or cancel {waiting > 1 ? 'them' : 'it'}; until then, don’t count on {waiting > 1 ? 'them' : 'it'}.
        </p>
      </div>
    ) : null

  // Computers: links with ?date= (notifications, Today's week) bring that day into view once it's drawn.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (isMobile || !dateParam || !isDateKey(dateParam) || scrolledTo.current === dateParam) return
    const el = document.getElementById(`tutor-day-${dateParam}`)
    if (!el) return
    scrolledTo.current = dateParam
    el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [isMobile, dateParam, sessionsRaw, view])

  if (!staffId) return <p className="text-sm text-muted-foreground">Your employee record isn’t linked yet. Ask an admin.</p>

  const ui: ScheduleUi = {
    tutorColor: () => me?.color,
    mode: 'tutor',
    today,
    nowMin,
    maxLanes: rules.maxStudentsPerTutor,
    loggableStatuses: settings.sessionLogs.allowForStatuses,
    snap: settings.schedule.snapMinutes,
    defaultDuration: settings.schedule.defaultSessionMinutes,
    selection: null,
    select: () => undefined,
    students: studentMap,
    // Only past days are locked ("Past" on the day). Tutors never edit sessions: cards are read-only in tutor mode.
    isLocked: (d) => d < today,
    bellFor: () => [],
    conflictsOf,
    createAt: () => undefined,
    editSession: () => undefined,
    setStatus: () => undefined,
    moveSession: () => undefined,
    resizeSession: () => undefined,
    reorderSession: () => undefined,
    openLog,
    viewLog: (s) => window.open(`/${branchId}/session-log/${s.id}/view`, '_blank', 'noopener'),
    openStudent: (s, newTab) => {
      const path = `/${branchId}/tutor/students/${s.studentId}/info`
      if (newTab) window.open(path, '_blank', 'noopener')
      else navigate(path)
    },
    showBell: () => undefined,
    reassignOptions: () => null,
    reassign: () => undefined,
    makeAvailable: () => undefined,
    copySession: () => undefined,
    duplicateSession: () => undefined,
    trashSession: () => undefined,
    openEmployee: () => undefined,
    showOnlyTutor: () => undefined,
    pasteAt: () => undefined,
    hasClipboard: () => false,
    createEvent: () => undefined,
    editEvent: () => undefined,
    moveEvent: () => undefined,
    deleteEvent: () => undefined,
    editDay: () => undefined,
  }

  if (isMobile) {
    return (
      <TutorWeekList
        days={week}
        today={today}
        nowMin={nowMin}
        sessions={sessions}
        hoursOf={hoursOf}
        conflictsOf={conflictsOf}
        studentOf={(id) => studentMap.get(id)}
        focus={dateParam && isDateKey(dateParam) ? dateParam : null}
        onWeek={(step) => setAnchor(step === 0 ? today : addDays(anchor, step * 7))}
        waitingNote={waitingNote}
      />
    )
  }

  const sections = days
    .map((d) => {
      const hours = dayHours(d, settings, dayConfigs)
      const a = avail.find((x) => x.dateKey === d)
      const rows = buildDayRows({
        dateKey: d,
        today,
        hours,
        tutors: [{ id: staffId, name: me?.name ?? 'Me' }],
        availability: () => (a ? { ranges: effectiveRanges(a.ranges, hours), unavailable: a.unavailable, hidden: false } : null),
        sessions: sessions.filter((s) => s.dateKey === d),
        clocks: () =>
          shifts
            .filter((sh) => sh.dateKey === d)
            .map((sh) => ({ id: sh.id, startMin: sh.inMin, endMin: sh.status === 'open' ? (d === today ? nowMin : 1440) : sh.outDateKey && sh.outDateKey > sh.dateKey ? 1440 : (sh.outMin ?? sh.inMin), open: sh.status === 'open' })),
        maxLanes: rules.maxStudentsPerTutor,
        addEmptyLane: false,
      }).map((r) => ({ ...r, laneCount: rules.maxStudentsPerTutor }))
      return { d, hours, rows }
    })
    // Closed days still show when sessions are booked on them.
    .filter((s) => (s.hours.isOpen && s.rows.length > 0) || s.rows.some((r) => r.active.length > 0))

  return (
    <ScheduleUiContext value={ui}>
      <div>
        <PageHeader
          title="Schedule"
          description="Click a session to open its log in a new tab."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Previous" onClick={() => setAnchor(addDays(anchor, view === 'week' ? -7 : -1))}>
                <LuChevronLeft />
              </Button>
              <Button variant="outline" onClick={() => setAnchor(today)}>
                Today
              </Button>
              <Button variant="outline" size="icon" aria-label="Next" onClick={() => setAnchor(addDays(anchor, view === 'week' ? 7 : 1))}>
                <LuChevronRight />
              </Button>
              <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && setView(v as 'day' | 'week')}>
                <ToggleGroupItem value="day">Day</ToggleGroupItem>
                <ToggleGroupItem value="week">Week</ToggleGroupItem>
              </ToggleGroup>
            </div>
          }
        />
        {waitingNote}
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {view === 'week' ? weekRange(days[0], days[6]) : formatDateKey(anchor, 'weekdayLong')}
          {view === 'week' && days.includes(today) ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">This week</span> : null}
          {view === 'day' && anchor === today ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">Today</span> : null}
        </div>
        <div className="flex flex-col gap-6 overflow-x-auto pb-2">
          {sections.map((s) => (
            <DaySection key={s.d} dateKey={s.d} hours={s.hours} rows={s.rows} events={[]} showHeader sectionId={`tutor-day-${s.d}`} />
          ))}
          {sections.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">No availability or sessions scheduled for this period.</div>
          ) : null}
        </div>
      </div>
    </ScheduleUiContext>
  )
}
