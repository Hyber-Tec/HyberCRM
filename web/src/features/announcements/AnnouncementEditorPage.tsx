import { getDoc } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuArrowLeft, LuFileText, LuPaperclip, LuSearch, LuX } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { type Announcement, type AnnouncementAttachment, type AnnouncementAudience, announcementCategories } from '@shared/comms'
import { useBranch } from '@/branch/BranchProvider'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { OptionPicker } from '@/components/app/OptionPicker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useMembers, useStaffList } from '@/features/data/hooks'
import { cn } from '@/lib/utils'
import { RichTextEditor } from './RichTextEditor'
import {
  type AnnouncementInput,
  announcementRef,
  createAnnouncement,
  formatBytes,
  newAnnouncementId,
  updateAnnouncement,
  uploadAnnouncementFile,
  useAllAnnouncements,
} from './api'
import { hasContent } from './html'

interface Draft {
  title: string
  category: string
  contentHtml: string
  attachments: AnnouncementAttachment[]
  audienceType: AnnouncementAudience
  audienceKeys: string[]
  commentsEnabled: boolean
  notify: boolean
}

const EMPTY: Draft = {
  title: '',
  category: 'General',
  contentHtml: '',
  attachments: [],
  audienceType: 'all',
  audienceKeys: [],
  commentsEnabled: false,
  notify: true,
}

/** Admin → Announcements → New / Edit: a two-step wizard (True Education layout). */
export function AnnouncementEditorPage() {
  const { announcementId } = useParams()
  const { branchId } = useBranch()
  const editing = !!announcementId
  const [id] = useState(() => announcementId ?? newAnnouncementId(branchId))
  const [initial, setInitial] = useState<Draft | null>(editing ? null : EMPTY)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!announcementId) return
    let live = true
    void getDoc(announcementRef(branchId, announcementId)).then((snap) => {
      if (!live) return
      if (!snap.exists()) return setMissing(true)
      const a = snap.data() as Announcement
      setInitial({
        title: a.title,
        category: a.category || 'General',
        contentHtml: a.contentHtml,
        attachments: a.attachments ?? [],
        audienceType: a.audienceType,
        audienceKeys: a.audienceKeys ?? [],
        commentsEnabled: a.commentsEnabled,
        // "Notify again" always starts off.
        notify: false,
      })
    })
    return () => {
      live = false
    }
  }, [branchId, announcementId])

  if (missing) return <p className="text-sm text-muted-foreground">This announcement no longer exists.</p>
  if (!initial) return <Skeleton className="mx-auto h-[32rem] w-full max-w-4xl rounded-xl" />
  return <Wizard id={id} editing={editing} initial={initial} />
}

