import { limit, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuCalendarCheck, LuCalendarClock, LuDownload, LuLock, LuPencil, LuTrash2, LuUserRound } from 'react-icons/lu'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { missingRates, rateName } from '@shared/pay/rates'
import { type PricedSegment, formatMoney, totals } from '@shared/pay/segment'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import { type BusinessRules, type PayModel } from '@shared/settings/businessRules'
import { type DateKey, addDays, formatDateKey, formatInstantTime, todayKey } from '@shared/time'
import type { Staff, StaffStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { DatePicker } from '@/components/app/DatePicker'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStaffList } from '@/features/data/hooks'
import { PayGapNotice, RateMissingNotice } from '@/features/employees/PayGapNotice'
import { usePayGaps } from '@/features/employees/payGaps'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { type ClockShift, deleteShift, effectiveRates, priceShifts, useSessionsRange, useShifts } from './api'
import { useCompensationMap, usePayrollState } from './hooks'
import { PayPeriodsDialog } from './PayPeriodsDialog'
import { ShiftDialog } from './ShiftDialog'

/** True Education's page sizes: recent records, and a generated report. */
const BROWSE_PAGE = 25
const REPORT_PAGE = 70
/** How far back the recent list first looks; it reaches further back as pages need it. */
const BROWSE_DAYS = 30

type RoleFilter = 'all' | 'tutor' | 'admin'

interface PayRow {
  id: string
  shift: WithId<ClockShift>
  seg: PricedSegment
  name: string
  /** Paid rows the same time entry makes (editing or deleting one touches them all). */
  parts: number
}

const money = formatMoney

/** Owners and admins are filtered as admins. */
const roleGroup = (s: Pick<Staff, 'role'> | undefined): 'tutor' | 'admin' => (s?.role === 'owner' || s?.role === 'admin' ? 'admin' : 'tutor')

/** The pay models in force at some point between two dates. */
function modelsBetween(rules: BusinessRules, from: DateKey, to: DateKey): PayModel[] {
  return rules.payModels.filter((p, i) => p.from <= to && (rules.payModels[i + 1]?.from ?? '9999-12-31') > from).map((p) => p.model)
}

/**
 * Payroll in True Education's layout: filters (role, status, employee, dates),
 * the most recent payroll records 25 at a time, and a generated report for one
 * employee and date range with pay totals. Rows are pieces of time entries
 * (shifts), split into teaching and admin time; Edit and Delete act on the
 * time entry they come from. The applied filters live in the URL.
 */
