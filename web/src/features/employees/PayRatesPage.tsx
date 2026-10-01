import { useEffect, useMemo, useState } from 'react'
import { LuSearch } from 'react-icons/lu'
import { toast } from 'sonner'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import { ROLE_LABELS, isAdminRole } from '@shared/roles'
import { PAY_MODEL_LABELS, payModelOn } from '@shared/settings/businessRules'
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
  const { rules, timezone } = useBranch()
  const { data: staff } = useStaffList()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<'tutor' | 'admin' | 'all'>('tutor')
  const [status, setStatus] = useState<StaffStatus | 'all'>('active')
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter(
      (s) =>
        (role === 'all' || (role === 'tutor' ? s.role === 'tutor' : isAdminRole(s.role))) &&
        (status === 'all' || s.status === status) &&
        (!q || s.nameLower.includes(q)),
    )
  }, [staff, search, role, status])
  // Tutors' admin rate only matters while the branch pays admin time.
  const usesAdminRate = rules.payModels.some((p) => p.model === 'teaching_admin')
  const modelNow = payModelOn(rules, todayKey(timezone))

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Pay Rates"
        description={`Hourly rates per employee. Changes save when you leave a field and apply from today. Pay model: ${PAY_MODEL_LABELS[modelNow]}; owners and admins are paid their admin rate for all clocked time.`}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <Select value={role} onValueChange={(v) => setRole(v as 'tutor' | 'admin' | 'all')}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutor">Tutors</SelectItem>
            <SelectItem value="admin">Owners & admins</SelectItem>
            <SelectItem value="all">All roles</SelectItem>
          </SelectContent>
        </Select>
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
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <RateRow key={s.id} staff={s} usesAdminRate={usesAdminRate} />
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function RateRow({ staff, usesAdminRate }: { staff: WithId<Staff>; usesAdminRate: boolean }) {
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

  const single = isAdminRole(staff.role)

  async function commit() {
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
        { rates: { teaching: t, admin: a } },
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
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[staff.role] ?? ''}</span>
              <StaffStatusBadge status={staff.status} className="h-5" />
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>{single ? <span className="text-sm text-muted-foreground">Doesn’t teach</span> : rateInput(teaching, setTeaching, 'Teaching rate')}</TableCell>
      <TableCell>
        {single || usesAdminRate ? rateInput(admin, setAdmin, 'Admin rate') : <span className="text-sm text-muted-foreground">Not paid (teaching only)</span>}
      </TableCell>
      <TableCell>{busy ? <Spinner className="size-4" /> : null}</TableCell>
    </TableRow>
  )
}
