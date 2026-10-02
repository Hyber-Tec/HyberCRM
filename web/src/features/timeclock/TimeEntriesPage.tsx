import { useMemo, useState } from 'react'
import { LuCalendarClock, LuLock, LuPencil, LuPlus, LuTrash2, LuTriangleAlert, LuUserRound } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { type DateKey, formatDateKey, formatDuration, formatInstantTime } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStaffList } from '@/features/data/hooks'
import { type ClockShift, deleteShift, useShifts } from './api'
import { usePayrollState } from './hooks'
import { PeriodPicker, type RangeValue, useDefaultRange } from './PeriodPicker'
import { ShiftDialog } from './ShiftDialog'

const SOURCE_LABEL: Record<ClockShift['source'], string> = { kiosk: 'Kiosk', admin: 'Admin entry', auto: 'Auto' }

/** Worked times (TE "Log Hours" + the Payroll page's edit/delete): add, fix and remove shifts. */
export function TimeEntriesPage() {
  const { branchId, actor, timezone } = useBranch()
  const navigate = useNavigate()
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
              <ContextMenuFor
                key={s.id}
                entries={menu(
                  { kind: 'label', label: `${s.staffName} · ${formatDateKey(s.dateKey, 'weekdayMedium')}` },
                  locked(s.dateKey) && { kind: 'label', label: 'In a locked pay period' },
                  { label: 'Edit time entry…', icon: LuPencil, disabled: locked(s.dateKey), onSelect: () => setDialog(s) },
                  {
                    label: 'Delete time entry',
                    icon: LuTrash2,
                    destructive: true,
                    disabled: locked(s.dateKey),
                    onSelect: () => window.confirm('Delete this time entry?') && void deleteShift(branchId, actor, s).then(() => toast.success('Deleted')),
                  },
                  { label: 'Open employee profile', icon: LuUserRound, separatorBefore: true, onSelect: () => navigate(`/${branchId}/admin/employees/directory/${s.staffId}`) },
                  { label: 'Clock in/out calendar', icon: LuCalendarClock, onSelect: () => navigate(`/${branchId}/admin/employees/calendar?staff=${s.staffId}&mode=clock`) },
                )}
              >
                <TableRow>
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
              </ContextMenuFor>
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
