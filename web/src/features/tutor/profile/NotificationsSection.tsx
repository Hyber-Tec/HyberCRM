import { useState } from 'react'
import { LuBell, LuSmartphone } from 'react-icons/lu'
import { toast } from 'sonner'
import type { NotificationPrefs } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { NOTIFICATION_SWITCHES, prefOn, setMyNotificationPref } from '../api'
import { NOT_LINKED, useMyStaff } from '../hooks'
import { SectionTitle } from './parts'

/**
 * Profile → Notifications: the four switches in `staff.notificationPrefs`. They
 * decide what reaches the bell here and the phone app's notifications.
 */
export function NotificationsSection() {
  const { branchId, actor, settings } = useBranch()
  const { data: staff, loading } = useMyStaff()
  // Shown at once while the write is on its way.
  const [pending, setPending] = useState<Partial<NotificationPrefs>>({})
  const hours = settings.notifications.sessionChangeWindowHours

  if (loading) return <Skeleton className="h-72 w-full rounded-xl" />
  if (!staff) return <p className="text-sm text-muted-foreground">{NOT_LINKED}</p>

  const value = (key: keyof NotificationPrefs) => pending[key] ?? prefOn(staff.notificationPrefs, key)
  const change = async (key: keyof NotificationPrefs, on: boolean) => {
    setPending((p) => ({ ...p, [key]: on }))
    try {
      await setMyNotificationPref(branchId, actor, staff, key, on)
    } catch (e) {
      toast.error('Couldn’t change the notification', { description: (e as Error).message })
    } finally {
      setPending((p) => {
        const next = { ...p }
        delete next[key]
        return next
      })
    }
  }

  return (
    <div>
      <SectionTitle title="Notifications" description="Choose what you’re told about. Turning one off stops it everywhere you’re signed in." />
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="Notification switches">
        <ul className="divide-y">
          {NOTIFICATION_SWITCHES.map((s) => (
            <li key={s.key}>
              <label className="flex cursor-pointer items-start gap-4 px-5 py-4 hover:bg-muted/30">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{s.description}</span>
                </span>
                <Switch className="mt-0.5" checked={value(s.key)} onCheckedChange={(on) => void change(s.key, on)} aria-label={s.label} data-testid={`pref-${s.key}`} />
              </label>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-2 px-1 text-xs text-muted-foreground">Session alerts are about sessions that start within the next {hours} hours.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
          <LuBell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">On the website</span> they arrive in the bell, which counts the ones you haven’t read.
          </p>
        </div>
        <div className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
          <LuSmartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">On your phone</span> they come from the phone app: sign in there and allow notifications.
          </p>
        </div>
      </div>
    </div>
  )
}
