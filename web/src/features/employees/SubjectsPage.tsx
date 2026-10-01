import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuArrowDown, LuArrowUp, LuChevronRight, LuPencil, LuPlus, LuSearch, LuTrash2, LuUsers } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import type { Staff, Subject, SubjectCategory, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStaffList, useSubjectCategories, useSubjects } from '@/features/data/hooks'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { setQualification } from './api'

const UNCATEGORIZED = '__none__'

export function SubjectsPage() {
  const { branchId, actor } = useBranch()
  const { data: subjects } = useSubjects()
  const { data: categories } = useSubjectCategories()
  const { data: staffAll } = useStaffList()
  const [search, setSearch] = useState('')
  const [tutorFilter, setTutorFilter] = useState<string>('all')
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<{ kind: 'category' } | { kind: 'subject'; categoryId: string } | null>(null)
  const [name, setName] = useState('')

  const staff = useMemo(() => staffAll.filter((s) => s.status !== 'finished' && s.roles.includes('tutor')), [staffAll])
  const tutorsBySubject = useMemo(() => {
    const m = new Map<string, WithId<Staff>[]>()
    for (const s of staff) for (const id of s.subjectIds ?? []) m.set(id, [...(m.get(id) ?? []), s])
    return m
  }, [staff])

  const q = search.trim().toLowerCase()
  const matchedTutors = q ? staff.filter((s) => s.nameLower.includes(q)) : []
  const visibleSubjects = subjects.filter((sub) => {
    if (tutorFilter !== 'all' && !(tutorsBySubject.get(sub.id) ?? []).some((t) => t.id === tutorFilter)) return false
    if (!q) return true
    if (matchedTutors.length) return (tutorsBySubject.get(sub.id) ?? []).some((t) => matchedTutors.includes(t))
    return sub.name.toLowerCase().includes(q)
  })
  const filtering = !!q || tutorFilter !== 'all'

  const groups = [
    ...categories.map((c) => ({ id: c.id, category: c as WithId<SubjectCategory> | null, subjects: visibleSubjects.filter((s) => s.categoryId === c.id) })),
    {
      id: UNCATEGORIZED,
      category: null,
      subjects: visibleSubjects.filter((s) => !categories.some((c) => c.id === s.categoryId)),
    },
  ].filter((g) => g.subjects.length > 0 || (editing && g.category))

  async function create() {
    const n = name.trim()
    if (!n || !dialog) return
    if (dialog.kind === 'category') {
      const ref = doc(branchCol(branchId, COL.subjectCategories))
      await setDoc(ref, { name: n, order: categories.length })
    } else {
      const siblings = subjects.filter((s) => s.categoryId === dialog.categoryId)
      const batch = writeBatch(db)
      const ref = doc(branchCol(branchId, COL.subjects))
      batch.set(ref, {
        name: n,
        categoryId: dialog.categoryId === UNCATEGORIZED ? '' : dialog.categoryId,
        order: siblings.length,
        createdAt: serverTimestamp(),
        createdBy: actor.email,
        updatedAt: serverTimestamp(),
        updatedBy: actor.email,
      })
      addAudit(batch, branchId, actor, { action: 'subject.create', category: 'people', entityType: 'subject', entityId: ref.id, summary: `Added the subject ${n}` })
      await batch.commit()
    }
    setName('')
    setDialog(null)
  }

  async function move<T extends { id: string; order: number }>(list: T[], index: number, dir: -1 | 1, col: 'subjects' | 'subjectCategories') {
    const target = index + dir
    if (target < 0 || target >= list.length) return
    const reordered = [...list]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    const batch = writeBatch(db)
    reordered.forEach((item, i) => batch.update(branchDocRef(branchId, col, item.id), { order: i }))
    await batch.commit()
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Subjects"
        description="The subjects your center teaches, grouped by category, and which tutors are qualified for each."
        actions={
          <>
            {editing ? (
              <Button variant="outline" onClick={() => setDialog({ kind: 'category' })}>
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
        {groups.map((g, gi) => {
          const tutorCount = new Set(g.subjects.flatMap((s) => (tutorsBySubject.get(s.id) ?? []).map((t) => t.id))).size
          return (
            <Collapsible key={`${g.id}-${filtering}`} defaultOpen={filtering || editing}>
              <Card className="gap-0 py-0">
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
                      <Button size="xs" variant="ghost" onClick={() => setDialog({ kind: 'subject', categoryId: g.id })}>
                        <LuPlus /> Subject
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={gi === 0} onClick={() => void move(categories, gi, -1, 'subjectCategories')}>
                        <LuArrowUp />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={gi >= categories.length - 1} onClick={() => void move(categories, gi, 1, 'subjectCategories')}>
                        <LuArrowDown />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Delete category"
                        onClick={async () => {
                          if (!window.confirm(`Delete the category “${g.category?.name}”? Its subjects move to Uncategorized.`)) return
                          await deleteDoc(branchDocRef(branchId, COL.subjectCategories, g.id))
                        }}
                      >
                        <LuTrash2 />
                      </Button>
                    </div>
                  ) : null}
                </div>
                <CollapsibleContent>
                  <div className="divide-y border-t">
                    {g.subjects.map((sub, si) => (
                      <SubjectRow
                        key={sub.id}
                        subject={sub}
                        tutors={tutorsBySubject.get(sub.id) ?? []}
                        allTutors={staff}
                        editing={editing}
                        canMoveUp={si > 0 && !filtering}
                        canMoveDown={si < g.subjects.length - 1 && !filtering}
                        onMove={(dir) => void move(g.subjects, si, dir, 'subjects')}
                        onToggle={(staffId, on) => void setQualification(branchId, actor, staffId, sub.id, on)}
                      />
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

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void create().catch((err) => toast.error((err as Error).message))
            }}
          >
            <DialogHeader>
              <DialogTitle>{dialog?.kind === 'category' ? 'New category' : 'Add subject'}</DialogTitle>
            </DialogHeader>
            <Input
              className="my-4"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={dialog?.kind === 'category' ? 'e.g. Math, Science, Languages' : 'e.g. Algebra 1, AP Chemistry'}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SubjectRow({
  subject,
  tutors,
  allTutors,
  editing,
  canMoveUp,
  canMoveDown,
  onMove,
  onToggle,
}: {
  subject: WithId<Subject>
  tutors: WithId<Staff>[]
  allTutors: WithId<Staff>[]
  editing: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (dir: -1 | 1) => void
  onToggle: (staffId: string, on: boolean) => void
}) {
  const { branchId } = useBranch()
  const [renaming, setRenaming] = useState(false)
  const [value, setValue] = useState(subject.name)

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-2 sm:w-64">
        {renaming ? (
          <Input
            autoFocus
            value={value}
            className="h-8"
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') setRenaming(false)
              if (e.key === 'Enter' && value.trim()) {
                await updateDoc(branchDocRef(branchId, COL.subjects, subject.id), { name: value.trim() })
                setRenaming(false)
              }
            }}
          />
        ) : (
          <span className="truncate text-sm font-medium" onDoubleClick={() => editing && setRenaming(true)}>
            {subject.name}
          </span>
        )}
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
            <div className="px-2 pb-2 text-xs font-medium text-muted-foreground">Qualified for {subject.name}</div>
            {allTutors.map((t) => {
              const on = tutors.some((x) => x.id === t.id)
              return (
                <label key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox checked={on} onCheckedChange={(v) => onToggle(t.id, v === true)} />
                  {t.name}
                </label>
              )
            })}
          </PopoverContent>
        </Popover>
        {editing ? (
          <>
            <Button size="icon-xs" variant="ghost" aria-label="Rename" onClick={() => setRenaming(true)}>
              <LuPencil />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={!canMoveUp} onClick={() => onMove(-1)}>
              <LuArrowUp />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={!canMoveDown} onClick={() => onMove(1)}>
              <LuArrowDown />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Delete subject"
              onClick={async () => {
                if (!window.confirm(`Delete the subject “${subject.name}”?`)) return
                await deleteDoc(branchDocRef(branchId, COL.subjects, subject.id))
              }}
            >
              <LuTrash2 />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
