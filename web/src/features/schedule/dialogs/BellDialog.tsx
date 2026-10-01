import type { Session, WithId } from '@shared/types'
import { formatDateKey, formatTimeRange } from '@shared/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { BellItem } from '../context'

const PILL: Record<BellItem['kind'], string> = {
  conference: 'border-[#f2cd9a] bg-[#fff7ed] text-[#92400e]',
  first_session: 'border-[#86efac] bg-[#f0fdf4] text-[#166534]',
}
const LABEL: Record<BellItem['kind'], string> = { conference: 'Conference', first_session: 'First session' }

export function BellDialog({ state, onClose }: { state: { session: WithId<Session>; items: BellItem[] } | null; onClose: () => void }) {
  if (!state) return null
  const s = state.session
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>
            {s.studentName} · {formatDateKey(s.dateKey, 'weekdayMedium')} · {formatTimeRange(s.startMin, s.endMin)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {state.items.map((it, i) => (
            <div key={i} className="rounded-lg border p-3">
              <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', PILL[it.kind])}>{LABEL[it.kind]}</span>
              <div className="mt-2 text-sm font-medium">{it.title}</div>
              <div className="text-xs text-muted-foreground">{it.subtitle}</div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
