import { query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import {
  LuCalendarDays,
  LuCircleCheck,
  LuClock,
  LuHouse,
  LuPlus,
  LuTriangleAlert,
  LuUserPlus,
  LuUsers,
} from 'react-icons/lu'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { STUDENT_STATUS_LABELS, conferenceState, isInactiveStudent } from '@shared/people'
import { ROLE_LABELS } from '@shared/roles'
import { occursOn } from '@shared/schedule/events'
import { EVENT_DOT, SESSION_STATUS_DOT } from '@shared/schedule/status'
import { type DateKey, addDays, dateRange, formatDateKey, formatInstant, formatMinutes, formatTimeRange, toInstant } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { StudentStatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStudentList } from '@/features/data/hooks'
import type { EventDoc } from '@/features/schedule/useScheduleData'
import { restartConferenceCycle } from '@/features/students/api'
import type { ClockShift } from '@/features/timeclock/api'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { ClockOutDialog } from './ClockOutDialog'
import { DayHeader, EmptyRow, HomeCard, HomeRow, LiveTag, Pill, type RowAction, SubHeader, openInNewTab } from './HomeCard'
import { type AttentionItem, type NewStudent, useAttention } from './attention'
import { SHORTCUTS, type Shortcut, useShortcutIds } from './shortcuts'

function dayLabel(d: DateKey, today: DateKey): string {
  if (d === today) return 'Today'
  if (d === addDays(today, 1)) return 'Tomorrow'
  if (d === addDays(today, -1)) return 'Yesterday'
  return formatDateKey(d, 'weekdayMedium')
}

function usePaths() {
  const { branchId } = useBranch()
  const admin = `/${branchId}/admin`
  return {
    admin,
    day: (d: DateKey) => `${admin}/schedule/day/${d}`,
    student: (id: string, tab?: string) => `${admin}/students/${id}${tab ? `/${tab}` : ''}`,
    employee: (id: string) => `${admin}/employees/directory/${id}`,
    log: (sessionId: string) => `/${branchId}/session-log/${sessionId}`,
  }
}

/** Admin → Home: today's dashboard (True Education's Home, without Diagnostics). */
export function AdminHomePage() {
  const { timezone } = useBranch()
  const attention = useAttention()
  const { today } = attention
  const [fixing, setFixing] = useState<WithId<ClockShift> | null>(null)
  const title = formatInstant(toInstant(today, 720, timezone), timezone, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
          <LuHouse className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <LiveTag />
      </div>
      <ShortcutsBar />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <UpcomingCard today={today} now={attention.now} />
        <ClockCard shifts={attention.shifts} today={today} onFix={setFixing} />
        <AttentionCard items={attention.items} today={today} onFix={setFixing} />
        <ConferenceCard />
        <NewStudentsCard list={attention.newStudents} today={today} />
      </div>
      <ClockOutDialog shift={fixing} onClose={() => setFixing(null)} />
    </div>
  )
}

// ---------------------------------------------------------------- shortcuts

function ShortcutsBar() {
  const { branchId, actor, settings, can } = useBranch()
  const navigate = useNavigate()
  const [ids, save] = useShortcutIds(branchId, actor.email, settings.home.defaultShortcuts)
  const available = SHORTCUTS.filter((s) => !s.restrict || can(s.restrict))
  const shown = ids.map((id) => available.find((s) => s.id === id)).filter((s): s is Shortcut => !!s)
  const href = (s: Shortcut) => (s.branchLevel ? `/${branchId}/${s.to}` : `/${branchId}/admin/${s.to}`)

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="home-shortcuts">
      {shown.map((s) => (
        <ContextMenu key={s.id}>
          <ContextMenuTrigger asChild>
            <Button variant="outline" size="sm" className="bg-card" asChild>
              <Link to={href(s)}>
                <s.icon className="text-blue-600 dark:text-blue-400" />
                {s.label}
              </Link>
            </Button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onSelect={() => navigate(href(s))}>Open</ContextMenuItem>
            <ContextMenuItem onSelect={() => openInNewTab(href(s))}>Open in new tab</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => save(ids.filter((x) => x !== s.id))}>
              Remove from Home
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <LuPlus /> {shown.length ? 'Edit' : 'Add shortcuts'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Shortcuts on Home</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {available.map((s) => (
            <DropdownMenuCheckboxItem
              key={s.id}
              checked={ids.includes(s.id)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) => save(on ? [...ids, s.id] : ids.filter((x) => x !== s.id))}
            >
              <s.icon className="text-muted-foreground" />
              {s.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ---------------------------------------------------------------- upcoming

type UpcomingItem =
  | { kind: 'session'; key: string; dateKey: DateKey; startMin: number; endMin: number; session: WithId<Session> }
  | { kind: 'event'; key: string; dateKey: DateKey; startMin: number; endMin: number; event: WithId<EventDoc> }

function UpcomingCard({ today, now }: { today: DateKey; now: number }) {
  const { branchId, settings, timezone } = useBranch()
  const navigate = useNavigate()
  const paths = usePaths()
  const to = addDays(today, settings.home.upcomingDays)

  const sessionsQ = useMemo(() => query(branchCol(branchId, COL.sessions), where('dateKey', '>=', today), where('dateKey', '<=', to)), [branchId, today, to])
  const sessions = useQuery<Session>(sessionsQ, `home-sessions-${branchId}-${today}-${to}`)
  const oneOffQ = useMemo(
    () => query(branchCol(branchId, COL.events), where('isRecurring', '==', false), where('dateKey', '>=', today), where('dateKey', '<=', to)),
    [branchId, today, to],
  )
  const recurringQ = useMemo(() => query(branchCol(branchId, COL.events), where('isRecurring', '==', true)), [branchId])
  const oneOff = useQuery<EventDoc>(oneOffQ, `sched-events-${branchId}-${today}-${to}`)
  const recurring = useQuery<EventDoc>(recurringQ, `sched-revents-${branchId}`)

  const groups = useMemo(() => {
    const items: UpcomingItem[] = []
    for (const s of sessions.data) {
      if (s.isDeleted || s.status === 'canceled' || s.endAt.toMillis() < now) continue
      items.push({ kind: 'session', key: s.id, dateKey: s.dateKey, startMin: s.startMin, endMin: s.endMin, session: s })
    }
    const events = [...oneOff.data, ...recurring.data]
    for (const d of dateRange(today, to)) {
      for (const e of events) {
        if (!occursOn(e, d) || toInstant(d, e.endMin, timezone).getTime() < now) continue
        items.push({ kind: 'event', key: `${e.id}-${d}`, dateKey: d, startMin: e.startMin, endMin: e.endMin, event: e })
      }
    }
    items.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin)
    const byDay = new Map<DateKey, UpcomingItem[]>()
    for (const i of items) byDay.set(i.dateKey, [...(byDay.get(i.dateKey) ?? []), i])
    return { count: items.length, days: [...byDay.entries()] }
  }, [sessions.data, oneOff.data, recurring.data, today, to, now, timezone])

  const dayActions = (d: DateKey): RowAction[] => [
    { label: 'Go to Schedule on this day', onSelect: () => navigate(paths.day(d)), separatorBefore: true },
    { label: 'Open Schedule in new tab', onSelect: () => openInNewTab(paths.day(d)) },
  ]

  return (
    <HomeCard
      icon={LuCalendarDays}
      title="Upcoming Schedule & Events"
      count={groups.count}
      link={{ label: 'Open Schedule', to: `${paths.admin}/schedule` }}
      testId="home-upcoming"
    >
      {groups.days.map(([d, items]) => (
        <div key={d}>
          <DayHeader label={dayLabel(d, today)} highlight={d === today} />
          {items.map((i) =>
            i.kind === 'session' ? (
              <HomeRow
                key={i.key}
                to={paths.day(d)}
                actions={[
                  { label: 'Open student', onSelect: () => navigate(paths.student(i.session.studentId)) },
                  { label: 'Open student in new tab', onSelect: () => openInNewTab(paths.student(i.session.studentId)) },
                  ...dayActions(d),
                ]}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: SESSION_STATUS_DOT[i.session.status] ?? SESSION_STATUS_DOT.pending }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{i.session.studentName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {i.session.subject || 'No subject'} · <span className="font-semibold text-foreground">{i.session.tutorName}</span>
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatTimeRange(i.startMin, i.endMin)}</div>
              </HomeRow>
            ) : (
              <HomeRow key={i.key} to={paths.day(d)} actions={dayActions(d).map((a, n) => ({ ...a, separatorBefore: n === 0 ? false : a.separatorBefore }))} className="bg-sky-50/50 dark:bg-sky-950/20">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: EVENT_DOT }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{i.event.title}</span>
                    <Pill tone="blue">Event</Pill>
                  </div>
                  {i.event.notes ? <div className="truncate text-xs text-muted-foreground">{i.event.notes}</div> : null}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatTimeRange(i.startMin, i.endMin)}</div>
              </HomeRow>
            ),
          )}
        </div>
      ))}
      {!sessions.loading && groups.count === 0 ? <EmptyRow>Nothing upcoming in the next {settings.home.upcomingDays} days.</EmptyRow> : null}
    </HomeCard>
  )
}

// ---------------------------------------------------------------- live clock

function shiftTimes(s: ClockShift) {
  return `in ${formatMinutes(s.inMin)} · out ${s.status === 'open' || s.outMin == null ? '—' : formatMinutes(s.outMin)}`
}

function ClockCard({ shifts, today, onFix }: { shifts: WithId<ClockShift>[]; today: DateKey; onFix: (s: WithId<ClockShift>) => void }) {
  const { settings, can } = useBranch()
  const navigate = useNavigate()
  const paths = usePaths()
  const open = useMemo(() => shifts.filter((s) => s.status === 'open').sort((a, b) => b.clockInAt.toMillis() - a.clockInAt.toMillis()), [shifts])
  const days = useMemo(() => {
    const byDay = new Map<DateKey, WithId<ClockShift>[]>()
    for (const s of shifts) if (s.status !== 'open') byDay.set(s.dateKey, [...(byDay.get(s.dateKey) ?? []), s])
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, list]) => [d, list.sort((a, b) => b.clockInAt.toMillis() - a.clockInAt.toMillis())] as const)
  }, [shifts])
  const payPage = can('payroll') ? { label: 'Payroll', to: `${paths.admin}/employees/payroll` } : can('timeEntries') ? { label: 'Time Entries', to: `${paths.admin}/employees/time-entries` } : undefined

  const actions = (s: WithId<ClockShift>, auto: boolean): RowAction[] => [
    ...(auto && can('timeEntries') ? [{ label: 'Change clock-out time', onSelect: () => onFix(s) }] : []),
    { label: 'Open employee', onSelect: () => navigate(paths.employee(s.staffId)), separatorBefore: auto && can('timeEntries') },
    { label: 'Open employee in new tab', onSelect: () => openInNewTab(paths.employee(s.staffId)) },
    ...(payPage ? [{ label: `Open ${payPage.label}`, onSelect: () => navigate(payPage.to), separatorBefore: true }] : []),
  ]

  return (
    <HomeCard icon={LuClock} title="Live Clock In / Out" count={open.length} live link={payPage} bodyClassName="max-h-[250px]" testId="home-clock">
      {open.length ? (
        <>
          <SubHeader>On the clock now</SubHeader>
          {open.map((s) => (
            <HomeRow key={s.id} to={paths.employee(s.staffId)} actions={actions(s, false)} className="bg-emerald-50/40 dark:bg-emerald-950/20">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.staffName}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {s.dateKey !== today ? `${dayLabel(s.dateKey, today)} · ` : ''}
                  {shiftTimes(s)}
                </div>
              </div>
              <Pill tone="green">● Clocked in</Pill>
            </HomeRow>
          ))}
        </>
      ) : null}
      {days.map(([d, list]) => (
        <div key={d}>
          <DayHeader label={dayLabel(d, today)} highlight={d === today} />
          {list.map((s) => {
            const auto = s.autoClosed && !s.autoCorrected
            return (
              <HomeRow key={s.id} to={paths.employee(s.staffId)} actions={actions(s, auto)}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.staffName}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{shiftTimes(s)}</div>
                </div>
                {auto ? <Pill tone="red">⚠ Auto</Pill> : <Pill tone="slate">Clocked out</Pill>}
              </HomeRow>
            )
          })}
        </div>
      ))}
      {!open.length && !days.length ? <EmptyRow>No clock activity in the last {settings.home.clockLookbackDays} days.</EmptyRow> : null}
    </HomeCard>
  )
}

