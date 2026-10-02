import { serverTimestamp, updateDoc } from 'firebase/firestore'
import { useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuCalendarDays,
  LuCalendarX2,
  LuChevronRight,
  LuCircleCheck,
  LuClockAlert,
  LuGraduationCap,
  LuHandshake,
  LuNotebookPen,
  LuSparkles,
  LuUserPlus,
} from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { ROLE_LABELS } from '@shared/roles'
import { type DateKey, addDays, formatDateKey, formatMinutes, formatTimeRange } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, type MenuEntry, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { restartConferenceCycle } from '@/features/students/api'
import type { ClockShift } from '@/features/timeclock/api'
import { branchDocRef } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import type { useAttention } from './attention'
import { nameList, plural } from './parts'

type Attention = ReturnType<typeof useAttention>

export function dayLabel(d: DateKey, today: DateKey): string {
  if (d === today) return 'Today'
  if (d === addDays(today, 1)) return 'Tomorrow'
  if (d === addDays(today, -1)) return 'Yesterday'
  return formatDateKey(d, 'weekdayMedium')
}

const TONES = {
  red: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400',
}

/**
 * Everything waiting on an admin, one line per kind ("2 sessions in conflict");
 * a line opens to the items, each with its action. The count matches the
 * sidebar's Home badge.
 */
