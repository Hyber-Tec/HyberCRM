import { deleteDoc, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuBell, LuCheckCheck, LuChevronRight, LuX } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { type AppNotification, notificationMeta } from '@shared/comms'
import { COL } from '@shared/paths'
import { type DateKey, addDays, dateKeyOf, diffDays, formatDateKey, formatInstantTime, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'

/** My newest inbox items in this branch (session changes, announcements). */
export function useInbox(enabled = true) {
  const { branchId, actor } = useBranch()
  const q = useMemo(
    () =>
      enabled
        ? query(branchCol(branchId, COL.notifications), where('recipientKey', '==', actor.email), orderBy('createdAt', 'desc'), limit(100))
        : null,
    [branchId, actor.email, enabled],
  )
  return useQuery<AppNotification>(q, `inbox-${branchId}-${actor.email}`)
}

function dayHeader(d: DateKey, today: DateKey): string {
  if (d === today) return 'Today'
  if (d === addDays(today, -1)) return 'Yesterday'
  const ago = diffDays(d, today)
  if (ago > 0 && ago < 7) return formatDateKey(d, 'weekdayMedium').split(',')[0]
  return formatDateKey(d, ago > 365 ? 'medium' : 'monthDay')
}

/** Header bell with the unread count; opens the inbox in a side sheet. */
export function NotificationBell() {
  const { branchId, timezone } = useBranch()
  const navigate = useNavigate()
  const { data, loading } = useInbox()
  const [open, setOpen] = useState(false)
  const unread = data.filter((n) => !n.readAt)

  const groups = useMemo(() => {
    const today = todayKey(timezone)
    const byDay = new Map<DateKey, WithId<AppNotification>[]>()
    for (const n of data) {
      const d = n.createdAt ? dateKeyOf(n.createdAt.toDate(), timezone) : today
      byDay.set(d, [...(byDay.get(d) ?? []), n])
    }
    return [...byDay.entries()].map(([d, items]) => ({ label: dayHeader(d, today), items }))
  }, [data, timezone])

  const markRead = (n: WithId<AppNotification>) =>
    n.readAt ? Promise.resolve() : updateDoc(branchDocRef(branchId, COL.notifications, n.id), { readAt: serverTimestamp() }).catch(() => undefined)

  async function markAll() {
    const batch = writeBatch(db)
    for (const n of unread.slice(0, 450)) batch.update(branchDocRef(branchId, COL.notifications, n.id), { readAt: serverTimestamp() })
    await batch.commit().catch(() => undefined)
  }

  function openItem(n: WithId<AppNotification>) {
    void markRead(n)
    if (n.link) {
      setOpen(false)
      navigate(`/${branchId}/${n.link}`)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread.length ? `Notifications (${unread.length} unread)` : 'Notifications'}>
          <LuBell />
          {unread.length ? (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Notifications</SheetTitle>
            {unread.length ? (
              <Button variant="ghost" size="sm" className="-my-1 text-muted-foreground" onClick={() => void markAll()}>
                <LuCheckCheck /> Mark all read
              </Button>
            ) : null}
          </div>
          <SheetDescription className="sr-only">Session changes and announcements for you.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {groups.map((g) => (
            <section key={g.label}>
              <h3 className="sticky top-0 z-[1] bg-background/95 px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground backdrop-blur">{g.label}</h3>
              {g.items.map((n) => {
                const meta = notificationMeta(n.type)
                return (
                  <div key={n.id} className={cn('group relative border-b last:border-b-0', !n.readAt && 'bg-muted/40')}>
                    <button type="button" className="flex w-full items-start gap-3 px-4 py-3 pr-11 text-left hover:bg-muted/60" onClick={() => openItem(n)}>
                      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium" style={{ color: meta.color }}>
                            {meta.label}
                          </span>
                          {n.createdAt ? <span>{formatInstantTime(n.createdAt.toDate(), timezone)}</span> : null}
                        </span>
                        <span className={cn('mt-0.5 block text-sm', !n.readAt && 'font-semibold')}>{n.title}</span>
                        {n.body ? <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span> : null}
                      </span>
                      {n.link ? <LuChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" /> : null}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete notification"
                      className="absolute top-2 right-2 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      onClick={() => void deleteDoc(branchDocRef(branchId, COL.notifications, n.id)).catch(() => undefined)}
                    >
                      <LuX />
                    </Button>
                  </div>
                )
              })}
            </section>
          ))}
          {!loading && data.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <LuBell className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No notifications yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Session and announcement alerts will appear here once they arrive.</p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
