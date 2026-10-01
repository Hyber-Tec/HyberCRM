import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuLock, LuLockOpen, LuTriangleAlert } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL, DOC } from '@shared/paths'
import { periodId } from '@shared/pay/periods'
import { formatMoney, totals } from '@shared/pay/segment'
import { addDays, formatDateKey, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useStaffList } from '@/features/data/hooks'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { effectiveRates, priceShifts, useSessionsRange, useShifts } from './api'
import { useCompensationMap, usePayPeriods, usePayrollState } from './hooks'
import { periodLabel } from './PeriodPicker'

const money = formatMoney

/**
 * Lock and unlock pay periods. Locking freezes pay up to the period's end:
 * time entries on those dates can't change and the totals are saved.
 * Only the latest locked period can be unlocked.
 */
export function PayPeriodsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { branchId, actor, settings, rules, timezone } = useBranch()
  const today = todayKey(timezone)
  const { recent, current } = usePayPeriods(12)
  const { lockedThrough } = usePayrollState()
  const isLocked = (end: string) => !!lockedThrough && end <= lockedThrough
  // Start on the latest finished period that isn't locked yet, else the latest locked one.
  const suggested = recent.find((p) => p.end < today && !isLocked(p.end)) ?? recent.find((p) => isLocked(p.end)) ?? current
  const [picked, setPicked] = useState<string | null>(null)
  const period = recent.find((p) => periodId(p) === picked) ?? suggested
  const [busy, setBusy] = useState(false)

  const { data: staff } = useStaffList()
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const comps = useCompensationMap(open ? staff.map((s) => s.id) : [])
  const { data: shifts, loading: l1 } = useShifts(period.start, period.end, null, open)
  const { data: sessions, loading: l2 } = useSessionsRange(addDays(period.start, -1), addDays(period.end, 1), null, open)
  const loading = l1 || l2

  const people = useMemo(() => {
    const priced = priceShifts({ shifts, sessions, settings, rules, timezone, ratesFor: (id) => effectiveRates(staffById.get(id), comps.get(id)) })
    const by = new Map<string, typeof priced>()
    for (const p of priced) by.set(p.shift.staffId, [...(by.get(p.shift.staffId) ?? []), p])
    return [...by.entries()].map(([id, list]) => ({
      id,
      name: staffById.get(id)?.name ?? list[0].shift.staffName,
      list,
      t: totals(list.flatMap((x) => x.segments)),
      open: list.filter((x) => x.open).length,
    }))
  }, [shifts, sessions, settings, rules, timezone, staffById, comps])
  const grand = totals(people.flatMap((p) => p.list.flatMap((x) => x.segments)))
  const openShifts = people.reduce((n, p) => n + p.open, 0)

  const locked = isLocked(period.end)
  const ended = period.end < today
  const canLock = !locked && ended && openShifts === 0 && !loading
  const canUnlock = locked && lockedThrough === period.end
  const skipsEarlier = !locked && recent.some((p) => p.end < period.start && !isLocked(p.end))

  async function lock() {
    const id = periodId(period)
    const batch = writeBatch(db)
    batch.set(branchDocRef(branchId, COL.payPeriods, id), {
      ...period,
      type: settings.payroll.payPeriod.type,
      status: 'locked',
      totals: grand,
      previousLockedThrough: lockedThrough ?? null,
      lockedAt: serverTimestamp(),
      lockedBy: actor.email,
    })
    for (const p of people) {
      batch.set(doc(collection(db, branchCol(branchId, COL.payPeriods).path, id, 'lines'), p.id), {
        staffId: p.id,
        name: p.name,
        ...p.t,
        segments: p.list.flatMap((x) => x.segments.map((s) => ({ ...s, dateKey: x.shift.dateKey }))),
      })
    }
    batch.set(branchDocRef(branchId, COL.payroll, DOC.payrollState), { lockedThrough: period.end, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, {
      action: 'pay.period_lock',
      category: 'pay',
      entityType: 'payPeriod',
      entityId: id,
      summary: `Locked the pay period ${periodLabel(period)} (${money(grand.total.pay)})`,
    })
    await batch.commit()
    toast.success(`Locked ${periodLabel(period)}`)
  }

  async function unlock() {
    const id = periodId(period)
    const snap = await getDoc(branchDocRef(branchId, COL.payPeriods, id))
    const previous = (snap.data()?.previousLockedThrough as string | null | undefined) ?? null
    const batch = writeBatch(db)
    batch.update(branchDocRef(branchId, COL.payPeriods, id), { status: 'unlocked', unlockedAt: serverTimestamp(), unlockedBy: actor.email })
    batch.set(branchDocRef(branchId, COL.payroll, DOC.payrollState), { lockedThrough: previous, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, { action: 'pay.period_unlock', category: 'pay', entityType: 'payPeriod', entityId: id, summary: `Unlocked the pay period ${periodLabel(period)}` })
    await batch.commit()
    toast.success(`Unlocked ${periodLabel(period)}`)
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay periods</DialogTitle>
          <DialogDescription>Locking a period freezes its pay: time entries on its dates can’t change. Unlock it to make corrections.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={periodId(period)} onValueChange={setPicked}>
            <SelectTrigger className="w-full" aria-label="Pay period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recent.map((p) => (
                <SelectItem key={periodId(p)} value={periodId(p)}>
                  {periodLabel(p)}
                  {periodId(p) === periodId(current) ? ' (current)' : ''}
                  {isLocked(p.end) ? ' · locked' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
            <div>
              <div className="font-medium tabular-nums">{loading ? 'Adding up…' : `${money(grand.total.pay)} · ${grand.total.hours.toFixed(2)} h`}</div>
              <div className="text-xs text-muted-foreground">
                {people.length} employee{people.length === 1 ? '' : 's'} · {formatDateKey(period.start, 'monthDay')} – {formatDateKey(period.end, 'medium')}
              </div>
            </div>
            {locked ? (
              <Badge variant="secondary" className="gap-1">
                <LuLock /> Locked
              </Badge>
            ) : !ended ? (
              <Badge variant="outline">In progress</Badge>
            ) : (
              <Badge variant="outline">Open</Badge>
            )}
          </div>
          {!locked && openShifts > 0 ? (
            <Alert>
              <LuTriangleAlert />
              <AlertDescription>
                {openShifts} shift{openShifts > 1 ? 's are' : ' is'} still clocked in during this period. Close {openShifts > 1 ? 'them' : 'it'} in Time Entries before locking.
              </AlertDescription>
            </Alert>
          ) : null}
          {!locked && !ended ? <p className="text-sm text-muted-foreground">This period hasn’t ended yet, so it can’t be locked.</p> : null}
          {locked && !canUnlock ? <p className="text-sm text-muted-foreground">Only the latest locked period can be unlocked.</p> : null}
          {skipsEarlier && ended ? <p className="text-sm text-muted-foreground">Earlier open periods are locked along with it.</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canUnlock ? (
            <Button variant="outline" disabled={busy} onClick={() => void run(unlock)}>
              {busy ? <Spinner /> : <LuLockOpen />} Unlock period
            </Button>
          ) : null}
          {!locked ? (
            <Button disabled={busy || !canLock} onClick={() => void run(lock)}>
              {busy ? <Spinner /> : <LuLock />} Lock period
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
