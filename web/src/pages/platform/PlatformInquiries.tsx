import { collection, doc, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuCheck, LuInbox, LuMail, LuPhone, LuRotateCcw, LuTriangleAlert } from 'react-icons/lu'
import { toast } from 'sonner'
import type { Inquiry } from '@shared/inquiry'
import { ROOT } from '@shared/paths'
import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { db } from '@/lib/firebase'
import { useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'

const when = (d: Date) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Platform → Inquiries: "Talk to us" requests from the landing page, newest first. */
export function PlatformInquiries() {
  const { email } = useAuth()
  const q = useMemo(() => query(collection(db, ROOT.inquiries), orderBy('createdAt', 'desc')), [])
  const { data, loading, error } = useQuery<Inquiry>(q, 'platform-inquiries')
  const [show, setShow] = useState<'new' | 'all'>('new')
  const fresh = data.filter((i) => i.status !== 'handled')
  const list = show === 'new' ? fresh : data

  async function mark(id: string, status: Inquiry['status']) {
    try {
      await updateDoc(doc(db, ROOT.inquiries, id), status === 'handled' ? { status, handledAt: serverTimestamp(), handledBy: email } : { status, handledAt: null, handledBy: null })
    } catch (e) {
      toast.error(`Couldn’t update it: ${(e as Error).message}`)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Inquiries" description="Centers that asked about Hyber CRM on hybercrm.com. Each one is also emailed to the company inbox." />
      <div className="mb-4 inline-flex rounded-lg bg-muted p-1 text-sm" role="group" aria-label="Show">
        {(['new', 'all'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setShow(k)}
            className={cn('rounded-md px-3 py-1', show === k ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
          >
            {k === 'new' ? `New (${fresh.length})` : `All (${data.length})`}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">Could not load inquiries: {error.message}</p> : null}
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuInbox />
            </EmptyMedia>
            <EmptyTitle>{show === 'new' ? 'Nothing new' : 'No inquiries yet'}</EmptyTitle>
            <EmptyDescription>Requests sent from the “Talk to us” form on hybercrm.com show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {list.map((i) => (
            <Card key={i.id} className={cn(i.status === 'handled' && 'opacity-70')} data-testid="inquiry">
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{i.name}</span>
                      {i.center ? <span className="text-muted-foreground">· {i.center}</span> : null}
                      {i.status === 'handled' ? <Badge variant="outline">Handled</Badge> : <Badge>New</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{i.createdAt ? when(i.createdAt.toDate()) : 'Just now'}</div>
                  </div>
                  {i.status === 'handled' ? (
                    <Button variant="ghost" size="sm" onClick={() => void mark(i.id, 'new')}>
                      <LuRotateCcw /> Mark as new
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void mark(i.id, 'handled')}>
                      <LuCheck /> Mark handled
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <a href={`mailto:${i.email}`} className="flex items-center gap-1.5 font-medium underline-offset-2 hover:underline">
                    <LuMail className="size-3.5 text-muted-foreground" /> {i.email}
                  </a>
                  {i.phone ? (
                    <a href={`tel:${i.phone}`} className="flex items-center gap-1.5 underline-offset-2 hover:underline">
                      <LuPhone className="size-3.5 text-muted-foreground" /> {i.phone}
                    </a>
                  ) : null}
                  {i.students ? (
                    <span className="text-muted-foreground">
                      Students: <span className="text-foreground">{i.students}</span>
                    </span>
                  ) : null}
                  {i.locations ? (
                    <span className="text-muted-foreground">
                      Locations: <span className="text-foreground">{i.locations}</span>
                    </span>
                  ) : null}
                </div>
                {i.message ? <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap">{i.message}</p> : null}
                {i.notify && i.notify.status !== 'sent' ? (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <LuTriangleAlert className="size-3.5" />
                    {i.notify.status === 'not_configured' ? 'Not emailed: the company Gmail app password isn’t set yet.' : `Not emailed: ${i.notify.error ?? 'sending failed'}.`}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