// ---------------------------------------------------------------- needs attention

function AttentionCard({ items, today, onFix }: { items: AttentionItem[]; today: DateKey; onFix: (s: WithId<ClockShift>) => void }) {
  const { can } = useBranch()
  const navigate = useNavigate()
  const paths = usePaths()
  const logList = `${paths.admin}/sessions/log`

  return (
    <HomeCard
      icon={LuTriangleAlert}
      title="Missing & Needs Attention"
      count={items.length}
      tone={items.length ? 'alert' : 'default'}
      link={{ label: 'Session Log', to: logList }}
      bodyClassName="max-h-[250px]"
      testId="home-attention"
    >
      {items.map((i) => {
        if (i.kind === 'missingLog') {
          const s = i.session
          return (
            <HomeRow
              key={i.id}
              onOpen={() => openInNewTab(paths.log(s.id))}
              actions={[
                { label: 'Write session log', onSelect: () => openInNewTab(paths.log(s.id)) },
                { label: 'Go to Session Log', onSelect: () => navigate(logList), separatorBefore: true },
                { label: 'Open Session Log in new tab', onSelect: () => openInNewTab(logList) },
                { label: 'Go to Schedule on this day', onSelect: () => navigate(paths.day(s.dateKey)), separatorBefore: true },
                { label: 'Open Schedule in new tab', onSelect: () => openInNewTab(paths.day(s.dateKey)) },
              ]}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {s.studentName} · {s.subject || 'No subject'}
                </div>
                <div className="truncate text-xs text-muted-foreground tabular-nums">
                  {dayLabel(s.dateKey, today)} · {formatTimeRange(s.startMin, s.endMin)} · {s.tutorName}
                </div>
              </div>
              <Pill tone="red">Missing session log</Pill>
            </HomeRow>
          )
        }
        if (i.kind === 'autoClockOut') {
          const s = i.shift
          const fix = can('timeEntries')
          return (
            <HomeRow
              key={i.id}
              onOpen={() => (fix ? onFix(s) : navigate(paths.employee(s.staffId)))}
              actions={[
                ...(fix ? [{ label: 'Change clock-out time', onSelect: () => onFix(s) }] : []),
                { label: 'Open employee', onSelect: () => navigate(paths.employee(s.staffId)), separatorBefore: fix },
                { label: 'Open employee in new tab', onSelect: () => openInNewTab(paths.employee(s.staffId)) },
              ]}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.staffName}</div>
                <div className="truncate text-xs text-muted-foreground tabular-nums">
                  {dayLabel(s.dateKey, today)} · in {formatMinutes(s.inMin)} → {s.outMin != null ? formatMinutes(s.outMin) : '—'}
                </div>
              </div>
              <Pill tone="red">Auto clock-out</Pill>
            </HomeRow>
          )
        }
        const r = i.request
        const name = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email
        return (
          <HomeRow key={i.id} to={`${paths.admin}/account?tab=requests`}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {r.email} · wants to join as {ROLE_LABELS[r.requestedRole] ?? r.requestedRole}
              </div>
            </div>
            <Pill tone="amber">Sign-up request</Pill>
          </HomeRow>
        )
      })}
      {items.length === 0 ? <EmptyRow icon={LuCircleCheck}>Nothing missing — all clear.</EmptyRow> : null}
    </HomeCard>
  )
}