function Wizard({ id, editing, initial }: { id: string; editing: boolean; initial: Draft }) {
  const { branchId, actor, settings } = useBranch()
  const navigate = useNavigate()
  const list = `/${branchId}/admin/announcements`
  const [step, setStep] = useState<1 | 2>(1)
  const [draft, setDraft] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [search, setSearch] = useState('')
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const { data: posts } = useAllAnnouncements()
  const categories = useMemo(
    () => announcementCategories(settings.announcements.defaultCategories, [...posts.map((p) => p.category), draft.category]),
    [settings.announcements.defaultCategories, posts, draft.category],
  )

  const { data: members } = useMembers()
  const { data: staff } = useStaffList()
  const tutors = useMemo(() => {
    const names = new Map(staff.map((s) => [s.id, s.name]))
    return members
      .filter((m) => m.status === 'active' && m.role === 'tutor')
      .map((m) => ({ key: m.email, name: (m.staffId && names.get(m.staffId)) || m.displayName || m.email, email: m.email }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members, staff])
  const shownTutors = tutors.filter((t) => {
    const q = search.trim().toLowerCase()
    return !q || t.name.toLowerCase().includes(q) || t.email.includes(q)
  })
  const audienceSize = draft.audienceType === 'all' ? tutors.length : draft.audienceKeys.length

  function next() {
    if (!draft.title.trim()) return setError('Please enter a title before continuing.')
    if (!hasContent(draft.contentHtml)) return setError('Please add some content before continuing.')
    if (uploading) return setError('Wait for the uploads to finish.')
    setError(null)
    setStep(2)
  }

  function publish() {
    if (draft.audienceType === 'members' && draft.audienceKeys.length === 0) return setError('Please select at least one person.')
    setError(null)
    setConfirming(true)
  }

  async function save() {
    const input: AnnouncementInput = { ...draft }
    try {
      if (editing) await updateAnnouncement(branchId, actor, id, input)
      else await createAnnouncement(branchId, actor, id, input)
      toast.success(editing ? 'Changes saved.' : 'Announcement published.')
      navigate(list)
    } catch (e) {
      toast.error(`${editing ? 'Save' : 'Publish'} failed: ${(e as Error).message}`)
    }
  }

  async function attach(files: File[]) {
    for (const file of files) {
      setUploading((n) => n + 1)
      try {
        const a = await uploadAnnouncementFile(branchId, id, file, 'files')
        setDraft((d) => ({ ...d, attachments: [...d.attachments, a] }))
      } catch (e) {
        toast.error((e as Error).message || 'Upload failed.')
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const stepLabel = step === 1 ? (editing ? 'Edit content' : 'Write content') : 'Audience & settings'

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => (step === 1 ? navigate(list) : setStep(1))}>
          <LuArrowLeft /> {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">{editing ? 'Edit announcement' : 'New announcement'}</h1>
          <div className="mt-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="flex gap-1">
              {[1, 2].map((n) => (
                <span key={n} className={cn('size-1.5 rounded-full', n === step ? 'bg-foreground' : 'bg-muted-foreground/30')} />
              ))}
            </span>
            Step {step} of 2 — {stepLabel}
          </div>
        </div>
        {step === 1 ? (
          <Button onClick={next}>Next</Button>
        ) : (
          <Button onClick={publish}>{editing ? 'Save changes' : 'Publish'}</Button>
        )}
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <Card className="p-5 sm:p-6">
          <FieldGroup className="gap-5">
            <div className="grid gap-5 sm:grid-cols-[1fr_14rem]">
              <Field>
                <FieldLabel htmlFor="ann-title">Title</FieldLabel>
                <Input
                  id="ann-title"
                  autoFocus
                  value={draft.title}
                  maxLength={200}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Give your announcement a clear title…"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ann-category">Category</FieldLabel>
                <OptionPicker
                  id="ann-category"
                  value={draft.category}
                  onChange={(category) => set({ category })}
                  options={categories.map((c) => ({ value: c, label: c }))}
                  searchPlaceholder="Find or add a category…"
                  allowCreate
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Content</FieldLabel>
              <RichTextEditor
                value={draft.contentHtml}
                onChange={(contentHtml) => set({ contentHtml })}
                uploadImage={async (file) => {
                  if (!file.type.startsWith('image/')) throw new Error('Only images can be placed in the text. Attach other files below.')
                  return (await uploadAnnouncementFile(branchId, id, file, 'images')).url
                }}
              />
            </Field>
            <Field>
              <FieldLabel>Attachments</FieldLabel>
              <div className="space-y-2">
                {draft.attachments.map((a) => (
                  <div key={a.path} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                    <LuFileText className="size-4 shrink-0 text-muted-foreground" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                      {a.name}
                    </a>
                    <span className="text-xs text-muted-foreground">{formatBytes(a.size)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => set({ attachments: draft.attachments.filter((x) => x.path !== a.path) })}
                    >
                      <LuX />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    {uploading ? <Spinner /> : <LuPaperclip />} Attach files
                    <input
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? [])
                        e.target.value = ''
                        void attach(files)
                      }}
                    />
                  </label>
                </Button>
                <FieldDescription>Up to 20 MB each. Images can also be pasted or dropped straight into the text.</FieldDescription>
              </div>
            </Field>
          </FieldGroup>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="gap-4 p-5 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold">Audience</h2>
              <p className="text-sm text-muted-foreground">Who sees this in the tutor portal. Admins always see every announcement.</p>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              value={draft.audienceType}
              onValueChange={(v) => v && set({ audienceType: v as AnnouncementAudience })}
              className="w-full sm:w-auto"
            >
              <ToggleGroupItem value="all" className="flex-1 px-4">
                All tutors ({tutors.length})
              </ToggleGroupItem>
              <ToggleGroupItem value="members" className="flex-1 px-4">
                Select people
              </ToggleGroupItem>
            </ToggleGroup>
            {draft.audienceType === 'all' ? (
              <p className="text-sm text-muted-foreground">This announcement will be visible to all {tutors.length} active tutors, including tutors added later.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <InputGroup className="max-w-xs">
                    <InputGroupAddon>
                      <LuSearch />
                    </InputGroupAddon>
                    <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tutors…" />
                  </InputGroup>
                  <span className="text-sm text-muted-foreground">
                    Selected: <span className="font-semibold text-foreground">{draft.audienceKeys.length}</span>
                  </span>
                </div>
                <div className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                  {shownTutors.map((t) => {
                    const checked = draft.audienceKeys.includes(t.key)
                    return (
                      <label key={t.key} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(on) =>
                            set({ audienceKeys: on ? [...draft.audienceKeys, t.key] : draft.audienceKeys.filter((k) => k !== t.key) })
                          }
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{t.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{t.email}</div>
                        </div>
                      </label>
                    )
                  })}
                  {shownTutors.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">No tutors match.</div> : null}
                </div>
              </div>
            )}
          </Card>
          <Card className="gap-4 p-5">
            <h2 className="text-sm font-semibold">Publishing options</h2>
            <OptionRow
              id="ann-comments"
              label="Allow comments"
              description="Let tutors leave comments on this announcement."
              checked={draft.commentsEnabled}
              onChange={(commentsEnabled) => set({ commentsEnabled })}
            />
            <OptionRow
              id="ann-notify"
              label={editing ? 'Notify again' : 'Notify tutors'}
              description={
                editing
                  ? 'Off by default. Turn on only to re-notify the audience about this update.'
                  : 'Adds it to their notifications. Phones get a push once the phone app is installed.'
              }
              checked={draft.notify}
              onChange={(notify) => set({ notify })}
            />
            {editing && draft.notify ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                The audience will be notified when you save these changes.
              </p>
            ) : null}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={editing ? 'Save changes?' : 'Publish announcement?'}
        description={
          <>
            {editing
              ? `Your edits to “${draft.title.trim()}” will be saved immediately.`
              : `This will immediately send “${draft.title.trim()}” to ${draft.audienceType === 'all' ? `all ${audienceSize} tutors` : `${audienceSize} selected ${audienceSize === 1 ? 'person' : 'people'}`}.`}
            {draft.notify ? (
              <span className={cn('mt-2 block', editing && 'text-red-600 dark:text-red-400')}>
                {editing ? 'The audience will be notified again.' : 'They’ll also get a notification.'}
              </span>
            ) : null}
          </>
        }
        confirmLabel={editing ? 'Yes, save' : 'Yes, publish'}
        busyLabel={editing ? 'Saving…' : 'Publishing…'}
        onConfirm={save}
      />
    </div>
  )
}

function OptionRow({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
