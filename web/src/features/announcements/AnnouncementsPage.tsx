import { doc } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuArchive,
  LuArchiveRestore,
  LuArrowLeft,
  LuClock,
  LuCornerDownRight,
  LuEye,
  LuMessageSquare,
  LuPaperclip,
  LuPencil,
  LuPin,
  LuPinOff,
  LuPlus,
  LuSearch,
  LuTag,
  LuTrash2,
  LuUser,
  LuUsers,
} from 'react-icons/lu'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { type Announcement, type AnnouncementRead, announcementCategories } from '@shared/comms'
import { COL, branchColPath } from '@shared/paths'
import { dateKeyOf, formatInstant, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { ReadReceiptsDialog } from './ReadReceiptsDialog'
import {
  addComment,
  announcementRef,
  deleteAnnouncement,
  deleteComment,
  formatBytes,
  markRead,
  setArchived,
  setPinned,
  useAllAnnouncements,
  useComments,
  useMyAnnouncements,
  useMyReadIds,
} from './api'
import { HtmlContent } from './html'

type Mode = 'admin' | 'tutor'

function useListPath(mode: Mode) {
  const { branchId } = useBranch()
  return `/${branchId}/${mode}/announcements`
}

function audienceLabel(a: Announcement) {
  if (a.audienceType === 'all') return 'All tutors'
  const n = a.audienceKeys?.length ?? 0
  return `${n} ${n === 1 ? 'person' : 'people'}`
}

function postedAt(a: Announcement, timezone: string) {
  return a.createdAt ? formatInstant(a.createdAt.toDate(), timezone, { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now'
}

// ---------------------------------------------------------------- admin actions

/** Pin, archive and delete with the True Education toasts. */
function useAdminActions(onDeleted?: () => void) {
  const { branchId, actor } = useBranch()
  const [deleting, setDeleting] = useState<WithId<Announcement> | null>(null)
  const pin = (a: WithId<Announcement>) =>
    setPinned(branchId, actor, a, !a.pinned).then(
      () => toast.success(a.pinned ? 'Unpinned.' : 'Pinned.'),
      () => toast.error('Pin update failed.'),
    )
  const archive = (a: WithId<Announcement>) =>
    setArchived(branchId, actor, a, !a.archived).then(
      () => toast.success(a.archived ? 'Restored.' : 'Archived.'),
      () => toast.error('Action failed.'),
    )
  const dialog = (
    <ConfirmDialog
      open={deleting !== null}
      onOpenChange={(o) => !o && setDeleting(null)}
      title="Delete this announcement?"
      description="This can’t be undone. Its comments, read receipts and attachments are deleted too."
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        if (!deleting) return
        try {
          await deleteAnnouncement(branchId, actor, deleting)
          toast.success('Deleted.')
          onDeleted?.()
        } catch (e) {
          toast.error(`Delete failed: ${(e as Error).message}`)
        }
      }}
    />
  )
  return { pin, archive, remove: setDeleting, dialog }
}

function IconAction({ icon: Icon, label, onClick, danger }: { icon: IconType; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn(danger && 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50')}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClick()
          }}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------- dashboard

export function AnnouncementsPage() {
  return <Dashboard mode="admin" />
}

export function TutorAnnouncementsPage() {
  return <Dashboard mode="tutor" />
}

function Dashboard({ mode }: { mode: Mode }) {
  const { settings, timezone } = useBranch()
  const navigate = useNavigate()
  const list = useListPath(mode)
  const admin = mode === 'admin'
  const adminFeed = useAllAnnouncements(admin)
  const tutorFeed = useMyAnnouncements(!admin)
  const reads = useMyReadIds(!admin)
  const feed = admin ? adminFeed : tutorFeed
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [receipts, setReceipts] = useState<WithId<Announcement> | null>(null)
  const actions = useAdminActions()

  const categories = useMemo(
    () => announcementCategories(settings.announcements.defaultCategories, feed.data.filter((a) => admin || !a.archived).map((a) => a.category)),
    [settings.announcements.defaultCategories, feed.data, admin],
  )

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const today = todayKey(timezone)
    const rows = feed.data
      .filter((a) => (filter === 'archive' ? a.archived : !a.archived))
      .filter((a) => filter !== 'pinned' || a.pinned)
      .filter((a) => !filter.startsWith('cat:') || (a.category ?? '').toLowerCase() === filter.slice(4).toLowerCase())
      .filter((a) => !q || [a.title, a.contentText, a.authorName].some((v) => (v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => (b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER))
    const pinned = filter === 'archive' ? [] : rows.filter((a) => a.pinned)
    const rest = rows.filter((a) => !pinned.includes(a))
    const isToday = (a: Announcement) => !a.createdAt || dateKeyOf(a.createdAt.toDate(), timezone) === today
    return [
      { label: 'Pinned', items: pinned },
      { label: 'Today', items: rest.filter(isToday) },
      { label: 'Earlier', items: rest.filter((a) => !isToday(a)) },
    ].filter((g) => g.items.length)
  }, [feed.data, filter, search, timezone])

  const pills = [
    { key: 'all', label: 'All' },
    { key: 'pinned', label: 'Pinned' },
    ...categories.map((c) => ({ key: `cat:${c}`, label: c })),
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Announcements"
        description={admin ? 'Manage and publish announcements for your team' : 'Stay up to date with the latest updates'}
        actions={
          <>
            <InputGroup className="w-full sm:w-60">
              <InputGroupAddon>
                <LuSearch />
              </InputGroupAddon>
              <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search announcements…" aria-label="Search announcements" />
            </InputGroup>
            {admin ? (
              <Button asChild>
                <Link to={`${list}/new`}>
                  <LuPlus /> New announcement
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {pills.map((p) => (
          <Pill key={p.key} active={filter === p.key} onClick={() => setFilter(p.key)}>
            {p.label}
          </Pill>
        ))}
        {admin ? (
          <>
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-7" />
            <Pill active={filter === 'archive'} onClick={() => setFilter('archive')}>
              <LuArchive className="size-3.5" /> Archive
            </Pill>
          </>
        ) : null}
      </div>

      {feed.loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">No announcements in this view.</div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</h2>
              <div className="space-y-3">
                {g.items.map((a) => (
                  <AnnouncementCard
                    key={a.id}
                    a={a}
                    to={`${list}/${a.id}`}
                    unread={!admin && !reads.loading && !reads.ids.has(a.id)}
                    admin={admin}
                    onEdit={() => navigate(`${list}/${a.id}/edit`)}
                    onPin={() => void actions.pin(a)}
                    onArchive={() => void actions.archive(a)}
                    onDelete={() => actions.remove(a)}
                    onReads={() => setReceipts(a)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {receipts ? <ReadReceiptsDialog a={receipts} open onOpenChange={(o) => !o && setReceipts(null)} /> : null}
      {actions.dialog}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant={active ? 'default' : 'outline'} size="sm" className="shrink-0 rounded-full" aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  )
}

function AnnouncementCard({
  a,
  to,
  unread,
  admin,
  onEdit,
  onPin,
  onArchive,
  onDelete,
  onReads,
}: {
  a: WithId<Announcement>
  to: string
  unread: boolean
  admin: boolean
  onEdit: () => void
  onPin: () => void
  onArchive: () => void
  onDelete: () => void
  onReads: () => void
}) {
  const { timezone } = useBranch()
  return (
    <Card
      className={cn('group relative gap-0 px-4 py-3.5 transition-shadow hover:shadow-md', unread && 'border-l-[3px] border-l-foreground')}
      data-testid="announcement-card"
    >
      <div className="flex items-start gap-2">
        {unread ? <span className="mt-2 size-2 shrink-0 rounded-full bg-foreground" aria-label="Unread" /> : null}
        {a.pinned ? <LuPin className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" /> : null}
        <h3 className="min-w-0 flex-1 leading-snug font-semibold">
          <Link to={to} className="after:absolute after:inset-0 focus-visible:outline-none">
            {a.title || '(Untitled)'}
          </Link>
        </h3>
        {admin ? (
          <div className="relative z-10 -my-1 flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            <IconAction icon={LuPencil} label="Edit" onClick={onEdit} />
            {!a.archived ? <IconAction icon={a.pinned ? LuPinOff : LuPin} label={a.pinned ? 'Unpin' : 'Pin'} onClick={onPin} /> : null}
            <IconAction icon={a.archived ? LuArchiveRestore : LuArchive} label={a.archived ? 'Restore' : 'Archive'} onClick={onArchive} />
            <IconAction icon={LuTrash2} label="Delete" onClick={onDelete} danger />
          </div>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Badge variant="secondary" className="font-normal">
          {a.category || 'General'}
        </Badge>
        <span>{a.authorName || 'Admin'}</span>
        <span aria-hidden>·</span>
        <span>{postedAt(a, timezone)}</span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <LuUsers className="size-3.5" /> {audienceLabel(a)}
        </span>
        {a.commentCount ? (
          <span className="inline-flex items-center gap-1">
            <LuMessageSquare className="size-3.5" /> {a.commentCount}
          </span>
        ) : null}
        {a.attachments?.length ? (
          <span className="inline-flex items-center gap-1">
            <LuPaperclip className="size-3.5" /> {a.attachments.length}
          </span>
        ) : null}
        {admin ? (
          <button
            type="button"
            className="relative z-10 font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
            onClick={(e) => {
              e.stopPropagation()
              onReads()
            }}
          >
            Read: {a.readCount ?? 0}
          </button>
        ) : null}
      </div>
      {a.contentText ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{a.contentText}</p> : null}
    </Card>
  )
}

// ---------------------------------------------------------------- post view

export function AnnouncementPostPage() {
  return <PostView mode="admin" />
}

export function TutorAnnouncementPostPage() {
  return <PostView mode="tutor" />
}

function PostView({ mode }: { mode: Mode }) {
  const { announcementId = '' } = useParams()
  const { branchId, actor, timezone, viewAs } = useBranch()
  const navigate = useNavigate()
  const list = useListPath(mode)
  const admin = mode === 'admin'
  const ref = useMemo(() => announcementRef(branchId, announcementId), [branchId, announcementId])
  const { data: a, loading } = useDoc<Announcement>(ref)
  const [receipts, setReceipts] = useState(false)
  const actions = useAdminActions(() => navigate(list))

  // Tutors leave a read receipt the first time they open a post (not a Super Admin previewing a tutor).
  const readRef = useMemo(
    () => (admin || viewAs ? null : doc(db, branchColPath(branchId, COL.announcements), announcementId, 'reads', actor.email)),
    [admin, viewAs, branchId, announcementId, actor.email],
  )
  const myRead = useDoc<AnnouncementRead>(readRef)
  const marked = useRef(false)
  useEffect(() => {
    if (admin || viewAs || !a || myRead.loading || myRead.data || marked.current) return
    marked.current = true
    void markRead(branchId, actor, announcementId).catch(() => undefined)
  }, [admin, viewAs, a, myRead.loading, myRead.data, branchId, actor, announcementId])

  useEffect(() => {
    if (a?.title) document.title = `${a.title} | Announcements`
  }, [a?.title])

  if (loading) return <Skeleton className="mx-auto h-96 w-full max-w-3xl rounded-xl" />
  if (!a) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <h1 className="text-lg font-semibold">Announcement not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or it isn’t addressed to you.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to={list}>
            <LuArrowLeft /> Announcements
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link to={list}>
          <LuArrowLeft /> Announcements
        </Link>
      </Button>
      <Card className="gap-0 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {a.pinned ? (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300">
                <LuPin /> Pinned
              </Badge>
            ) : null}
            {a.archived ? <Badge variant="outline">Archived</Badge> : null}
            <Badge variant="secondary" className="font-normal">
              <LuTag /> {a.category || 'General'}
            </Badge>
          </div>
          {admin ? (
            <div className="flex flex-wrap items-center gap-1">
              {!a.archived ? (
                <Button variant="outline" size="sm" onClick={() => void actions.pin(a)}>
                  {a.pinned ? <LuPinOff /> : <LuPin />} {a.pinned ? 'Unpin' : 'Pin'}
                </Button>
              ) : null}
              <Button variant="outline" size="sm" asChild>
                <Link to={`${list}/${a.id}/edit`}>
                  <LuPencil /> Edit
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => void actions.archive(a)}>
                {a.archived ? <LuArchiveRestore /> : <LuArchive />} {a.archived ? 'Restore' : 'Archive'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReceipts(true)}>
                <LuEye /> Read: {a.readCount ?? 0}
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Delete" className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/50" onClick={() => actions.remove(a)}>
                <LuTrash2 />
              </Button>
            </div>
          ) : null}
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{a.title || '(Untitled)'}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <LuUser className="size-4" /> {a.authorName || 'Admin'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LuClock className="size-4" /> {postedAt(a, timezone)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LuUsers className="size-4" /> {audienceLabel(a)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LuMessageSquare className="size-4" /> {a.commentCount ?? 0} {(a.commentCount ?? 0) === 1 ? 'comment' : 'comments'}
          </span>
        </div>
        <Separator className="my-5" />
        <HtmlContent html={a.contentHtml} />
        {a.attachments?.length ? (
          <div className="mt-6 space-y-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Attachments</h2>
            {a.attachments.map((f) => (
              <a key={f.path} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
                <LuPaperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
              </a>
            ))}
          </div>
        ) : null}
      </Card>
      <Comments a={a} mode={mode} />
      {admin ? <ReadReceiptsDialog a={a} open={receipts} onOpenChange={setReceipts} /> : null}
      {actions.dialog}
    </div>
  )
}

function Comments({ a, mode }: { a: WithId<Announcement>; mode: Mode }) {
  const { branchId, actor, timezone } = useBranch()
  const { data: comments, loading } = useComments(a.id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const admin = mode === 'admin'

  async function post() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await addComment(branchId, actor, mode, a.id, text)
      setText('')
    } catch {
      toast.error('Could not post the comment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="gap-0 p-5 sm:p-6" data-testid="announcement-comments">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        Comments
        {comments.length ? (
          <Badge variant="secondary" className="tabular-nums">
            {comments.length}
          </Badge>
        ) : null}
      </h2>
      {a.commentsEnabled ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={3}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void post()
              }
            }}
            placeholder="Write a comment…"
            aria-label="Write a comment"
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={!text.trim() || busy} onClick={() => void post()}>
              {busy ? <Spinner /> : <LuCornerDownRight />} Post comment
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Comments are turned off for this post.</p>
      )}
      <div className="mt-4 space-y-4">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">{(c.authorName || '?').charAt(0)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{c.authorName}</span>
                {c.authorRole === 'admin' ? (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    Admin
                  </Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">{c.createdAt ? formatInstant(c.createdAt.toDate(), timezone, { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now'}</span>
                {c.authorKey === actor.email || admin ? (
                  <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-red-600 hover:underline" onClick={() => setRemoving(c.id)}>
                    Delete
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{c.text}</p>
            </div>
          </div>
        ))}
        {!loading && comments.length === 0 && a.commentsEnabled ? (
          <p className="text-sm text-muted-foreground">No comments yet. Be the first to start the discussion!</p>
        ) : null}
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this comment?"
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!removing) return
          await deleteComment(branchId, a.id, removing).catch(() => toast.error('Delete failed.'))
        }}
      />
    </Card>
  )
}
