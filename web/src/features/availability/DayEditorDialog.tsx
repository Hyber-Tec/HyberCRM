import { useState } from 'react'
import { LuLock, LuPlus, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import { clipToHours, normalizeRanges } from '@shared/availability'
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
  onSave: (ranges: AvailabilityRange[]) => Promise<void>
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
          : [{ startMin: Math.max(state.hours.openMin, a.pickerRange.startMin), endMin: Math.min(state.hours.closeMin, a.pickerRange.endMin) }]
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
    const { ranges: clipped } = clipToHours(next, state!.hours)
    if (next.length > 0 && clipped.length === 0) {
      return setError(`Choose a time within opening hours (${formatTimeRange(state!.hours.openMin, state!.hours.closeMin)}).`)
    }
    setBusy(true)
    try {
      await onSave(clipped)
      onClose()
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
                min={a.pickerRange.startMin}
                max={a.pickerRange.endMin - step}
                disabled={locked}
                onChange={(m) => setRanges(ranges.map((x, idx) => (idx === i ? { ...x, startMin: m } : x)))}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <TimeSelect
                value={r.endMin}
                step={step}
                min={a.pickerRange.startMin + step}
                max={a.pickerRange.endMin}
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
          {!locked && ranges.length < a.maxRangesPerDay ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const last = ranges[ranges.length - 1]
                const start = last ? Math.min(last.endMin + 60, a.pickerRange.endMin - 60) : state.hours.openMin
                setRanges([...ranges, { startMin: start, endMin: Math.min(start + 120, a.pickerRange.endMin) }])
              }}
            >
              <LuPlus /> Add a time range
            </Button>
          ) : null}
          {ranges.length === 0 ? <p className="text-sm text-muted-foreground">No availability on this day.</p> : null}
          {outside && !locked ? (
            <p className="text-xs text-muted-foreground">
              Open {formatTimeRange(state.hours.openMin, state.hours.closeMin)}; times outside opening hours are trimmed.
            </p>
          ) : null}
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
