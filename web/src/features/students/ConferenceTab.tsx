import { collection, orderBy, query } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuPencil, LuPlus, LuRefreshCw, LuSettings, LuTag, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { conferenceState } from '@shared/people'
import { formatDateKey, todayKey } from '@shared/time'
import type { ConferenceCategory, ConferenceNote, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useConferenceCategories } from '@/features/data/hooks'
import { db } from '@/lib/firebase'
import { useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import {
  addConferenceCategory,
  conferenceNotesCol,
  deleteConferenceCategory,
  deleteConferenceNote,
  restartConferenceCycle,
  saveConferenceNote,
  updateConferenceCategory,
} from './api'

const SWATCHES = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#475569']

export function ConferenceTab({ student }: { student: WithId<Student> }) {
  const { branchId, actor, settings } = useBranch()
  const q = useMemo(() => query(collection(db, conferenceNotesCol(branchId, student.id)), orderBy('date', 'desc')), [branchId, student.id])
  const { data: notes, loading } = useQuery<ConferenceNote>(q, `conf-${student.id}`)
  const { data: categories } = useConferenceCategories()
  const [editing, setEditing] = useState<WithId<ConferenceNote> | 'new' | null>(null)
  const [managing, setManaging] = useState(false)
  const catById = new Map(categories.map((c) => [c.id, c]))
  const conf = conferenceState(
    { totalSessionHours: student.totalSessionHours, baselineHours: student.conference?.baselineHours ?? 0 },
    settings.students.conference.cycleHours,
  )

  return (
    <div className="space-y-4">
      <Card className="flex-row flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex-1 text-sm">
          <span className="font-medium">{conf.needed ? 'Conference due' : 'On track'}</span>
          <span className="text-muted-foreground">
            {' '}
            · {conf.hoursSince.toFixed(1)} of {conf.cycleHours} hours since the last conference
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!conf.needed}
          onClick={() => void restartConferenceCycle(branchId, actor, student).then(() => toast.success('Cycle restarted'))}
        >
          <LuRefreshCw /> Skip & restart
        </Button>
        <Button variant="outline" size="sm" onClick={() => setManaging(true)}>
          <LuSettings /> Categories
        </Button>
        <Button size="sm" onClick={() => setEditing('new')}>
          <LuPlus /> New note
        </Button>
      </Card>

      {loading ? (
        <Spinner />
      ) : notes.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No conference notes yet. Click “New note” to add the first one.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const cat = n.categoryId ? catById.get(n.categoryId) : null
            return (
              <Card key={n.id} className="gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{n.date ? formatDateKey(n.date, 'long') : 'Undated'}</span>
                  {cat ? (
                    <Badge variant="outline" style={{ borderColor: `${cat.color}66`, color: cat.color, backgroundColor: `${cat.color}11` }}>
                      <LuTag /> {cat.name}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Conference note</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">by {n.authorName}</span>
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditing(n)}>
                      <LuPencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete"
                      onClick={async () => {
                        if (!window.confirm('Delete this conference note? This cannot be undone.')) return
                        await deleteConferenceNote(branchId, student, n.id, notes.filter((x) => x.id !== n.id).map((x) => x.date))
                      }}
                    >
                      <LuTrash2 />
                    </Button>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{n.text || 'No content yet'}</p>
              </Card>
            )
          })}
        </div>
      )}

      <NoteDialog
        note={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSave={async (value) => {
          await saveConferenceNote(
            branchId,
            actor,
            student,
            value,
            editing && editing !== 'new' ? editing.id : null,
            notes.filter((n) => editing === 'new' || n.id !== editing?.id).map((n) => n.date),
          )
          toast.success('Note saved')
          setEditing(null)
        }}
      />
      <CategoryManager open={managing} onOpenChange={setManaging} categories={categories} />
    </div>
  )
}

function NoteDialog({
  note,
  categories,
  onClose,
  onSave,
}: {
  note: WithId<ConferenceNote> | 'new' | null
  categories: WithId<ConferenceCategory>[]
  onClose: () => void
  onSave: (v: { date: string; text: string; categoryId: string | null }) => Promise<void>
}) {
  const { timezone } = useBranch()
  const existing = note && note !== 'new' ? note : null
  const [date, setDate] = useState('')
  const [text, setText] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = note === null ? null : existing?.id ?? 'new'
  if (key !== lastKey) {
    setLastKey(key)
    setDate(existing?.date ?? todayKey(timezone))
    setText(existing?.text ?? '')
    setCategoryId(existing?.categoryId ?? null)
  }

  return (
    <Dialog open={note !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit conference note' : 'New conference note'}</DialogTitle>
          <DialogDescription>Saving a note completes the conference: the hours cycle starts again.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cn-date">Date</FieldLabel>
            <Input id="cn-date" type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                className={cn('rounded-full border border-dashed px-2.5 py-0.5 text-xs', categoryId === null && 'ring-2 ring-ring/40')}
              >
                No category
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={cn('rounded-full border px-2.5 py-0.5 text-xs', categoryId === c.id && 'ring-2')}
                  style={{ borderColor: `${c.color}66`, color: c.color, backgroundColor: `${c.color}11`, ['--tw-ring-color' as string]: c.color }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="cn-text">Notes</FieldLabel>
            <Textarea id="cn-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="What was discussed with the family…" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !date}
            onClick={async () => {
              setBusy(true)
              try {
                await onSave({ date, text: text.trim(), categoryId })
              } catch (e) {
                toast.error('Could not save', { description: (e as Error).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner /> : null} Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CategoryManager({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  categories: WithId<ConferenceCategory>[]
}) {
  const { branchId } = useBranch()
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[0])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conference categories</DialogTitle>
          <DialogDescription>Names and colors apply to every student’s notes.</DialogDescription>
        </DialogHeader>
        <CardContent className="space-y-2 px-0">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`Color of ${c.name}`}
                className="size-7 cursor-pointer rounded border"
                defaultValue={c.color}
                onBlur={(e) => void updateConferenceCategory(branchId, c.id, c.name, e.target.value)}
              />
              <Input defaultValue={c.name} className="h-8" onBlur={(e) => e.target.value.trim() && void updateConferenceCategory(branchId, c.id, e.target.value.trim(), c.color)} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete category"
                onClick={() =>
                  window.confirm(`Delete the “${c.name}” category? Notes keep their text but lose the tag.`) &&
                  void deleteConferenceCategory(branchId, c.id)
                }
              >
                <LuTrash2 />
              </Button>
            </div>
          ))}
          <form
            className="flex items-center gap-2 pt-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const n = name.trim().slice(0, 40)
              if (!n) return
              if (categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) return toast.error(`“${n}” already exists.`)
              await addConferenceCategory(branchId, n, color)
              setName('')
            }}
          >
            <div className="flex gap-1">
              {SWATCHES.slice(0, 5).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`Use ${s}`}
                  onClick={() => setColor(s)}
                  className={cn('size-5 rounded-full border-2', color === s ? 'border-foreground' : 'border-transparent')}
                  style={{ backgroundColor: s }}
                />
              ))}
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className="h-8" />
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
        </CardContent>
      </DialogContent>
    </Dialog>
  )
}
