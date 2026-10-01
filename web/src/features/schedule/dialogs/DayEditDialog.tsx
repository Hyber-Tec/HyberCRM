import { serverTimestamp, writeBatch } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { LuPlus, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours, normalizeRanges } from '@shared/availability'
import { COL } from '@shared/paths'
import { type DateKey, formatDateKey, todayKey } from '@shared/time'
import type { Availability, AvailabilityRange, DayConfig, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchDocRef } from '@/lib/firestore'
import { type ScheduleCtx, saveDayConfig, setDayAvailability } from '../api'

interface TutorDay {
  ranges: AvailabilityRange[]
  unavailable: boolean
  hidden: boolean
}

export function DayEditDialog({
  dateKey,
  onClose,
  ctx,
  tutors,
  sessions,
  availabilityByKey,
  dayConfigs,
}: {
  dateKey: DateKey | null
  onClose: () => void
  ctx: ScheduleCtx
  tutors: { id: string; name: string }[]
  sessions: WithId<Session>[]
  availabilityByKey: Map<string, WithId<Availability>>
  dayConfigs: Map<DateKey, DayConfig>
}) {
  const { settings } = useBranch()
  const [isOpen, setIsOpen] = useState(true)
  const [openMin, setOpenMin] = useState(840)
  const [closeMin, setCloseMin] = useState(1260)
  const [rows, setRows] = useState<Record<string, TutorDay>>({})
  const [initial, setInitial] = useState<Record<string, TutorDay>>({})
  const [busy, setBusy] = useState(false)
  const range = settings.schedule.editorRange

  useEffect(() => {
    if (!dateKey) return
    const h = dayHours(dateKey, settings, dayConfigs)
    setIsOpen(h.isOpen)
    setOpenMin(h.openMin)
    setCloseMin(h.closeMin)
    const r: Record<string, TutorDay> = {}
    for (const t of tutors) {
      const a = availabilityByKey.get(`${t.id}|${dateKey}`)
      r[t.id] = a ? { ranges: a.ranges, unavailable: a.unavailable || a.ranges.length === 0, hidden: a.hidden } : { ranges: [], unavailable: true, hidden: false }
    }
    setRows(r)
    setInitial(r)
    // Only when opening for a date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey])

  if (!dateKey) return null
  const past = dateKey < todayKey(ctx.timezone)

  const setRow = (id: string, patch: Partial<TutorDay>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))

  async function apply() {
    if (!dateKey) return
    if (closeMin < openMin + 60) return toast.error('The day must be open at least one hour.')
    const live = sessions.filter((s) => !s.isDeleted)
    if (!isOpen && live.length > 0 && !window.confirm(`Close this day? This will delete all ${live.length} sessions on this day.`)) return
    setBusy(true)
    try {
      const batch = writeBatch(db)
      await saveDayConfig(ctx, dateKey, { isOpen, openMin, closeMin }, batch)
      if (!isOpen) {
        for (const s of live) {
          batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: ctx.actor.name,
            updatedAt: serverTimestamp(),
            updatedBy: ctx.actor.email,
          })
        }
        if (live.length) {
          addAudit(batch, ctx.branchId, ctx.actor, {
            action: 'session.delete_day',
            category: 'schedule',
            entityType: 'session',
            entityId: dateKey,
            dateKey,
            summary: `Deleted ${live.length} sessions when closing ${formatDateKey(dateKey, 'weekdayMedium')}`,
          })
        }
      }
      let changed = 0
      for (const t of tutors) {
        const now = rows[t.id]
        if (!now || JSON.stringify(now) === JSON.stringify(initial[t.id])) continue
        setDayAvailability(batch, ctx, t.id, dateKey, { ...now, ranges: normalizeRanges(now.ranges) })
        changed++
      }
      if (changed) {
        addAudit(batch, ctx.branchId, ctx.actor, {
          action: 'availability.day_edit',
          category: 'availability',
          entityType: 'availability',
          entityId: dateKey,
          dateKey,
          summary: `Updated availability for ${changed} tutor${changed > 1 ? 's' : ''} on ${formatDateKey(dateKey, 'weekdayMedium')}`,
        })
      }
      await batch.commit()
      toast.success('Day updated')
      onClose()
    } catch (e) {
      toast.error('Could not update the day', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit day — {formatDateKey(dateKey, 'weekdayLong')}</DialogTitle>
        </DialogHeader>
        {past ? <p className="text-sm text-amber-700">Past days can’t be changed.</p> : null}
        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Day timeline</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline" className="space-y-4 pt-3">
            <Field>
              <FieldLabel>Day status</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={isOpen ? 'open' : 'closed'} onValueChange={(v) => v && setIsOpen(v === 'open')} disabled={past}>
                <ToggleGroupItem value="open">Open day</ToggleGroupItem>
                <ToggleGroupItem value="closed">Close day</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            {isOpen ? (
              <Field>
                <FieldLabel>Timeline</FieldLabel>
                <div className="flex items-center gap-2">
                  <TimeSelect value={openMin} step={60} min={range.startMin} max={range.endMin - 60} disabled={past} onChange={(m) => (setOpenMin(m), m >= closeMin - 60 && setCloseMin(Math.min(range.endMin, m + 60)))} />
                  <span className="text-sm text-muted-foreground">to</span>
                  <TimeSelect value={closeMin} step={60} min={openMin + 60} max={range.endMin} disabled={past} onChange={setCloseMin} />
                </div>
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">Closed days are hidden from the schedule. Closing a day moves its sessions to Trash.</p>
            )}
          </TabsContent>
          <TabsContent value="availability" className="pt-3">
            <div className="divide-y rounded-lg border">
              {tutors.map((t) => {
                const r = rows[t.id]
                if (!r) return null
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <div className="w-36 truncate text-sm font-medium">{t.name}</div>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={r.unavailable}
                        disabled={past}
                        onCheckedChange={(v) =>
                          setRow(t.id, v === true ? { unavailable: true, hidden: true } : { unavailable: false, ranges: r.ranges.length ? r.ranges : [{ startMin: openMin, endMin: closeMin }] })
                        }
                      />
                      Unavailable
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={r.hidden || r.unavailable} disabled={past || r.unavailable} onCheckedChange={(v) => setRow(t.id, { hidden: v === true })} />
                      Hide
                    </label>
                    <div className="ml-auto flex flex-col gap-1">
                      {r.unavailable ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        r.ranges.map((rg, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <TimeSelect className="w-28" value={rg.startMin} step={30} min={range.startMin} max={range.endMin - 30} disabled={past} onChange={(m) => setRow(t.id, { ranges: r.ranges.map((x, k) => (k === i ? { ...x, startMin: m } : x)) })} />
                            <span className="text-xs text-muted-foreground">to</span>
                            <TimeSelect className="w-28" value={rg.endMin} step={30} min={rg.startMin + 30} max={range.endMin} disabled={past} onChange={(m) => setRow(t.id, { ranges: r.ranges.map((x, k) => (k === i ? { ...x, endMin: m } : x)) })} />
                            {r.ranges.length > 1 ? (
                              <Button variant="ghost" size="icon-xs" aria-label="Remove range" disabled={past} onClick={() => setRow(t.id, { ranges: r.ranges.filter((_, k) => k !== i) })}>
                                <LuX />
                              </Button>
                            ) : null}
                            {i === r.ranges.length - 1 && r.ranges.length < settings.availability.maxRangesPerDay ? (
                              <Button variant="ghost" size="icon-xs" aria-label="Add range" disabled={past} onClick={() => setRow(t.id, { ranges: [...r.ranges, { startMin: Math.min(rg.endMin + 60, closeMin - 60), endMin: closeMin }] })}>
                                <LuPlus />
                              </Button>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || past} onClick={() => void apply()}>
            {busy ? <Spinner /> : null} Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
