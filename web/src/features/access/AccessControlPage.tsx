import { deleteField, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useMemo } from 'react'
import { LuLock } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { RESTRICTABLE_PAGES, type RestrictablePage } from '@shared/roles'
import type { Member, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { initials } from '@/components/app/BrandMark'
import { PageHeader } from '@/components/app/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'

export function AccessControlPage() {
  const { branchId, actor, isOwner } = useBranch()
  const admins = useQuery<Member>(
    useMemo(() => query(branchCol(branchId, COL.members), where('role', 'in', ['owner', 'admin'])), [branchId]),
    `admins-${branchId}`,
  )
  const isOwnerRow = (m: WithId<Member>) => m.role === 'owner'
  const rows = [...admins.data].sort((a, b) => Number(isOwnerRow(b)) - Number(isOwnerRow(a)) || a.email.localeCompare(b.email))
  const ownerCount = rows.filter(isOwnerRow).length

  async function update(member: WithId<Member>, patch: Partial<Member>, summary: string) {
    const batch = writeBatch(db)
    batch.update(branchDocRef(branchId, COL.members, member.id), {
      ...patch,
      // Fields from before one role per person.
      roles: deleteField(),
      isOwner: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: actor.email,
    })
    addAudit(batch, branchId, actor, {
      action: 'member.access',
      category: 'access',
      entityType: 'member',
      entityId: member.id,
      summary,
    })
    try {
      await batch.commit()
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    }
  }

  function toggleRestriction(member: WithId<Member>, page: RestrictablePage, blocked: boolean) {
    const current = new Set(member.restrictions ?? [])
    if (blocked) current.add(page)
    else current.delete(page)
    const label = RESTRICTABLE_PAGES.find((p) => p.key === page)?.label ?? page
    void update(
      member,
      { restrictions: [...current] },
      `${blocked ? 'Blocked' : 'Unblocked'} ${label} for ${member.displayName || member.email}`,
    )
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Access Control"
        description="Owners decide which admins can use sensitive pages. Blocked pages are hidden and also refused by the server."
      />
      {!isOwner ? (
        <Alert className="mb-4">
          <LuLock />
          <AlertTitle>View only</AlertTitle>
          <AlertDescription>Only branch owners and platform admins can change access control.</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-3">
        {rows.map((m) => (
          <Card key={m.id} className="gap-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar className="size-9">
                {m.photoURL ? <AvatarImage src={m.photoURL} alt="" referrerPolicy="no-referrer" /> : null}
                <AvatarFallback>{initials(m.displayName || m.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.displayName || m.email}</div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={isOwnerRow(m)}
                  disabled={!isOwner || m.id === actor.email || (isOwnerRow(m) && ownerCount <= 1)}
                  onCheckedChange={(v) =>
                    void update(
                      m,
                      { role: v ? 'owner' : 'admin', ...(v ? { restrictions: [] } : {}) },
                      `${v ? 'Made' : 'Removed'} ${m.displayName || m.email} ${v ? 'an owner' : 'as owner'}`,
                    )
                  }
                />
                Owner
              </label>
            </div>
            {isOwnerRow(m) ? (
              <p className="text-sm text-muted-foreground">Owners always have access to every page.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {RESTRICTABLE_PAGES.map((p) => {
                  const blocked = (m.restrictions ?? []).includes(p.key)
                  return (
                    <button
                      key={p.key}
                      type="button"
                      disabled={!isOwner}
                      onClick={() => toggleRestriction(m, p.key, !blocked)}
                      title={p.description}
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed',
                        blocked
                          ? 'border-destructive/30 bg-destructive/10 text-destructive'
                          : 'hover:bg-muted disabled:hover:bg-transparent',
                      )}
                    >
                      {blocked ? 'Blocked: ' : ''}
                      {p.label}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        ))}
        {!admins.loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admins yet.</p>
        ) : null}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-2">
          Tip
        </Badge>
        Platform admins (Super Admins) are never restricted.
      </p>
    </div>
  )
}
