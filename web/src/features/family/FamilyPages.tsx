import { useMemo, useState } from 'react'
import { LuCalendarDays, LuChartLine, LuClock, LuList } from 'react-icons/lu'
import { STUDENT_STATUS_LABELS } from '@shared/people'
import { type DateKey, addDays, formatDateKey, formatInstant, formatTimeRange, startOfMonth, todayKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useSubjects } from '@/features/data/hooks'
import { StudentMonthCalendar } from '@/features/schedule/StudentMonthCalendar'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { ContactCard, FamilyStatus, ReportList, SessionDetails, SessionList, dayTitle } from './FamilyWidgets'
import { useFamilySessions, useLinkedStudentIds, useSharedReports, useStudentsById } from './data'

function NotLinked({ who }: { who: 'parent' | 'student' }) {
  const { branch } = useBranch()
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{who === 'parent' ? 'No students linked yet' : 'Your account isn’t linked yet'}</EmptyTitle>
          <EmptyDescription>
            {who === 'parent'
              ? `Ask ${branch.name} to link your child to your account.`
              : `Ask ${branch.name} to link your account to your student record.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <ContactCard title="Contact" />
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant={active ? 'default' : 'outline'} size="sm" className="rounded-full" aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  )
}

// ---------------------------------------------------------------- parent

/** Parent → Upcoming sessions for their linked children (read-only). */
export function ParentHomePage() {
  const { timezone } = useBranch()
  const ids = useLinkedStudentIds('parent')
  const { map: students } = useStudentsById(ids)
  const [child, setChild] = useState('all')
  const [view, setView] = useState<'list' | 'month'>('list')
  const [weeks, setWeeks] = useState(4)
  const [month, setMonth] = useState<DateKey>(() => startOfMonth(todayKey(timezone)))
  const [open, setOpen] = useState<WithId<Session> | null>(null)
  const today = todayKey(timezone)
  const { data, loading } = useFamilySessions(ids, today, addDays(today, weeks * 7))
  const sessions = data.filter((s) => child === 'all' || s.studentId === child)
  const name = (id: string) => students.get(id)?.firstName || students.get(id)?.name || 'Student'
  const monthChild = child === 'all' ? ids[0] : child

  if (!ids.length) return <NotLinked who="parent" />
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Upcoming sessions"
        description={ids.length > 1 ? `For ${ids.map(name).join(', ')}` : students.get(ids[0])?.name}
        actions={
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as 'list' | 'month')}>
            <ToggleGroupItem value="list" aria-label="List">
              <LuList /> List
            </ToggleGroupItem>
            <ToggleGroupItem value="month" aria-label="Month">
              <LuCalendarDays /> Month
            </ToggleGroupItem>
          </ToggleGroup>
        }
        className="mb-2"
      />
      {ids.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {view === 'list' ? (
            <Chip active={child === 'all'} onClick={() => setChild('all')}>
              Everyone
            </Chip>
          ) : null}
          {ids.map((id) => (
            <Chip key={id} active={(view === 'month' ? monthChild : child) === id} onClick={() => setChild(id)}>
              {name(id)}
            </Chip>
          ))}
        </div>
      ) : null}
      {view === 'list' ? (
        loading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <>
            <SessionList sessions={sessions} showStudent={ids.length > 1 && child === 'all'} empty={`No sessions in the next ${weeks} weeks.`} />
            {weeks < 12 ? (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setWeeks((w) => w + 4)}>
                  Show 4 more weeks
                </Button>
              </div>
            ) : null}
          </>
        )
      ) : (
        <Card className="p-4">
          <StudentMonthCalendar studentId={monthChild} month={month} onMonth={setMonth} onPickSession={setOpen} />
          <SessionDetails session={open} onClose={() => setOpen(null)} />
        </Card>
      )}
      <ContactCard />
    </div>
  )
}

/** Parent → progress reports the branch shared. */
export function ParentReportsPage() {
  const { branch } = useBranch()
  const ids = useLinkedStudentIds('parent')
  const { map: students } = useStudentsById(ids)
  const { data: reports, loading } = useSharedReports(ids)
  if (!ids.length) return <NotLinked who="parent" />
  const groups = ids.map((id) => ({ id, name: students.get(id)?.name ?? 'Student', items: reports.filter((r) => r.studentId === id) })).filter((g) => g.items.length)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Progress reports" description={`Reports ${branch.name} has shared with you.`} className="mb-2" />
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : groups.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No reports yet</EmptyTitle>
            <EmptyDescription>When {branch.name} shares a progress report, it will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="space-y-2">
            {ids.length > 1 ? <h2 className="text-sm font-semibold">{g.name}</h2> : null}
            <ReportList reports={g.items} />
          </section>
        ))
      )}
    </div>
  )
}

// ---------------------------------------------------------------- student

function useMe() {
  const ids = useLinkedStudentIds('student')
  const { map, loading } = useStudentsById(ids)
  return { ids, me: ids[0] ? (map.get(ids[0]) ?? null) : null, loading }
}

/** Student → Home: the next session, what's coming up and shared reports. */
export function StudentHomePage() {
  const { timezone } = useBranch()
  const { ids, me } = useMe()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const { data, loading } = useFamilySessions(ids, today, addDays(today, 28))
  const { data: reports } = useSharedReports(ids)
  const upcoming = useMemo(() => data.filter((s) => s.status !== 'canceled' && s.endAt.toMillis() >= now), [data, now])
  const next = upcoming[0]
  const [open, setOpen] = useState<WithId<Session> | null>(null)

  if (!ids.length) return <NotLinked who="student" />
  const greeting = formatInstant(now, timezone, { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Hi{me?.firstName ? `, ${me.firstName}` : ''}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">{greeting}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className={cn('gap-2 p-5 sm:col-span-2', next && 'cursor-pointer hover:shadow-md')} onClick={() => next && setOpen(next)} data-testid="next-session">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <LuClock className="size-3.5" /> Next session
          </div>
          {next ? (
            <>
              <div className="text-xl font-semibold">{dayTitle(next.dateKey, today)}</div>
              <div className="text-sm tabular-nums">{formatTimeRange(next.startMin, next.endMin)}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {next.subject || 'Tutoring session'} · with {next.tutorName}
                <FamilyStatus status={next.status} />
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">{loading ? 'Loading…' : 'No sessions scheduled yet.'}</div>
          )}
        </Card>
        <Card className="gap-1 p-5">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Hours of tutoring</div>
          <div className="text-3xl font-semibold tabular-nums">{(me?.totalSessionHours ?? 0).toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">
            {me?.lastSessionDate ? `Last session ${formatDateKey(me.lastSessionDate, 'monthDay')}` : me?.totalSessionHours ? '' : 'No sessions yet'}
          </div>
        </Card>
      </div>
      <h2 className="pt-2 text-sm font-semibold">Coming up</h2>
      {loading ? <Skeleton className="h-48 w-full rounded-xl" /> : <SessionList sessions={data.filter((s) => s.endAt.toMillis() >= now)} empty="Nothing scheduled in the next 4 weeks." />}
      {reports.length ? (
        <>
          <h2 className="flex items-center gap-2 pt-2 text-sm font-semibold">
            <LuChartLine className="size-4" /> Progress reports
          </h2>
          <ReportList reports={reports} />
        </>
      ) : null}
      <ContactCard />
      <SessionDetails session={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/** Student → Calendar: their sessions month by month. */
export function StudentPortalCalendarPage() {
  const { timezone } = useBranch()
  const { ids } = useMe()
  const [month, setMonth] = useState<DateKey>(() => startOfMonth(todayKey(timezone)))
  const [open, setOpen] = useState<WithId<Session> | null>(null)
  if (!ids.length) return <NotLinked who="student" />
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Calendar" description="Your tutoring sessions. Click a session for details." />
      <Card className="p-4">
        <StudentMonthCalendar studentId={ids[0]} month={month} onMonth={setMonth} onPickSession={setOpen} />
      </Card>
      <SessionDetails session={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/** Student → My Info: the basic record (contact details stay with the branch). */
export function StudentInfoPage() {
  const { branch } = useBranch()
  const { ids, me, loading } = useMe()
  const { data: subjects } = useSubjects()
  if (!ids.length) return <NotLinked who="student" />
  if (loading) return <Skeleton className="mx-auto h-72 w-full max-w-3xl rounded-xl" />
  if (!me) return <NotLinked who="student" />
  const subjectNames = me.subjectIds.map((id) => subjects.find((s) => s.id === id)?.name).filter(Boolean)
  const rows: [string, React.ReactNode][] = [
    ['Name', me.name],
    ['Grade', me.grade || '—'],
    ['School', me.school || '—'],
    ['Status', <Badge key="s" variant="secondary">{STUDENT_STATUS_LABELS[me.status] ?? me.status}</Badge>],
    ['Subjects', subjectNames.length ? subjectNames.join(', ') : '—'],
    ['Signed up', me.signUpDate ? formatDateKey(me.signUpDate, 'medium') : '—'],
    ['First session', me.firstSessionDate ? formatDateKey(me.firstSessionDate, 'medium') : '—'],
    ['Hours of tutoring', (me.totalSessionHours ?? 0).toFixed(1)],
  ]
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="My info" description={`What ${branch.name} has on file for you.`} className="mb-2" />
      <Card className="gap-0 py-0">
        <dl className="divide-y">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[9rem_1fr] gap-4 px-5 py-3 text-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <ContactCard title="Something out of date?" />
    </div>
  )
}

