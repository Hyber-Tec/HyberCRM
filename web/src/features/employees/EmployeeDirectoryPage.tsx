import { useMemo, useState } from 'react'
import { LuCalendarClock, LuSearch, LuUserPlus, LuUserRound } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { STAFF_STATUSES, STAFF_STATUS_LABELS, formatPhone } from '@shared/people'
import { ROLE_LABELS, isAdminRole } from '@shared/roles'
import type { Staff, StaffRole, StaffStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { initials } from '@/components/app/BrandMark'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { PageHeader } from '@/components/app/PageHeader'
import { StaffStatusBadge } from '@/components/app/StatusBadge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStaffList } from '@/features/data/hooks'
import { useConfirm } from '@/components/app/useConfirm'
import { countUpcomingSessions, createEmployee, setEmployeeStatus, stopTeachingQuestion } from './api'

type RoleFilter = StaffRole | 'all'
type StatusFilter = StaffStatus | 'all'

export function EmployeeDirectoryPage() {
  const { branchId, actor, timezone } = useBranch()
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const pathOf = (id: string) => `/${branchId}/admin/employees/directory/${id}`

  /** Asks first when a tutor with upcoming sessions stops teaching (they'd become conflicts). */
  async function changeStatus(s: WithId<Staff>, next: StaffStatus) {
    if (next === s.status) return
    try {
      if (next !== 'active' && s.role === 'tutor') {
        const q = stopTeachingQuestion(s.name, await countUpcomingSessions(branchId, s.id, timezone), `set ${s.firstName || s.name} to ${STAFF_STATUS_LABELS[next]}`)
        if (q && !(await confirm(q))) return
      }
      await setEmployeeStatus(branchId, actor, s, next)
    } catch (err) {
      toast.error('Could not change the status', { description: (err as Error).message })
    }
  }
  const { data: staff, loading } = useStaffList()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff
      .filter((s) => role === 'all' || s.role === role)
      .filter((s) => status === 'all' || s.status === status)
      .filter((s) => !q || s.nameLower.includes(q) || s.email.toLowerCase().includes(q))
  }, [staff, search, role, status])

  return (
    <div>
      <PageHeader
        title="Employees"
        description={`${rows.length} of ${staff.length} employees`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <LuUserPlus /> Add employee
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="tutor">Tutors</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="owner">Owners</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
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
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="w-40">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <ContextMenuFor
                key={s.id}
                entries={menu(
                  { kind: 'label', label: s.name },
                  { label: 'Open employee profile', icon: LuUserRound, onSelect: () => navigate(pathOf(s.id)) },
                  { label: 'Open in new tab', onSelect: () => window.open(pathOf(s.id), '_blank', 'noopener') },
                  s.role === 'tutor' && { label: 'Availability calendar', icon: LuCalendarClock, onSelect: () => navigate(`/${branchId}/admin/employees/calendar?staff=${s.id}`) },
                  {
                    kind: 'sub',
                    label: 'Change status',
                    separatorBefore: true,
                    entries: [{ kind: 'radio', value: s.status, options: STAFF_STATUSES.map((st) => ({ value: st, label: STAFF_STATUS_LABELS[st] })), onChange: (v) => void changeStatus(s, v as StaffStatus) }],
                  },
                )}
              >
                <TableRow className="cursor-pointer" onClick={() => navigate(pathOf(s.id))}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback style={{ backgroundColor: `${s.color}22`, color: s.color }}>{initials(s.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{s.email || 'No email'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.role ? <Badge variant={isAdminRole(s.role) ? 'default' : 'secondary'}>{ROLE_LABELS[s.role]}</Badge> : null}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatPhone(s.phone) || '—'}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={s.status}
                      onValueChange={(v) => void changeStatus(s, v as StaffStatus)}
                    >
                      <SelectTrigger size="sm" className="h-auto border-0 bg-transparent p-0 shadow-none [&>svg]:hidden">
                        <StaffStatusBadge status={s.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_STATUSES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {STAFF_STATUS_LABELS[st]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              </ContextMenuFor>
            ))}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <NewEmployeeDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={async (input) => {
          const id = await createEmployee(branchId, actor, input)
          toast.success('Employee added')
          navigate(`/${branchId}/admin/employees/directory/${id}`)
        }}
      />
      {confirmDialog}
    </div>
  )
}

function NewEmployeeDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreate: (input: { firstName: string; lastName: string; email: string; role: StaffRole }) => Promise<void>
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('tutor')
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!firstName.trim()) return toast.error('Enter a first name.')
            setBusy(true)
            try {
              await onCreate({ firstName, lastName, email, role })
              onOpenChange(false)
              setFirstName('')
              setLastName('')
              setEmail('')
              setRole('tutor')
            } catch (err) {
              toast.error('Could not add the employee', { description: (err as Error).message })
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              Creates the employee record (schedule, availability, pay). To let them sign in, give them access on the Account page.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ne-first">First name</FieldLabel>
                <Input id="ne-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
              </Field>
              <Field>
                <FieldLabel htmlFor="ne-last">Last name</FieldLabel>
                <Input id="ne-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ne-email">Email</FieldLabel>
              <Input id="ne-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <FieldDescription>Contact email; also used to match their Google sign-in.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <RadioGroup value={role} onValueChange={(v) => setRole(v as StaffRole)} className="flex gap-6">
                {(['tutor', 'admin'] as StaffRole[]).map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={r} />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </RadioGroup>
              <FieldDescription>Only tutors teach and appear on the schedule.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null} Add employee
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
