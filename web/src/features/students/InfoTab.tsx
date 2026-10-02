import { useState } from 'react'
import { LuLock, LuMail, LuPencil, LuPhone, LuPlus, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { STUDENT_STATUSES, STUDENT_STATUS_LABELS, formatPhone } from '@shared/people'
import { formatDateKey, todayKey } from '@shared/time'
import type { ParentContact, Student, StudentPrivateProfile, StudentStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { StudentStatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { EMPTY_PRIVATE, resumeAutoStatus, saveStudentInfo } from './api'
import { Avatar } from './profile/IdentityColumn'
import { ageOn } from './profile/model'

type PublicForm = Pick<Student, 'firstName' | 'lastName' | 'grade' | 'school' | 'status' | 'learningNote' | 'signUpDate'>

const pickPublic = (s: Student): PublicForm => ({
  firstName: s.firstName ?? '',
  lastName: s.lastName ?? '',
  grade: s.grade ?? '',
  school: s.school ?? '',
  status: s.status,
  learningNote: s.learningNote ?? '',
  signUpDate: s.signUpDate ?? null,
})

const gradeLabel = (g: string) => (/^\d+$/.test(g) ? `Grade ${g}` : g)

/**
 * Student page → Info. Reads like a profile; Edit turns it into the form (admins).
 * The Student section is what tutors see; contact details and family are for admins only.
 */
export function InfoTab({ student, readOnly, priv, privLoading }: { student: WithId<Student>; readOnly: boolean; priv: StudentPrivateProfile | null; privLoading: boolean }) {
  const { branchId, actor, settings, timezone } = useBranch()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<PublicForm>(pickPublic(student))
  const [pform, setPform] = useState<StudentPrivateProfile>({ ...EMPTY_PRIVATE, ...(priv ?? {}) })
  const [busy, setBusy] = useState(false)
  const savedPrivate = { ...EMPTY_PRIVATE, ...(priv ?? {}) }

  const startEdit = () => {
    setForm(pickPublic(student))
    setPform({ ...EMPTY_PRIVATE, ...(priv ?? {}) })
    setEditing(true)
  }
  const dirty = editing && (JSON.stringify(form) !== JSON.stringify(pickPublic(student)) || (!readOnly && JSON.stringify(pform) !== JSON.stringify(savedPrivate)))
  const set = <K extends keyof PublicForm>(k: K, v: PublicForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setP = <K extends keyof StudentPrivateProfile>(k: K, v: StudentPrivateProfile[K]) => setPform((f) => ({ ...f, [k]: v }))
  const setParent = (i: number, patch: Partial<ParentContact>) => setP('parents', pform.parents.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  async function save() {
    if (!form.firstName.trim()) return toast.error('Enter the first name.')
    setBusy(true)
    try {
      const patch: Partial<Student> = { ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim() }
      await saveStudentInfo(branchId, actor, student, patch, readOnly ? null : { ...pform, parents: pform.parents.filter((p) => p.name || p.email || p.phone) })
      toast.success('Saved')
      setEditing(false)
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const statusNote =
    !readOnly && student.statusSource === 'manual' && settings.students.autoStatus.respectManual ? (
      <p className="text-xs text-muted-foreground">
        Set by hand, so automatic status changes are paused.{' '}
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-2"
          onClick={() =>
            void resumeAutoStatus(branchId, actor, student).then(
              () => toast.success('The status updates automatically again'),
              (e) => toast.error((e as Error).message),
            )
          }
        >
          Update it automatically again
        </button>
      </p>
    ) : null

  if (!editing) {
    const today = todayKey(timezone)
    const age = priv?.dob ? ageOn(priv.dob, today) : null
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{readOnly ? 'What admins have on file for this student.' : 'Tutors see the Student section. Contact details and family are for admins only.'}</p>
          {!readOnly ? (
            <Button variant="outline" className="shrink-0" onClick={startEdit} disabled={privLoading} data-testid="info-edit">
              <LuPencil /> Edit
            </Button>
          ) : null}
        </div>

        <section className="rounded-xl border bg-card p-5" data-testid="info-student">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-base font-semibold">Student</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Tutors can see</span>
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            <Item label="First name">{student.firstName || '—'}</Item>
            <Item label="Last name">{student.lastName || '—'}</Item>
            <Item label="Grade">{student.grade ? gradeLabel(student.grade) : '—'}</Item>
            <Item label="Status">
              <StudentStatusBadge status={student.status} />
              {statusNote ? <div className="mt-1.5">{statusNote}</div> : null}
            </Item>
            <Item label="School">{student.school || '—'}</Item>
            <Item label="Sign-up date">{student.signUpDate ? formatDateKey(student.signUpDate, 'medium') : '—'}</Item>
            <Item label="First session">{student.firstSessionDate ? formatDateKey(student.firstSessionDate, 'medium') : '—'}</Item>
            <Item label="Last session">{student.lastSessionDate ? formatDateKey(student.lastSessionDate, 'medium') : '—'}</Item>
            {!readOnly ? (
              <>
                <Item label="Email" admin>
                  {priv?.email ? (
                    <a className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline" href={`mailto:${priv.email}`}>
                      <LuMail className="size-3.5 text-muted-foreground" />
                      {priv.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </Item>
                <Item label="Phone" admin>
                  {priv?.phone ? (
                    <a className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline" href={`tel:${priv.phone.replace(/[^\d+]/g, '')}`}>
                      <LuPhone className="size-3.5 text-muted-foreground" />
                      {formatPhone(priv.phone)}
                    </a>
                  ) : (
                    '—'
                  )}
                </Item>
              </>
            ) : null}
          </dl>
          <div className="mt-5 rounded-lg border-l-2 border-indigo-300 bg-indigo-50/40 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/20">
            <div className="text-xs font-medium text-muted-foreground">Learning notes</div>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{student.learningNote || 'No learning notes yet.'}</p>
          </div>
        </section>

        {!readOnly ? (
          <section className="rounded-xl border bg-card p-5" data-testid="info-family">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-base font-semibold">Contact and family</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                <LuLock className="size-3" />
                Admins only
              </span>
            </div>
            {privLoading ? (
              <Spinner />
            ) : (
              <>
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Item label="Date of birth">
                    {priv?.dob ? (
                      <>
                        {formatDateKey(priv.dob, 'medium')}
                        {age !== null ? <span className="text-muted-foreground"> · age {age}</span> : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </Item>
                  <Item label="Home address" className="sm:col-span-1 xl:col-span-3">
                    {priv?.address || '—'}
                  </Item>
                </dl>
                <div className="mt-5 text-xs font-medium text-muted-foreground">Parents and guardians</div>
                {priv?.parents.length ? (
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {priv.parents.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                        <Avatar name={p.name || '?'} className="size-10" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {p.name || 'No name'}
                            {p.relation ? <span className="font-normal text-muted-foreground"> · {p.relation}</span> : null}
                          </div>
                          {p.email ? <div className="truncate text-xs text-muted-foreground">{p.email}</div> : null}
                          {p.phone ? <div className="text-xs text-muted-foreground">{formatPhone(p.phone)}</div> : null}
                        </div>
                        <div className="flex gap-1">
                          {p.email ? (
                            <a className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" href={`mailto:${p.email}`} aria-label={`Email ${p.name}`}>
                              <LuMail className="size-4" />
                            </a>
                          ) : null}
                          {p.phone ? (
                            <a className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${p.name}`}>
                              <LuPhone className="size-4" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No parents or guardians yet.</p>
                )}
                <dl className="mt-5 grid gap-x-6 gap-y-4 md:grid-cols-3">
                  <Item label="School login information">
                    <span className="whitespace-pre-wrap">{priv?.schoolLogin || '—'}</span>
                  </Item>
                  <Item label="Internal notes">
                    <span className="whitespace-pre-wrap">{priv?.adminNote || '—'}</span>
                  </Item>
                  <Item label="Sign-up answers">
                    {Object.keys(priv?.customFields ?? {}).length
                      ? Object.entries(priv?.customFields ?? {})
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([k, v]) => (
                            <div key={k} className="mb-1">
                              <span className="text-muted-foreground">{k.replace(/:$/, '')}</span> {v}
                            </div>
                          ))
                      : '—'}
                  </Item>
                </dl>
              </>
            )}
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">Student</h2>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="si-first">First name</FieldLabel>
              <Input id="si-first" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="si-last">Last name</FieldLabel>
              <Input id="si-last" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Grade</FieldLabel>
              <Select value={form.grade || undefined} onValueChange={(v) => set('grade', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...settings.students.gradeOptions, form.grade].filter(Boolean))].map((g) => (
                    <SelectItem key={g} value={g}>
                      {gradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select value={form.status} onValueChange={(v) => set('status', v as StudentStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STUDENT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {statusNote}
            </Field>
            <Field>
              <FieldLabel htmlFor="si-school">School</FieldLabel>
              <Input id="si-school" value={form.school} onChange={(e) => set('school', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="si-signup">Sign-up date</FieldLabel>
              <DatePicker id="si-signup" value={form.signUpDate ?? null} onChange={(d) => set('signUpDate', d)} onClear={() => set('signUpDate', null)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="sp-email">Email</FieldLabel>
              <Input id="sp-email" type="email" value={pform.email} onChange={(e) => setP('email', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="sp-phone">Phone</FieldLabel>
              <Input id="sp-phone" type="tel" value={pform.phone} onChange={(e) => setP('phone', e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="si-learning">Learning notes</FieldLabel>
            <Textarea id="si-learning" rows={3} value={form.learningNote} onChange={(e) => set('learningNote', e.target.value)} placeholder="Goals, strengths, what works with this student…" />
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">The student’s email and phone are for admins only; tutors see the rest of this section.</p>
        </FieldGroup>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">Contact and family</h2>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sp-dob">Date of birth</FieldLabel>
              <DatePicker id="sp-dob" value={pform.dob ?? null} onChange={(d) => setP('dob', d)} onClear={() => setP('dob', null)} placeholder="Birth date" />
            </Field>
            <Field>
              <FieldLabel htmlFor="sp-address">Home address</FieldLabel>
              <Input id="sp-address" value={pform.address} onChange={(e) => setP('address', e.target.value)} />
            </Field>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Parents and guardians</span>
              <Button size="xs" variant="outline" onClick={() => setP('parents', [...pform.parents, { name: '', email: '', phone: '', relation: '' }])}>
                <LuPlus /> Add
              </Button>
            </div>
            {pform.parents.length === 0 ? <p className="text-sm text-muted-foreground">No parents yet.</p> : null}
            {pform.parents.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_8rem_auto]">
                <Input aria-label="Name" placeholder="Name" value={p.name} onChange={(e) => setParent(i, { name: e.target.value })} />
                <Input aria-label="Email" placeholder="Email" type="email" value={p.email} onChange={(e) => setParent(i, { email: e.target.value })} />
                <Input aria-label="Phone" placeholder="Phone" type="tel" value={p.phone} onChange={(e) => setParent(i, { phone: e.target.value })} />
                <Input aria-label="Relation" placeholder="Relation" value={p.relation} onChange={(e) => setParent(i, { relation: e.target.value })} />
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setP('parents', pform.parents.filter((_, idx) => idx !== i))}>
                  <LuTrash2 />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="sp-login">School login information</FieldLabel>
              <Textarea id="sp-login" rows={2} value={pform.schoolLogin} onChange={(e) => setP('schoolLogin', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="sp-note">Internal notes</FieldLabel>
              <Textarea id="sp-note" rows={2} value={pform.adminNote} onChange={(e) => setP('adminNote', e.target.value)} />
            </Field>
          </div>
        </FieldGroup>
      </section>

      <div className="sticky bottom-4 z-20 flex items-center justify-end gap-2 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <span className="mr-auto text-sm text-muted-foreground">{dirty ? 'Unsaved changes' : 'No changes yet'}</span>
        <Button variant="outline" disabled={busy} onClick={() => setEditing(false)}>
          {dirty ? 'Discard' : 'Cancel'}
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save changes
        </Button>
      </div>
    </div>
  )
}

function Item({ label, admin, className, children }: { label: string; admin?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        {admin ? <LuLock className="size-3 opacity-60" aria-label="Admins only" /> : null}
      </dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  )
}
