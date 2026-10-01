import { getDocs, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { LuArrowDown, LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { type DateKey, type Weekday, WEEKDAY_SHORT, addDays, formatDateKey, orderedWeekdays, startOfWeek, weekDays, weekdayOf } from '@shared/time'
import type { DayConfig, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { branchCol } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { type DuplicateSource, type ScheduleCtx, duplicateIntoWeek } from '../api'

function WeekPicker({ value, onChange }: { value: DateKey; onChange: (d: DateKey) => void }) {
  const { settings } = useBranch()
  const days = weekDays(value, settings.general.weekStartsOn)
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => onChange(addDays(value, -7))}>
        <LuChevronLeft />
      </Button>
      <div className="flex-1 text-center text-sm font-medium">
        {formatDateKey(days[0], 'monthDay')} – {formatDateKey(days[6], 'medium')}
      </div>
      <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => onChange(addDays(value, 7))}>
        <LuChevronRight />
      </Button>
    </div>
  )
}

export function DuplicateDialog({ open, onOpenChange, ctx, anchor }: { open: boolean; onOpenChange: (o: boolean) => void; ctx: ScheduleCtx; anchor: DateKey }) {
  const { settings } = useBranch()
  const weekStartsOn = settings.general.weekStartsOn
  const { data: students } = useStudentList()
  const [from, setFrom] = useState(startOfWeek(anchor, weekStartsOn))
  const [to, setTo] = useState(addDays(startOfWeek(anchor, weekStartsOn), 7))
  const [selected, setSelected] = useState<Weekday[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setFrom(startOfWeek(anchor, weekStartsOn))
    setTo(addDays(startOfWeek(anchor, weekStartsOn), 7))
    setSelected([])
  }, [open, anchor, weekStartsOn])

  const same = startOfWeek(from, weekStartsOn) === startOfWeek(to, weekStartsOn)
  const weekdays = orderedWeekdays(weekStartsOn)

  async function run() {
    const targetDays = weekDays(to, weekStartsOn)
    const label = `${formatDateKey(startOfWeek(from, weekStartsOn), 'monthDay')} → ${formatDateKey(targetDays[0], 'monthDay')}`
    if (!window.confirm(`Duplicate ${selected.length} day${selected.length > 1 ? 's' : ''} (${label})? Sessions already on those days in the target week move to Trash.`)) return
    setBusy(true)
    try {
      const srcDays = weekDays(from, weekStartsOn)
      const snap = await getDocs(query(branchCol(ctx.branchId, COL.sessions), where('dateKey', '>=', srcDays[0]), where('dateKey', '<=', srcDays[6])))
      const sources: DuplicateSource[] = snap.docs
        .map((d) => d.data() as Session)
        .filter((s) => !s.isDeleted && s.status !== 'canceled' && selected.includes(weekdayOf(s.dateKey)))
        .map((s) => ({ ...s, weekday: weekdayOf(s.dateKey) }))
      const [tSnap, cSnap] = await Promise.all([
        getDocs(query(branchCol(ctx.branchId, COL.sessions), where('dateKey', '>=', targetDays[0]), where('dateKey', '<=', targetDays[6]))),
        getDocs(query(branchCol(ctx.branchId, COL.dayConfigs), where('dateKey', '>=', targetDays[0]), where('dateKey', '<=', targetDays[6]))),
      ])
      const configs = new Map(cSnap.docs.map((d) => [d.id, d.data() as DayConfig]))
      const existingTarget = tSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Session) }) as WithId<Session>)
      const grades = new Map(students.map((s) => [s.id, s.grade]))
      const n = await duplicateIntoWeek(ctx, {
        sources,
        targetDays: targetDays
          .filter((d) => selected.includes(weekdayOf(d)))
          .map((d) => ({ dateKey: d, weekday: weekdayOf(d), open: dayHours(d, settings, configs).isOpen })),
        existingTarget,
        liveGrade: (id) => grades.get(id),
        label,
      })
      toast.success(n ? `Duplicated ${n} sessions` : 'Nothing to copy on those days (closed and past days are skipped).')
      if (n) onOpenChange(false)
    } catch (e) {
      toast.error('Duplicate failed', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate schedule</DialogTitle>
          <DialogDescription>Copy sessions into another week as {settings.schedule.pasteStatus === 'pending' ? 'Pending' : 'Confirmed'} sessions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase">From</div>
          <WeekPicker value={from} onChange={setFrom} />
          <div className="flex justify-center text-muted-foreground">
            <LuArrowDown />
          </div>
          <div className="text-xs font-semibold text-muted-foreground uppercase">To</div>
          <WeekPicker value={to} onChange={setTo} />
          {same ? <p className="text-sm text-destructive">Source and destination weeks are the same. Pick a different destination.</p> : null}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Days to duplicate</span>
            <span className="space-x-3 text-xs">
              <button type="button" className="text-blue-600" onClick={() => setSelected(weekdays)}>
                Select all
              </button>
              <button type="button" className="text-blue-600" onClick={() => setSelected([])}>
                Clear
              </button>
            </span>
          </div>
          <div className="flex gap-1.5">
            {weekdays.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))}
                className={cn('flex-1 rounded-md border py-1.5 text-xs font-semibold', selected.includes(d) ? 'border-foreground bg-foreground text-background' : 'bg-background')}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || selected.length === 0 || same} onClick={() => void run()}>
            {busy ? <Spinner /> : null} Duplicate selected days
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
