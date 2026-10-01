import { query, where } from 'firebase/firestore'
import { useMemo, useRef, useState } from 'react'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { SESSION_STATUS_STYLE } from '@shared/schedule/status'
import { type DateKey, formatDateKey, formatMinutesShort, todayKey as todayKeyOf } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { MonthScroller, type MonthScrollerHandle } from '@/components/app/MonthScroller'
import { Button } from '@/components/ui/button'
import { useDayConfigs } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { useLoadWindow } from '@/lib/useLoadWindow'
import { cn } from '@/lib/utils'

/**
 * A student's sessions on a vertically scrolling month calendar. Clicking a day
 * picks it; clicking a chip opens the session.
 */
export function StudentMonthCalendar({
  studentId,
  selectedDate,
  onPickDay,
  onPickSession,
  highlightSessionId,
  compact = false,
  tutorId,
  className,
}: {
  studentId: string | null
  selectedDate?: DateKey | null
  onPickDay?: (d: DateKey) => void
  onPickSession?: (s: WithId<Session>) => void
  highlightSessionId?: string | null
  compact?: boolean
  /** Tutors may only read their own sessions. */
  tutorId?: string | null
  /** Sets the scroll area's height (default: most of the screen). */
  className?: string
}) {
  const { branchId, settings, timezone } = useBranch()
  const todayKey = todayKeyOf(timezone)
  const [anchor] = useState(() => selectedDate ?? todayKey)
  const scroller = useRef<MonthScrollerHandle>(null)
  const [topMonth, setTopMonth] = useState(anchor)
  const { from, to, onVisibleRangeChange } = useLoadWindow(anchor)
  const q = useMemo(
    () =>
      studentId
        ? tutorId
          ? query(branchCol(branchId, COL.sessions), where('studentId', '==', studentId), where('tutorId', '==', tutorId), where('dateKey', '>=', from), where('dateKey', '<=', to))
          : query(branchCol(branchId, COL.sessions), where('studentId', '==', studentId), where('dateKey', '>=', from), where('dateKey', '<=', to))
        : null,
    [branchId, studentId, from, to, tutorId],
  )
  const { data } = useQuery<Session>(q, `student-cal-${studentId}-${tutorId ?? 'all'}-${from}-${to}`, { keepPrevious: true })
  const { map: dayConfigs } = useDayConfigs(from, to, { keepPrevious: true })
  const byDate = useMemo(() => {
    const m = new Map<DateKey, WithId<Session>[]>()
    for (const s of data) if (!s.isDeleted) m.set(s.dateKey, [...(m.get(s.dateKey) ?? []), s].sort((a, b) => a.startMin - b.startMin))
    return m
  }, [data])
  const maxChips = compact ? 2 : 3

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <div className="text-sm font-semibold">{formatDateKey(topMonth, 'monthYear')}</div>
        <Button variant="ghost" size="xs" onClick={() => scroller.current?.scrollToDate(todayKey, { block: 'month' })}>
          Today
        </Button>
      </div>
      <MonthScroller
        ref={scroller}
        anchor={anchor}
        focusDate={selectedDate}
        weekStartsOn={settings.general.weekStartsOn}
        onVisibleRangeChange={onVisibleRangeChange}
        onTopMonthChange={setTopMonth}
        className={cn('px-2', className ?? 'h-[min(70svh,720px)]')}
        renderDay={(d) => {
          const closed = !dayHours(d, settings, dayConfigs).isOpen
          const sessions = byDate.get(d) ?? []
          const past = d < todayKey
          return (
            <div
              role={onPickDay && !closed ? 'button' : undefined}
              onClick={() => !closed && onPickDay?.(d)}
              className={cn(
                'flex h-full flex-col gap-0.5 p-1',
                compact ? 'min-h-16' : 'min-h-24',
                closed ? 'bg-muted/70' : onPickDay ? 'cursor-pointer hover:bg-muted/40' : '',
                selectedDate === d && 'bg-accent ring-2 ring-foreground ring-inset',
              )}
            >
              <div className="flex justify-end">
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums',
                    d === todayKey && 'bg-foreground font-semibold text-background',
                    closed && d !== todayKey && 'text-muted-foreground',
                  )}
                >
                  {Number(d.slice(8))}
                </span>
              </div>
              {sessions.slice(0, maxChips).map((s) => {
                const st = SESSION_STATUS_STYLE[s.status]
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPickSession?.(s)
                    }}
                    className={cn(
                      'truncate rounded border px-1 text-left text-[10px] leading-tight',
                      s.status === 'canceled' && 'opacity-55',
                      past && 'opacity-70',
                      highlightSessionId === s.id && 'outline-1 outline-foreground outline-dashed',
                    )}
                    style={{ backgroundColor: st.bg, borderColor: st.border, color: st.text, borderLeft: s.note ? '3px solid #335586' : undefined }}
                    title={`${s.tutorName} · ${s.subject || 'No subject'}${s.note ? `\nNote: ${s.note}` : ''}`}
                  >
                    <span className="font-bold">{s.tutorName.split(' ')[0]}</span> {formatMinutesShort(s.startMin)}
                  </button>
                )
              })}
              {sessions.length > maxChips ? <div className="text-[9px] text-muted-foreground">+{sessions.length - maxChips} more</div> : null}
            </div>
          )
        }}
      />
    </div>
  )
}
