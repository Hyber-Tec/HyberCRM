import { useMemo } from 'react'
import { LuEye } from 'react-icons/lu'
import type { Announcement } from '@shared/comms'
import { formatInstant } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMembers, useStaffList } from '@/features/data/hooks'
import { useReads } from './api'

function Initial({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">{(name || '?').trim().charAt(0)}</span>
  )
}

/** Who opened the post, newest first, plus who in the audience hasn't yet. */
export function ReadReceiptsDialog({ a, open, onOpenChange }: { a: WithId<Announcement>; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { timezone } = useBranch()
  const { data: reads, loading } = useReads(a.id, open)
  const { data: members } = useMembers(open)
  const { data: staff } = useStaffList()

  const notYet = useMemo(() => {
    const names = new Map(staff.map((s) => [s.id, s.name]))
    const readers = new Set(reads.map((r) => r.email))
    const audience =
      a.audienceType === 'all'
        ? members.filter((m) => m.status === 'active' && m.role === 'tutor')
        : members.filter((m) => a.audienceKeys.includes(m.email))
    return audience
      .filter((m) => !readers.has(m.email))
      .map((m) => ({ email: m.email, name: (m.staffId && names.get(m.staffId)) || m.displayName || m.email }))
      .sort((x, y) => x.name.localeCompare(y.name))
  }, [a, members, reads, staff])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LuEye className="size-4" /> Read receipts
            <Badge variant="secondary" className="ml-1">
              {reads.length} read
            </Badge>
          </DialogTitle>
          <DialogDescription className="truncate">{a.title}</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 max-h-[60vh] overflow-y-auto px-6">
          {reads.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
              <Initial name={r.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.name || r.email}</div>
                <div className="truncate text-xs text-muted-foreground">{r.email}</div>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">{r.readAt ? formatInstant(r.readAt.toDate(), timezone, { dateStyle: 'medium', timeStyle: 'short' }) : '…'}</div>
            </div>
          ))}
          {!loading && reads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <LuEye className="size-6 opacity-40" />
              No one has read this announcement yet.
            </div>
          ) : null}
          {notYet.length ? (
            <div className="mt-4 pb-1">
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Not read yet ({notYet.length})</div>
              {notYet.map((m) => (
                <div key={m.email} className="flex items-center gap-3 py-1.5 opacity-70">
                  <Initial name={m.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{m.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
