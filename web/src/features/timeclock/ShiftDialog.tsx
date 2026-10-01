import { useState } from 'react'
import { toast } from 'sonner'
import type { PayType } from '@shared/pay/segment'
import { type DateKey, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { OptionPicker } from '@/components/app/OptionPicker'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { type ClockShift, saveShift } from './api'

/**
 * Add or fix a time entry (a clock-in to clock-out shift). Used by Time Entries
 * and by Payroll, whose rows are pieces of these shifts.
 */
export function ShiftDialog({
  state,
  onClose,
  staff,
  isLocked,
  defaultStaff,
  note: context,
}: {
  state: WithId<ClockShift> | 'new' | null
  onClose: () => void
  staff: { id: string; name: string }[]
  isLocked: (d: DateKey) => boolean
  defaultStaff: string | null
  /** Shown under the title, e.g. which payroll rows the entry produces. */
  note?: string
}) {
  const { branchId, actor, timezone, settings } = useBranch()
  const existing = state && state !== 'new' ? state : null
  const [staffId, setStaffId] = useState('')
  const [dateKey, setDateKey] = useState('')
  const [inMin, setInMin] = useState(840)
  const [outMin, setOutMin] = useState(1020)
  const [type, setType] = useState<'auto' | PayType>('auto')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const k = state === null ? null : existing?.id ?? 'new'
  if (k !== key) {
    setKey(k)
    setError(null)
    if (existing) {
      setStaffId(existing.staffId)
      setDateKey(existing.dateKey)
      setInMin(existing.inMin)
      const out = existing.clockOutAt ? Math.round((existing.clockOutAt.toMillis() - existing.clockInAt.toMillis()) / 60000) + existing.inMin : Math.max(existing.inMin + 60, 1020)
      setOutMin(Math.min(out, 1440))
      setType(existing.forcedType ?? 'auto')
      setNote(existing.note ?? '')
    } else {
      setStaffId(defaultStaff ?? '')
      setDateKey(todayKey(timezone))
      setInMin(840)
      setOutMin(1020)
      setType('auto')
      setNote('')
    }
  }
  if (!state) return null
  const step = settings.timeEntries.stepMinutes

  async function save() {
    const person = staff.find((s) => s.id === staffId)
    if (!person) return setError('Choose an employee.')
    if (!dateKey) return setError('Choose a date.')
    if (outMin <= inMin) return setError('The end time must be after the start time.')
    if (isLocked(dateKey)) return setError('This date is in a locked pay period.')
    setBusy(true)
    try {
      await saveShift(branchId, actor, timezone, { staffId, staffName: person.name, dateKey, inMin, outMin, forcedType: type === 'auto' ? null : type, note }, existing)
      toast.success(existing ? 'Time entry updated' : 'Time entry added')
      onClose()
    } catch (e) {
      setError((e as Error).message.includes('permission') ? 'This change isn’t allowed (locked period or no access).' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? (existing.status === 'open' ? 'Clock out / edit shift' : 'Edit time entry') : 'Add time entry'}</DialogTitle>
          {context ? <DialogDescription>{context}</DialogDescription> : null}
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>Employee</FieldLabel>
            <OptionPicker value={staffId || null} onChange={setStaffId} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Choose employee…" disabled={!!existing} />
          </Field>
          <Field>
            <FieldLabel htmlFor="te-date">Date</FieldLabel>
            <DatePicker id="te-date" value={dateKey || null} onChange={setDateKey} disabled={!!existing} />
          </Field>
          <Field>
            <FieldLabel>Time</FieldLabel>
            <div className="flex items-center gap-2">
              <TimeSelect value={inMin} step={step} min={0} max={1440 - step} onChange={(m) => (setInMin(m), m >= outMin && setOutMin(Math.min(1440, m + 60)))} />
              <span className="text-sm text-muted-foreground">to</span>
              <TimeSelect value={outMin} step={step} min={inMin + step} max={1440} onChange={setOutMin} />
            </div>
            {existing?.autoClosed ? <FieldDescription>This shift was closed automatically. Set the real clock-out time.</FieldDescription> : null}
          </Field>
          <Field>
            <FieldLabel>Pay as</FieldLabel>
            <Select value={type} onValueChange={(v) => setType(v as 'auto' | PayType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Split automatically (teaching during logged sessions)</SelectItem>
                <SelectItem value="admin">All admin time</SelectItem>
                <SelectItem value="teaching">All teaching time</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="te-note">Note</FieldLabel>
            <Textarea id="te-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? <Spinner /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
