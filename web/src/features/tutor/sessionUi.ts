import type { SessionStatus } from '@shared/settings/defaults'
import { canLog } from '@shared/sessions/logs'
import { type DateKey, formatDateKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import type { Tone } from '@/features/home/parts'

/** The session log opens in a new tab, as from the schedule (the demo keeps it in the same window). */
export function openInNewTab(path: string) {
  window.open(path, '_blank', 'noopener')
}

export interface LogAction {
  label: string
  path: string
  /** The log is owed (the session ended without one). */
  due: boolean
}

/**
 * What a session's log button says and opens: Prepare before it starts (the
 * log's first step shows the student and last session), Session log while it
 * runs, Write log once it's over, View log after it's submitted.
 */
export function logAction(s: WithId<Session>, ctx: { branchId: string; today: DateKey; nowMin: number; allowed: readonly SessionStatus[] }): LogAction | null {
  const base = `/${ctx.branchId}/session-log/${s.id}`
  if (s.logStatus === 'submitted') return { label: 'View log', path: `${base}/view`, due: false }
  if (!canLog(s.status, ctx.allowed)) return null
  const started = s.dateKey < ctx.today || (s.dateKey === ctx.today && s.startMin <= ctx.nowMin)
  const ended = s.dateKey < ctx.today || (s.dateKey === ctx.today && s.endMin <= ctx.nowMin)
  if (ended) return { label: 'Write log', path: base, due: true }
  return { label: started ? 'Session log' : 'Prepare', path: base, due: false }
}

/** How a session stands, for the pill on its row (the admin Home's words, from the tutor's side). */
export function sessionState(
  s: WithId<Session>,
  ctx: { today: DateKey; nowMin: number; allowed: readonly SessionStatus[]; waiting: string | null },
): { label: string; tone: Tone; pulse?: boolean; title?: string } {
  if (s.status === 'canceled') return { label: 'Canceled', tone: 'muted' }
  if (s.status === 'no_show') return { label: 'No show', tone: 'danger' }
  const ended = s.dateKey < ctx.today || (s.dateKey === ctx.today && s.endMin <= ctx.nowMin)
  if (ended) {
    if (s.logStatus === 'submitted') return { label: 'Logged', tone: 'done' }
    return canLog(s.status, ctx.allowed) ? { label: s.logStatus === 'draft' ? 'Draft saved' : 'Log due', tone: 'warn' } : { label: 'Done', tone: 'muted' }
  }
  if (ctx.waiting) return { label: 'Waiting for admin', tone: 'danger', title: ctx.waiting }
  if (s.dateKey === ctx.today && s.startMin <= ctx.nowMin) return { label: 'In progress', tone: 'live', pulse: true }
  if (s.status === 'pending') return { label: 'Unconfirmed', tone: 'warn', title: 'Booked, not confirmed yet.' }
  if (s.status === 'present') return { label: 'Present', tone: 'muted' }
  return { label: 'Confirmed', tone: 'muted' }
}

/** "in 25 min", "in 1 hr 5 min" (until a start time today). */
export function untilText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 1) return 'now'
  if (m < 60) return `in ${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `in ${h} hr ${r} min` : `in ${h} hr`
}

/** "35 min left", "1 hr 10 min left". */
export function leftText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min left`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} hr ${r} min left` : `${h} hr left`
}

/** "Oct 4 – 10, 2026", "Sep 27 – Oct 3, 2026", "Dec 27, 2026 – Jan 2, 2027". */
export function weekRange(first: DateKey, last: DateKey): string {
  if (first.slice(0, 4) !== last.slice(0, 4)) return `${formatDateKey(first, 'medium')} – ${formatDateKey(last, 'medium')}`
  if (first.slice(0, 7) !== last.slice(0, 7)) return `${formatDateKey(first, 'monthDay')} – ${formatDateKey(last, 'monthDay')}, ${first.slice(0, 4)}`
  return `${formatDateKey(first, 'monthDay')} – ${Number(last.slice(8))}, ${first.slice(0, 4)}`
}
