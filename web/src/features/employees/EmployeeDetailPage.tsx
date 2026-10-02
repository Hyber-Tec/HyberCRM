import { query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuArrowLeft, LuExternalLink } from 'react-icons/lu'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { STAFF_COLORS } from '@shared/colors'
import { COL } from '@shared/paths'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import { ROLE_LABELS, isAdminRole } from '@shared/roles'
import { payModelOn } from '@shared/settings/businessRules'
import { sortSubjects } from '@shared/subjects'
import { formatInstant, todayKey } from '@shared/time'
import type { Compensation, Member, Staff, StaffNotes, StaffRole, StaffStatus } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { initials } from '@/components/app/BrandMark'
import { MultiOptionPicker } from '@/components/app/OptionPicker'
import { StaffStatusBadge } from '@/components/app/StatusBadge'
import { DatePicker } from '@/components/app/DatePicker'
import { useConfirm } from '@/components/app/useConfirm'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useSubjectCategories, useSubjects } from '@/features/data/hooks'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { KioskPinCard } from '@/features/timeclock/KioskPinCard'
import { compensationRef, countUpcomingSessions, saveCompensation, saveEmployeeProfile, saveStaffNotes, staffNotesRef, stopTeachingQuestion } from './api'

export function EmployeeDetailPage() {
  const { staffId = '' } = useParams()
  const { branchId, can } = useBranch()
  const staffRef = useMemo(() => branchDocRef(branchId, COL.staff, staffId), [branchId, staffId])
  const { data: staff, loading } = useDoc<Staff>(staffRef)
  const membersQ = useMemo(() => query(branchCol(branchId, COL.members), where('staffId', '==', staffId)), [branchId, staffId])
  const { data: linked } = useQuery<Member>(membersQ, `member-of-${staffId}`)

  if (loading) return <Skeleton className="h-96 w-full max-w-4xl rounded-xl" />
  if (!staff) {
    return (
      <div className="text-sm text-muted-foreground">
        Employee not found. <Link to={`/${branchId}/admin/employees/directory`} className="underline">Back to the directory</Link>
      </div>
    )
  }

  const member = linked[0] ?? null
  return (
    <div className="max-w-4xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to={`/${branchId}/admin/employees/directory`}>
          <LuArrowLeft /> Employees
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="size-12">
          <AvatarFallback className="text-base" style={{ backgroundColor: `${staff.color}22`, color: staff.color }}>
            {initials(staff.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{staff.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StaffStatusBadge status={staff.status} />
            {staff.role ? <Badge variant={isAdminRole(staff.role) ? 'default' : 'secondary'}>{ROLE_LABELS[staff.role]}</Badge> : null}
          </div>
        </div>
      </div>
      <ProfileCard staff={staff} member={member} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SubjectsCard staff={staff} />
        <AccessCard member={member} />
      </div>
      {can('payRates') ? <PayCard staff={staff} /> : null}
      <KioskPinCard staff={staff} />
      <NotesCard staffId={staff.id} />
    </div>
  )
}

function ProfileCard({ staff, member }: { staff: Staff & { id: string }; member: (Member & { id: string }) | null }) {
  const { branchId, actor, timezone } = useBranch()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [form, setForm] = useState(staff)
  const [busy, setBusy] = useState(false)
  useEffect(() => setForm(staff), [staff])
  const set = <K extends keyof Staff>(k: K, v: Staff[K]) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = JSON.stringify(pick(form)) !== JSON.stringify(pick(staff))

  async function save() {
    if (!form.firstName.trim()) return toast.error('Enter a first name.')
    setBusy(true)
    try {
      // A tutor who stops teaching leaves their upcoming sessions as conflicts: ask first.
      const stopsTeaching = staff.role === 'tutor' && staff.status === 'active' && (form.status !== 'active' || form.role !== 'tutor')
      if (stopsTeaching) {
        const what = form.status !== 'active' ? `set ${staff.firstName || staff.name} to ${STAFF_STATUS_LABELS[form.status]}` : 'change the role'
        const q = stopTeachingQuestion(staff.name, await countUpcomingSessions(branchId, staff.id, timezone), what)
        if (q && !(await confirm(q))) return
      }
      await saveEmployeeProfile(branchId, actor, staff, pick(form))
      toast.success('Profile saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ep-first">First name</FieldLabel>
              <Input id="ep-first" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ep-last">Last name</FieldLabel>
              <Input id="ep-last" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ep-email">Email</FieldLabel>
              <Input id="ep-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ep-phone">Phone</FieldLabel>
              <Input id="ep-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 000-0000" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ep-dob">Date of birth</FieldLabel>
              <DatePicker id="ep-dob" value={form.dob ?? null} onChange={(d) => set('dob', d)} onClear={() => set('dob', null)} placeholder="Birth date" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ep-address">Home address</FieldLabel>
              <Input id="ep-address" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Street, City, State" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ep-start">Start date</FieldLabel>
              <DatePicker id="ep-start" value={form.startDate ?? null} onChange={(d) => set('startDate', d)} onClear={() => set('startDate', null)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ep-end">End date</FieldLabel>
              <DatePicker id="ep-end" value={form.endDate ?? null} min={form.startDate ?? null} onChange={(d) => set('endDate', d)} onClear={() => set('endDate', null)} />
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select value={form.status} onValueChange={(v) => set('status', v as StaffStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAFF_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Finished employees leave the schedule and pickers.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              {member ? (
                <FieldDescription>
                  Managed with their sign-in on the{' '}
                  <Link to={`/${branchId}/admin/account`} className="underline">
                    Account page
                  </Link>
                  .
                </FieldDescription>
              ) : (
                <RadioGroup value={form.role} onValueChange={(v) => set('role', v as StaffRole)} className="flex gap-6 pt-1.5">
                  {(['tutor', 'admin'] as StaffRole[]).map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={r} />
                      {ROLE_LABELS[r]}
                    </label>
                  ))}
                </RadioGroup>
              )}
            </Field>
          </div>
          <Field>
            <FieldLabel>Schedule color</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {STAFF_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  onClick={() => set('color', c)}
                  className={cn('size-7 rounded-full border-2', form.color === c ? 'border-foreground' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setForm(staff)}>
          Discard
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save changes
        </Button>
      </CardFooter>
      {confirmDialog}
    </Card>
  )
}

function pick(s: Staff): Partial<Staff> {
  return {
    firstName: s.firstName.trim(),
    lastName: s.lastName.trim(),
    email: s.email.trim().toLowerCase(),
    phone: s.phone.trim(),
    dob: s.dob ?? null,
    address: (s.address ?? '').trim(),
    startDate: s.startDate ?? null,
    endDate: s.endDate ?? null,
    status: s.status,
    role: s.role,
    color: s.color,
  }
}

function SubjectsCard({ staff }: { staff: Staff & { id: string } }) {
  const { branchId, actor } = useBranch()
  const { data: subjects } = useSubjects()
  const { data: categories } = useSubjectCategories()
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string[]>(staff.subjectIds)
  useEffect(() => setValue(staff.subjectIds), [staff.subjectIds])
  const byId = new Map(subjects.map((s) => [s.id, s]))

  async function save() {
    const batch = writeBatch(db)
    batch.update(branchDocRef(branchId, COL.staff, staff.id), { subjectIds: value, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, {
      action: 'staff.subjects',
      category: 'people',
      entityType: 'staff',
      entityId: staff.id,
      summary: `Updated ${staff.name}’s subjects`,
      tutorId: staff.id,
      tutorName: staff.name,
    })
    await batch.commit()
    setEditing(false)
    toast.success('Subjects saved')
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Subjects</CardTitle>
          <CardDescription>{staff.subjectIds.length} qualified</CardDescription>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <MultiOptionPicker
              value={value}
              onChange={setValue}
              options={sortSubjects(subjects, categories).map((s) => ({ value: s.id, label: s.name, hint: categoryName.get(s.categoryId) }))}
              placeholder="Add a subject…"
              searchPlaceholder="Search subjects…"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => (setValue(staff.subjectIds), setEditing(false))}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>
        ) : staff.subjectIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {staff.subjectIds.map((id) => (
              <Badge key={id} variant="secondary">
                {byId.get(id)?.name ?? 'Removed subject'}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AccessCard({ member }: { member: (Member & { id: string }) | null }) {
  const { branchId, timezone } = useBranch()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in</CardTitle>
        <CardDescription>How this employee signs in to Hyber.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {member ? (
          <>
            <div>
              <span className="text-muted-foreground">Google account: </span>
              {member.email}
            </div>
            <div>
              <span className="text-muted-foreground">Last sign-in: </span>
              {member.lastLoginAt ? formatInstant(member.lastLoginAt.toDate(), timezone) : 'Not signed in yet'}
            </div>
            {member.status !== 'active' ? <Badge variant="destructive">Access paused</Badge> : null}
          </>
        ) : (
          <p className="text-muted-foreground">No sign-in yet. Give them access on the Account page.</p>
        )}
        <Button variant="link" className="h-auto px-0" asChild>
          <Link to={`/${branchId}/admin/account`}>
            Manage access <LuExternalLink />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function PayCard({ staff }: { staff: Staff & { id: string } }) {
  const { branchId, actor, timezone, rules } = useBranch()
  const ref = useMemo(() => compensationRef(branchId, staff.id), [branchId, staff.id])
  const { data: comp } = useDoc<Compensation>(ref)
  const [teaching, setTeaching] = useState('')
  const [admin, setAdmin] = useState('')
  const [effective, setEffective] = useState(todayKey(timezone))
  const [busy, setBusy] = useState(false)
  // Owners and admins have one hourly rate (kept as the admin rate); tutors follow the branch pay model.
  const single = isAdminRole(staff.role)
  const today = todayKey(timezone)
  const modelNow = payModelOn(rules, today)
  const usesAdminRate = rules.payModels.some((p) => p.model === 'teaching_admin')

  useEffect(() => {
    setTeaching(comp?.rates?.teaching != null ? String(comp.rates.teaching) : '')
    setAdmin(comp?.rates?.admin != null ? String(comp.rates.admin) : '')
  }, [comp])

  async function save() {
    const t = single ? (comp?.rates?.teaching ?? 0) : Number(teaching)
    const a = !single && !usesAdminRate ? (comp?.rates?.admin ?? 0) : Number(admin)
    if (!Number.isFinite(t) || !Number.isFinite(a) || t < 0 || a < 0 || (single ? admin === '' : teaching === '')) return toast.error('Enter valid pay rates.')
    setBusy(true)
    try {
      await saveCompensation(branchId, actor, staff, comp, { rates: { teaching: t, admin: a } }, effective)
      toast.success('Pay saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const fields = single
    ? [{ id: 'admin', label: 'Hourly rate', value: admin, set: setAdmin }]
    : [
        { id: 'teaching', label: 'Teaching rate', value: teaching, set: setTeaching },
        ...(usesAdminRate ? [{ id: 'admin', label: 'Admin rate', value: admin, set: setAdmin }] : []),
      ]
  const description = single
    ? 'Paid this hourly rate for all clocked time.'
    : modelNow === 'teaching_only'
      ? 'Paid for teaching time only: time inside sessions with a submitted log. Other clocked time is unpaid.'
      : 'Time inside logged sessions is paid at the teaching rate; the rest of the shift at the admin rate.'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-3">
            {fields.map((r) => (
              <Field key={r.id}>
                <FieldLabel htmlFor={`pay-${r.id}`}>{r.label}</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText>$</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput id={`pay-${r.id}`} inputMode="decimal" value={r.value} onChange={(e) => r.set(e.target.value.replace(/[^\d.]/g, ''))} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>/hr</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            ))}
            <Field>
              <FieldLabel htmlFor="pay-from">Effective from</FieldLabel>
              <DatePicker id="pay-from" value={effective || null} onChange={setEffective} />
            </Field>
          </div>
          {comp?.history?.length ? (
            <div className="rounded-lg border text-sm">
              <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Rate history</div>
              {[...comp.history].reverse().map((h, i) => (
                <div key={i} className="flex justify-between px-3 py-1.5">
                  <span>From {h.effectiveFrom}</span>
                  <span className="tabular-nums">
                    {single ? `$${h.rates.admin}/hr` : usesAdminRate ? `$${h.rates.teaching} teaching · $${h.rates.admin} admin` : `$${h.rates.teaching} teaching`}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? <Spinner /> : null} Save pay
        </Button>
      </CardFooter>
    </Card>
  )
}

function NotesCard({ staffId }: { staffId: string }) {
  const { branchId, actor } = useBranch()
  const ref = useMemo(() => staffNotesRef(branchId, staffId), [branchId, staffId])
  const { data } = useDoc<StaffNotes>(ref)
  const [text, setText] = useState('')
  useEffect(() => setText(data?.adminNote ?? ''), [data])
  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal notes</CardTitle>
        <CardDescription>Only admins can see these notes.</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Add internal notes about this employee…" />
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          variant="outline"
          disabled={text === (data?.adminNote ?? '')}
          onClick={async () => {
            await saveStaffNotes(branchId, actor, staffId, text)
            toast.success('Notes saved')
          }}
        >
          Save notes
        </Button>
      </CardFooter>
    </Card>
  )
}
