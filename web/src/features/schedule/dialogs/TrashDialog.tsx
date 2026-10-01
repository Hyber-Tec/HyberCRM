import { query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { formatDateKey, formatInstant, formatTimeRange } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { branchCol, useQuery } from '@/lib/firestore'
import { type ScheduleCtx, purgeSessions, restoreSession } from '../api'

export function TrashDialog({ open, onOpenChange, ctx, tutorFilter }: { open: boolean; onOpenChange: (o: boolean) => void; ctx: ScheduleCtx; tutorFilter: string | null }) {
  const q = useMemo(() => (open ? query(branchCol(ctx.branchId, COL.sessions), where('isDeleted', '==', true)) : null), [open, ctx.branchId])
  const { data, loading } = useQuery<Session>(q, `trash-${ctx.branchId}`)
  const [busy, setBusy] = useState(false)
  const rows = data
    .filter((s) => !tutorFilter || s.tutorId === tutorFilter)
    .sort((a, b) => (b.deletedAt?.toMillis?.() ?? 0) - (a.deletedAt?.toMillis?.() ?? 0))

  async function act(fn: () => Promise<void>, ok: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message.includes('permission') ? 'Past sessions can’t be restored.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Deleted sessions <Badge variant="secondary">{rows.length}</Badge>
          </DialogTitle>
          <DialogDescription>Items older than {ctx.settings.trash.retentionDays} days are removed automatically.</DialogDescription>
        </DialogHeader>
        {rows.length > 0 ? (
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => window.confirm(`Permanently delete all ${rows.length} sessions in Trash? This can’t be undone.`) && void act(() => purgeSessions(ctx, rows), 'Trash emptied')}
            >
              Empty Trash
            </Button>
          </div>
        ) : null}
        <div className="-mx-2 max-h-[60svh] divide-y overflow-y-auto">
          {rows.map((s: WithId<Session>) => (
            <div key={s.id} className="flex flex-col gap-2 px-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate">
                  <span className="font-semibold">{s.studentName}</span> — {s.subject || 'No subject'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.tutorName} · {formatDateKey(s.dateKey, 'weekdayMedium')} · {formatTimeRange(s.startMin, s.endMin)}
                </div>
                {s.deletedAt ? (
                  <div className="text-xs text-muted-foreground">
                    Deleted {formatInstant(s.deletedAt.toDate(), ctx.timezone)}
                    {s.deletedBy ? ` by ${s.deletedBy}` : ''}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => window.confirm('Permanently delete this session? This can’t be undone.') && void act(() => purgeSessions(ctx, [s]), 'Deleted permanently')}
                >
                  Delete
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void act(() => restoreSession(ctx, s), 'Session restored')}>
                  Restore
                </Button>
              </div>
            </div>
          ))}
          {!loading && rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No deleted sessions.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
