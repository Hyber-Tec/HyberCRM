import { useMemo, useState } from 'react'
import { LuCalendarClock, LuChartLine, LuExternalLink, LuMail, LuMapPin, LuPhone } from 'react-icons/lu'
import type { SessionStatus } from '@shared/settings/defaults'
import { type DateKey, addDays, formatDateKey, formatInstant, formatTimeRange, todayKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type ProgressReport, reportTitle } from '@/features/sessions/reportModel'
import { cn } from '@/lib/utils'

/** Session statuses in family-friendly words. */
export const FAMILY_STATUS: Record<SessionStatus, { label: string; className: string }> = {
  pending: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
  confirmed: { label: 'Confirmed', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' },
  present: { label: 'Attended', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' },
  no_show: { label: 'Missed', className: 'bg-muted text-muted-foreground' },
  canceled: { label: 'Canceled', className: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400' },
}

export function FamilyStatus({ status }: { status: SessionStatus }) {
  const s = FAMILY_STATUS[status] ?? FAMILY_STATUS.pending
  return <span className={cn('inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', s.className)}>{s.label}</span>
}

export function dayTitle(d: DateKey, today: DateKey) {
  const label = formatDateKey(d, 'weekdayMedium')
  if (d === today) return `Today · ${label}`
  if (d === addDays(today, 1)) return `Tomorrow · ${label}`
  return label
}

/** Sessions grouped by day; a click opens the details. */
export function SessionList({
  sessions,
  showStudent,
  empty = 'No sessions scheduled.',
}: {
  sessions: WithId<Session>[]
  showStudent?: boolean
  empty?: string
}) {
  const { timezone } = useBranch()
  const today = todayKey(timezone)
  const [open, setOpen] = useState<WithId<Session> | null>(null)
  const days = useMemo(() => {
    const m = new Map<DateKey, WithId<Session>[]>()
    for (const s of sessions) m.set(s.dateKey, [...(m.get(s.dateKey) ?? []), s])
    return [...m.entries()]
  }, [sessions])

  if (!sessions.length) {
    return (
      <Card className="items-center gap-2 py-12 text-center text-sm text-muted-foreground">
        <LuCalendarClock className="size-6 opacity-50" />
        {empty}
      </Card>
    )
  }
  return (
    <Card className="gap-0 overflow-hidden py-0" data-testid="family-sessions">
      {days.map(([d, list]) => (
        <div key={d}>
          <div className={cn('border-b bg-muted/40 px-4 py-1.5 text-xs font-semibold', d === today ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
            {dayTitle(d, today)}
          </div>
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpen(s)}
              className={cn('flex w-full items-center gap-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/40', s.status === 'canceled' && 'opacity-70')}
            >
              <div className="hidden w-36 shrink-0 text-sm font-medium tabular-nums sm:block">{formatTimeRange(s.startMin, s.endMin)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium tabular-nums sm:hidden">{formatTimeRange(s.startMin, s.endMin)}</div>
                <div className={cn('truncate text-sm font-medium', s.status === 'canceled' && 'line-through')}>
                  {showStudent ? `${s.studentName} · ` : ''}
                  {s.subject || 'Tutoring session'}
                </div>
                <div className="truncate text-xs text-muted-foreground">with {s.tutorName}</div>
              </div>
              <FamilyStatus status={s.status} />
            </button>
          ))}
        </div>
      ))}
      <SessionDetails session={open} onClose={() => setOpen(null)} />
    </Card>
  )
}

export function SessionDetails({ session: s, onClose }: { session: WithId<Session> | null; onClose: () => void }) {
  const { branch } = useBranch()
  return (
    <Dialog open={s !== null} onOpenChange={(o) => !o && onClose()}>
      {s ? (
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{s.subject || 'Tutoring session'}</DialogTitle>
            <DialogDescription>{s.studentName}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatDateKey(s.dateKey, 'weekdayLong')}</dd>
            <dt className="text-muted-foreground">Time</dt>
            <dd className="tabular-nums">{formatTimeRange(s.startMin, s.endMin)}</dd>
            <dt className="text-muted-foreground">Tutor</dt>
            <dd>{s.tutorName}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <FamilyStatus status={s.status} />
            </dd>
          </dl>
          <p className="text-xs text-muted-foreground">To change or cancel this session, please contact {branch.name}.</p>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/** The branch's contact details, if any are set. */
export function ContactCard({ title = 'Questions or changes?' }: { title?: string }) {
  const { branch } = useBranch()
  const c = branch.contact
  if (!c || (!c.phone && !c.email && !c.address && !c.website)) return null
  return (
    <Card className="gap-2 px-5 py-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground">Contact {branch.name}:</div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {c.phone ? (
          <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
            <LuPhone className="size-4 text-muted-foreground" /> {c.phone}
          </a>
        ) : null}
        {c.email ? (
          <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:underline">
            <LuMail className="size-4 text-muted-foreground" /> {c.email}
          </a>
        ) : null}
        {c.address ? (
          <span className="inline-flex items-center gap-1.5">
            <LuMapPin className="size-4 text-muted-foreground" /> {c.address}
          </span>
        ) : null}
        {c.website ? (
          <a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
            <LuExternalLink className="size-4 text-muted-foreground" /> {c.website.replace(/^https?:\/\//, '')}
          </a>
        ) : null}
      </div>
    </Card>
  )
}

/** Shared progress reports; each opens the printable report in a new tab. */
export function ReportList({ reports, showStudent }: { reports: WithId<ProgressReport>[]; showStudent?: boolean }) {
  const { branchId, timezone } = useBranch()
  return (
    <Card className="gap-0 overflow-hidden py-0" data-testid="family-reports">
      {reports.map((r) => (
        <div key={r.id} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
          <LuChartLine className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.customName || (showStudent ? reportTitle(r) : `Progress report · ${formatDateKey(r.startDate, 'medium')} – ${formatDateKey(r.endDate, 'medium')}`)}</div>
            <div className="truncate text-xs text-muted-foreground">
              {r.sessionCount} {r.sessionCount === 1 ? 'session' : 'sessions'}
              {r.generatedAt ? ` · prepared ${formatInstant(r.generatedAt.toDate(), timezone, { dateStyle: 'medium' })}` : ''}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.open(`/${branchId}/progress-report/${r.id}`, '_blank', 'noopener')}>
            Open <LuExternalLink />
          </Button>
        </div>
      ))}
    </Card>
  )
}
