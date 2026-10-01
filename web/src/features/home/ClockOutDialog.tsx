import { useState } from 'react'
import { toast } from 'sonner'
import { dayHours } from '@shared/availability'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { type ClockShift, saveShift } from '@/features/timeclock/api'
import { usePayrollState } from '@/features/timeclock/hooks'

/** Home → "Change clock-out time" for a shift the system closed automatically. */
export function ClockOutDialog({ shift, onClose }: { shift: WithId<ClockShift> | null; onClose: () => void }) {
  const { branchId, actor, timezone, settings } = useBranch()
  const { lockedThrough } = usePayrollState()
  const [outMin, setOutMin] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const step = settings.timeEntries.stepMinutes

  const k = shift?.id ?? null
  if (k !== key) {
    setKey(k)
    setError(null)
    if (shift) {
      // Best guess: the branch's closing time that day (never before clock-in).
      const close = dayHours(shift.dateKey, settings).closeMin
      setOutMin(Math.min(1440, Math.max(shift.inMin + step, close)))
    }
  }
  if (!shift) return null
  const locked = !!lockedThrough && shift.dateKey <= lockedThrough

  async function save() {
    if (!shift) return
    if (outMin <= shift.inMin) return setError('The clock-out time must be after the clock-in time.')
    if (locked) return setError('This shift is in a locked pay period.')
    setBusy(true)
    try {
      await saveShift(
        branchId,
        actor,
        timezone,
        { staffId: shift.staffId, staffName: shift.staffName, dateKey: shift.dateKey, inMin: shift.inMin, outMin, forcedType: shift.forcedType, note: shift.note ?? '' },
        shift,
      )
      toast.success('Clock-out time updated')
      onClose()
    } catch (e) {
      setError((e as Error).message.includes('permission') ? 'You can’t change this shift (locked period or no access).' : 'Failed to update the clock-out time.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change clock-out time</DialogTitle>
          <DialogDescription>
            {shift.staffName} · {formatDateKey(shift.dateKey, 'weekdayMedium')} · clocked in {formatMinutes(shift.inMin)}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Correct clock-out time</FieldLabel>
          <TimeSelect value={outMin} step={step} min={shift.inMin + step} max={1440} onChange={setOutMin} disabled={locked} />
          <FieldDescription>Updates this shift and its pay, then clears the Auto Clock-Out warning.</FieldDescription>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || locked} onClick={() => void save()}>
            {busy ? <Spinner /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
