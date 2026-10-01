import { useMemo, useState } from 'react'
import { COL, DOC } from '@shared/paths'
import { totals } from '@shared/pay/segment'
import { addDays, formatDateKey, formatInstantTime } from '@shared/time'
import type { Compensation, Staff } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { branchCol, branchDocRef, useDoc } from '@/lib/firestore'
import { doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { effectiveRates, priceShifts, useSessionsRange, useShifts } from './api'
import { PeriodPicker, type RangeValue, useDefaultRange } from './PeriodPicker'

const money = (n: number) => `$${n.toFixed(2)}`

/** A tutor's own worked time and pay for a pay period or range (read-only). */
export function TutorPayrollPage() {
  const { branchId, staffId, settings, timezone } = useBranch()
  const [range, setRange] = useState<RangeValue>(useDefaultRange())
  const meRef = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  const compRef = useMemo(() => (staffId ? doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.compensation) : null), [branchId, staffId])
  const { data: me } = useDoc<Staff>(meRef)
  const { data: comp } = useDoc<Compensation>(compRef)
  const { data: shifts } = useShifts(range.from, range.to, staffId, !!staffId)
  const { data: sessions } = useSessionsRange(addDays(range.from, -1), addDays(range.to, 1), staffId, !!staffId)

  const priced = useMemo(
    () => priceShifts({ shifts, sessions, settings, timezone, ratesFor: () => effectiveRates(me ?? undefined, comp, settings) }),
    [shifts, sessions, settings, timezone, me, comp],
  )
  const t = totals(priced.flatMap((p) => p.segments))
  if (!staffId) return <p className="text-sm text-muted-foreground">Your employee record isn’t linked yet. Ask an admin.</p>

  return (
    <div className="max-w-4xl">
      <PageHeader title="Payroll" description="Your recorded hours and pay. Teaching time is time inside sessions with a submitted log." />
      <div className="mb-4">
        <PeriodPicker value={range} onChange={setRange} />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Admin', v: t.admin },
          { label: 'Teaching', v: t.teaching },
          { label: 'Total pay', v: t.total },
        ].map((x) => (
          <Card key={x.label} className="gap-1 px-4 py-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase">{x.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{money(x.v.pay)}</div>
            <div className="text-sm text-muted-foreground tabular-nums">{x.v.hours.toFixed(2)}h</div>
          </Card>
        ))}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="text-right">Hrs</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {priced.flatMap((p) =>
              p.open
                ? [
                    <TableRow key={p.shift.id}>
                      <TableCell>{formatDateKey(p.shift.dateKey, 'weekdayMedium')}</TableCell>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        Clocked in at {formatInstantTime(p.shift.clockInAt.toDate(), timezone)}
                      </TableCell>
                    </TableRow>,
                  ]
                : p.segments.map((s, i) => (
                    <TableRow key={`${p.shift.id}-${i}`}>
                      <TableCell className="whitespace-nowrap">{i === 0 ? formatDateKey(p.shift.dateKey, 'weekdayMedium') : ''}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.type === 'teaching' ? 'border-green-200 bg-green-50 text-green-700' : 'border-sky-200 bg-sky-50 text-sky-700'}>
                          {s.type === 'teaching' ? 'Teaching' : 'Admin'}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatInstantTime(s.startMs, timezone)}</TableCell>
                      <TableCell className="tabular-nums">{formatInstantTime(s.endMs, timezone)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(s.rate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(s.pay)}</TableCell>
                    </TableRow>
                  )),
            )}
            {priced.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No records found for this range.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
