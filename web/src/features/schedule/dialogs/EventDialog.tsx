import { useEffect, useState } from 'react'
import { LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import type { Recurrence, RecurrenceFrequency, ScheduleEvent } from '@shared/schedule/events'
import { type DateKey, type Weekday, WEEKDAYS, parseDateKey, weekdayOf } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { TimeSelect } from '@/components/app/TimeSelect'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ScheduleCtx } from '../api'
import { deleteEvent, saveEvent } from '../eventsApi'
import type { EventDoc } from '../useScheduleData'

export type EventDialogState =
  | { mode: 'create'; dateKey: DateKey; startMin: number; endMin: number }
  | { mode: 'edit'; event: WithId<EventDoc> }
  | null

const LETTERS: Record<Weekday, string> = { sunday: 'S', monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F', saturday: 'S' }

export function EventDialog({ state, onClose, ctx }: { state: EventDialogState; onClose: () => void; ctx: ScheduleCtx }) {
  const { settings } = useBranch()
  const [preset, setPreset] = useState('none')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [dateKey, setDateKey] = useState('')
  const [startMin, setStartMin] = useState(840)
  const [endMin, setEndMin] = useState(900)
  const [notes, setNotes] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [freq, setFreq] = useState<RecurrenceFrequency>('weekly')
  const [interval, setIntervalN] = useState('1')
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [ends, setEnds] = useState<'never' | 'on' | 'after'>('never')
  const [endDate, setEndDate] = useState('')
  const [occurrences, setOccurrences] = useState('13')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const existing = state?.mode === 'edit' ? state.event : null

  useEffect(() => {
    if (!state) return
    setError(null)
    setPreset('none')
    setName('')
    if (state.mode === 'edit') {
      const e = state.event
      setTitle(e.title)
      setTitleTouched(true)
      setDateKey(e.dateKey)
      setStartMin(e.startMin)
      setEndMin(e.endMin)
      setNotes(e.notes ?? '')
      const r = e.recurrence
      setRepeat(!!r)
      setFreq(r?.frequency ?? 'weekly')
      setIntervalN(String(r?.interval ?? 1))
      setWeekdays(r?.weekdays?.length ? r.weekdays : [weekdayOf(e.dateKey)])
      setEnds(r?.ends.type ?? 'never')
      setEndDate(r?.ends.endDate ?? '')
      setOccurrences(String(r?.ends.occurrences ?? 13))
    } else {
      setTitle('')
      setTitleTouched(false)
      setDateKey(state.dateKey)
      setStartMin(state.startMin)
      setEndMin(Math.max(state.endMin, state.startMin + 5))
      setNotes('')
      setRepeat(false)
      setFreq('weekly')
      setIntervalN('1')
      setWeekdays([weekdayOf(state.dateKey)])
      setEnds('never')
      setEndDate('')
      setOccurrences('13')
    }
  }, [state])

  useEffect(() => {
    if (titleTouched || preset === 'none') return
    setTitle(name.trim() ? `${name.trim()} - ${preset}` : preset)
  }, [preset, name, titleTouched])

  if (!state) return null

  async function save() {
    if (!title.trim()) return setError('Title is required.')
    if (!dateKey) return setError('Date is required.')
    if (endMin <= startMin) return setError('End time must be after start time.')
    let recurrence: Recurrence | null = null
    if (repeat) {
      const n = Number(interval)
      if (!Number.isInteger(n) || n < 1) return setError('Repeat every must be a positive whole number.')
      if (freq === 'weekly' && weekdays.length === 0) return setError('Select at least one day.')
      if (ends === 'on' && (!endDate || endDate < dateKey)) return setError('The end date must be on or after the start date.')
      const occ = Number(occurrences)
      if (ends === 'after' && (!Number.isInteger(occ) || occ < 1)) return setError('Occurrences must be a positive whole number.')
      recurrence = {
        frequency: freq,
        interval: n,
        weekdays: freq === 'weekly' ? weekdays : [],
        monthDay: freq === 'monthly' ? parseDateKey(dateKey).day : null,
        ends: { type: ends, endDate: ends === 'on' ? endDate : null, occurrences: ends === 'after' ? occ : null },
      }
    }
    const value: ScheduleEvent = { title, dateKey, startMin, endMin, notes, recurrence }
    setBusy(true)
    try {
      await saveEvent(ctx, value, existing)
      toast.success(existing ? 'Event updated' : 'Event added')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit event' : 'Add event'}</DialogTitle>
        </DialogHeader>
        <FieldGroup className="gap-4">
          {!existing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>Event type (optional)</FieldLabel>
                <Select value={preset} onValueChange={(v) => (setPreset(v), setTitleTouched(false))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None / type manually —</SelectItem>
                    {settings.schedule.events.titlePresets.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {preset !== 'none' ? (
                <Field>
                  <FieldLabel htmlFor="ev-name">Name</FieldLabel>
                  <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ava (11)" />
                </Field>
              ) : null}
            </div>
          ) : null}
          <Field>
            <FieldLabel htmlFor="ev-title">Title</FieldLabel>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
            />
            {!titleTouched && preset !== 'none' ? <FieldDescription>Auto-generated — edit to override.</FieldDescription> : null}
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="ev-date">Date</FieldLabel>
              <DatePicker id="ev-date" value={dateKey || null} onChange={setDateKey} />
            </Field>
            <Field>
              <FieldLabel>Start</FieldLabel>
              <TimeSelect value={startMin} step={5} min={360} max={1435} onChange={(m) => (setStartMin(m), m >= endMin && setEndMin(Math.min(1440, m + 60)))} />
            </Field>
            <Field>
              <FieldLabel>End</FieldLabel>
              <TimeSelect value={endMin} step={5} min={startMin + 5} max={1440} onChange={setEndMin} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ev-notes">Notes</FieldLabel>
            <Textarea id="ev-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note…" />
          </Field>
          <Field>
            <FieldLabel>Repeat</FieldLabel>
            <Select value={repeat ? 'custom' : 'none'} onValueChange={(v) => setRepeat(v === 'custom')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="custom">Custom recurrence…</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {repeat ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-sm">
                Repeat every
                <Input className="h-8 w-16" inputMode="numeric" value={interval} onChange={(e) => setIntervalN(e.target.value.replace(/\D/g, ''))} />
                <Select value={freq} onValueChange={(v) => setFreq(v as RecurrenceFrequency)}>
                  <SelectTrigger size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">day</SelectItem>
                    <SelectItem value="weekly">week</SelectItem>
                    <SelectItem value="monthly">month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {freq === 'weekly' ? (
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="mr-1">Repeat on</span>
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-label={d}
                      onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-full border text-xs font-semibold',
                        weekdays.includes(d) ? 'border-foreground bg-foreground text-background' : 'bg-background',
                      )}
                    >
                      {LETTERS[d]}
                    </button>
                  ))}
                </div>
              ) : null}
              {freq === 'monthly' && dateKey ? <div className="text-sm text-muted-foreground">Monthly on day {parseDateKey(dateKey).day}</div> : null}
              <div className="space-y-2 text-sm">
                <div className="font-medium">Ends</div>
                <RadioGroup value={ends} onValueChange={(v) => setEnds(v as typeof ends)} className="gap-2">
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="never" /> Never
                  </label>
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="on" /> On
                    <DatePicker size="sm" className="w-40" value={endDate || null} min={dateKey || null} disabled={ends !== 'on'} onChange={setEndDate} aria-label="Ends on" />
                  </label>
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="after" /> After
                    <Input className="h-8 w-16" inputMode="numeric" value={occurrences} disabled={ends !== 'after'} onChange={(e) => setOccurrences(e.target.value.replace(/\D/g, ''))} />
                    occurrences
                  </label>
                </RadioGroup>
              </div>
            </div>
          ) : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <DialogFooter className="gap-2 sm:justify-between">
          {existing ? (
            <Button
              variant="destructive"
              onClick={async () => {
                if (!window.confirm(existing.recurrence ? 'Delete this recurring event? The entire series is removed.' : 'Delete this event?')) return
                await deleteEvent(ctx, existing)
                toast.success('Event deleted')
                onClose()
              }}
            >
              <LuTrash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? <Spinner /> : null} Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
