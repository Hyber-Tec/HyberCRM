import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { SESSION_STATUS_STYLE } from '@shared/schedule/status'
import {
  type DateKey,
  WEEKDAY_SHORT,
  addMonths,
  formatDateKey,
  formatMinutesShort,
  isSameMonth,
  monthGrid,
  orderedWeekdays,
  todayKey as todayKeyOf,
} from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { useDayConfigs } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'

/** A student's sessions on a month grid. Clicking a day picks it; clicking a chip opens the session. */
export function StudentMonthCalendar({
  studentId,
  month,
  onMonth,
  selectedDate,
  onPickDay,
  onPickSession,
  highlightSessionId,
  compact = false,
  tutorId,
}: {
  studentId: string | null
  month: DateKey
  onMonth: (m: DateKey) => void
  selectedDate?: DateKey | null
  onPickDay?: (d: DateKey) => void
  onPickSession?: (s: WithId<Session>) => void
  highlightSessionId?: string | null
  compact?: boolean
  /** Tutors may only read their own sessions. */
  tutorId?: string | null
}) {
  const { branchId, settings, timezone } = useBranch()
  const weekStartsOn = settings.general.weekStartsOn
  const grid = monthGrid(month, weekStartsOn)
  const from = grid[0]
  const to = grid[grid.length - 1]
  const q = useMemo(
    () =>
      studentId
        ? tutorId
          ? query(branchCol(branchId, COL.sessions), where('studentId', '==', studentId), where('tutorId', '==', tutorId), where('dateKey', '>=', from), where('dateKey', '<=', to))
          : query(branchCol(branchId, COL.sessions), where('studentId', '==', studentId), where('dateKey', '>=', from), where('dateKey', '<=', to))
        : null,
    [branchId, studentId, from, to, tutorId],
  )
  const { data } = useQuery<Session>(q, `student-cal-${studentId}-${tutorId ?? 'all'}-${from}`)
  const { map: dayConfigs } = useDayConfigs(from, to)
  const byDate = useMemo(() => {
    const m = new Map<DateKey, WithId<Session>[]>()
    for (const s of data) if (!s.isDeleted) m.set(s.dateKey, [...(m.get(s.dateKey) ?? []), s].sort((a, b) => a.startMin - b.startMin))
    return m
  }, [data])
  const weeks = Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7)).filter((wk) => wk.some((d) => isSameMonth(d, month)))
  const todayKey = todayKeyOf(timezone)
  const maxChips = compact ? 2 : 3

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{formatDateKey(month, 'monthYear')}</div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
            <LuChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
            <LuChevronRight />
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-[10px] font-semibold text-muted-foreground uppercase">
          {orderedWeekdays(weekStartsOn).map((d) => (
            <div key={d} className="py-1">
              {WEEKDAY_SHORT[d]}
            </div>
          ))}
        </div>
        {weeks.map((wk, i) => (
          <div key={i} className="grid grid-cols-7 border-b last:border-b-0">
            {wk.map((d) => {
              if (!isSameMonth(d, month)) return <div key={d} className="border-r last:border-r-0" />
              const closed = !dayHours(d, settings, dayConfigs).isOpen
              const sessions = byDate.get(d) ?? []
              const past = d < todayKey
              return (
                <div
                  key={d}
                  role={onPickDay && !closed ? 'button' : undefined}
                  onClick={() => !closed && onPickDay?.(d)}
                  className={cn(
                    'flex flex-col gap-0.5 border-r p-1 last:border-r-0',
                    compact ? 'min-h-16' : 'min-h-24',
                    closed ? 'bg-muted/70' : onPickDay ? 'cursor-pointer hover:bg-muted/40' : '',
                    selectedDate === d && 'bg-accent ring-2 ring-foreground ring-inset',
                  )}
                >
                  <div className="flex justify-end">
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full text-[11px]',
                        d === todayKey && 'bg-foreground font-semibold text-background',
                        closed && 'text-muted-foreground',
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
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
