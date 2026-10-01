import { useEffect, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuGripVertical } from 'react-icons/lu'
import { toast } from 'sonner'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type ScheduleCtx, saveTutorOrder } from '../api'

export function TutorOrderDialog({ open, onOpenChange, ctx, tutors }: { open: boolean; onOpenChange: (o: boolean) => void; ctx: ScheduleCtx; tutors: { id: string; name: string }[] }) {
  const { branch } = useBranch()
  const [list, setList] = useState(tutors)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  useEffect(() => {
    if (open) setList(tutors)
  }, [open, tutors])

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length) return
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setList(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tutor display order</DialogTitle>
          <DialogDescription>Drag to reorder how tutors appear on the schedule.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55svh] divide-y overflow-y-auto rounded-lg border">
          {list.map((t, i) => (
            <div
              key={t.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, i)
                setDragIndex(null)
              }}
              className="flex items-center gap-2 bg-background px-3 py-2 text-sm"
            >
              <LuGripVertical className="cursor-grab text-muted-foreground" />
              <span className="flex-1 truncate">{t.name}</span>
              <Button variant="ghost" size="icon-xs" aria-label="Move up" onClick={() => move(i, i - 1)}>
                <LuArrowUp />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Move down" onClick={() => move(i, i + 1)}>
                <LuArrowDown />
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await saveTutorOrder(ctx, list.map((t) => t.id), (branch.settings ?? {}) as Record<string, unknown>)
              toast.success('Order saved')
              onOpenChange(false)
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
