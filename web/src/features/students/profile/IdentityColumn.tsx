import { LuArrowRight, LuCalendarPlus, LuChevronRight, LuFilePlus2, LuMail, LuPhone } from 'react-icons/lu'
import { formatPhone } from '@shared/people'
import { type ConferenceState } from '@shared/people'
import { formatDateKey } from '@shared/time'
import type { Staff, Student, StudentPrivateProfile, WithId } from '@shared/types'
import { StudentStatusBadge } from '@/components/app/StatusBadge'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LEVEL_STYLE, levelLabel } from '@/features/reports/model'
import { cn } from '@/lib/utils'
import { Ring } from './charts'
import { initialsOf, timeSpan } from './model'
import type { StudentActivity } from './useStudentActivity'

export type ProfileTab = 'sessions' | 'info' | 'school' | 'conference' | 'calendar'

const actionClass = 'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground [&_svg]:size-[18px] [&_svg]:text-foreground'

/**
 * The student page's left column: who the student is, quick actions, key
 * numbers, the next session, family, tutors and the conference cycle. It
 * stays in view while the tabs change.
 */
export function IdentityColumn({
  student,
  activity,
  priv,
  isAdmin,
  conference,
  staffById,
  canCreateReport,
  onTab,
  onNewSession,
  onNewReport,
  onOpenSession,
}: {
  student: WithId<Student>
  activity: StudentActivity
  /** Contact details (admins only). */
  priv: StudentPrivateProfile | null
  isAdmin: boolean
  /** Parent conferences, when the branch holds them (admins only). */
  conference: ConferenceState | null
  staffById: Map<string, WithId<Staff>>
  canCreateReport: boolean
  onTab: (tab: ProfileTab) => void
  onNewSession: () => void
  onNewReport: () => void
  onOpenSession: (id: string) => void
}) {
  const { summary, attendance, next } = activity
  const level = summary?.progress.level ?? null
  const first = student.firstName || student.name.split(' ')[0]
  const emails = priv
    ? [
        ...(priv.email ? [{ label: `${first} (student)`, value: priv.email }] : []),
        ...priv.parents.filter((p) => p.email).map((p) => ({ label: `${p.name}${p.relation ? ` (${p.relation})` : ''}`, value: p.email })),
      ]
    : []
  const phones = priv
    ? [
        ...(priv.phone ? [{ label: `${first} (student)`, value: priv.phone }] : []),
        ...priv.parents.filter((p) => p.phone).map((p) => ({ label: `${p.name}${p.relation ? ` (${p.relation})` : ''}`, value: p.phone })),
      ]
    : []
  const actions = [
    isAdmin ? (
      <button key="session" type="button" className={actionClass} onClick={onNewSession}>
        <LuCalendarPlus />
        Session
      </button>
    ) : null,
    canCreateReport ? (
      <button key="report" type="button" className={actionClass} onClick={onNewReport}>
        <LuFilePlus2 />
        Report
      </button>
    ) : null,
    emails.length ? (
      <ContactMenu key="email" icon={<LuMail />} label="Email" title="Send an email" items={emails.map((e) => ({ ...e, href: `mailto:${e.value}` }))} all={emails.length > 1 ? `mailto:${emails.map((e) => e.value).join(',')}` : null} />
    ) : null,
    phones.length ? <ContactMenu key="call" icon={<LuPhone />} label="Call" title="Call" items={phones.map((p) => ({ ...p, value: formatPhone(p.value), href: `tel:${p.value.replace(/[^\d+]/g, '')}` }))} all={null} /> : null,
  ].filter(Boolean)

  return (
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start" data-testid="student-identity">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="h-20 bg-gradient-to-r from-indigo-100 via-sky-50 to-emerald-50 dark:from-indigo-950/60 dark:via-sky-950/40 dark:to-emerald-950/40" />
        <div className="-mt-10 px-5 pb-5">
          <span className="flex size-[76px] items-center justify-center rounded-2xl bg-card p-1 shadow-sm ring-1 ring-border">
            <span className="flex size-full items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl font-semibold text-white">{initialsOf(student.name)}</span>
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">{student.name}</h1>
          <p className="text-sm text-muted-foreground">{[student.grade ? (/^\d+$/.test(student.grade) ? `Grade ${student.grade}` : student.grade) : null, student.school || null].filter(Boolean).join(' · ') || 'No grade or school yet'}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <StudentStatusBadge status={student.status} />
            {level ? (
              <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset', LEVEL_STYLE[level].chip)}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: LEVEL_STYLE[level].dot }} />
                {levelLabel(level, 'staff')}
              </span>
            ) : null}
          </div>
          {actions.length ? (
            <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, actions.length)}, minmax(0, 1fr))` }}>
              {actions}
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 border-t text-center">
          <Stat label="Total hours" value={(student.totalSessionHours ?? 0).toFixed(1)} className="border-r border-b" />
          <Stat label="Sessions logged" value={String(activity.logs.length)} className="border-b" />
          <Stat label="Attendance" value={attendance.percent !== null ? `${attendance.percent}%` : '—'} className="border-r" />
          <Stat label="Homework done" value={summary?.facts.homework.percent != null ? `${summary.facts.homework.percent}%` : '—'} />
        </dl>
        <dl className="hidden space-y-2 border-t px-5 py-4 text-sm sm:block">
          <DateRow label="Signed up" value={student.signUpDate} />
          <DateRow label="First session" value={student.firstSessionDate} />
          <DateRow label="Last session" value={student.lastSessionDate} />
        </dl>
      </div>

      <div className="rounded-xl bg-zinc-900 p-4 text-white shadow-sm dark:bg-zinc-800" data-testid="next-session">
        {next ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
              <span className="font-medium tracking-wide uppercase">Next session</span>
              <SessionStatusBadge status={next.status} />
            </div>
            <div className="mt-3 text-lg font-semibold">{formatDateKey(next.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')}</div>
            <div className="text-sm text-zinc-300">
              {timeSpan(next.startMin, next.endMin)}
              {next.subject ? ` · ${next.subject}` : ''}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold">{initialsOf(next.tutorName)}</span>
              <span className="truncate">{next.tutorName}</span>
              {isAdmin ? (
                <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-zinc-300 hover:text-white" onClick={() => onOpenSession(next.id)}>
                  Open <LuArrowRight className="size-3.5" />
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Next session</div>
            <div className="mt-2 text-sm text-zinc-300">Nothing booked yet.</div>
            {isAdmin ? (
              <Button size="sm" variant="secondary" className="mt-3" onClick={onNewSession}>
                <LuCalendarPlus /> Book a session
              </Button>
            ) : null}
          </>
        )}
      </div>

      {isAdmin ? (
        <div className="hidden rounded-xl border bg-card p-4 lg:block">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Family</h2>
            <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => onTab('info')}>
              Edit
            </button>
          </div>
          {priv?.parents.length ? (
            <ul className="space-y-3">
              {priv.parents.map((p, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Avatar name={p.name || '?'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name || 'No name'}</div>
                    <div className="truncate text-xs text-muted-foreground">{[p.relation, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(' · ') || p.email}</div>
                  </div>
                  {p.email ? (
                    <a className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" href={`mailto:${p.email}`} aria-label={`Email ${p.name}`}>
                      <LuMail className="size-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No parents or guardians yet.</p>
          )}
        </div>
      ) : null}

      {activity.tutors.length ? (
        <div className="hidden rounded-xl border bg-card p-4 lg:block">
          <h2 className="mb-3 text-sm font-semibold">Tutors</h2>
          <ul className="space-y-3">
            {activity.tutors.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                <Avatar name={t.name} color={staffById.get(t.id)?.color} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.subjects.join(' · ') || 'No subject'}</div>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{t.logs ? `${t.logs} log${t.logs === 1 ? '' : 's'}` : 'Booked'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {conference ? (
        <button type="button" className="hidden w-full items-center gap-3 rounded-xl border bg-card p-4 text-left hover:bg-muted/40 lg:flex" onClick={() => onTab('conference')}>
          <Ring value={conference.hoursSince} max={conference.cycleHours} label={conference.hoursSince.toFixed(0)} color={conference.needed ? '#d03b3b' : undefined} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Parent conference</div>
            <div className="text-xs text-muted-foreground">
              {conference.hoursSince.toFixed(0)} of {conference.cycleHours} hours ·{' '}
              {conference.needed ? 'due now' : `due in about ${Math.max(1, Math.round(conference.cycleHours - conference.hoursSince))} hours`}
            </div>
          </div>
          <LuChevronRight className="size-4 text-muted-foreground" />
        </button>
      ) : null}
    </aside>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('px-3 py-3', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function DateRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ? formatDateKey(value, 'medium') : '—'}</dd>
    </div>
  )
}

export function Avatar({ name, color, className }: { name: string; color?: string; className?: string }) {
  const c = color ?? '#52525b'
  return (
    <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', className)} style={{ backgroundColor: `${c}1f`, color: c }} title={name}>
      {initialsOf(name)}
    </span>
  )
}

/** Email or Call: one item opens directly; several open a menu of who to reach. */
function ContactMenu({ icon, label, title, items, all }: { icon: React.ReactNode; label: string; title: string; items: { label: string; value: string; href: string }[]; all: string | null }) {
  if (items.length === 1) {
    return (
      <a className={actionClass} href={items[0].href} title={`${title}: ${items[0].label}`}>
        {icon}
        {label}
      </a>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={actionClass}>
          {icon}
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        {items.map((it) => (
          <DropdownMenuItem key={it.href} asChild>
            <a href={it.href} className="flex flex-col items-start gap-0">
              <span className="text-sm">{it.label}</span>
              <span className="text-xs text-muted-foreground">{it.value}</span>
            </a>
          </DropdownMenuItem>
        ))}
        {all ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={all}>Email everyone</a>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
