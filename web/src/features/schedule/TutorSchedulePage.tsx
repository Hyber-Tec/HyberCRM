import { query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuFileText } from 'react-icons/lu'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { studentLabel } from '@shared/people'
import { buildDayRows } from '@shared/schedule/dayModel'
import { SESSION_STATUS_LABELS, SESSION_STATUS_STYLE } from '@shared/schedule/status'
import { type DateKey, addDays, formatDateKey, formatTimeRange, nowMinutes, todayKey, weekDays } from '@shared/time'
import type { Availability, Session, Staff, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDayConfigs, useStudentList } from '@/features/data/hooks'
import { useIsMobile } from '@/hooks/use-mobile'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { useShifts } from '@/features/timeclock/api'
import { type ScheduleUi, ScheduleUiContext } from './context'
import { DaySection } from './DaySection'

/** The tutor's own schedule: read-only rows; clicking a session opens its log in a new tab. */
export function TutorSchedulePage() {
  const { branchId, staffId, settings, timezone } = useBranch()
  const isMobile = useIsMobile()
  const [view, setView] = useState<'day' | 'week'>('week')
  const [today, setToday] = useState(() => todayKey(timezone))
  const [nowMin, setNowMin] = useState(() => nowMinutes(timezone))
  const [anchor, setAnchor] = useState(today)
  useEffect(() => {
    const t = setInterval(() => {
      setToday(todayKey(timezone))
      setNowMin(nowMinutes(timezone))
    }, 30_000)
    return () => clearInterval(t)
  }, [timezone])

  const weekStartsOn = settings.general.weekStartsOn
  const days = view === 'week' ? weekDays(anchor, weekStartsOn) : [anchor]
  const from = isMobile ? today : days[0]
  const to = isMobile ? addDays(today, 27) : days[days.length - 1]

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
  const sessions = sessionsRaw.filter((s) => !s.isDeleted)
  const openLog = (s: WithId<Session>) => window.open(`/${branchId}/tutor/sessions/log/${s.id}/edit`, '_blank', 'noopener')

  if (!staffId) return <p className="text-sm text-muted-foreground">Your employee record isn’t linked yet. Ask an admin.</p>

  const ui: ScheduleUi = {
    mode: 'tutor',
    master: false,
    today,
    nowMin,
    maxLanes: settings.schedule.maxConcurrentStudentsPerTutor,
    loggableStatuses: settings.sessionLogs.allowForStatuses,
    snap: settings.schedule.snapMinutes,
    defaultDuration: settings.schedule.defaultSessionMinutes,
    selection: null,
    select: () => undefined,
    students: studentMap,
    isLocked: () => true,
    bellFor: () => [],
    createAt: () => undefined,
    editSession: () => undefined,
    setStatus: () => undefined,
    moveSession: () => undefined,
    resizeSession: () => undefined,
    reorderSession: () => undefined,
    openLog,
    showBell: () => undefined,
    createEvent: () => undefined,
    editEvent: () => undefined,
    moveEvent: () => undefined,
    editDay: () => undefined,
  }

  if (isMobile) {
    const byDate = new Map<DateKey, WithId<Session>[]>()
    for (const s of [...sessions].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)) {
      byDate.set(s.dateKey, [...(byDate.get(s.dateKey) ?? []), s])
    }
    return (
      <div>
        <PageHeader title="Schedule" description="Your sessions for the next four weeks. Tap a session to open its log." />
        {byDate.size === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No sessions scheduled.</p> : null}
        <div className="space-y-5">
          {[...byDate.entries()].map(([d, list]) => (
            <section key={d}>
              <h2 className="mb-2 text-sm font-semibold">
                {formatDateKey(d, 'weekdayLong')}
                {d === today ? <span className="ml-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] text-background">TODAY</span> : null}
              </h2>
              <div className="space-y-2">
                {list.map((s) => {
                  const st = SESSION_STATUS_STYLE[s.status]
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openLog(s)}
                      className="flex w-full items-center gap-3 rounded-xl border p-3 text-left"
                      style={{ backgroundColor: st.bg, borderColor: st.border, opacity: s.status === 'canceled' ? 0.6 : 1 }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-black">{studentLabel(s.studentName, s.studentGrade)}</div>
                        <div className="truncate text-sm text-neutral-700">{s.subject || 'No subject'}</div>
                        <div className="text-xs text-neutral-600">{formatTimeRange(s.startMin, s.endMin)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs" style={{ color: st.text }}>
                        {SESSION_STATUS_LABELS[s.status]}
                        <LuFileText className={s.logStatus === 'submitted' ? 'text-blue-700' : 'text-neutral-400'} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
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
        availability: () => (a ? { ranges: a.ranges, unavailable: a.unavailable, hidden: false } : null),
        sessions: sessions.filter((s) => s.dateKey === d),
        clocks: () =>
          shifts
            .filter((sh) => sh.dateKey === d)
            .map((sh) => ({ id: sh.id, startMin: sh.inMin, endMin: sh.status === 'open' ? (d === today ? nowMin : 1440) : sh.outDateKey && sh.outDateKey > sh.dateKey ? 1440 : (sh.outMin ?? sh.inMin), open: sh.status === 'open' })),
        maxLanes: settings.schedule.maxConcurrentStudentsPerTutor,
        addEmptyLane: false,
      }).map((r) => ({ ...r, laneCount: settings.schedule.maxConcurrentStudentsPerTutor }))
      return { d, hours, rows }
    })
    .filter((s) => s.hours.isOpen && s.rows.length > 0)

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
        <div className="mb-3 text-sm font-medium text-muted-foreground">
          {view === 'week' ? `${formatDateKey(days[0], 'medium')} – ${formatDateKey(days[6], 'medium')}` : formatDateKey(anchor, 'weekdayLong')}
        </div>
        <div className="flex flex-col gap-4 overflow-x-auto" style={{ zoom: 0.8 }}>
          {sections.map((s) => (
            <DaySection key={s.d} dateKey={s.d} hours={s.hours} rows={s.rows} events={[]} />
          ))}
          {sections.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">No availability or sessions scheduled for this period.</div>
          ) : null}
        </div>
      </div>
    </ScheduleUiContext>
  )
}
