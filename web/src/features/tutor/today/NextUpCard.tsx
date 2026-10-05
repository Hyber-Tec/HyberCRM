import { LuArrowUpRight, LuCalendarClock, LuCalendarDays, LuGraduationCap, LuSparkles, LuStickyNote, LuTriangleAlert } from 'react-icons/lu'
import { Link } from 'react-router'
import { tutorConflictText } from '@shared/schedule/conflicts'
import { isFirstSession } from '@shared/schedule/firstSession'
import { addDays, formatDateKey, formatDuration, formatMinutes } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatePill } from '@/features/home/parts'
import { SESSION_CARD_STYLE } from '@/features/schedule/cardStyle'
import { cn } from '@/lib/utils'
import { leftText, logAction, openInNewTab, untilText } from '../sessionUi'
import type { TutorDay } from './useTutorDay'

/** Sessions shown in the card before "and N more". */
const SHOWN = 3

/**
 * The session that matters now: the ones in progress (with what's left and
 * what comes after), else the next start today with a countdown, else the
 * next day with sessions.
 */
export function NextUpCard({ t }: { t: TutorDay }) {
  const { branchId, settings } = useBranch()
  const next = t.day.next
  const tutor = `/${branchId}/tutor`

  if (t.loading) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-5 h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </section>
    )
  }

  if (next.kind === 'none') {
    return (
      <section className="rounded-xl border bg-card p-5" data-testid="next-up">
        <Eyebrow>Next up</Eyebrow>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <LuCalendarClock className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">No sessions booked in the next four weeks</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Sessions are booked inside your availability. Keep it set at least {settings.availability.leadTimeDays} days ahead.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to={`${tutor}/availability`}>Set availability</Link>
          </Button>
        </div>
      </section>
    )
  }

  const first = next.sessions[0]
  const shown = next.sessions.slice(0, SHOWN)
  const more = next.sessions.length - shown.length
  const header =
    next.kind === 'now' ? (
      <>
        <Eyebrow tone="live">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Now
          <span className="font-normal text-muted-foreground">
            {next.sessions.length > 1 ? `· ${next.sessions.length} sessions` : `· ends at ${formatMinutes(first.endMin)}`}
          </span>
        </Eyebrow>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">{leftText(Math.min(...next.sessions.map((s) => s.endMin)) - t.nowMin)}</span>
      </>
    ) : next.kind === 'later' ? (
      <>
        <Eyebrow>
          Next up <span className="font-normal text-muted-foreground">· {untilText(next.startMin - t.nowMin)}</span>
        </Eyebrow>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatMinutes(next.startMin)}</span>
      </>
    ) : (
      <>
        <Eyebrow>
          Next up{' '}
          <span className="font-normal text-muted-foreground">
            · {next.dateKey === addDays(t.today, 1) ? 'Tomorrow' : formatDateKey(next.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')}
          </span>
        </Eyebrow>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatMinutes(first.startMin)}</span>
      </>
    )

  // How far the first session in progress has run.
  const progress = next.kind === 'now' ? Math.min(1, Math.max(0, (t.nowMin - first.startMin) / Math.max(1, first.endMin - first.startMin))) : null

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="next-up" aria-label="Next up">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">{header}</div>
      {progress !== null ? (
        <div className="mx-5 mt-3 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
      <ul className="mt-3 divide-y">
        {shown.map((s) => (
          <NextSession key={s.id} s={s} t={t} />
        ))}
      </ul>
      {next.kind === 'now' && next.then ? (
        <Footer>
          Then at <span className="font-medium text-foreground tabular-nums">{formatMinutes(next.then.startMin)}</span> · {next.then.studentName}
          {next.then.subject ? `, ${next.then.subject}` : ''}
        </Footer>
      ) : null}
      {next.kind === 'day' ? (
        <Footer
          action={
            <Link to={`${tutor}/schedule?date=${next.dateKey}`} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
              <LuCalendarDays className="size-3.5" /> Open in schedule
            </Link>
          }
        >
          {next.sessions.length} {next.sessions.length === 1 ? 'session' : 'sessions'} that day, {formatMinutes(first.startMin)} –{' '}
          {formatMinutes(Math.max(...next.sessions.map((s) => s.endMin)))}
        </Footer>
      ) : more > 0 ? (
        <Footer>
          and {more} more at the same time
        </Footer>
      ) : null}
    </section>
  )
}

function NextSession({ s, t }: { s: WithId<Session>; t: TutorDay }) {
  const { branchId, settings } = useBranch()
  const student = t.student(s.studentId)
  const waiting = tutorConflictText(t.conflictsOf(s.id))
  const action = logAction(s, { branchId, today: t.today, nowMin: t.nowMin, allowed: settings.sessionLogs.allowForStatuses })
  // The schedule bell's "First session" notice, from the same rule.
  const first = settings.schedule.alerts.firstSession && !!student && isFirstSession(s, student, t.sessions)
  const learning = student?.learningNote?.trim()
  const bar = SESSION_CARD_STYLE[s.status]?.bar ?? '#a1a1aa'
  return (
    <li className="flex gap-4 px-5 py-4" data-testid="next-session">
      <span className="w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: bar }} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-lg leading-tight font-semibold">{s.studentName}</h2>
            {s.studentGrade ? <span className="text-sm text-muted-foreground">Grade {s.studentGrade}</span> : null}
            {first ? (
              <StatePill tone="info">
                <LuSparkles className="size-3" /> First session
              </StatePill>
            ) : null}
            {s.status === 'pending' && !waiting ? (
              <StatePill tone="warn" title="Booked, not confirmed yet.">
                Unconfirmed
              </StatePill>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium whitespace-nowrap text-foreground">{s.subject || 'No subject'}</span>
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            <span className="whitespace-nowrap tabular-nums">
              {formatMinutes(s.startMin)} – {formatMinutes(s.endMin)}
            </span>
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            <span className="whitespace-nowrap">{formatDuration(s.endMin - s.startMin)}</span>
          </p>
          {s.note ? (
            <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              <LuStickyNote className="mt-0.5 size-3.5 shrink-0" />
              {s.note}
            </p>
          ) : null}
          {learning ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">About {s.studentName.split(' ')[0]}:</span> {learning}
            </p>
          ) : null}
          {waiting ? (
            <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0 text-red-600" />
              <span>
                <span className="font-semibold">Not confirmed:</span> {waiting}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {action ? (
            <Button
              variant={action.due || action.label === 'Session log' ? 'default' : 'outline'}
              size="sm"
              onClick={() => openInNewTab(action.path)}
              data-testid="next-log"
            >
              {action.label} <LuArrowUpRight />
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/${branchId}/tutor/students/${s.studentId}`}>
              <LuGraduationCap /> Student
            </Link>
          </Button>
        </div>
      </div>
    </li>
  )
}

function Eyebrow({ children, tone }: { children: React.ReactNode; tone?: 'live' }) {
  return (
    <span className={cn('flex items-center gap-2 text-sm font-semibold', tone === 'live' ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>
      {children}
    </span>
  )
}

function Footer({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-5 py-2.5 text-sm text-muted-foreground">
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  )
}
