import { billedHours } from '@shared/schedule/hours'
import { type DateKey, formatDateKey, formatTimeRange } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { cn } from '@/lib/utils'

/** What the header shows about the session: from the session, or from the log's own copy. */
export interface LogSnapshot {
  studentName: string
  subject: string
  dateKey: DateKey
  startMin: number
  endMin: number
  tutorName: string
}

export type LogHeaderStatus = 'draft' | 'submitted' | 'editing' | null

const STATUS: Record<Exclude<LogHeaderStatus, null>, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground ring-border' },
  submitted: { label: 'Submitted', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900' },
  editing: { label: 'Editing', className: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900' },
}

/** The log's sticky header: the branch, the session (student, subject, date, time, billed hours) and the tutor. */
export function LogHeader({
  snap,
  status,
  subtitle,
  usedHours,
}: {
  snap: LogSnapshot
  status: LogHeaderStatus
  subtitle: string
  /** A submitted log's billed hours; otherwise they're computed with the branch's rounding. */
  usedHours?: number | null
}) {
  const { branch, settings } = useBranch()
  const hours = usedHours ?? billedHours(snap.endMin - snap.startMin, settings.students.hourRounding)
  const chip = status ? STATUS[status] : null
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur print:static print:border-b-2">
      <div className="mx-auto grid max-w-4xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)_12rem]">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} />
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="truncate text-sm font-semibold">{branch.name}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <div className="min-w-0 sm:text-center">
          <div className="flex min-w-0 items-center gap-2 sm:justify-center">
            <span className="truncate font-semibold" data-testid="log-student">
              {snap.studentName || '—'}
            </span>
            {chip ? <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', chip.className)}>{chip.label}</span> : null}
          </div>
          <div className="line-clamp-2 text-xs text-muted-foreground tabular-nums sm:line-clamp-1">
            {snap.subject || '—'} · {formatDateKey(snap.dateKey, 'medium')} · {formatTimeRange(snap.startMin, snap.endMin)} ({hours}h)
          </div>
        </div>
        <div className="min-w-0 text-right text-xs">
          <div className="text-muted-foreground">Tutor</div>
          <div className="truncate font-medium">{snap.tutorName || '—'}</div>
        </div>
      </div>
    </header>
  )
}