// ---------------------------------------------------------------- conference

function ConferenceCard() {
  const { branchId, settings, actor } = useBranch()
  const navigate = useNavigate()
  const paths = usePaths()
  const { data: students } = useStudentList()
  const [skipping, setSkipping] = useState<WithId<Student> | null>(null)
  const cycle = settings.students.conference.cycleHours
  const due = useMemo(
    () =>
      students
        .filter((s) => !isInactiveStudent(s.status) && (s.totalSessionHours ?? 0) > 0)
        .map((s) => ({ s, c: conferenceState({ totalSessionHours: s.totalSessionHours, baselineHours: s.conference?.baselineHours ?? 0 }, cycle) }))
        .filter((x) => x.c.needed)
        .sort((a, b) => b.c.hoursSince - a.c.hoursSince),
    [students, cycle],
  )

  return (
    <HomeCard
      icon={LuUsers}
      title="Conference Needed"
      count={due.length}
      tone={due.length ? 'warn' : 'default'}
      link={{ label: 'Directory', to: `${paths.admin}/students` }}
      testId="home-conference"
    >
      {due.map(({ s, c }) => (
        <HomeRow
          key={s.id}
          to={paths.student(s.id)}
          actions={[
            { label: 'Open student', onSelect: () => navigate(paths.student(s.id)) },
            { label: 'Open in new tab', onSelect: () => openInNewTab(paths.student(s.id)) },
            { label: 'Conference notes', onSelect: () => navigate(paths.student(s.id, 'conference')) },
            { label: `Skip & restart ${cycle} hrs`, onSelect: () => setSkipping(s), destructive: true, separatorBefore: true },
          ]}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{s.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              Grade {s.grade || '—'} · {STUDENT_STATUS_LABELS[s.status] ?? s.status}
            </div>
          </div>
          <Pill tone="amber">
            {Math.floor(c.hoursSince)}/{cycle} hrs
          </Pill>
        </HomeRow>
      ))}
      {due.length === 0 ? <EmptyRow>No students are due for a conference.</EmptyRow> : null}
      <ConfirmDialog
        open={skipping !== null}
        onOpenChange={(o) => !o && setSkipping(null)}
        title="Skip this conference?"
        description={skipping ? `Restart the ${cycle}-hour conference cycle for ${skipping.name} without a conference note.` : null}
        confirmLabel={`Skip & restart ${cycle} hrs`}
        destructive
        onConfirm={async () => {
          if (!skipping) return
          try {
            await restartConferenceCycle(branchId, actor, skipping)
            toast.success(`Conference cycle restarted for ${skipping.name}`)
          } catch (e) {
            toast.error(`Failed to skip the conference cycle: ${(e as Error).message}`)
          }
        }}
      />
    </HomeCard>
  )
}

// ---------------------------------------------------------------- new students

function NewStudentsCard({ list, today }: { list: NewStudent[]; today: DateKey }) {
  const { branchId, actor } = useBranch()
  const navigate = useNavigate()
  const paths = usePaths()

  const markReviewed = (s: WithId<Student>) =>
    updateDoc(branchDocRef(branchId, COL.students, s.id), { followUpReviewedAt: serverTimestamp(), updatedBy: actor.email }).catch(() =>
      toast.error('Could not update the student.'),
    )

  return (
    <HomeCard icon={LuUserPlus} title="New Students to Follow Up" count={list.length} link={{ label: 'Directory', to: `${paths.admin}/students` }} testId="home-new-students">
      {list.map(({ student: s, since }) => (
        <HomeRow
          key={s.id}
          to={paths.student(s.id)}
          actions={[
            { label: 'Open student', onSelect: () => navigate(paths.student(s.id)) },
            { label: 'Open in new tab', onSelect: () => openInNewTab(paths.student(s.id)) },
            { label: 'Mark as followed up', onSelect: () => void markReviewed(s), separatorBefore: true },
          ]}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{s.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              Grade {s.grade || '—'} · signed up {since ? dayLabel(since, today).replace(/^(Today|Yesterday|Tomorrow)$/, (m) => m.toLowerCase()) : 'recently'}
            </div>
          </div>
          {s.status !== 'signed_up' ? <StudentStatusBadge status={s.status} /> : null}
        </HomeRow>
      ))}
      {list.length === 0 ? <EmptyRow>No new sign-ups to follow up on.</EmptyRow> : null}
    </HomeCard>
  )
}
