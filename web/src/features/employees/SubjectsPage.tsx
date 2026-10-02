import { useMemo, useRef, useState } from 'react'
import {
  LuArrowDown,
  LuArrowRight,
  LuArrowUp,
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuFolderInput,
  LuFolderPlus,
  LuGripVertical,
  LuListPlus,
  LuMove,
  LuPencil,
  LuPlus,
  LuSearch,
  LuSearchX,
  LuTrash2,
  LuUserPlus,
  LuX,
} from 'react-icons/lu'
import { toast } from 'sonner'
import type { Staff, Subject, SubjectCategory, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { initials } from '@/components/app/BrandMark'
import { ContextMenuFor, ItemMenuButton, type MenuEntry, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useStaffList, useSubjectCategories, useSubjects } from '@/features/data/hooks'
import { cn } from '@/lib/utils'
import { setQualification } from './api'
import {
  addMissingDefaults,
  createCategory,
  createSubject,
  deleteCategory,
  deleteSubject,
  missingDefaults,
  moveSubject,
  nameTaken,
  placeSubject,
  renameCategory,
  renameSubject,
  reorder,
} from './subjectsApi'

const UNCATEGORIZED = ''
const ALL = 'all'

type Show = 'all' | 'taught' | 'none'

type NameDialog =
  | { kind: 'newCategory' }
  | { kind: 'newSubject'; categoryId: string }
  | { kind: 'renameCategory'; category: WithId<SubjectCategory> }
  | { kind: 'renameSubject'; subject: WithId<Subject> }

interface Group {
  id: string
  category: WithId<SubjectCategory> | null
  subjects: WithId<Subject>[]
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * The branch's subjects by category and which tutors teach each (a guide when
 * booking, never a block). Categories on the left with how much of each is
 * taught; the chosen category's subjects on the right; a side sheet switches a
 * subject's tutors on and off. Edit list adds, renames, moves, reorders and
 * deletes. Each branch has its own copy of the default list.
 */
export function SubjectsPage() {
  const { branchId, actor } = useBranch()
  const { data: subjects } = useSubjects()
  const { data: categories } = useSubjectCategories()
  const { data: staffAll } = useStaffList()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [search, setSearch] = useState('')
  const [tutorFilter, setTutorFilter] = useState<string>(ALL)
  const [show, setShow] = useState<Show>('all')
  const [chosenCat, setChosenCat] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<NameDialog | null>(null)
  const [sheet, setSheet] = useState<{ id: string; teach: Set<string> } | null>(null)
  // Dragging in Edit list: the dragged subject (a ref, read by drop targets) and what is shown.
  const dragId = useRef<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null)
  const listRef = useRef<HTMLElement>(null)

  const tutors = useMemo(() => staffAll.filter((s) => s.status !== 'finished' && s.role === 'tutor'), [staffAll])
  const tutorsBySubject = useMemo(() => {
    const m = new Map<string, WithId<Staff>[]>()
    for (const t of tutors) for (const id of t.subjectIds ?? []) m.set(id, [...(m.get(id) ?? []), t])
    return m
  }, [tutors])
  const tutorsOf = (id: string) => tutorsBySubject.get(id) ?? []
  const missing = useMemo(() => missingDefaults(subjects, categories).missing.length, [subjects, categories])

  const ordered = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories])
  const known = useMemo(() => new Set(categories.map((c) => c.id)), [categories])
  const catOf = (s: Subject) => (known.has(s.categoryId) ? s.categoryId : UNCATEGORIZED)
  const catName = (id: string) => (id === UNCATEGORIZED ? 'Uncategorized' : (categories.find((c) => c.id === id)?.name ?? 'Uncategorized'))
  const subjectsIn = (id: string, list: readonly WithId<Subject>[] = subjects) => list.filter((s) => catOf(s) === id).sort((a, b) => a.order - b.order)
  const groupsOf = (list: readonly WithId<Subject>[]): Group[] => {
    const out: Group[] = ordered.map((c) => ({ id: c.id, category: c, subjects: subjectsIn(c.id, list) }))
    const loose = subjectsIn(UNCATEGORIZED, list)
    if (loose.length) out.push({ id: UNCATEGORIZED, category: null, subjects: loose })
    return out
  }

  // The category shown: the one picked, else the first.
  const cat = chosenCat !== null && (chosenCat === ALL || chosenCat === UNCATEGORIZED || known.has(chosenCat)) ? chosenCat : (ordered[0]?.id ?? ALL)
  const q = search.trim().toLowerCase()
  const searching = q !== ''
  const filtering = searching || tutorFilter !== ALL || show !== 'all'

  // Search: a query that matches tutor names shows their subjects, otherwise subject names.
  const filtered = useMemo(() => {
    const matched = q ? tutors.filter((t) => t.nameLower.includes(q)) : []
    return subjects.filter((s) => {
      const ts = tutorsBySubject.get(s.id) ?? []
      if (tutorFilter !== ALL && !ts.some((t) => t.id === tutorFilter)) return false
      if (show === 'taught' && ts.length === 0) return false
      if (show === 'none' && ts.length > 0) return false
      if (!q) return true
      if (matched.length) return ts.some((t) => matched.includes(t))
      return s.name.toLowerCase().includes(q)
    })
  }, [subjects, tutors, tutorsBySubject, q, tutorFilter, show])

  const statsOf = (id: string) => {
    const list = id === ALL ? subjects : subjectsIn(id)
    return { total: list.length, taught: list.filter((s) => tutorsOf(s.id).length > 0).length }
  }
  const total = subjects.length
  const taught = subjects.filter((s) => tutorsOf(s.id).length > 0).length
  const pct = total ? Math.round((taught / total) * 100) : 0
  const categoryCount = categories.length + (subjectsIn(UNCATEGORIZED).length ? 1 : 0)

  const grouped = searching || cat === ALL
  const shownGroups = grouped ? groupsOf(filtered).filter((g) => g.subjects.length || (editing && !searching && g.category)) : []
  const shownList = grouped ? [] : subjectsIn(cat, filtered)
  const order = grouped ? shownGroups.flatMap((g) => g.subjects) : shownList

  const run = (p: Promise<unknown>, ok?: string) =>
    void p.then(() => ok && toast.success(ok)).catch((e) => toast.error('Couldn’t save', { description: (e as Error).message }))

  function moveIn<T extends { id: string }>(list: T[], index: number, dir: -1 | 1, col: 'subjects' | 'subjectCategories', what: string) {
    const target = index + dir
    if (target < 0 || target >= list.length) return
    const next = [...list]
    ;[next[index], next[target]] = [next[target], next[index]]
    run(reorder(branchId, actor, col, next, `Reordered ${what}`))
  }

  async function removeCategory(c: WithId<SubjectCategory>) {
    const n = subjects.filter((s) => s.categoryId === c.id).length
    const ok = await confirm({
      title: `Delete the category “${c.name}”?`,
      description: n ? `Its ${n} subject${n > 1 ? 's move' : ' moves'} to Uncategorized.` : 'It has no subjects.',
      confirmLabel: 'Delete category',
      destructive: true,
    })
    if (ok) run(deleteCategory(branchId, actor, c, subjects), 'Category deleted')
  }

  async function removeSubject(s: WithId<Subject>) {
    const n = tutorsOf(s.id).length
    const ok = await confirm({
      title: `Delete “${s.name}”?`,
      description: `${n ? `${n} tutor${n > 1 ? 's lose' : ' loses'} it from their subjects. ` : ''}Sessions already booked keep the subject name.`,
      confirmLabel: 'Delete subject',
      destructive: true,
    })
    if (ok) run(deleteSubject(branchId, actor, s), 'Subject deleted')
  }

  async function addDefaults() {
    const ok = await confirm({
      title: `Add ${plural(missing, 'default subject')}?`,
      description: 'Subjects from the default list that this center doesn’t have yet (by name) are added to their usual categories.',
      confirmLabel: 'Add subjects',
    })
    if (ok) run(addMissingDefaults(branchId, actor, subjects, categories), `Added ${plural(missing, 'subject')}`)
  }

  const categoryMenu = (c: WithId<SubjectCategory>): MenuEntry[] => {
    const index = ordered.findIndex((x) => x.id === c.id)
    return menu(
      { kind: 'label', label: c.name },
      { label: 'Add subject…', icon: LuPlus, onSelect: () => setDialog({ kind: 'newSubject', categoryId: c.id }) },
      { label: 'Rename category…', icon: LuPencil, onSelect: () => setDialog({ kind: 'renameCategory', category: c }) },
      { label: 'Move up', icon: LuArrowUp, disabled: index <= 0, separatorBefore: true, onSelect: () => moveIn(ordered, index, -1, 'subjectCategories', 'subject categories') },
      { label: 'Move down', icon: LuArrowDown, disabled: index >= ordered.length - 1, onSelect: () => moveIn(ordered, index, 1, 'subjectCategories', 'subject categories') },
      { label: 'Delete category', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void removeCategory(c) },
    )
  }

  const subjectMenu = (s: WithId<Subject>): MenuEntry[] => {
    const list = subjectsIn(catOf(s))
    const index = list.findIndex((x) => x.id === s.id)
    return menu(
      { kind: 'label', label: s.name },
      { label: 'Tutors…', icon: LuUserPlus, onSelect: () => openSheet(s.id) },
      { label: 'Rename…', icon: LuPencil, onSelect: () => setDialog({ kind: 'renameSubject', subject: s }) },
      {
        kind: 'sub',
        label: 'Move to category',
        icon: LuFolderInput,
        entries: ordered
          .filter((c) => c.id !== s.categoryId)
          .map((c) => ({ label: c.name, onSelect: () => run(moveSubject(branchId, actor, s, c, subjects.filter((x) => x.categoryId === c.id).length), `Moved to ${c.name}`) })),
      },
      { label: 'Move up', icon: LuArrowUp, disabled: index <= 0 || filtering, separatorBefore: true, onSelect: () => moveIn(list, index, -1, 'subjects', 'subjects') },
      { label: 'Move down', icon: LuArrowDown, disabled: index >= list.length - 1 || filtering, onSelect: () => moveIn(list, index, 1, 'subjects', 'subjects') },
      { label: 'Delete subject', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void removeSubject(s) },
    )
  }

  /** Who teaches the subject is noted when the sheet opens, so rows don't jump while switching. */
  function openSheet(id: string) {
    setSheet({ id, teach: new Set(tutorsOf(id).map((t) => t.id)) })
  }

  /** Edit list: drop a dragged subject before another one, or at the end of a category. */
  function dropSubject(id: string, target: { before: WithId<Subject> } | { category: string }) {
    const s = subjects.find((x) => x.id === id)
    if (!s) return
    const toId = 'before' in target ? catOf(target.before) : target.category
    if ('before' in target && target.before.id === id) return
    const list = subjectsIn(toId).filter((x) => x.id !== id)
    const at = 'before' in target ? Math.max(0, list.findIndex((x) => x.id === target.before.id)) : list.length
    list.splice(at, 0, s)
    if (catOf(s) === toId && list.every((x, i) => subjectsIn(toId)[i]?.id === x.id)) return
    run(placeSubject(branchId, actor, s, { id: toId, name: catName(toId) }, list), catOf(s) === toId ? undefined : `Moved to ${catName(toId)}`)
  }

  const dragProps = (target: { before: WithId<Subject> } | { category: string }, key: string) =>
    editing
      ? {
          onDragOver: (e: React.DragEvent) => {
            const id = dragId.current
            if (!id) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (drag?.over !== key) setDrag({ id, over: key })
          },
          onDrop: (e: React.DragEvent) => {
            const id = dragId.current
            if (!id) return
            e.preventDefault()
            e.stopPropagation()
            dragId.current = null
            setDrag(null)
            dropSubject(id, target)
          },
        }
      : {}
  const startDrag = (id: string) => {
    dragId.current = id
    setDrag({ id, over: null })
  }
  const endDrag = () => {
    dragId.current = null
    setDrag(null)
  }

  const clearFilters = () => {
    setSearch('')
    setTutorFilter(ALL)
    setShow('all')
  }

  const navEntries = [{ id: ALL, name: 'All subjects', category: null as WithId<SubjectCategory> | null }, ...groupsOf(subjects).map((g) => ({ id: g.id, name: g.category?.name ?? 'Uncategorized', category: g.category }))]
  const countFor = (id: string) => {
    if (filtering) return String(id === ALL ? filtered.length : filtered.filter((s) => catOf(s) === id).length)
    const st = statsOf(id)
    return `${st.taught}/${st.total}`
  }
  const pickCategory = (id: string) => {
    setChosenCat(id)
    setSearch('')
  }

  const sheetSubject = sheet ? subjects.find((s) => s.id === sheet.id) : undefined
  const sheetIndex = sheetSubject ? order.findIndex((s) => s.id === sheetSubject.id) : -1

  return (
    <div className="max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Subjects</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">What your center teaches and who teaches it. A tutor’s subjects are a guide when booking; they never block it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing && missing > 0 ? (
            <Button variant="outline" onClick={() => void addDefaults()}>
              <LuListPlus /> Add {plural(missing, 'default subject')}
            </Button>
          ) : null}
          {editing ? (
            <Button variant="outline" onClick={() => setDialog({ kind: 'newCategory' })}>
              <LuFolderPlus /> New category
            </Button>
          ) : null}
          <Button variant={editing ? 'default' : 'outline'} onClick={() => setEditing((e) => !e)}>
            {editing ? (
              <>
                <LuCheck /> Done
              </>
            ) : (
              <>
                <LuPencil /> Edit list
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3" data-testid="subjects-stats">
        <div className="rounded-xl border bg-card px-3 py-3 sm:px-5 sm:py-4">
          <div className="text-xs text-muted-foreground sm:text-sm">Subjects</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{total}</div>
          <div className="mt-1 hidden text-xs text-muted-foreground sm:block">in {plural(categoryCount, 'category', 'categories')}</div>
        </div>
        <div className="rounded-xl border bg-card px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground sm:text-sm">
            <span>
              <span className="sm:hidden">Taught</span>
              <span className="hidden sm:inline">Taught by your tutors</span>
            </span>
            <span className="hidden text-xs font-medium tabular-nums sm:inline">{pct}%</span>
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{taught}</div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button
          type="button"
          className="group rounded-xl border bg-card px-3 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50/40 sm:px-5 sm:py-4 dark:hover:bg-amber-950/20"
          onClick={() => {
            setShow('none')
            setChosenCat(ALL)
            setSearch('')
            listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          <div className="text-xs text-muted-foreground sm:text-sm">
            <span className="sm:hidden">No tutor</span>
            <span className="hidden sm:inline">Without a tutor</span>
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-amber-600 tabular-nums sm:text-3xl">{total - taught}</div>
          <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
            Show <span className="hidden sm:inline">them</span> <LuArrowRight className="size-3.5" />
          </div>
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-2.5 md:flex-row md:items-center">
        <InputGroup className="md:w-80">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search subjects or tutor names…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <Select value={tutorFilter} onValueChange={setTutorFilter}>
          <SelectTrigger className="w-full md:w-52" aria-label="Tutor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tutors</SelectItem>
            {tutors.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="inline-flex h-9 w-full items-center rounded-lg bg-muted p-1 text-sm md:ml-auto md:w-auto" role="group" aria-label="Show">
          {(
            [
              ['all', 'All'],
              ['taught', 'Taught'],
              ['none', 'No tutor'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={show === v}
              onClick={() => setShow(v)}
              className={cn(
                'h-7 flex-1 rounded-md px-3 text-sm font-medium transition md:flex-none',
                show === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {editing ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <LuMove className="mt-0.5 size-4 shrink-0" />
          <span>
            You’re editing the list. Drag a subject to reorder it, or onto a category to move it there. Use <b className="font-semibold">⋯</b> or right-click to rename,
            move or delete.
          </span>
        </div>
      ) : null}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <nav aria-label="Categories" className="min-w-0 lg:sticky lg:top-6">
          {/* Phones: categories as a row of chips. */}
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden">
            <div className="flex w-max gap-2 pb-1">
              {navEntries.map((e) => {
                const sel = !searching && cat === e.id
                return (
                  <button
                    key={e.id || 'uncategorized'}
                    type="button"
                    onClick={() => pickCategory(e.id)}
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
                      sel ? 'border-foreground bg-foreground text-background' : 'bg-card text-foreground/80',
                    )}
                  >
                    {e.name}
                    <span className={cn('text-xs font-normal tabular-nums', sel ? 'opacity-70' : 'text-muted-foreground')}>{countFor(e.id)}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="hidden max-h-[calc(100svh-3rem)] overflow-y-auto rounded-xl border bg-card p-1.5 lg:block">
            <div className="flex h-8 items-center justify-between px-3">
              <span className="text-xs font-medium text-muted-foreground">Categories</span>
              <span className="text-[11px] text-muted-foreground/70">{filtering ? 'matches' : 'taught'}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {navEntries.map((e) => {
                const st = statsOf(e.id)
                const p = st.total ? Math.round((st.taught / st.total) * 100) : 0
                const sel = !searching && cat === e.id
                const dim = filtering && countFor(e.id) === '0'
                const key = `cat:${e.id}`
                const row = (
                  <div
                    className={cn('flex items-center gap-1 rounded-lg', sel && 'bg-muted', drag?.over === key && 'outline-2 outline-offset-2 outline-muted-foreground/50 outline-dashed')}
                    {...(e.category ? dragProps({ category: e.id }, key) : {})}
                  >
                    <button
                      type="button"
                      onClick={() => pickCategory(e.id)}
                      className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition', !sel && 'hover:bg-muted/50', dim && 'opacity-40')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm', sel ? 'font-semibold' : 'font-medium text-foreground/80')}>{e.name}</span>
                        <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${p}%` }} />
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{countFor(e.id)}</span>
                    </button>
                    {editing && e.category ? <ItemMenuButton entries={categoryMenu(e.category)} label={`${e.name} actions`} className="mr-1 size-7" /> : null}
                  </div>
                )
                return e.category ? (
                  <ContextMenuFor key={e.id} entries={categoryMenu(e.category)}>
                    {row}
                  </ContextMenuFor>
                ) : (
                  <div key={e.id || 'uncategorized'}>{row}</div>
                )
              })}
            </div>
            {editing ? (
              <button
                type="button"
                onClick={() => setDialog({ kind: 'newCategory' })}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                <LuPlus className="size-4" /> New category
              </button>
            ) : null}
          </div>
        </nav>

        <section ref={listRef} className="min-w-0 scroll-mt-4 overflow-hidden rounded-xl border bg-card" data-testid="subjects-list">
          <PaneHeader
            searching={searching}
            query={search.trim()}
            results={filtered.length}
            category={cat === ALL || cat === UNCATEGORIZED ? null : (categories.find((c) => c.id === cat) ?? null)}
            title={cat === ALL ? 'All subjects' : catName(cat)}
            stats={statsOf(cat)}
            editing={editing}
            onClear={clearFilters}
            onAdd={(id) => setDialog({ kind: 'newSubject', categoryId: id })}
            menuFor={categoryMenu}
          />
          {order.length === 0 && !(grouped && shownGroups.length) ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <LuSearchX className="size-5" />
              </div>
              <p className="mt-3 text-sm font-medium">No subjects here</p>
              <p className="mt-1 text-sm text-muted-foreground">{filtering ? 'Nothing matches the search or filters.' : 'This category is empty.'}</p>
              {filtering ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : grouped ? (
            shownGroups.map((g) => (
              <div key={g.id || 'uncategorized'}>
                <GroupHeader group={g} editing={editing} onAdd={(id) => setDialog({ kind: 'newSubject', categoryId: id })} menuFor={categoryMenu} drop={g.category ? dragProps({ category: g.id }, `group:${g.id}`) : {}} />
                {g.subjects.length ? (
                  g.subjects.map((s) => (
                    <SubjectRow
                      key={s.id}
                      subject={s}
                      tutors={tutorsOf(s.id)}
                      editing={editing}
                      menuEntries={subjectMenu(s)}
                      onOpen={() => openSheet(s.id)}
                      dragging={drag?.id === s.id}
                      over={drag?.over === `row:${s.id}`}
                      onDragStart={() => startDrag(s.id)}
                      onDragEnd={endDrag}
                      drop={dragProps({ before: s }, `row:${s.id}`)}
                    />
                  ))
                ) : (
                  <div className="px-5 py-3 text-sm text-muted-foreground">No subjects in this category.</div>
                )}
              </div>
            ))
          ) : (
            shownList.map((s) => (
              <SubjectRow
                key={s.id}
                subject={s}
                tutors={tutorsOf(s.id)}
                editing={editing}
                menuEntries={subjectMenu(s)}
                onOpen={() => openSheet(s.id)}
                dragging={drag?.id === s.id}
                over={drag?.over === `row:${s.id}`}
                onDragStart={() => startDrag(s.id)}
                onDragEnd={endDrag}
                drop={dragProps({ before: s }, `row:${s.id}`)}
              />
            ))
          )}
          {editing && !searching && known.has(cat) ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-dashed px-5 py-3 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={() => setDialog({ kind: 'newSubject', categoryId: cat })}
              {...dragProps({ category: cat }, `end:${cat}`)}
            >
              <LuPlus className="size-4" /> Add a subject to {catName(cat)}
            </button>
          ) : null}
        </section>
      </div>

      <TutorSheet
        subject={sheetSubject ?? null}
        categoryName={sheetSubject ? catName(catOf(sheetSubject)) : ''}
        tutors={tutors}
        subjectName={(id) => subjects.find((x) => x.id === id)?.name}
        teach={sheet?.teach ?? new Set()}
        index={sheetIndex}
        count={order.length}
        onStep={(dir) => {
          const next = order[sheetIndex + dir]
          if (next) openSheet(next.id)
        }}
        onClose={() => setSheet(null)}
        onToggle={(t, on) =>
          sheetSubject && run(setQualification(branchId, actor, t.id, sheetSubject.id, on, { staff: t.name, subject: sheetSubject.name }))
        }
      />
      <NameDialog dialog={dialog} onClose={() => setDialog(null)} subjects={subjects} categories={categories} />
      {confirmDialog}
    </div>
  )
}

function PaneHeader({
  searching,
  query,
  results,
  category,
  title,
  stats,
  editing,
  onClear,
  onAdd,
  menuFor,
}: {
  searching: boolean
  query: string
  results: number
  category: WithId<SubjectCategory> | null
  title: string
  stats: { total: number; taught: number }
  editing: boolean
  onClear: () => void
  onAdd: (categoryId: string) => void
  menuFor: (c: WithId<SubjectCategory>) => MenuEntry[]
}) {
  if (searching) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight">
            {plural(results, 'result')} for “{query}”
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Subjects with that name, or taught by a tutor with that name.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClear}>
          <LuX /> Clear
        </Button>
      </div>
    )
  }
  const header = (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {plural(stats.total, 'subject')} · {stats.taught} taught · {stats.total - stats.taught} without a tutor
        </p>
      </div>
      <CoverageRing taught={stats.taught} total={stats.total} />
      {editing && category ? (
        <>
          <Button variant="outline" size="sm" onClick={() => onAdd(category.id)}>
            <LuPlus /> Add subject
          </Button>
          <ItemMenuButton entries={menuFor(category)} label="Category actions" />
        </>
      ) : null}
    </div>
  )
  return category ? <ContextMenuFor entries={menuFor(category)}>{header}</ContextMenuFor> : header
}

function CoverageRing({ taught, total }: { taught: number; total: number }) {
  const pct = total ? taught / total : 0
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <div className="hidden items-center gap-2 sm:flex">
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" className="stroke-muted" strokeWidth="4" />
        {pct ? <circle cx="18" cy="18" r={r} fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct * c).toFixed(1)} ${c.toFixed(1)}`} /> : null}
      </svg>
      <span className="text-xs leading-tight text-muted-foreground">
        <span className="block text-sm font-semibold text-foreground tabular-nums">{Math.round(pct * 100)}%</span>
        covered
      </span>
    </div>
  )
}

function GroupHeader({
  group,
  editing,
  onAdd,
  menuFor,
  drop,
}: {
  group: Group
  editing: boolean
  onAdd: (categoryId: string) => void
  menuFor: (c: WithId<SubjectCategory>) => MenuEntry[]
  drop: React.HTMLAttributes<HTMLDivElement>
}) {
  const header = (
    <div className="sticky top-0 z-[1] flex h-10 items-center gap-2 border-b bg-muted/80 px-4 backdrop-blur sm:px-5" {...drop}>
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.category?.name ?? 'Uncategorized'}</span>
      <span className="text-xs text-muted-foreground/70 tabular-nums">{group.subjects.length}</span>
      {editing && group.category ? (
        <Button variant="ghost" size="xs" className="ml-auto" onClick={() => onAdd(group.id)}>
          <LuPlus /> Subject
        </Button>
      ) : null}
    </div>
  )
  return group.category ? <ContextMenuFor entries={menuFor(group.category)}>{header}</ContextMenuFor> : header
}

function TutorAvatar({ tutor, className }: { tutor: WithId<Staff>; className?: string }) {
  return (
    <span
      title={tutor.name}
      className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-card', className)}
      style={{ backgroundColor: `${tutor.color}1f`, color: tutor.color }}
    >
      {initials(tutor.name)}
    </span>
  )
}

function SubjectRow({
  subject,
  tutors,
  editing,
  menuEntries,
  onOpen,
  dragging,
  over,
  onDragStart,
  onDragEnd,
  drop,
}: {
  subject: WithId<Subject>
  tutors: WithId<Staff>[]
  editing: boolean
  menuEntries: MenuEntry[]
  onOpen: () => void
  dragging: boolean
  over: boolean
  onDragStart: () => void
  onDragEnd: () => void
  drop: React.HTMLAttributes<HTMLDivElement>
}) {
  const names =
    tutors.length <= 2
      ? tutors.map((t) => t.name).join(' and ')
      : `${tutors
          .slice(0, 2)
          .map((t) => t.firstName || t.name.split(' ')[0])
          .join(', ')} and ${plural(tutors.length - 2, 'other')}`
  return (
    <ContextMenuFor entries={menuEntries}>
      <div
        className={cn(
          'group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/40 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] sm:px-5',
          dragging && 'opacity-40',
          over && 'shadow-[inset_0_2px_0_0_var(--foreground)]',
        )}
        draggable={editing}
        onDragStart={
          editing
            ? (e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', subject.id)
                onDragStart()
              }
            : undefined
        }
        onDragEnd={editing ? onDragEnd : undefined}
        data-testid="subject-row"
        {...drop}
      >
        <div className="flex min-w-0 items-center gap-2">
          {editing ? <LuGripVertical className="-ml-1 size-4 shrink-0 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground" aria-label="Drag to reorder" /> : null}
          <button type="button" onClick={onOpen} className="min-w-0 truncate text-left text-sm font-medium hover:underline hover:underline-offset-4">
            {subject.name}
          </button>
        </div>
        <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-2.5 sm:col-span-1 sm:row-start-auto">
          {tutors.length ? (
            <>
              <span className="flex -space-x-1.5">
                {tutors.slice(0, 4).map((t) => (
                  <TutorAvatar key={t.id} tutor={t} />
                ))}
                {tutors.length > 4 ? (
                  <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-2 ring-card">+{tutors.length - 4}</span>
                ) : null}
              </span>
              <span className="truncate text-sm text-muted-foreground">{names}</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground/70">
              <span className="size-1.5 rounded-full bg-amber-400" />
              No tutor yet
            </span>
          )}
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="sm" onClick={onOpen}>
            <LuUserPlus /> Tutors{tutors.length ? <span className="text-muted-foreground tabular-nums">{tutors.length}</span> : null}
          </Button>
          {editing ? <ItemMenuButton entries={menuEntries} label={`${subject.name} actions`} /> : null}
        </div>
      </div>
    </ContextMenuFor>
  )
}

/** A subject's tutors, each with a switch; who taught it when it opened is listed first. */
function TutorSheet({
  subject,
  categoryName,
  tutors,
  subjectName,
  teach,
  index,
  count,
  onStep,
  onClose,
  onToggle,
}: {
  subject: WithId<Subject> | null
  categoryName: string
  tutors: WithId<Staff>[]
  subjectName: (id: string) => string | undefined
  teach: Set<string>
  index: number
  count: number
  onStep: (dir: -1 | 1) => void
  onClose: () => void
  onToggle: (t: WithId<Staff>, on: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [shownFor, setShownFor] = useState<string | null>(null)
  if ((subject?.id ?? null) !== shownFor) {
    setShownFor(subject?.id ?? null)
    setQuery('')
  }
  const q = query.trim().toLowerCase()
  const subjectNames = (t: WithId<Staff>) => (t.subjectIds ?? []).map(subjectName).filter((n): n is string => !!n)
  const match = (t: WithId<Staff>) => !q || t.nameLower.includes(q) || subjectNames(t).some((n) => n.toLowerCase().includes(q))
  const first = tutors.filter((t) => teach.has(t.id) && match(t))
  const rest = tutors.filter((t) => !teach.has(t.id) && match(t))
  const teaching = subject ? tutors.filter((t) => (t.subjectIds ?? []).includes(subject.id)).length : 0

  const row = (t: WithId<Staff>) => {
    const on = !!subject && (t.subjectIds ?? []).includes(subject.id)
    const theirs = subjectNames(t)
    return (
      <label key={t.id} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-muted/50">
        <TutorAvatar tutor={t} className="size-9 text-xs ring-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{t.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {plural(theirs.length, 'subject')}
            {theirs.length ? ` · ${theirs.slice(0, 3).join(', ')}${theirs.length > 3 ? '…' : ''}` : ''}
          </span>
        </span>
        <Switch checked={on} onCheckedChange={(v) => onToggle(t, v)} aria-label={`${t.name} teaches ${subject?.name ?? ''}`} />
      </label>
    )
  }
  const head = (label: string, n: number) => (
    <div className="sticky top-0 z-[1] bg-popover/95 px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
      {label} <span className="font-normal tabular-nums opacity-70">{n}</span>
    </div>
  )

  return (
    <Sheet open={!!subject} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md" data-testid="subject-tutors">
        <SheetHeader className="border-b px-6 py-5 pr-12">
          <div className="text-xs font-medium text-muted-foreground">{categoryName}</div>
          <SheetTitle className="truncate text-xl font-semibold tracking-tight">{subject?.name}</SheetTitle>
          <SheetDescription>Tutors who teach it are suggested first when booking. Anyone can still be booked.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 border-b px-6 pt-4 pb-3">
          {tutors.length > 8 ? (
            <InputGroup>
              <InputGroupAddon>
                <LuSearch />
              </InputGroupAddon>
              <InputGroupInput placeholder="Find a tutor by name or subject…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a tutor" />
            </InputGroup>
          ) : null}
          <div className="text-xs font-medium text-muted-foreground">
            {teaching} of {plural(tutors.length, 'tutor')} teach it
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {first.length ? head('Teaches it', first.length) : null}
          {first.map(row)}
          {rest.length ? head(first.length ? 'Other tutors' : 'Tutors', rest.length) : null}
          {rest.map(row)}
          {!first.length && !rest.length ? <p className="px-3 py-10 text-center text-sm text-muted-foreground">{tutors.length ? `No tutor matches “${query.trim()}”.` : 'No tutors yet.'}</p> : null}
        </div>
        <div className="flex items-center gap-2 border-t px-6 py-4">
          <Button variant="outline" size="icon" disabled={index <= 0} onClick={() => onStep(-1)} aria-label="Previous subject">
            <LuChevronLeft />
          </Button>
          <Button variant="outline" size="icon" disabled={index < 0 || index >= count - 1} onClick={() => onStep(1)} aria-label="Next subject">
            <LuChevronRight />
          </Button>
          <span className="text-xs text-muted-foreground">{index >= 0 ? `${index + 1} of ${count}` : ''}</span>
          <Button className="ml-auto" onClick={onClose}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** New or renamed category or subject; names must be unique (ignoring case). */
function NameDialog({
  dialog,
  onClose,
  subjects,
  categories,
}: {
  dialog: NameDialog | null
  onClose: () => void
  subjects: WithId<Subject>[]
  categories: WithId<SubjectCategory>[]
}) {
  const { branchId, actor } = useBranch()
  const initial = dialog?.kind === 'renameCategory' ? dialog.category.name : dialog?.kind === 'renameSubject' ? dialog.subject.name : ''
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [shownFor, setShownFor] = useState<NameDialog | null>(null)
  if (dialog !== shownFor) {
    setShownFor(dialog)
    setName(initial)
  }
  if (!dialog) return null
  const isCategory = dialog.kind === 'newCategory' || dialog.kind === 'renameCategory'
  const list = isCategory ? categories : subjects
  const exceptId = dialog.kind === 'renameCategory' ? dialog.category.id : dialog.kind === 'renameSubject' ? dialog.subject.id : undefined
  const n = name.trim()
  const taken = !!n && nameTaken(list, n, exceptId)
  const title = { newCategory: 'New category', newSubject: 'Add subject', renameCategory: 'Rename category', renameSubject: 'Rename subject' }[dialog.kind]

  async function save() {
    if (!dialog || !n || taken) return
    setBusy(true)
    try {
      if (dialog.kind === 'newCategory') await createCategory(branchId, actor, n, categories.length)
      else if (dialog.kind === 'newSubject') {
        await createSubject(branchId, actor, n, dialog.categoryId, subjects.filter((s) => s.categoryId === dialog.categoryId).length)
        toast.success(`Added ${n}`, { description: 'Assign tutors so it shows up when booking.' })
      } else if (dialog.kind === 'renameCategory') await renameCategory(branchId, actor, dialog.category, n)
      else await renameSubject(branchId, actor, dialog.subject, n)
      onClose()
    } catch (e) {
      toast.error('Couldn’t save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {dialog.kind === 'renameSubject' ? (
              <DialogDescription>Sessions already booked keep the name they were booked with.</DialogDescription>
            ) : dialog.kind === 'newSubject' ? (
              <DialogDescription>To {categories.find((c) => c.id === dialog.categoryId)?.name ?? 'Uncategorized'}.</DialogDescription>
            ) : null}
          </DialogHeader>
          <Input
            className="mt-4"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isCategory ? 'e.g. Math, Science, Languages' : 'e.g. Algebra 1, AP Chemistry'}
            aria-invalid={taken}
          />
          {taken ? <FieldError className="mt-2">{isCategory ? 'A category' : 'A subject'} with this name already exists.</FieldError> : null}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!n || taken || busy || n === initial}>
              {dialog.kind.startsWith('rename') ? 'Rename' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
