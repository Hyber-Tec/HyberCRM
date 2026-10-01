import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { Fragment, useMemo, useState } from 'react'
import { LuChevronDown, LuChevronRight, LuDownload, LuLock, LuLockOpen } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL, DOC } from '@shared/paths'
import { periodId } from '@shared/pay/periods'
import { totals } from '@shared/pay/segment'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import { addDays, formatDateKey, formatInstantTime, todayKey } from '@shared/time'
import type { StaffStatus } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStaffList } from '@/features/data/hooks'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { effectiveRates, priceShifts, useSessionsRange, useShifts } from './api'
import { useCompensationMap, usePayrollState } from './hooks'
import { PeriodPicker, type RangeValue, periodLabel, useDefaultRange } from './PeriodPicker'

const money = (n: number) => `$${n.toFixed(2)}`
const hrs = (n: number) => `${n.toFixed(2)}h`

/** Payroll report (TE's date-range report) with pay periods that can be locked. */
export function PayrollPage() {
  const { branchId, actor, settings, timezone } = useBranch()
  const { data: staff } = useStaffList()
  const [range, setRange] = useState<RangeValue>(useDefaultRange())
  const [status, setStatus] = useState<StaffStatus | 'all'>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const { lockedThrough } = usePayrollState()
  const { data: shifts } = useShifts(range.from, range.to, null)
  const { data: sessions } = useSessionsRange(addDays(range.from, -1), addDays(range.to, 1), null)
  const comps = useCompensationMap(staff.map((s) => s.id))
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])

  const priced = useMemo(
    () =>
      priceShifts({
        shifts,
        sessions,
        settings,
        timezone,
        ratesFor: (id) => effectiveRates(staffById.get(id), comps.get(id), settings),
      }),
    [shifts, sessions, settings, timezone, staffById, comps],
  )

  const people = useMemo(() => {
    const by = new Map<string, typeof priced>()
    for (const p of priced) by.set(p.shift.staffId, [...(by.get(p.shift.staffId) ?? []), p])
    return [...by.entries()]
      .map(([id, list]) => ({ id, name: staffById.get(id)?.name ?? list[0].shift.staffName, status: staffById.get(id)?.status, list, t: totals(list.flatMap((x) => x.segments)), open: list.filter((x) => x.open).length }))
      .filter((p) => status === 'all' || p.status === status)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [priced, staffById, status])
  const grand = totals(people.flatMap((p) => p.list.flatMap((x) => x.segments)))

  const today = todayKey(timezone)
  const isPeriod = !!range.period
  const periodLocked = isPeriod && !!lockedThrough && range.period!.end <= lockedThrough
  const { type } = settings.payroll.payPeriod
  // Locking a period locks everything up to its end; only the latest locked period can be unlocked.
  const canLock = isPeriod && !periodLocked && range.period!.end < today
  const canUnlock = periodLocked && lockedThrough === range.period!.end

  async function lock() {
    if (!range.period) return
    const openCount = people.reduce((n, p) => n + p.open, 0)
    if (openCount > 0) return toast.error(`${openCount} shift(s) are still open in this period. Close them in Time Entries first.`)
    if (!window.confirm(`Lock ${periodLabel(range.period)}? Pay is frozen and time entries in this period can no longer change.`)) return
    const id = periodId(range.period)
    const batch = writeBatch(db)
    batch.set(branchDocRef(branchId, COL.payPeriods, id), {
      ...range.period,
      type,
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
    batch.set(branchDocRef(branchId, COL.payroll, DOC.payrollState), { lockedThrough: range.period.end, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, { action: 'pay.period_lock', category: 'pay', entityType: 'payPeriod', entityId: id, summary: `Locked the pay period ${periodLabel(range.period)} (${money(grand.total.pay)})` })
    await batch.commit()
    toast.success('Pay period locked')
  }

  async function unlock() {
    if (!range.period) return
    if (!window.confirm(`Unlock ${periodLabel(range.period)}? Time entries in it can be changed again.`)) return
    const id = periodId(range.period)
    const snap = await getDoc(branchDocRef(branchId, COL.payPeriods, id))
    const previous = (snap.data()?.previousLockedThrough as string | null | undefined) ?? null
    const batch = writeBatch(db)
    batch.update(branchDocRef(branchId, COL.payPeriods, id), { status: 'unlocked', unlockedAt: serverTimestamp(), unlockedBy: actor.email })
    batch.set(branchDocRef(branchId, COL.payroll, DOC.payrollState), { lockedThrough: previous, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, { action: 'pay.period_unlock', category: 'pay', entityType: 'payPeriod', entityId: id, summary: `Unlocked the pay period ${periodLabel(range.period)}` })
    await batch.commit()
    toast.success('Pay period unlocked')
  }

  function exportCsv() {
    const lines = [['Employee', 'Admin hours', 'Admin pay', 'Teaching hours', 'Teaching pay', 'Total hours', 'Total pay']]
    for (const p of people) lines.push([p.name, p.t.admin.hours, p.t.admin.pay, p.t.teaching.hours, p.t.teaching.pay, p.t.total.hours, p.t.total.pay].map(String))
    const blob = new Blob([lines.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `payroll_${range.from}_${range.to}.csv`
    a.click()
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Payroll"
        description="Worked time split into teaching (logged sessions) and admin time, priced with each employee’s rates."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <LuDownload /> CSV
            </Button>
            {canUnlock ? (
              <Button variant="outline" onClick={() => void unlock()}>
                <LuLockOpen /> Unlock period
              </Button>
            ) : null}
            {canLock ? (
              <Button onClick={() => void lock()}>
                <LuLock /> Lock period
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <PeriodPicker value={range} onChange={setRange} lockedThrough={lockedThrough} />
        <Select value={status} onValueChange={(v) => setStatus(v as StaffStatus | 'all')}>
          <SelectTrigger className="lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STAFF_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAFF_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {periodLocked ? (
          <Badge variant="secondary" className="gap-1">
            <LuLock /> Locked
          </Badge>
        ) : null}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Admin', v: grand.admin },
          { label: 'Teaching', v: grand.teaching },
          { label: 'Total pay', v: grand.total },
        ].map((t) => (
          <Card key={t.label} className="gap-1 px-4 py-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase">{t.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{money(t.v.pay)}</div>
            <div className="text-sm text-muted-foreground tabular-nums">{hrs(t.v.hours)}</div>
          </Card>
        ))}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Admin</TableHead>
              <TableHead className="text-right">Teaching</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((p) => {
              const isOpen = open.has(p.id)
              return (
                <Fragment key={p.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen((s) => (s.has(p.id) ? new Set([...s].filter((x) => x !== p.id)) : new Set([...s, p.id])))}>
                    <TableCell>{isOpen ? <LuChevronDown /> : <LuChevronRight />}</TableCell>
                    <TableCell className="font-medium">
                      {p.name}
                      {p.open ? <Badge className="ml-2 bg-emerald-600">{p.open} open</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(p.t.admin.pay)} <span className="text-xs text-muted-foreground">{hrs(p.t.admin.hours)}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(p.t.teaching.pay)} <span className="text-xs text-muted-foreground">{hrs(p.t.teaching.hours)}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {money(p.t.total.pay)} <span className="text-xs font-normal text-muted-foreground">{hrs(p.t.total.hours)}</span>
                    </TableCell>
                  </TableRow>
                  {isOpen
                    ? p.list.flatMap((x) =>
                        x.open
                          ? [
                              <TableRow key={x.shift.id} className="bg-muted/30 text-sm">
                                <TableCell />
                                <TableCell colSpan={4} className="text-muted-foreground">
                                  {formatDateKey(x.shift.dateKey, 'weekdayMedium')} · clocked in at {formatInstantTime(x.shift.clockInAt.toDate(), timezone)} (still open)
                                </TableCell>
                              </TableRow>,
                            ]
                          : x.segments.map((s, i) => (
                              <TableRow key={`${x.shift.id}-${i}`} className="bg-muted/30 text-sm">
                                <TableCell />
                                <TableCell className="text-muted-foreground">
                                  {formatDateKey(x.shift.dateKey, 'weekdayMedium')} · {formatInstantTime(s.startMs, timezone)} – {formatInstantTime(s.endMs, timezone)}
                                </TableCell>
                                <TableCell colSpan={2}>
                                  <Badge variant="outline" className={s.type === 'teaching' ? 'border-green-200 bg-green-50 text-green-700' : 'border-sky-200 bg-sky-50 text-sky-700'}>
                                    {s.type === 'teaching' ? 'Teaching' : 'Admin'}
                                  </Badge>
                                  <span className="ml-2 text-muted-foreground tabular-nums">
                                    {hrs(s.hours)} × {money(s.rate)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{money(s.pay)}</TableCell>
                              </TableRow>
                            )),
                      )
                    : null}
                </Fragment>
              )
            })}
            {people.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No worked time in this range.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
          {people.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{money(grand.admin.pay)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(grand.teaching.pay)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{money(grand.total.pay)}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">
        Teaching time = clocked time inside sessions in these statuses: {settings.payroll.teachingSessionStatuses.join(', ')}. Hours are rounded to 0.01 h; pay is computed from the rounded hours.
      </p>
    </div>
  )
}
