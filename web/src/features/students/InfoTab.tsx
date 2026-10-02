import { useEffect, useMemo, useState } from 'react'
import { LuPlus, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { STUDENT_STATUSES, STUDENT_STATUS_LABELS } from '@shared/people'
import { formatDateKey } from '@shared/time'
import type { ParentContact, Student, StudentPrivateProfile, StudentStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useDoc } from '@/lib/firestore'
import { EMPTY_PRIVATE, resumeAutoStatus, saveStudentInfo, studentPrivateRef } from './api'

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

export function InfoTab({ student, readOnly }: { student: WithId<Student>; readOnly: boolean }) {
  const { branchId, actor, settings } = useBranch()
  const privateRef = useMemo(() => (readOnly ? null : studentPrivateRef(branchId, student.id)), [readOnly, branchId, student.id])
  const { data: priv, loading: privLoading } = useDoc<StudentPrivateProfile>(privateRef)
  const [form, setForm] = useState<PublicForm>(pickPublic(student))
  const [pform, setPform] = useState<StudentPrivateProfile>(EMPTY_PRIVATE)
  const [busy, setBusy] = useState(false)

  useEffect(() => setForm(pickPublic(student)), [student])
  useEffect(() => setPform({ ...EMPTY_PRIVATE, ...(priv ?? {}) }), [priv])

  const dirty =
    JSON.stringify(form) !== JSON.stringify(pickPublic(student)) ||
    (!readOnly && JSON.stringify(pform) !== JSON.stringify({ ...EMPTY_PRIVATE, ...(priv ?? {}) }))

  const set = <K extends keyof PublicForm>(k: K, v: PublicForm[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setP = <K extends keyof StudentPrivateProfile>(k: K, v: StudentPrivateProfile[K]) => setPform((f) => ({ ...f, [k]: v }))
  const setParent = (i: number, patch: Partial<ParentContact>) =>
    setP('parents', pform.parents.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  async function save() {
    if (!form.firstName.trim()) return toast.error('Enter the first name.')
    setBusy(true)
    try {
      const patch: Partial<Student> = { ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim() }
      await saveStudentInfo(branchId, actor, student, patch, readOnly ? null : { ...pform, parents: pform.parents.filter((p) => p.name || p.email || p.phone) })
      toast.success('Saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Student</CardTitle>
          <CardDescription>Tutors can see this section.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="si-first">First name</FieldLabel>
                <Input id="si-first" value={form.firstName} disabled={readOnly} onChange={(e) => set('firstName', e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="si-last">Last name</FieldLabel>
                <Input id="si-last" value={form.lastName} disabled={readOnly} onChange={(e) => set('lastName', e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Grade</FieldLabel>
                <Select value={form.grade || undefined} onValueChange={(v) => set('grade', v)} disabled={readOnly}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...settings.students.gradeOptions, form.grade].filter(Boolean))].map((g) => (
                      <SelectItem key={g} value={g}>
                        {/^\d+$/.test(g) ? `Grade ${g}` : g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select value={form.status} onValueChange={(v) => set('status', v as StudentStatus)} disabled={readOnly}>
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
                {!readOnly && student.statusSource === 'manual' && settings.students.autoStatus.respectManual ? (
                  <FieldDescription>
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
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="si-school">School</FieldLabel>
                <Input id="si-school" value={form.school} disabled={readOnly} onChange={(e) => set('school', e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="si-signup">Sign-up date</FieldLabel>
                <DatePicker id="si-signup" value={form.signUpDate ?? null} disabled={readOnly} onChange={(d) => set('signUpDate', d)} onClear={() => set('signUpDate', null)} />
              </Field>
            </div>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground">First session</div>
                <div>{student.firstSessionDate ? formatDateKey(student.firstSessionDate, 'medium') : '—'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Last session</div>
                <div>{student.lastSessionDate ? formatDateKey(student.lastSessionDate, 'medium') : '—'}</div>
              </div>
            </div>
            <Field>
              <FieldLabel htmlFor="si-learning">Learning notes</FieldLabel>
              <Textarea
                id="si-learning"
                rows={3}
                value={form.learningNote}
                disabled={readOnly}
                onChange={(e) => set('learningNote', e.target.value)}
                placeholder="Goals, strengths, what works with this student…"
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {!readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle>Contact & family</CardTitle>
            <CardDescription>Only admins can see this section.</CardDescription>
          </CardHeader>
          <CardContent>
            {privLoading ? (
              <Spinner />
            ) : (
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="sp-email">Student email</FieldLabel>
                    <Input id="sp-email" type="email" value={pform.email} onChange={(e) => setP('email', e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sp-phone">Student phone</FieldLabel>
                    <Input id="sp-phone" type="tel" value={pform.phone} onChange={(e) => setP('phone', e.target.value)} />
                  </Field>
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
                    <span className="text-sm font-medium">Parents / guardians</span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setP('parents', [...pform.parents, { name: '', email: '', phone: '', relation: '' }])}
                    >
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
                <Field>
                  <FieldLabel htmlFor="sp-login">School login information</FieldLabel>
                  <Textarea id="sp-login" rows={2} value={pform.schoolLogin} onChange={(e) => setP('schoolLogin', e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sp-note">Internal notes</FieldLabel>
                  <Textarea id="sp-note" rows={3} value={pform.adminNote} onChange={(e) => setP('adminNote', e.target.value)} />
                </Field>
                {Object.keys(pform.customFields ?? {}).length > 0 ? (
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="mb-2 font-medium">Sign-up answers</div>
                    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {Object.entries(pform.customFields)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-muted-foreground">{k.replace(/:$/, '')}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                ) : null}
              </FieldGroup>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!readOnly ? (
        <Card className="sticky bottom-4 flex-row items-center justify-end gap-2 px-4 py-3 shadow-md">
          <CardFooter className="w-full justify-end gap-2 p-0">
            {dirty ? <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span> : null}
            <Button
              variant="outline"
              disabled={!dirty || busy}
              onClick={() => {
                setForm(pickPublic(student))
                setPform({ ...EMPTY_PRIVATE, ...(priv ?? {}) })
              }}
            >
              Discard
            </Button>
            <Button disabled={!dirty || busy} onClick={() => void save()}>
              {busy ? <Spinner /> : null} Save changes
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  )
}
