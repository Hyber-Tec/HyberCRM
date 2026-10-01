import { useEffect, useMemo, useState } from 'react'
import { LuSearch } from 'react-icons/lu'
import { toast } from 'sonner'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import { todayKey } from '@shared/time'
import type { Compensation, Staff, StaffStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { initials } from '@/components/app/BrandMark'
import { PageHeader } from '@/components/app/PageHeader'
import { StaffStatusBadge } from '@/components/app/StatusBadge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStaffList } from '@/features/data/hooks'
import { useDoc } from '@/lib/firestore'
import { compensationRef, saveCompensation } from './api'

export function PayRatesPage() {
  const { data: staff } = useStaffList()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StaffStatus | 'all'>('active')
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter((s) => (status === 'all' || s.status === status) && (!q || s.nameLower.includes(q)))
  }, [staff, search, status])

  return (
    <div className="max-w-5xl">
      <PageHeader title="Pay Rates" description="Hourly rates per employee. Changes save when you leave a field and apply from today." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <Select value={status} onValueChange={(v) => setStatus(v as StaffStatus | 'all')}>
          <SelectTrigger className="sm:w-40">
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
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="w-40">Teaching rate</TableHead>
              <TableHead className="w-40">Admin rate</TableHead>
              <TableHead className="hidden w-56 lg:table-cell">Pay model</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <RateRow key={s.id} staff={s} />
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function RateRow({ staff }: { staff: WithId<Staff> }) {
  const { branchId, actor, timezone } = useBranch()
  const ref = useMemo(() => compensationRef(branchId, staff.id), [branchId, staff.id])
  const { data: comp } = useDoc<Compensation>(ref)
  const [teaching, setTeaching] = useState('')
  const [admin, setAdmin] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTeaching(comp?.rates?.teaching != null ? String(comp.rates.teaching) : '')
    setAdmin(comp?.rates?.admin != null ? String(comp.rates.admin) : '')
  }, [comp])

  async function commit(model?: Compensation['payModel']) {
    const t = teaching === '' ? 0 : Number(teaching)
    const a = admin === '' ? 0 : Number(admin)
    if (!Number.isFinite(t) || !Number.isFinite(a)) {
      toast.error('Enter a valid amount.')
      return
    }
    setBusy(true)
    try {
      await saveCompensation(
        branchId,
        actor,
        staff,
        comp,
        { rates: { teaching: t, admin: a }, payModel: model ?? comp?.payModel ?? 'branch_default' },
        todayKey(timezone),
      )
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const rateInput = (value: string, set: (v: string) => void, label: string) => (
    <InputGroup className="h-8">
      <InputGroupAddon>
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={`${label} for ${staff.name}`}
        inputMode="decimal"
        value={value}
        disabled={busy}
        onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={() => void commit()}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>/hr</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback style={{ backgroundColor: `${staff.color}22`, color: staff.color }}>{initials(staff.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium">{staff.name}</div>
            <StaffStatusBadge status={staff.status} className="mt-0.5 h-5" />
          </div>
        </div>
      </TableCell>
      <TableCell>{rateInput(teaching, setTeaching, 'Teaching rate')}</TableCell>
      <TableCell>{rateInput(admin, setAdmin, 'Admin rate')}</TableCell>
      <TableCell className="hidden lg:table-cell">
        <Select value={comp?.payModel ?? 'branch_default'} onValueChange={(v) => void commit(v as Compensation['payModel'])}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="branch_default">Branch default</SelectItem>
            <SelectItem value="teaching_admin_split">Teaching / admin</SelectItem>
            <SelectItem value="single_rate">One rate (admin rate)</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>{busy ? <Spinner className="size-4" /> : null}</TableCell>
    </TableRow>
  )
}
