import { useMemo, useState } from 'react'
import { LuLock, LuPencil, LuPlus, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import { toast } from 'sonner'
import type { PayType } from '@shared/pay/segment'
import { type DateKey, formatDateKey, formatDuration, formatInstantTime, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useStaffList } from '@/features/data/hooks'
import { type ClockShift, deleteShift, saveShift, useShifts } from './api'
import { usePayrollState } from './hooks'
import { PeriodPicker, type RangeValue, useDefaultRange } from './PeriodPicker'

const SOURCE_LABEL: Record<ClockShift['source'], string> = { kiosk: 'Kiosk', admin: 'Admin entry', auto: 'Auto' }

/** Worked times (TE "Log Hours" + the Payroll page's edit/delete): add, fix and remove shifts. */
export function TimeEntriesPage() {
  const { branchId, actor, timezone } = useBranch()
  const { data: staff } = useStaffList()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [range, setRange] = useState<RangeValue>(useDefaultRange())
  const { lockedThrough } = usePayrollState()
  const { data: shifts, loading } = useShifts(range.from, range.to, staffId)
  const [dialog, setDialog] = useState<WithId<ClockShift> | 'new' | null>(null)

  const rows = useMemo(() => [...shifts].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.staffName.localeCompare(b.staffName) || a.inMin - b.inMin), [shifts])
  const locked = (d: DateKey) => !!lockedThrough && d <= lockedThrough
  const minutesOf = (s: WithId<ClockShift>) => (s.clockOutAt ? (s.clockOutAt.toMillis() - s.clockInAt.toMillis()) / 60000 : 0)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Time Entries"
        description="Clock-ins from the kiosk and time added by admins. Pay is split into teaching and admin time automatically."
        actions={
          <Button onClick={() => setDialog('new')}>
            <LuPlus /> Add time entry
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <OptionPicker
          className="lg:w-64"
          value={staffId ?? 'all'}
          onChange={(v) => setStaffId(v === 'all' ? null : v)}
          options={[{ value: 'all', label: 'All employees' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <PeriodPicker value={range} onChange={setRange} lockedThrough={lockedThrough} />
      </div>
      {lockedThrough ? (
        <Alert className="mb-4">
          <LuLock />
          <AlertDescription>Pay periods through {formatDateKey(lockedThrough, 'medium')} are locked; their entries can’t be changed.</AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>Worked</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap">{formatDateKey(s.dateKey, 'weekdayMedium')}</TableCell>
                <TableCell className="font-medium">{s.staffName}</TableCell>
                <TableCell className="tabular-nums">{formatInstantTime(s.clockInAt.toDate(), timezone)}</TableCell>
                <TableCell className="tabular-nums">
                  {s.clockOutAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      {formatInstantTime(s.clockOutAt.toDate(), timezone)}
                      {s.autoClosed && !s.autoCorrected ? (
                        <Badge variant="destructive" className="gap-1">
                          <LuTriangleAlert /> Auto
                        </Badge>
                      ) : null}
                    </span>
                  ) : (
                    <Badge className="bg-emerald-600">Clocked in</Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{s.clockOutAt ? formatDuration(minutesOf(s)) : '—'}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{SOURCE_LABEL[s.source] ?? s.source}</Badge>
                    {s.forcedType ? <Badge variant="secondary">All {s.forcedType}</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  {locked(s.dateKey) ? (
                    <LuLock className="text-muted-foreground" aria-label="Locked" />
                  ) : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setDialog(s)}>
                        <LuPencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete"
                        onClick={() => window.confirm('Delete this time entry?') && void deleteShift(branchId, actor, s).then(() => toast.success('Deleted'))}
                      >
                        <LuTrash2 />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No time entries in this range.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <ShiftDialog state={dialog} onClose={() => setDialog(null)} staff={staff.map((s) => ({ id: s.id, name: s.name }))} isLocked={locked} defaultStaff={staffId} />
    </div>
  )
}

function ShiftDialog({
  state,
  onClose,
  staff,
  isLocked,
  defaultStaff,
}: {
  state: WithId<ClockShift> | 'new' | null
  onClose: () => void
  staff: { id: string; name: string }[]
  isLocked: (d: DateKey) => boolean
  defaultStaff: string | null
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
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>Employee</FieldLabel>
            <OptionPicker value={staffId || null} onChange={setStaffId} options={staff.map((s) => ({ value: s.id, label: s.name }))} placeholder="Choose employee…" disabled={!!existing} />
          </Field>
          <Field>
            <FieldLabel htmlFor="te-date">Date</FieldLabel>
            <Input id="te-date" type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} disabled={!!existing} />
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
