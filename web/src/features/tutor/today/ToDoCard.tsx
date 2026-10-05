import { useState } from 'react'
import type { IconType } from 'react-icons'
import { LuArrowUpRight, LuCalendarClock, LuCalendarX2, LuCircleCheck, LuMegaphone, LuNotebookPen } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router'
import { tutorConflictText } from '@shared/schedule/conflicts'
import { addDays, dateKeyOf, formatDateKey, formatMinutes } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { plural } from '@/features/home/parts'
import { cn } from '@/lib/utils'
import { openInNewTab } from '../sessionUi'
import type { TutorDay } from './useTutorDay'

/** Items shown per kind before "Show N more". */
const SHOWN = 3

const TONES = {
  red: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
}

interface Item {
  key: string
  title: string
  detail: string
  onOpen: () => void
  action?: { label: string; onClick: () => void; external?: boolean }
}

/**
 * What the tutor still has to do: logs to write (last two weeks), sessions
 * waiting for the admin, open days that still need availability, and posts
 * not read yet. Each line opens the place to do it.
 */
export function ToDoCard({ t }: { t: TutorDay }) {
  const { branchId, settings, timezone } = useBranch()
  const navigate = useNavigate()
  const tutor = `/${branchId}/tutor`
  const { logs, waiting, gaps, unread, total } = t.todo
  const day = (d: string) => (d === t.today ? 'Today' : d === addDays(t.today, -1) ? 'Yesterday' : d === addDays(t.today, 1) ? 'Tomorrow' : formatDateKey(d, 'weekdayMedium'))

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="tutor-todo">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold">To do</h2>
        {total ? <span className="rounded-full bg-foreground px-2 text-xs leading-5 font-semibold text-background tabular-nums">{total}</span> : null}
      </div>
      {t.todoLoading && total === 0 ? (
        <div className="border-t px-4 py-4 text-sm text-muted-foreground">Checking…</div>
      ) : total === 0 ? (
        <div className="flex items-start gap-3 border-t px-4 py-4">
          <LuCircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div className="text-sm">
            <p className="font-medium">You’re all caught up.</p>
            <p className="mt-0.5 text-muted-foreground">Logs are written, your availability is set and you’ve read every post.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y border-t">
          {waiting.length ? (
            <Group
              icon={LuCalendarX2}
              tone="red"
              title={`${plural(waiting.length, 'session')} waiting for the admin`}
              subtitle="Something changed since booking. Don’t count on them until the admin moves, reassigns or cancels them."
              items={waiting.map((s) => ({
                key: s.id,
                title: `${s.studentName} · ${s.subject || 'No subject'}`,
                detail: `${day(s.dateKey)}, ${formatMinutes(s.startMin)} · ${(tutorConflictText(t.conflictsOf(s.id)) ?? '').replace(/ Waiting for the admin.*$/, '')}`,
                onOpen: () => navigate(`${tutor}/schedule?date=${s.dateKey}`),
              }))}
            />
          ) : null}
          {logs.length ? (
            <Group
              icon={LuNotebookPen}
              tone="amber"
              title={`Write ${plural(logs.length, 'session log')}`}
              subtitle={logs.length > 1 ? (logs[logs.length - 1].dateKey === t.today ? 'All from today' : `Oldest from ${day(logs[logs.length - 1].dateKey).replace(/^Yesterday$/, 'yesterday')}`) : undefined}
              items={logs.map((s) => ({
                key: s.id,
                title: `${s.studentName} · ${s.subject || 'No subject'}`,
                detail: `${day(s.dateKey)}, ${formatMinutes(s.startMin)}${s.logStatus === 'draft' ? ' · draft saved' : ''}`,
                onOpen: () => openInNewTab(`/${branchId}/session-log/${s.id}`),
                action: { label: s.logStatus === 'draft' ? 'Finish' : 'Write', external: true, onClick: () => openInNewTab(`/${branchId}/session-log/${s.id}`) },
              }))}
            />
          ) : null}
          {gaps.length ? (
            <Group
              icon={LuCalendarClock}
              tone="violet"
              title={`Set availability for ${plural(gaps.length, 'day')}`}
              subtitle={`Open days inside your ${settings.availability.leadTimeDays}-day notice. Each locks ${settings.availability.lockWindowDays} days ahead.`}
              seeAll={{ label: 'Open Availability', to: `${tutor}/availability` }}
              items={gaps.map((d) => {
                const h = t.hoursOf(d)
                return {
                  key: d,
                  title: formatDateKey(d, 'weekdayLong').replace(/, \d{4}$/, ''),
                  detail: h.isOpen ? `Open ${formatMinutes(h.openMin)} – ${formatMinutes(h.closeMin)}` : 'Open',
                  onOpen: () => navigate(`${tutor}/availability?date=${d}`),
                  action: { label: 'Set', onClick: () => navigate(`${tutor}/availability?date=${d}`) },
                }
              })}
            />
          ) : null}
          {unread.length ? (
            <Group
              icon={LuMegaphone}
              tone="sky"
              title={plural(unread.length, 'unread announcement')}
              items={unread.map((a) => ({
                key: a.id,
                title: a.title,
                detail: `${a.authorName}${a.createdAt ? ` · ${day(dateKeyOf(a.createdAt.toDate(), timezone))}` : ''}${a.pinned ? ' · Pinned' : ''}`,
                onOpen: () => navigate(`${tutor}/announcements/${a.id}`),
                action: { label: 'Read', onClick: () => navigate(`${tutor}/announcements/${a.id}`) },
              }))}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

function Group({
  icon: Icon,
  tone,
  title,
  subtitle,
  items,
  seeAll,
}: {
  icon: IconType
  tone: keyof typeof TONES
  title: string
  subtitle?: string
  items: Item[]
  seeAll?: { label: string; to: string }
}) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, SHOWN)
  const hidden = items.length - shown.length
  return (
    <div className="px-4 py-3.5" data-testid="todo-group">
      <div className="flex items-start gap-3">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 pt-1 leading-tight">
          <h3 className="text-sm font-medium">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 pl-11">
        {shown.map((i) => (
          <li key={i.key} className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
            <button type="button" onClick={i.onOpen} className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-sm">{i.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">{i.detail}</span>
            </button>
            {i.action ? (
              <Button variant="outline" size="xs" onClick={i.action.onClick}>
                {i.action.label}
                {i.action.external ? <LuArrowUpRight /> : null}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {hidden > 0 || seeAll ? (
        <div className="mt-1 flex items-center gap-3 pl-11 text-xs">
          {hidden > 0 ? (
            <button type="button" className="font-medium text-muted-foreground hover:text-foreground" onClick={() => setAll(true)}>
              Show {hidden} more
            </button>
          ) : null}
          {seeAll ? (
            <Link to={seeAll.to} className="font-medium text-muted-foreground hover:text-foreground">
              {seeAll.label} →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
