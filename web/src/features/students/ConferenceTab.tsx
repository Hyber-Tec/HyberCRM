import { collection, orderBy, query } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuPencil, LuPlus, LuRefreshCw, LuTag, LuTags, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { conferenceState } from '@shared/people'
import { formatDateKey, todayKey } from '@shared/time'
import type { ConferenceCategory, ConferenceNote, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { CardContent } from '@/components/ui/card'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

export function ConferenceTab({ student, weeklyHours }: { student: WithId<Student>; weeklyHours: number }) {
  const { branchId, actor, rules } = useBranch()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const q = useMemo(() => query(collection(db, conferenceNotesCol(branchId, student.id)), orderBy('date', 'desc')), [branchId, student.id])
  const { data: notes, loading } = useQuery<ConferenceNote>(q, `conf-${student.id}`)
  const { data: categories } = useConferenceCategories()
  const [editing, setEditing] = useState<WithId<ConferenceNote> | 'new' | null>(null)
  const [managing, setManaging] = useState(false)
  const catById = new Map(categories.map((c) => [c.id, c]))
  const conf = conferenceState(
    { totalSessionHours: student.totalSessionHours, baselineHours: student.conference?.baselineHours ?? 0 },
    rules.conferences.everyHours,
  )
  const cycle = conf.cycleHours
  const pct = cycle > 0 ? Math.min(100, (conf.hoursSince / cycle) * 100) : 0
  const left = Math.max(0, cycle - conf.hoursSince)
  const weeksLeft = weeklyHours > 0 ? Math.max(1, Math.round(left / weeklyHours)) : null
  const last = student.conference?.lastNoteDate ?? null
  // Ticks every 5 hours (every 10 for long cycles).
  const step = cycle > 30 ? 10 : 5
  const ticks = Array.from({ length: Math.floor(cycle / step) + 1 }, (_, i) => i * step)

  async function skip() {
    const ok = await confirm({
      title: 'Skip this conference?',
      description: `Restart the ${cycle}-hour conference cycle for ${student.name} without a conference note.`,
      confirmLabel: `Skip & restart ${cycle} hrs`,
      destructive: true,
    })
    if (!ok) return
    try {
      await restartConferenceCycle(branchId, actor, student)
      toast.success('Cycle restarted')
    } catch (e) {
      toast.error(`Failed to skip the conference cycle: ${(e as Error).message}`)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-5" data-testid="conference-cycle">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Parent conferences</h2>
            <p className="text-sm text-muted-foreground">Every {cycle} tutoring hours. Saving a note completes the conference.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!conf.needed} title={conf.needed ? undefined : 'Available when a conference is due'} onClick={() => void skip()}>
              <LuRefreshCw /> Skip & restart
            </Button>
            <Button variant="outline" onClick={() => setManaging(true)}>
              <LuTags /> Categories
            </Button>
            <Button onClick={() => setEditing('new')}>
              <LuPlus /> New note
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <b className="text-2xl font-semibold tabular-nums">{conf.hoursSince.toFixed(1)}</b>{' '}
              <span className="text-muted-foreground">
                of {cycle} hours{last ? ` since ${formatDateKey(last, 'monthDay')}` : ' so far'}
              </span>
            </span>
            <span className={cn('font-medium', conf.needed ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>{conf.needed ? 'Conference due' : 'On track'}</span>
          </div>
          <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950" role="progressbar" aria-valuemin={0} aria-valuemax={cycle} aria-valuenow={conf.hoursSince}>
            <div className={cn('h-full rounded-full', conf.needed ? 'bg-red-500' : 'bg-[#2a78d6]')} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
            {ticks.map((t, i) => (
              <span key={t}>
                {t}
                {i === ticks.length - 1 ? ' h' : ''}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {conf.needed
              ? `${student.firstName || student.name} has had ${conf.hoursSince.toFixed(1)} hours since the last conference: it’s time to meet the family.`
              : weeksLeft
                ? `About ${Math.round(left)} hours left: at ${weeklyHours} hours a week, the next conference is due in about ${weeksLeft === 1 ? 'a week' : `${weeksLeft} weeks`}.`
                : `About ${Math.round(left)} hours left until the next conference.`}
          </p>
        </div>
      </section>

      {loading ? (
        <Spinner />
      ) : notes.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No conference notes yet. Click “New note” to add the first one.</p>
      ) : (
        <ol className="relative ml-3 space-y-5 border-l pl-7" data-testid="conference-notes">
          {notes.map((n) => {
            const cat = n.categoryId ? catById.get(n.categoryId) : null
            return (
              <li key={n.id} className="relative">
                <span
                  className="absolute top-1.5 -left-[34px] size-3.5 rounded-full border-2 border-background"
                  style={{ backgroundColor: cat?.color ?? '#a1a1aa', boxShadow: `0 0 0 1px ${cat ? `${cat.color}66` : '#d4d4d8'}` }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{n.date ? formatDateKey(n.date, 'long') : 'Undated'}</span>
                  {cat ? (
                    <Badge variant="outline" style={{ borderColor: `${cat.color}66`, color: cat.color, backgroundColor: `${cat.color}11` }}>
                      <LuTag /> {cat.name}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Conference note</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">by {n.authorName}</span>
                  <div className="ml-auto flex">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditing(n)}>
                      <LuPencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete"
                      className="hover:text-red-600"
                      onClick={async () => {
                        const ok = await confirm({ title: 'Delete this conference note?', description: 'This cannot be undone.', confirmLabel: 'Delete note', destructive: true })
                        if (!ok) return
                        await deleteConferenceNote(branchId, student, n.id, notes.filter((x) => x.id !== n.id).map((x) => x.date))
                      }}
                    >
                      <LuTrash2 />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 rounded-xl border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">{n.text || 'No content yet'}</div>
              </li>
            )
          })}
        </ol>
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
      {confirmDialog}
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
            <DatePicker id="cn-date" className="w-44" value={date || null} onChange={setDate} />
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
