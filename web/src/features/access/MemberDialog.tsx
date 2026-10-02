import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { isReservedEmail } from '@shared/brand'
import { emailKey } from '@shared/paths'
import { ROLES, ROLE_LABELS, type Role, isAdminRole, isStaffRole } from '@shared/roles'
import type { Member, SignupRequest, Staff, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { MultiOptionPicker, OptionPicker } from '@/components/app/OptionPicker'
import { useConfirm } from '@/components/app/useConfirm'
import { countUpcomingSessions, stopTeachingQuestion } from '@/features/employees/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { saveMember } from './api'

const ROLE_HELP: Record<Role, string> = {
  owner: 'Runs the branch: everything an admin can, plus admins and Access Control',
  admin: 'Full access to the admin portal',
  tutor: 'Teaches: appears on the schedule; tutor portal',
  parent: 'Sees their children’s sessions and shared reports',
  student: 'Sees their own schedule and info',
}

export interface MemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: WithId<Member> | null
  request?: WithId<SignupRequest> | null
  members: WithId<Member>[]
  staff: WithId<Staff>[]
  students: WithId<Student>[]
}

export function MemberDialog({ open, onOpenChange, member, request, members, staff, students }: MemberDialogProps) {
  const { branchId, actor, isOwner, timezone } = useBranch()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [active, setActive] = useState(true)
  const [staffId, setStaffId] = useState<string>('new')
  const [studentId, setStudentId] = useState<string>('new')
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])

  useEffect(() => {
    if (!open) return
    setError(null)
    if (member) {
      const [f = '', ...rest] = (member.displayName || '').split(' ')
      const linkedStaff = member.staffId ? staffById.get(member.staffId) : null
      setEmail(member.email)
      setFirstName(linkedStaff?.firstName ?? f)
      setLastName(linkedStaff?.lastName ?? rest.join(' '))
      setRole(member.role ?? null)
      setActive(member.status === 'active')
      setStaffId(member.staffId ?? 'new')
      setStudentId(member.studentId ?? 'new')
      setStudentIds(member.studentIds ?? [])
    } else {
      setEmail(request?.email ?? '')
      setFirstName(request?.firstName ?? '')
      setLastName(request?.lastName ?? '')
      setRole(request ? request.requestedRole : null)
      setActive(true)
      // Suggest an existing record with the same email or name.
      const match = request
        ? staff.find((s) => s.email === request.email || s.nameLower === `${request.firstName} ${request.lastName}`.toLowerCase())
        : null
      setStaffId(match?.id ?? 'new')
      const sMatch = request
        ? students.find((s) => s.nameLower === `${request.firstName} ${request.lastName}`.toLowerCase())
        : null
      setStudentId(sMatch?.id ?? 'new')
      setStudentIds([])
    }
  }, [open, member, request, staff, students, staffById])

  const linkedStaffIds = useMemo(
    () => new Set(members.filter((m) => m.id !== member?.id && m.staffId).map((m) => m.staffId as string)),
    [members, member],
  )
  const linkedStudentIds = useMemo(
    () => new Set(members.filter((m) => m.id !== member?.id && m.studentId).map((m) => m.studentId as string)),
    [members, member],
  )

  const staffOptions = [
    { value: 'new', label: '+ Create a new employee record' },
    ...staff.map((s) => ({
      value: s.id,
      label: s.name,
      hint: linkedStaffIds.has(s.id) ? 'has a login' : ROLE_LABELS[s.role],
      disabled: linkedStaffIds.has(s.id),
    })),
  ]
  const studentOptions = students.map((s) => ({ value: s.id, label: s.name, hint: s.grade ? `Grade ${s.grade}` : undefined }))
  const staffRole = isStaffRole(role)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const key = emailKey(email)
    if (!member && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return setError('Enter a valid email address.')
    if (!member && members.some((m) => m.id === key)) return setError('This email already has access. Edit it instead.')
    if (!firstName.trim()) return setError('Enter a first name.')
    if (!role) return setError('Choose a role.')
    if (role === 'parent' && studentIds.length === 0) return setError('Choose the parent’s child or children.')
    setError(null)
    setBusy(true)
    try {
      // Pausing a tutor's access, or making them something else, leaves their upcoming sessions as conflicts: ask first.
      const tutorStaffId = member?.role === 'tutor' && member.status === 'active' ? member.staffId : null
      if (tutorStaffId && (!active || role !== 'tutor')) {
        const name = member?.displayName || `${firstName} ${lastName}`.trim() || key
        const q = stopTeachingQuestion(name, await countUpcomingSessions(branchId, tutorStaffId, timezone), !active ? 'pause their access' : 'change their role')
        if (q && !(await confirm(q))) return
      }
      await saveMember({
        branchId,
        actor,
        existing: member,
        staffById,
        approveRequest: request ?? null,
        input: {
          email: key,
          firstName,
          lastName,
          role,
          status: active ? 'active' : 'disabled',
          links: {
            staffId: staffRole ? staffId : null,
            studentId: role === 'student' ? studentId : null,
            studentIds,
          },
        },
      })
      const emailed = active && !isReservedEmail(key)
      if (member) {
        toast.success('Access updated', member.role !== 'owner' && role === 'owner' && emailed ? { description: `We’re emailing ${key} that they’re now an owner.` } : undefined)
      } else {
        const who = `${firstName} ${lastName}`.trim() || key
        toast.success(request ? `Approved ${who}` : `Added ${who}`, {
          description: emailed ? `We’re emailing ${key} a link to sign in. Their status shows on the People list.` : 'No email goes to paused access or test addresses.',
        })
      }
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const editingAdmin = isAdminRole(member?.role)
  const lockedForNonOwner = !isOwner && editingAdmin

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{member ? 'Edit access' : request ? 'Approve sign-up request' : 'Add a person'}</DialogTitle>
              <DialogDescription>
                {member
                  ? member.email
                  : 'We’ll email them a link to sign in with Google using this address.'}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              {!member ? (
                <Field>
                  <FieldLabel htmlFor="m-email">Google email</FieldLabel>
                  <Input
                    id="m-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    disabled={!!request}
                    autoFocus
                  />
                </Field>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="m-first">First name</FieldLabel>
                  <Input id="m-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={lockedForNonOwner} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="m-last">Last name</FieldLabel>
                  <Input id="m-last" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={lockedForNonOwner} />
                </Field>
              </div>
              <FieldSet>
                <FieldLegend variant="label">Role</FieldLegend>
                <FieldDescription>Each person has one role. Someone with two jobs signs in with a separate Google account for each.</FieldDescription>
                <RadioGroup value={role ?? ''} onValueChange={(v) => setRole(v as Role)} className="grid gap-2 sm:grid-cols-2">
                  {ROLES.map((r) => {
                    const disabled = (isAdminRole(r) && !isOwner) || lockedForNonOwner
                    return (
                      <Field key={r} orientation="horizontal" data-disabled={disabled} className="rounded-lg border p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40">
                        <RadioGroupItem id={`role-${r}`} value={r} disabled={disabled} />
                        <div className="grid gap-0.5">
                          <FieldLabel htmlFor={`role-${r}`} className="font-medium">
                            {ROLE_LABELS[r]}
                          </FieldLabel>
                          <span className="text-xs text-muted-foreground">
                            {isAdminRole(r) && !isOwner ? `Only owners can make someone ${r === 'owner' ? 'an owner' : 'an admin'}` : ROLE_HELP[r]}
                          </span>
                        </div>
                      </Field>
                    )
                  })}
                </RadioGroup>
              </FieldSet>
              {staffRole ? (
                <Field>
                  <FieldLabel>Employee record</FieldLabel>
                  <OptionPicker value={staffId} onChange={setStaffId} options={staffOptions} searchPlaceholder="Search employees…" />
                  <FieldDescription>
                    {role === 'tutor' ? 'Schedule, availability, clock and pay belong to the employee record.' : 'Clock-ins and pay belong to the employee record.'}
                  </FieldDescription>
                </Field>
              ) : null}
              {role === 'student' ? (
                <Field>
                  <FieldLabel>Student record</FieldLabel>
                  <OptionPicker
                    value={studentId}
                    onChange={setStudentId}
                    options={[
                      { value: 'new', label: '+ Create a new student record' },
                      ...studentOptions.map((o) => ({ ...o, disabled: linkedStudentIds.has(o.value) })),
                    ]}
                    searchPlaceholder="Search students…"
                  />
                </Field>
              ) : null}
              {role === 'parent' ? (
                <Field>
                  <FieldLabel>Children</FieldLabel>
                  <MultiOptionPicker
                    value={studentIds}
                    onChange={setStudentIds}
                    options={studentOptions}
                    placeholder="Add a student…"
                    searchPlaceholder="Search students…"
                  />
                  {request?.studentNames ? (
                    <FieldDescription>From the request: “{request.studentNames}”</FieldDescription>
                  ) : null}
                </Field>
              ) : null}
              {member ? (
                <Field orientation="horizontal">
                  <Switch id="m-active" checked={active} onCheckedChange={setActive} disabled={lockedForNonOwner} />
                  <FieldLabel htmlFor="m-active" className="font-normal">
                    Access active
                  </FieldLabel>
                </Field>
              ) : null}
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || lockedForNonOwner}>
                {busy ? <Spinner /> : null}
                {member ? 'Save' : request ? 'Approve' : 'Add person'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  )
}