export function NeedsYouCard({ attention, onFixClock }: { attention: Attention; onFixClock: (s: WithId<ClockShift>) => void }) {
  const { branchId, actor, rules, can } = useBranch()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const [open, setOpen] = useState<string | null>(null)
  const { today } = attention
  const admin = `/${branchId}/admin`
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key))
  const openTab = (path: string) => window.open(path, '_blank', 'noopener')

  const markFollowedUp = (s: WithId<Student>) =>
    updateDoc(branchDocRef(branchId, COL.students, s.id), { followUpReviewedAt: serverTimestamp(), updatedBy: actor.email })
      .then(() => toast.success(`${s.name} marked as followed up`))
      .catch(() => toast.error('Could not update the student.'))

  const skipConference = async (s: WithId<Student>) => {
    const cycle = rules.conferences.everyHours
    const ok = await confirm({
      title: 'Skip this conference?',
      description: `Restart the ${cycle}-hour conference cycle for ${s.name} without a conference note.`,
      confirmLabel: `Skip & restart ${cycle} hrs`,
      destructive: true,
    })
    if (!ok) return
    try {
      await restartConferenceCycle(branchId, actor, s)
      toast.success(`Conference cycle restarted for ${s.name}`)
    } catch (e) {
      toast.error(`Failed to skip the conference cycle: ${(e as Error).message}`)
    }
  }

  const groups: GroupProps[] = []
  if (attention.conflicts.length) {
    const first = attention.conflicts[0]
    groups.push({
      id: 'conflicts',
      icon: LuCalendarX2,
      tone: 'red',
      title: plural(attention.conflicts.length, 'session') + ' in conflict',
      subtitle: `${first.conflicts[0]?.message ?? ''}${attention.conflicts.length > 1 ? ` · +${attention.conflicts.length - 1} more` : ''}`,
      items: attention.conflicts.map(({ session: s, conflicts }) => ({
        key: s.id,
        title: `${s.studentName} · ${s.subject || 'No subject'}`,
        detail: `${dayLabel(s.dateKey, today)} · ${formatTimeRange(s.startMin, s.endMin)} · ${conflicts[0]?.message ?? ''}`,
        onOpen: () => navigate(`${admin}/schedule/day/${s.dateKey}`),
        actions: menu(
          { label: 'Go to Schedule on this day', icon: LuCalendarDays, onSelect: () => navigate(`${admin}/schedule/day/${s.dateKey}`) },
          { label: 'Open Schedule in new tab', onSelect: () => openTab(`${admin}/schedule/day/${s.dateKey}`) },
        ),
      })),
    })
  }
  if (attention.missingLogs.length) {
    const oldest = attention.missingLogs[attention.missingLogs.length - 1]
    groups.push({
      id: 'logs',
      icon: LuNotebookPen,
      tone: 'amber',
      title: `${plural(attention.missingLogs.length, 'missing session log')}`,
      subtitle: `Oldest from ${formatDateKey(oldest.dateKey, 'weekdayMedium')}`,
      seeAll: { label: 'Open in Session Log', to: `${admin}/sessions/log?status=missing` },
      items: attention.missingLogs.map((s) => ({
        key: s.id,
        title: `${s.studentName} · ${s.subject || 'No subject'}`,
        detail: `${dayLabel(s.dateKey, today)} · ${formatTimeRange(s.startMin, s.endMin)} · ${s.tutorName}`,
        onOpen: () => openTab(`/${branchId}/session-log/${s.id}`),
        action: { label: 'Add log', onClick: () => openTab(`/${branchId}/session-log/${s.id}`) },
        actions: menu(
          { label: `Write log on behalf of ${s.tutorName}`, icon: LuNotebookPen, onSelect: () => openTab(`/${branchId}/session-log/${s.id}`) },
          { label: 'Go to Schedule on this day', icon: LuCalendarDays, separatorBefore: true, onSelect: () => navigate(`${admin}/schedule/day/${s.dateKey}`) },
        ),
      })),
    })
  }
  if (attention.pendingRequests.length) {
    const names = attention.pendingRequests.map((r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email)
    groups.push({
      id: 'signups',
      icon: LuUserPlus,
      tone: 'sky',
      title: plural(attention.pendingRequests.length, 'sign-up request'),
      subtitle: nameList(names),
      seeAll: { label: 'Review requests', to: `${admin}/account?tab=requests` },
      items: attention.pendingRequests.map((r, i) => ({
        key: r.id,
        title: names[i],
        detail: `${r.email} · wants to join as ${ROLE_LABELS[r.requestedRole] ?? r.requestedRole}`,
        onOpen: () => navigate(`${admin}/account?tab=requests`),
      })),
    })
  }
  if (attention.autoClockOuts.length) {
    const first = attention.autoClockOuts[0]
    const fix = can('timeEntries')
    groups.push({
      id: 'clock',
      icon: LuClockAlert,
      tone: 'amber',
      title: plural(attention.autoClockOuts.length, 'automatic clock-out'),
      subtitle: `${first.staffName} · ${dayLabel(first.dateKey, today)}${first.outMin != null ? ` at ${formatMinutes(first.outMin)}` : ''}${attention.autoClockOuts.length > 1 ? ` · +${attention.autoClockOuts.length - 1} more` : ''}`,
      items: attention.autoClockOuts.map((s) => ({
        key: s.id,
        title: s.staffName,
        detail: `${dayLabel(s.dateKey, today)} · in ${formatMinutes(s.inMin)} → ${s.outMin != null ? formatMinutes(s.outMin) : '—'} (automatic)`,
        onOpen: () => (fix ? onFixClock(s) : navigate(`${admin}/employees/directory/${s.staffId}`)),
        action: fix ? { label: 'Fix time', onClick: () => onFixClock(s) } : undefined,
        actions: menu(
          fix && { label: 'Change clock-out time', onSelect: () => onFixClock(s) },
          { label: 'Open employee', separatorBefore: fix, onSelect: () => navigate(`${admin}/employees/directory/${s.staffId}`) },
        ),
      })),
    })
  }
  if (attention.newStudents.length) {
    groups.push({
      id: 'students',
      icon: LuSparkles,
      tone: 'violet',
      title: plural(attention.newStudents.length, 'new student'),
      subtitle: `${nameList(attention.newStudents.map((n) => n.student.name))} signed up`,
      items: attention.newStudents.map(({ student: s, since }) => ({
        key: s.id,
        title: s.name,
        detail: `Grade ${s.grade || '—'} · signed up ${since ? dayLabel(since, today).replace(/^(Today|Yesterday|Tomorrow)$/, (m) => m.toLowerCase()) : 'recently'}`,
        onOpen: () => navigate(`${admin}/students/${s.id}`),
        action: { label: 'Done', title: 'Mark as followed up', onClick: () => void markFollowedUp(s) },
        actions: menu(
          { label: 'Open student', icon: LuGraduationCap, onSelect: () => navigate(`${admin}/students/${s.id}`) },
          { label: 'Mark as followed up', icon: LuCircleCheck, separatorBefore: true, onSelect: () => void markFollowedUp(s) },
        ),
      })),
    })
  }
  if (attention.conferenceDue.length) {
    const cycle = rules.conferences.everyHours
    groups.push({
      id: 'conferences',
      icon: LuHandshake,
      tone: 'teal',
      title: `${plural(attention.conferenceDue.length, 'parent conference')} due`,
      subtitle: nameList(attention.conferenceDue.map((c) => c.student.name)),
      items: attention.conferenceDue.map(({ student: s, state }) => ({
        key: s.id,
        title: s.name,
        detail: `${Math.floor(state.hoursSince)} of ${cycle} tutoring hours since the last conference`,
        onOpen: () => navigate(`${admin}/students/${s.id}/conference`),
        actions: menu(
          { label: 'Conference notes', icon: LuHandshake, onSelect: () => navigate(`${admin}/students/${s.id}/conference`) },
          { label: 'Open student', icon: LuGraduationCap, onSelect: () => navigate(`${admin}/students/${s.id}`) },
          { label: `Skip & restart ${cycle} hrs`, destructive: true, separatorBefore: true, onSelect: () => void skipConference(s) },
        ),
      })),
    })
  }

  const total = attention.total
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="home-needs-you">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">Needs you</h2>
        {total ? <span className="rounded-full bg-foreground px-2 text-xs leading-5 font-semibold text-background tabular-nums">{total}</span> : null}
      </div>
      {attention.loading && !groups.length ? (
        <div className="px-4 pb-4 text-sm text-muted-foreground">Checking…</div>
      ) : groups.length ? (
        <ul className="divide-y border-t">
          {groups.map((g) => (
            <Group key={g.id} {...g} open={open === g.id} onToggle={() => toggle(g.id)} />
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3 border-t px-4 py-4 text-sm text-muted-foreground">
          <LuCircleCheck className="size-5 text-emerald-600" />
          You’re all caught up.
        </div>
      )}
      {dialog}
    </section>
  )
}

interface Item {
  key: string
  title: string
  detail: string
  onOpen: () => void
  action?: { label: string; title?: string; onClick: () => void }
  actions?: MenuEntry[]
}

interface GroupProps {
  id: string
  icon: IconType
  tone: keyof typeof TONES
  title: string
  subtitle: string
  items: Item[]
  seeAll?: { label: string; to: string }
}

function Group({ icon: Icon, tone, title, subtitle, items, seeAll, open, onToggle }: GroupProps & { open: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="group flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50">
        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-medium">{title}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <LuChevronRight className={cn('mt-2 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-muted-foreground', open && 'rotate-90')} />
      </button>
      {open ? (
        <div className="border-t bg-muted/30">
          <ul className="max-h-80 divide-y overflow-y-auto">
            {items.map((i) => (
              <ContextMenuFor key={i.key} entries={i.actions ?? []}>
                <li className="flex items-center gap-2 px-4 py-2 pl-15">
                  <button type="button" onClick={i.onOpen} className="min-w-0 flex-1 text-left leading-tight hover:underline-offset-2 [&:hover>span:first-child]:underline">
                    <span className="block truncate text-sm">{i.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground tabular-nums">{i.detail}</span>
                  </button>
                  {i.action ? (
                    <Button variant="outline" size="xs" title={i.action.title} onClick={i.action.onClick}>
                      {i.action.label}
                    </Button>
                  ) : null}
                </li>
              </ContextMenuFor>
            ))}
          </ul>
          {seeAll ? (
            <div className="border-t px-4 py-2 pl-15">
              <button type="button" className="text-xs font-medium underline-offset-2 hover:underline" onClick={() => navigate(seeAll.to)}>
                {seeAll.label} →
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
