import { collection, doc, getDocs, limit, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuArrowLeft, LuArrowRight, LuCopy, LuDatabase, LuTrash2, LuUserPlus } from 'react-icons/lu'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { newMemberData, publicProfileFor } from '@shared/branchFactory'
import { buildDemoData } from '@shared/demo/seed'
import { COL, DOC, ROOT, emailKey } from '@shared/paths'
import { todayKey } from '@shared/time'
import type { Branch, BranchStatus, Member } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { FullPageSpinner } from '@/components/app/FullPage'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { auditData } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { useDoc, useQuery } from '@/lib/firestore'
import { writeSeedDocs } from '@/lib/seedWriter'
import { STATUS_BADGE } from './PlatformHome'

export function PlatformBranch() {
  const { branchId = '' } = useParams()
  const { user, email } = useAuth()
  const branchRef = useMemo(() => doc(db, ROOT.branches, branchId), [branchId])
  const { data: branch, loading } = useDoc<Branch>(branchRef)
  const ownersQ = useMemo(
    () => query(collection(db, ROOT.branches, branchId, COL.members), where('isOwner', '==', true)),
    [branchId],
  )
  const { data: owners } = useQuery<Member>(ownersQ, `owners-${branchId}`)
  const [newOwner, setNewOwner] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  if (loading) return <FullPageSpinner />
  if (!branch || !user || !email) return <p className="text-sm text-muted-foreground">Branch not found.</p>

  const actor = { uid: user.uid, email, name: user.displayName ?? email, role: 'super_admin' as const }
  const signupUrl = `${window.location.origin}/${branchId}/signup`

  async function setStatus(status: BranchStatus) {
    if (!branch) return
    const batch = writeBatch(db)
    batch.update(branchRef, { status, updatedAt: serverTimestamp(), updatedBy: email })
    batch.set(doc(db, ROOT.branches, branchId, COL.public, DOC.publicProfile), publicProfileFor({ ...branch, status }))
    batch.set(
      doc(collection(db, ROOT.branches, branchId, COL.auditLog)),
      auditData(actor, {
        action: 'branch.status',
        category: 'settings',
        entityType: 'branch',
        entityId: branchId,
        summary: `Changed the branch status to ${status}`,
        changes: [{ field: 'status', label: 'Status', from: branch.status, to: status }],
      }),
    )
    await batch.commit()
    toast.success(`Status set to ${STATUS_BADGE[status].label}`)
  }

  async function addOwner() {
    const key = emailKey(newOwner)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
      toast.error('Enter a valid email address.')
      return
    }
    const batch = writeBatch(db)
    const ref = doc(db, ROOT.branches, branchId, COL.members, key)
    const existing = owners.find((o) => o.id === key)
    if (existing) return
    batch.set(
      ref,
      {
        ...newMemberData({ email: key, roles: ['admin'], isOwner: true, createdBy: email! }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    batch.set(
      doc(collection(db, ROOT.branches, branchId, COL.auditLog)),
      auditData(actor, {
        action: 'member.owner_add',
        category: 'access',
        entityType: 'member',
        entityId: key,
        summary: `Made ${key} an owner admin`,
      }),
    )
    await batch.commit()
    setNewOwner('')
    toast.success(`${key} is now an owner`)
  }

  async function removeOwner(member: Member & { id: string }) {
    const batch = writeBatch(db)
    batch.update(doc(db, ROOT.branches, branchId, COL.members, member.id), {
      isOwner: false,
      updatedAt: serverTimestamp(),
      updatedBy: email,
    })
    batch.set(
      doc(collection(db, ROOT.branches, branchId, COL.auditLog)),
      auditData(actor, {
        action: 'member.owner_remove',
        category: 'access',
        entityType: 'member',
        entityId: member.id,
        summary: `Removed owner rights from ${member.email}`,
      }),
    )
    await batch.commit()
  }

  async function addSampleData() {
    if (!branch) return
    const existing = await getDocs(query(collection(db, ROOT.branches, branchId, COL.staff), limit(1)))
    if (!existing.empty && !window.confirm('This branch already has employees. Add (or refresh) the sample data anyway?')) return
    setBusy('Adding sample data…')
    try {
      const docs = buildDemoData({ branchId, timezone: branch.timezone, today: todayKey(branch.timezone), createdBy: email! })
      await writeSeedDocs(docs, (done, total) => setBusy(`Adding sample data… ${done}/${total}`))
      toast.success('Sample data added')
    } catch (e) {
      toast.error('Could not add sample data', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link to="/platform">
          <LuArrowLeft /> Branches
        </Link>
      </Button>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} className="size-10" />
            {branch.name}
          </span>
        }
        description={<span className="font-mono">/{branchId}</span>}
        actions={
          <Button asChild>
            <Link to={`/${branchId}/admin/home`}>
              Open admin portal <LuArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Suspended and archived branches are closed to everyone except platform admins.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Select value={branch.status} onValueChange={(v) => void setStatus(v as BranchStatus)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_BADGE) as BranchStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_BADGE[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant={STATUS_BADGE[branch.status].variant}>{STATUS_BADGE[branch.status].label}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owners</CardTitle>
            <CardDescription>
              Owner admins manage other admins and Access Control. Everyone else is managed from the branch’s Account page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {owners.length === 0 ? <p className="text-sm text-muted-foreground">No owners yet.</p> : null}
            {owners.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{o.displayName || o.email}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {o.email} · {o.uid ? 'signed in' : 'not signed in yet'}
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Remove owner rights" onClick={() => void removeOwner(o)}>
                  <LuTrash2 />
                </Button>
              </div>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void addOwner()
              }}
            >
              <Input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="owner@center.com" />
              <Button type="submit" variant="outline">
                <LuUserPlus /> Add owner
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign-up page</CardTitle>
            <CardDescription>Tutors, parents and students request access here with Google.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Input readOnly value={signupUrl} className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy link"
              onClick={() => {
                void navigator.clipboard.writeText(signupUrl)
                toast.success('Link copied')
              }}
            >
              <LuCopy />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sample data</CardTitle>
            <CardDescription>Fictional tutors, students and subjects for demos and testing. Safe to run again.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void addSampleData()} disabled={!!busy}>
              {busy ? <Spinner /> : <LuDatabase />}
              {busy ?? 'Add sample data'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
