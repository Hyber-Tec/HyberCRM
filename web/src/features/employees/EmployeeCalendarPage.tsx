import { query, where } from 'firebase/firestore'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { COL } from '@shared/paths'
import { unionMinutes } from '@shared/schedule/lanes'
import { formatTimeRange } from '@shared/time'
import type { Session } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'
import { type DayCell, HoursCalendar } from './HoursCalendar'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import type { StaffStatus } from '@shared/types'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AvailabilityCalendar } from '@/features/availability/AvailabilityCalendar'
import { useStaffList } from '@/features/data/hooks'

type CalendarMode = 'availability' | 'scheduled' | 'clock' | 'teaching' | 'admin'

const MODES: { value: CalendarMode; label: string; ready: boolean }[] = [
  { value: 'availability', label: 'Availability', ready: true },
  { value: 'scheduled', label: 'Scheduled hours', ready: true },
  { value: 'clock', label: 'Clock in/out', ready: false },
  { value: 'teaching', label: 'Teaching hours', ready: false },
  { value: 'admin', label: 'Admin hours', ready: false },
]

export function EmployeeCalendarPage() {
  const { data: staff } = useStaffList()
  const [params, setParams] = useSearchParams()
  const [role, setRole] = useState<'tutor' | 'admin' | 'all'>('tutor')
  const [status, setStatus] = useState<StaffStatus | 'all'>('active')
  const mode = (params.get('mode') as CalendarMode) || 'availability'
  const staffId = params.get('staff')
  const options = useMemo(
    () =>
      staff
        .filter((s) => (role === 'all' || s.roles.includes(role)) && (status === 'all' || s.status === status))
        .map((s) => ({ value: s.id, label: s.name })),
    [staff, role, status],
  )
  const selected = staff.find((s) => s.id === staffId) ?? null
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    setParams(next, { replace: true })
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title="Employee Calendar" description="Each employee’s availability, scheduled hours and worked time by day." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="sm:w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutor">Tutors</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="all">All roles</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="sm:w-36">
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
        <OptionPicker
          className="sm:w-64"
          value={staffId}
          onChange={(v) => set({ staff: v })}
          options={options}
          placeholder="Select employee…"
          searchPlaceholder="Search employees…"
        />
        <Select value={mode} onValueChange={(v) => set({ mode: v })}>
          <SelectTrigger className="sm:ml-auto sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m.value} value={m.value} disabled={!m.ready}>
                {m.label}
                {m.ready ? '' : ' (soon)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected && mode === 'scheduled' ? (
        <ScheduledHours key={selected.id} staffId={selected.id} />
      ) : selected ? (
        <AvailabilityCalendar key={selected.id} staffId={selected.id} staffName={selected.name} mode="admin" />
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Select an employee</EmptyTitle>
            <EmptyDescription>Choose someone above to see and edit their calendar. Admins can change any day, including locked ones.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

function ScheduledHours({ staffId }: { staffId: string }) {
  const { branchId } = useBranch()
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const onRange = useCallback((from: string, to: string) => setRange({ from, to }), [])
  const q = useMemo(
    () => (range ? query(branchCol(branchId, COL.sessions), where('tutorId', '==', staffId), where('dateKey', '>=', range.from), where('dateKey', '<=', range.to)) : null),
    [branchId, staffId, range],
  )
  const { data } = useQuery<Session>(q, `emp-sched-${staffId}-${range?.from}`)
  const cells = useMemo(() => {
    const byDay = new Map<string, Session[]>()
    for (const s of data) if (!s.isDeleted && s.status !== 'canceled') byDay.set(s.dateKey, [...(byDay.get(s.dateKey) ?? []), s])
    const m = new Map<string, DayCell>()
    for (const [d, list] of byDay) {
      list.sort((a, b) => a.startMin - b.startMin)
      m.set(d, { minutes: unionMinutes(list), lines: list.map((s) => ({ label: `${formatTimeRange(s.startMin, s.endMin)} ${s.studentName}`, tone: 'scheduled' as const })) })
    }
    return m
  }, [data])
  return <HoursCalendar cells={cells} tone="scheduled" onRange={onRange} footnote="Scheduled hours from assigned sessions. Canceled sessions are excluded; overlapping students count once." />
}
