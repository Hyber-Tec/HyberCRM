import { useMemo, useState } from 'react'
import {
  LuArrowDown,
  LuArrowUp,
  LuChevronRight,
  LuFolderInput,
  LuListPlus,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu'
import { toast } from 'sonner'
import type { Staff, Subject, SubjectCategory, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, type MenuEntry, menu } from '@/components/app/ItemMenu'
import { PageHeader } from '@/components/app/PageHeader'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStaffList, useSubjectCategories, useSubjects } from '@/features/data/hooks'
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
  renameCategory,
  renameSubject,
  reorder,
} from './subjectsApi'

const UNCATEGORIZED = ''

type NameDialog =
  | { kind: 'newCategory' }
  | { kind: 'newSubject'; categoryId: string }
  | { kind: 'renameCategory'; category: WithId<SubjectCategory> }
  | { kind: 'renameSubject'; subject: WithId<Subject> }

/**
 * The branch's subjects by category, and which tutors teach each (a hint for
 * booking, never a block). Each branch has its own copy of the default list.
 */
export function SubjectsPage() {
  const { branchId, actor } = useBranch()
  const { data: subjects } = useSubjects()
  const { data: categories } = useSubjectCategories()
  const { data: staffAll } = useStaffList()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [search, setSearch] = useState('')
  const [tutorFilter, setTutorFilter] = useState<string>('all')
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<NameDialog | null>(null)

  const staff = useMemo(() => staffAll.filter((s) => s.status !== 'finished' && s.role === 'tutor'), [staffAll])
  const tutorsBySubject = useMemo(() => {
    const m = new Map<string, WithId<Staff>[]>()
    for (const s of staff) for (const id of s.subjectIds ?? []) m.set(id, [...(m.get(id) ?? []), s])
    return m
  }, [staff])
  const missing = useMemo(() => missingDefaults(subjects, categories).missing.length, [subjects, categories])

  const q = search.trim().toLowerCase()
  const matchedTutors = q ? staff.filter((s) => s.nameLower.includes(q)) : []
  const visibleSubjects = subjects.filter((sub) => {
    if (tutorFilter !== 'all' && !(tutorsBySubject.get(sub.id) ?? []).some((t) => t.id === tutorFilter)) return false
    if (!q) return true
    if (matchedTutors.length) return (tutorsBySubject.get(sub.id) ?? []).some((t) => matchedTutors.includes(t))
    return sub.name.toLowerCase().includes(q)
  })
  const filtering = !!q || tutorFilter !== 'all'
  const known = new Set(categories.map((c) => c.id))
  const inCategory = (id: string) => visibleSubjects.filter((s) => (id === UNCATEGORIZED ? !known.has(s.categoryId) : s.categoryId === id)).sort((a, b) => a.order - b.order)

  const groups = [
    ...categories.map((c) => ({ id: c.id, category: c as WithId<SubjectCategory> | null, subjects: inCategory(c.id) })),
    { id: UNCATEGORIZED, category: null, subjects: inCategory(UNCATEGORIZED) },
  ].filter((g) => g.subjects.length > 0 || (editing && g.category))

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
    const n = (tutorsBySubject.get(s.id) ?? []).length
    const ok = await confirm({
      title: `Delete “${s.name}”?`,
      description: `${n ? `${n} tutor${n > 1 ? 's lose' : ' loses'} it from their subjects. ` : ''}Sessions already booked keep the subject name.`,
      confirmLabel: 'Delete subject',
      destructive: true,
    })
    if (ok) run(deleteSubject(branchId, actor, s), 'Subject deleted')
  }

  const categoryMenu = (c: WithId<SubjectCategory>, index: number): MenuEntry[] =>
    menu(
      { kind: 'label', label: c.name },
      { label: 'Add subject…', icon: LuPlus, onSelect: () => setDialog({ kind: 'newSubject', categoryId: c.id }) },
      { label: 'Rename category…', icon: LuPencil, onSelect: () => setDialog({ kind: 'renameCategory', category: c }) },
      { label: 'Move up', icon: LuArrowUp, disabled: index === 0, separatorBefore: true, onSelect: () => moveIn(categories, index, -1, 'subjectCategories', 'subject categories') },
      { label: 'Move down', icon: LuArrowDown, disabled: index >= categories.length - 1, onSelect: () => moveIn(categories, index, 1, 'subjectCategories', 'subject categories') },
      { label: 'Delete category', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void removeCategory(c) },
    )

  const subjectMenu = (s: WithId<Subject>, list: WithId<Subject>[], index: number): MenuEntry[] =>
    menu(
      { kind: 'label', label: s.name },
      { label: 'Rename…', icon: LuPencil, onSelect: () => setDialog({ kind: 'renameSubject', subject: s }) },
      {
        kind: 'sub',
        label: 'Move to category',
        icon: LuFolderInput,
        entries: categories
          .filter((c) => c.id !== s.categoryId)
          .map((c) => ({
            label: c.name,
            onSelect: () => run(moveSubject(branchId, actor, s, c, subjects.filter((x) => x.categoryId === c.id).length), `Moved to ${c.name}`),
          })),
      },
      { label: 'Move up', icon: LuArrowUp, disabled: index === 0 || filtering, separatorBefore: true, onSelect: () => moveIn(list, index, -1, 'subjects', 'subjects') },
      { label: 'Move down', icon: LuArrowDown, disabled: index >= list.length - 1 || filtering, onSelect: () => moveIn(list, index, 1, 'subjects', 'subjects') },
      { label: 'Delete subject', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void removeSubject(s) },
    )

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Subjects"
        description="The subjects your center teaches, grouped by category, and which tutors teach each. Tutors’ subjects are a guide when booking; they never block it."
        actions={
          <>
            {editing && missing > 0 ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Add ${missing} default subject${missing > 1 ? 's' : ''}?`,
                    description: 'Subjects from the default list that this center doesn’t have yet (by name) are added to their usual categories.',
                    confirmLabel: 'Add subjects',
                  })
                  if (ok) run(addMissingDefaults(branchId, actor, subjects, categories), `Added ${missing} subject${missing > 1 ? 's' : ''}`)
                }}
              >
                <LuListPlus /> Add {missing} default subject{missing > 1 ? 's' : ''}
              </Button>
            ) : null}
            {editing ? (
              <Button variant="outline" onClick={() => setDialog({ kind: 'newCategory' })}>
                <LuPlus /> New category
              </Button>
            ) : null}
            <Button variant={editing ? 'default' : 'outline'} onClick={() => setEditing((e) => !e)}>
              {editing ? 'Done' : <><LuPencil /> Edit</>}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <InputGroup className="sm:w-80">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search subjects or tutor names…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <Select value={tutorFilter} onValueChange={setTutorFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tutors</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {groups.map((g) => {
          const ci = g.category ? categories.findIndex((c) => c.id === g.id) : -1
          const tutorCount = new Set(g.subjects.flatMap((s) => (tutorsBySubject.get(s.id) ?? []).map((t) => t.id))).size
          const header = (
            <div className="flex items-center gap-2 px-4 py-3">
              <CollapsibleTrigger className="group flex flex-1 items-center gap-2 text-left">
                <LuChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
                <span className="font-medium">{g.category?.name ?? 'Uncategorized'}</span>
                <Badge variant="secondary">{g.subjects.length} subjects</Badge>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  <LuUsers /> {tutorCount} tutors
                </Badge>
              </CollapsibleTrigger>
              {editing && g.category ? (
                <div className="flex items-center gap-1">
                  <Button size="xs" variant="ghost" onClick={() => setDialog({ kind: 'newSubject', categoryId: g.id })}>
                    <LuPlus /> Subject
                  </Button>
                  <ItemMenuButton entries={categoryMenu(g.category, ci)} label={`${g.category.name} actions`} className="size-7" />
                </div>
              ) : null}
            </div>
          )
          return (
            <Collapsible key={`${g.id}-${filtering}`} defaultOpen={filtering || editing}>
              <Card className="gap-0 py-0">
                {g.category ? (
                  <ContextMenuFor entries={categoryMenu(g.category, ci)}>{header}</ContextMenuFor>
                ) : (
                  header
                )}
                <CollapsibleContent>
                  <div className="divide-y border-t">
                    {g.subjects.map((sub, si) => (
                      <ContextMenuFor key={sub.id} entries={subjectMenu(sub, g.subjects, si)}>
                        <SubjectRow
                          subject={sub}
                          tutors={tutorsBySubject.get(sub.id) ?? []}
                          allTutors={staff}
                          editing={editing}
                          menuEntries={subjectMenu(sub, g.subjects, si)}
                          onQualify={(staffId, on) =>
                            run(setQualification(branchId, actor, staffId, sub.id, on, { staff: staff.find((t) => t.id === staffId)?.name ?? 'a tutor', subject: sub.name }))
                          }
                        />
                      </ContextMenuFor>
                    ))}
                    {g.subjects.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">No subjects in this category.</p> : null}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )
        })}
        {groups.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No subjects found.</p> : null}
      </div>

      <NameDialog dialog={dialog} onClose={() => setDialog(null)} subjects={subjects} categories={categories} />
      {confirmDialog}
    </div>
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
      else if (dialog.kind === 'newSubject') await createSubject(branchId, actor, n, dialog.categoryId, subjects.filter((s) => s.categoryId === dialog.categoryId).length)
      else if (dialog.kind === 'renameCategory') await renameCategory(branchId, actor, dialog.category, n)
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
            {dialog.kind === 'renameSubject' ? <DialogDescription>Sessions already booked keep the name they were booked with.</DialogDescription> : null}
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

function SubjectRow({
  subject,
  tutors,
  allTutors,
  editing,
  menuEntries,
  onQualify,
  ...rest
}: {
  subject: WithId<Subject>
  tutors: WithId<Staff>[]
  allTutors: WithId<Staff>[]
  editing: boolean
  menuEntries: MenuEntry[]
  onQualify: (staffId: string, on: boolean) => void
} & React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center" {...rest}>
      <div className="flex min-w-0 items-center gap-2 sm:w-64">
        <span className="truncate text-sm font-medium">{subject.name}</span>
      </div>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {tutors.length === 0 ? (
          <span className="text-xs text-muted-foreground">No tutors assigned</span>
        ) : (
          tutors.map((t) => (
            <Badge key={t.id} variant="secondary">
              {t.name}
            </Badge>
          ))
        )}
      </div>
      <div className="flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="xs" variant="outline">
              <LuUsers /> Tutors
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-80 w-64 overflow-y-auto p-2">
            <div className="px-2 pb-2 text-xs font-medium text-muted-foreground">Teach {subject.name}</div>
            {allTutors.map((t) => {
              const on = tutors.some((x) => x.id === t.id)
              return (
                <label key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox checked={on} onCheckedChange={(v) => onQualify(t.id, v === true)} />
                  {t.name}
                </label>
              )
            })}
          </PopoverContent>
        </Popover>
        {editing ? <ItemMenuButton entries={menuEntries} label={`${subject.name} actions`} className="size-7" /> : null}
      </div>
    </div>
  )
}
