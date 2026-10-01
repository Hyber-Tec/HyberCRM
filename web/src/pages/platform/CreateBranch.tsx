import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useState } from 'react'
import { LuArrowLeft } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { newBranchData, newMemberData, publicProfileFor } from '@shared/branchFactory'
import { COL, DOC, ROOT, emailKey } from '@shared/paths'
import { slugify, validateBranchId } from '@shared/slug'
import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { TimeZonePicker } from '@/components/app/TimeZonePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { auditData } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { seedDemoData } from '@/lib/seedDemo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function CreateBranch() {
  const { user, email } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York')
  const [owners, setOwners] = useState('')
  const [sample, setSample] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const effectiveId = idTouched ? id : slugify(name)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !email) return
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Enter the branch name.'
    const idError = validateBranchId(effectiveId)
    if (idError) next.id = idError
    const ownerEmails = owners
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const bad = ownerEmails.find((o) => !EMAIL_RE.test(o))
    if (bad) next.owners = `“${bad}” isn’t a valid email address.`
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setBusy('Creating branch…')
    try {
      const branchRef = doc(db, ROOT.branches, effectiveId)
      if ((await getDoc(branchRef)).exists()) {
        setErrors({ id: 'A branch with this ID already exists.' })
        setBusy(null)
        return
      }
      const data = newBranchData({ name, timezone, createdBy: email })
      const batch = writeBatch(db)
      batch.set(branchRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      batch.set(doc(db, ROOT.branches, effectiveId, COL.public, DOC.publicProfile), publicProfileFor(data))
      for (const owner of new Set(ownerEmails.map(emailKey))) {
        batch.set(doc(db, ROOT.branches, effectiveId, COL.members, owner), {
          ...newMemberData({ email: owner, role: 'owner', createdBy: email }),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()

      // The branch exists now, so the audit entry can be written under it.
      const auditBatch = writeBatch(db)
      auditBatch.set(
        doc(db, ROOT.branches, effectiveId, COL.auditLog, `branch-created`),
        auditData(
          { uid: user.uid, email, name: user.displayName ?? email, role: 'super_admin' },
          {
            action: 'branch.create',
            category: 'settings',
            entityType: 'branch',
            entityId: effectiveId,
            summary: `Created the branch ${name.trim()}`,
          },
        ),
      )
      await auditBatch.commit()

      if (sample) {
        setBusy('Adding sample data…')
        await seedDemoData({ branchId: effectiveId })
      }
      toast.success(`${name.trim()} created`)
      navigate(`/platform/branches/${effectiveId}`)
    } catch (err) {
      toast.error('Could not create the branch', { description: (err as Error).message })
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/platform">
          <LuArrowLeft /> Branches
        </Link>
      </Button>
      <PageHeader title="New branch" description="A tutoring center with its own people, schedule, settings and branding." />
      <Card>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="b-name">Branch name</FieldLabel>
                <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Demo Academy" autoFocus />
                {errors.name ? <FieldError>{errors.name}</FieldError> : null}
              </Field>
              <Field data-invalid={!!errors.id}>
                <FieldLabel htmlFor="b-id">Branch ID</FieldLabel>
                <Input
                  id="b-id"
                  value={effectiveId}
                  onChange={(e) => {
                    setIdTouched(true)
                    setId(e.target.value.toLowerCase())
                  }}
                  className="font-mono"
                  placeholder="demo-academy"
                />
                <FieldDescription>
                  Used in links, e.g. hybercrm.web.app/<span className="font-mono">{effectiveId || 'demo-academy'}</span>/signup. It
                  can’t be changed later.
                </FieldDescription>
                {errors.id ? <FieldError>{errors.id}</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="b-tz">Time zone</FieldLabel>
                <TimeZonePicker id="b-tz" value={timezone} onChange={setTimezone} />
                <FieldDescription>All dates, “today”, locks and cut-offs use this zone.</FieldDescription>
              </Field>
              <Field data-invalid={!!errors.owners}>
                <FieldLabel htmlFor="b-owners">Owner emails (optional)</FieldLabel>
                <Textarea
                  id="b-owners"
                  value={owners}
                  onChange={(e) => setOwners(e.target.value)}
                  placeholder="owner@center.com"
                  rows={2}
                />
                <FieldDescription>
                  Each becomes an owner admin of the branch and is linked on their first Google sign-in.
                </FieldDescription>
                {errors.owners ? <FieldError>{errors.owners}</FieldError> : null}
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="b-sample" checked={sample} onCheckedChange={(v) => setSample(v === true)} />
                <FieldLabel htmlFor="b-sample" className="font-normal">
                  Fill with sample data (fictional tutors, students and subjects)
                </FieldLabel>
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" asChild>
                  <Link to="/platform">Cancel</Link>
                </Button>
                <Button type="submit" disabled={!!busy}>
                  {busy ? <Spinner /> : null}
                  {busy ?? 'Create branch'}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
