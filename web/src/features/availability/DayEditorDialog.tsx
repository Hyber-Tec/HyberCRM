import { useState } from 'react'
import { LuLock, LuPlus, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import { fitRangesToDay, normalizeRanges } from '@shared/availability'
import type { DayHours } from '@shared/settings/defaults'
import { formatDateKey, formatTimeRange } from '@shared/time'
import type { AvailabilityRange } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'

export interface DayEditorState {
  dateKey: string
  ranges: AvailabilityRange[]
  exists: boolean
  locked: boolean
  leadWarning: boolean
  hours: DayHours
}

export function DayEditorDialog({
  state,
  onClose,
  onSave,
}: {
  state: DayEditorState | null
  onClose: () => void
  /** False: the person backed out (keep the dialog open). */
  onSave: (ranges: AvailabilityRange[]) => Promise<boolean | void>
}) {
  const { settings } = useBranch()
  const a = settings.availability
  const [ranges, setRanges] = useState<AvailabilityRange[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastKey, setLastKey] = useState<string | null>(null)
  if ((state?.dateKey ?? null) !== lastKey) {
    setLastKey(state?.dateKey ?? null)
    setError(null)
    setRanges(
      state
        ? state.ranges.length
          ? state.ranges
          : [{ startMin: state.hours.openMin, endMin: state.hours.closeMin }]
        : [],
    )
  }
  if (!state) return null

  const locked = state.locked
  const step = a.stepMinutes

  async function save(next: AvailabilityRange[]) {
    for (const r of next) {
      if (r.endMin <= r.startMin) return setError('End time must be after start time.')
      if (r.endMin - r.startMin < a.minBlockMinutes) return setError(`Each range must be at least ${a.minBlockMinutes} minutes.`)
    }
    // Availability follows this date's opening hours (owner rule).
    const fit = fitRangesToDay(next, state!.hours, a)
    if (!fit.ok) {
      return setError(
        fit.reason === 'closed'
          ? 'The center is closed on this day.'
          : fit.reason === 'too_many'
            ? `Use at most ${a.maxRangesPerDay} time ranges per day.`
            : `Choose a time within opening hours (${formatTimeRange(state!.hours.openMin, state!.hours.closeMin)}).`,
      )
    }
    setBusy(true)
    try {
      if ((await onSave(fit.ranges)) !== false) onClose()
    } catch (e) {
      setError((e as Error).message.includes('permission') ? 'This day is locked. Please contact an admin.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const merged = normalizeRanges(ranges)
  const outside = merged.some((r) => r.startMin < state.hours.openMin || r.endMin > state.hours.closeMin)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.exists ? 'Edit availability' : 'Add availability'}</DialogTitle>
          <DialogDescription>{formatDateKey(state.dateKey, 'weekdayLong')}</DialogDescription>
        </DialogHeader>
        {locked ? (
          <Alert>
            <LuLock />
            <AlertDescription>
              This day is within {a.lockWindowDays} days and can’t be changed here. Please contact an admin.
            </AlertDescription>
          </Alert>
        ) : state.leadWarning ? (
          <Alert>
            <LuTriangleAlert />
            <AlertDescription>
              Please set availability at least {a.leadTimeDays} days in advance.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          {ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <TimeSelect
                value={r.startMin}
                step={step}
                min={state.hours.openMin}
                max={state.hours.closeMin - step}
                disabled={locked}
                onChange={(m) => setRanges(ranges.map((x, idx) => (idx === i ? { ...x, startMin: m } : x)))}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <TimeSelect
                value={r.endMin}
                step={step}
                min={state.hours.openMin + step}
                max={state.hours.closeMin}
                disabled={locked}
                onChange={(m) => setRanges(ranges.map((x, idx) => (idx === i ? { ...x, endMin: m } : x)))}
              />
              {!locked ? (
                <Button variant="ghost" size="icon-sm" aria-label="Remove range" onClick={() => setRanges(ranges.filter((_, idx) => idx !== i))}>
                  <LuTrash2 />
                </Button>
              ) : null}
            </div>
          ))}
          {!locked && ranges.length < a.maxRangesPerDay && roomAfter(ranges, state.hours.closeMin, a.minBlockMinutes) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const last = normalizeRanges(ranges).pop()
                const start = last ? Math.min(last.endMin + step, state.hours.closeMin - a.minBlockMinutes) : state.hours.openMin
                setRanges([...ranges, { startMin: start, endMin: Math.min(start + 120, state.hours.closeMin) }])
              }}
            >
              <LuPlus /> Add a time range
            </Button>
          ) : null}
          {ranges.length === 0 ? <p className="text-sm text-muted-foreground">No availability on this day.</p> : null}
          <p className="text-xs text-muted-foreground">
            Open {formatTimeRange(state.hours.openMin, state.hours.closeMin)} this day
            {outside && !locked ? '; times outside opening hours are trimmed.' : '.'}
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {state.exists && !locked ? (
            <Button variant="destructive" disabled={busy} onClick={() => void save([])}>
              <LuTrash2 /> Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {locked ? 'Close' : 'Cancel'}
            </Button>
            {!locked ? (
              <Button disabled={busy} onClick={() => void save(ranges)}>
                {busy ? <Spinner /> : null} Save
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Whether another range still fits after the last one before closing. */
function roomAfter(ranges: AvailabilityRange[], closeMin: number, minBlock: number): boolean {
  const last = normalizeRanges(ranges).pop()
  return !last || last.endMin + minBlock <= closeMin
}