export function PayrollPage() {
  const { branchId, actor, settings, rules, timezone } = useBranch()
  const navigate = useNavigate()
  const today = todayKey(timezone)
  const [params, setParams] = useSearchParams()
  const { data: staff } = useStaffList()
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const { lockedThrough } = usePayrollState()

  // Applied state (URL).
  const role: RoleFilter = params.get('role') === 'tutor' || params.get('role') === 'admin' ? (params.get('role') as RoleFilter) : 'all'
  const statusParam = params.get('status')
  const status: StaffStatus | 'all' = statusParam === 'all' || STAFF_STATUSES.includes(statusParam as StaffStatus) ? (statusParam as StaffStatus | 'all') : 'active'
  const report = params.get('employee') && params.get('from') && params.get('to') ? { staffId: params.get('employee')!, from: params.get('from')!, to: params.get('to')! } : null
  const isReport = !!report
  const sortAsc = report ? params.get('sort') !== 'desc' : false
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1)
  const update = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  // Draft fields (applied with Generate).
  const [employee, setEmployee] = useState<string | null>(report?.staffId ?? null)
  const [from, setFrom] = useState<DateKey | null>(report?.from ?? null)
  const [to, setTo] = useState<DateKey | null>(report?.to ?? null)
  const matches = (s: WithId<Staff> | undefined) => !!s && (role === 'all' || roleGroup(s) === role) && (status === 'all' || s.status === status)
  const choices = staff.filter(matches)
  // An employee the role or status filter hides is no longer chosen.
  const chosen = employee && choices.some((c) => c.id === employee) ? employee : null

  // Data: the report's range, or the recent window (which grows as pages need it).
  const [browseFrom, setBrowseFrom] = useState(() => addDays(today, -BROWSE_DAYS))
  const qFrom = report ? report.from : browseFrom
  const qTo = report ? report.to : today
  const who = report?.staffId ?? null
  const { data: shifts, loading: loadingShifts } = useShifts(qFrom, qTo, who, true, { keepPrevious: true })
  const { data: sessions, loading: loadingSessions } = useSessionsRange(addDays(qFrom, -1), addDays(qTo, 1), who, true, { keepPrevious: true })
  const olderQuery = useMemo(
    () => (isReport ? null : query(branchCol(branchId, COL.clockShifts), where('dateKey', '<', browseFrom), orderBy('dateKey', 'desc'), limit(1))),
    [branchId, browseFrom, isReport],
  )
  const { data: older, loading: loadingOlder } = useQuery<ClockShift>(olderQuery, `pay-older-${branchId}-${browseFrom}-${isReport}`, { keepPrevious: true })
  const loading = loadingShifts || loadingSessions || loadingOlder
  const comps = useCompensationMap(staff.map((s) => s.id))

  const rows = useMemo(() => {
    const priced = priceShifts({ shifts, sessions, settings, rules, timezone, ratesFor: (id) => effectiveRates(staffById.get(id), comps.get(id)) })
    const out: PayRow[] = []
    for (const p of priced) {
      const person = staffById.get(p.shift.staffId)
      if (!isReport && !(matches(person) || (!person && role === 'all' && status === 'all'))) continue
      // Unpaid time (Teaching only) isn't a payroll record.
      const paid = p.segments.filter((s) => !s.unpaid)
      paid.forEach((seg, i) => out.push({ id: `${p.shift.id}-${i}`, shift: p.shift, seg, name: person?.name ?? p.shift.staffName, parts: paid.length }))
    }
    const dir = sortAsc ? 1 : -1
    return out.sort((a, b) => a.shift.dateKey.localeCompare(b.shift.dateKey) * dir || a.name.localeCompare(b.name) || a.seg.startMs - b.seg.startMs)
    // `matches` reads role and status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, sessions, settings, rules, timezone, staffById, comps, isReport, role, status, sortAsc])

  const size = report ? REPORT_PAGE : BROWSE_PAGE
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const pageRows = rows.slice((page - 1) * size, page * size)
  const olderDate = older[0]?.dateKey ?? null

  // The recent list reaches further back until the page is full or nothing older exists.
  useEffect(() => {
    if (isReport || loading || !olderDate || rows.length >= page * BROWSE_PAGE) return
    setBrowseFrom(addDays(olderDate, -BROWSE_DAYS))
  }, [isReport, loading, olderDate, rows.length, page])

  const canPrev = page > 1
  const canNext = report ? page < pageCount : rows.length > page * size || !!olderDate

  function generate() {
    if (!chosen) return toast.error('Choose an employee.')
    if (!from || !to) return toast.error('Choose the dates (From and Up to).')
    if (from > to) return toast.error('“From” must be on or before “Up to”.')
    update({ employee: chosen, from, to, sort: null, page: null })
  }

  function clear() {
    setEmployee(null)
    setFrom(null)
    setTo(null)
    setBrowseFrom(addDays(today, -BROWSE_DAYS))
    setParams({}, { replace: true })
  }

  // Report summary.
  const person = report ? staffById.get(report.staffId) : undefined
  const rates = report ? effectiveRates(person, comps.get(report.staffId)).rates : null
  const singleRate = roleGroup(person) === 'admin'
  const models = report ? modelsBetween(rules, report.from, report.to) : []
  const paysAdmin = singleRate || models.includes('teaching_admin')
  const sum = totals(rows.map((r) => r.seg))
  // Rates the report's employee is missing (their time is priced at $0), and anyone missing one.
  const reportMissing = report && person && rates ? missingRates(person.role, rates, models.includes('teaching_admin')) : []
  const { gaps } = usePayGaps(!report)

  const [editing, setEditing] = useState<PayRow | null>(null)
  const [deleting, setDeleting] = useState<PayRow | null>(null)
  const [periodsOpen, setPeriodsOpen] = useState(false)
  const isLocked = (d: DateKey) => !!lockedThrough && d <= lockedThrough
  const timeOf = (ms: number) => formatInstantTime(ms, timezone)
  const entryLabel = (r: PayRow) =>
    `${r.name}’s time entry on ${formatDateKey(r.shift.dateKey, 'weekdayMedium')}, ${timeOf(r.shift.clockInAt.toMillis())} – ${r.shift.clockOutAt ? timeOf(r.shift.clockOutAt.toMillis()) : 'open'}`

  function exportCsv() {
    const lines = [['Date', 'Name', 'Type', 'Start time', 'End time', 'Hours', 'Rate', 'Total']]
    for (const r of rows) {
      lines.push([r.shift.dateKey, r.name, r.seg.type === 'teaching' ? 'Teaching' : 'Admin', timeOf(r.seg.startMs), timeOf(r.seg.endMs), r.seg.hours.toFixed(2), r.seg.rate.toFixed(2), r.seg.pay.toFixed(2)])
    }
    const blob = new Blob([lines.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = report ? `payroll_${(person?.name ?? 'employee').replace(/\W+/g, '_')}_${report.from}_${report.to}.csv` : `payroll_recent_${today}.csv`
    a.click()
  }

  // Rows are shaded by date, not one by one (TE).
  const shaded = pageRows.reduce<boolean[]>((acc, r, i) => [...acc, i > 0 && (r.shift.dateKey !== pageRows[i - 1].shift.dateKey ? !acc[i - 1] : acc[i - 1])], [])

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Payroll"
        description="Worked time split into teaching (logged sessions) and admin time, priced with each employee’s rates."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <LuDownload /> CSV
            </Button>
            <Button variant="outline" onClick={() => setPeriodsOpen(true)}>
              <LuCalendarCheck /> Pay periods
            </Button>
          </>
        }
      />

      {!report ? <PayGapNotice gaps={gaps} className="mb-4" /> : null}
      <Card className="mb-4 px-4 py-4" data-testid="payroll-filters">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-36">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={(v) => update({ role: v === 'all' ? null : v, page: report ? params.get('page') : null })}>
              <SelectTrigger className="w-full" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="tutor">Tutors</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-36">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={(v) => update({ status: v === 'active' ? null : v, page: report ? params.get('page') : null })}>
              <SelectTrigger className="w-full" aria-label="Status">
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
          </div>
          <div className="grid w-full gap-1.5 sm:w-auto sm:min-w-56 sm:flex-1">
            <Label className="text-xs text-muted-foreground">Employee</Label>
            <OptionPicker
              value={chosen}
              onChange={setEmployee}
              options={choices.map((s) => ({ value: s.id, label: s.name, hint: roleGroup(s) === 'admin' ? 'Admin' : undefined }))}
              placeholder="Choose employee…"
              searchPlaceholder="Search employees…"
            />
          </div>
          <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-40">
            <Label htmlFor="pay-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <DatePicker id="pay-from" value={from} onChange={setFrom} max={to} placeholder="Start date" />
          </div>
          <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-40">
            <Label htmlFor="pay-to" className="text-xs text-muted-foreground">
              Up to
            </Label>
            <DatePicker id="pay-to" value={to} onChange={setTo} min={from} placeholder="End date" />
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button className="flex-1 sm:flex-none" onClick={generate}>
              Generate
            </Button>
            <Button variant="ghost" className="flex-1 sm:flex-none" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {report ? (
        <Card className="mb-4 gap-3 px-4 py-4" data-testid="payroll-summary">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold">{person?.name ?? 'Employee'}</span>
            <span className="text-muted-foreground">
              {formatDateKey(report.from, 'medium')} – {formatDateKey(report.to, 'medium')}
            </span>
            {rates ? (
              singleRate ? (
                <span>
                  Hourly rate: <strong>{money(rates.admin)}/hr</strong>
                </span>
              ) : (
                <>
                  {paysAdmin ? (
                    <span>
                      Admin rate: <strong>{money(rates.admin)}/hr</strong>
                    </span>
                  ) : null}
                  <span>
                    Teaching rate: <strong>{money(rates.teaching)}/hr</strong>
                  </span>
                </>
              )
            ) : null}
          </div>
          <div className={cn('grid gap-2 sm:gap-3', singleRate ? 'grid-cols-1' : paysAdmin ? 'grid-cols-3' : 'grid-cols-2')}>
            {[
              ...(!singleRate && paysAdmin ? [{ label: 'Admin', v: sum.admin }] : []),
              ...(!singleRate ? [{ label: 'Teaching', v: sum.teaching }] : []),
              { label: 'Total pay', v: sum.total, total: true },
            ].map((t) => (
              <div key={t.label} className={cn('min-w-0 rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3', 'total' in t && 'bg-muted/40')}>
                <div className="truncate text-[11px] font-semibold text-muted-foreground uppercase sm:text-xs">{t.label}</div>
                <div className="truncate text-base font-semibold tabular-nums sm:text-2xl">{money(t.v.pay)}</div>
                <div className="text-xs text-muted-foreground tabular-nums sm:text-sm">{t.v.hours.toFixed(2)} h</div>
              </div>
            ))}
          </div>
          {reportMissing.length && person ? (
            <RateMissingNotice>
              {person.name} has no {reportMissing.map((k) => rateName(k, person.role).replace(/ rate$/, '')).join(' or ')} rate, so this time is priced at $0.{' '}
              <Link to={`/${branchId}/admin/employees/directory/${person.id}#pay`} className="font-medium underline underline-offset-2">
                Set it
              </Link>
            </RateMissingNotice>
          ) : null}
          {!singleRate && models.includes('teaching_only') ? (
            <p className="text-xs text-muted-foreground">
              {paysAdmin ? 'Part of this range uses Teaching only: ' : 'This branch pays Teaching only: '}clocked time outside sessions isn’t paid, so it isn’t listed.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-base font-semibold">{report ? 'Generated Payroll Records' : 'Recent Payroll Records'}</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="payroll-page-meta">
          {loading ? <Spinner className="size-3.5" /> : null}
          <span>
            Page <strong className="text-foreground">{page}</strong> · <strong className="text-foreground">{size}</strong> per page
            {report ? (
              <>
                {' '}
                · <strong className="text-foreground">{rows.length}</strong> total
              </>
            ) : null}
          </span>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <Table data-testid="payroll-table">
          <TableHeader>
            <TableRow>
              <TableHead>
                {report ? (
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => update({ sort: sortAsc ? 'desc' : null, page: null })}>
                    Date {sortAsc ? <LuArrowUp className="size-3.5" /> : <LuArrowDown className="size-3.5" />}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    Date <LuArrowDown className="size-3.5" aria-label="Newest first" />
                  </span>
                )}
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Start Time</TableHead>
              <TableHead>End Time</TableHead>
              <TableHead className="text-right">Hrs</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  {loading ? 'Loading records…' : report ? 'No records for this employee and date range.' : 'No payroll records yet.'}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r, i) => {
                const locked = isLocked(r.shift.dateKey)
                const employeePath = `/${branchId}/admin/employees/directory/${r.shift.staffId}`
                return (
                  <ContextMenuFor
                    key={r.id}
                    entries={menu(
                      { kind: 'label', label: `${r.name} · ${formatDateKey(r.shift.dateKey, 'weekdayMedium')}` },
                      locked && { kind: 'label', label: 'In a locked pay period' },
                      { label: 'Edit shift…', icon: LuPencil, disabled: locked, onSelect: () => setEditing(r) },
                      { label: 'Delete shift', icon: LuTrash2, destructive: true, disabled: locked, onSelect: () => setDeleting(r) },
                      { label: 'Open employee profile', icon: LuUserRound, separatorBefore: true, onSelect: () => navigate(employeePath) },
                      { label: 'Open in new tab', onSelect: () => window.open(employeePath, '_blank', 'noopener') },
                      {
                        label: 'Clock in/out calendar',
                        icon: LuCalendarClock,
                        onSelect: () => navigate(`/${branchId}/admin/employees/calendar?staff=${r.shift.staffId}&mode=clock`),
                      },
                    )}
                  >
                    <TableRow className={cn(shaded[i] && 'bg-muted/80 hover:bg-muted')} data-testid="payroll-row">
                      <TableCell className="whitespace-nowrap">{formatDateKey(r.shift.dateKey, r.shift.dateKey.slice(0, 4) === today.slice(0, 4) ? 'weekdayMedium' : 'medium')}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.seg.type === 'teaching' ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'}>
                          {r.seg.type === 'teaching' ? 'Teaching' : 'Admin'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{timeOf(r.seg.startMs)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{timeOf(r.seg.endMs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.seg.hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.seg.rate)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(r.seg.pay)}</TableCell>
                      <TableCell>
                        {locked ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <LuLock className="size-3.5" /> Locked
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>In a locked pay period</TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="xs" onClick={() => setEditing(r)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setDeleting(r)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  </ContextMenuFor>
                )
              })
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {report ? `${pageCount} page${pageCount > 1 ? 's' : ''}` : 'Newest first'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}>
              Prev
            </Button>
            <Button variant="outline" size="sm" disabled={!canNext} onClick={() => update({ page: String(page + 1) })}>
              Next
            </Button>
          </div>
        </div>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">
        Teaching time = clocked time inside sessions in these statuses: {settings.payroll.teachingSessionStatuses.join(', ')}. Hours are rounded to 0.01 h; pay is computed from the rounded hours. Each row is part of a time entry: Edit and Delete change that whole entry.
      </p>

      <ShiftDialog
        state={editing?.shift ?? null}
        onClose={() => setEditing(null)}
        staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        isLocked={isLocked}
        defaultStaff={null}
        note={editing ? `This row is part of ${entryLabel(editing)}. Pay is split into teaching and admin time again when you save.` : undefined}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this time entry?"
        description={
          deleting ? (
            <>
              {entryLabel(deleting)} will be deleted{deleting.parts > 1 ? `, with all ${deleting.parts} of its payroll rows` : ''}. This can’t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteShift(branchId, actor, deleting.shift)
            toast.success('Time entry deleted')
          } catch (e) {
            toast.error('Could not delete', { description: (e as Error).message.includes('permission') ? 'That date is in a locked pay period.' : (e as Error).message })
          }
        }}
      />
      <PayPeriodsDialog open={periodsOpen} onOpenChange={setPeriodsOpen} />
    </div>
  )
}
