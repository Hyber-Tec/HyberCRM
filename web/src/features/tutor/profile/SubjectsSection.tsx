import { useMemo, useState } from 'react'
import { LuChevronRight, LuSearch, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import type { Subject, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubjectCategories, useSubjects } from '@/features/data/hooks'
import { setQualification } from '@/features/employees/api'
import { cn } from '@/lib/utils'
import { NOT_LINKED, useMyStaff } from '../hooks'
import { SectionTitle } from './parts'

/**
 * Profile → Subjects: what the tutor teaches, picked from the center's list
 * (informational: it never blocks booking). Each change is in the audit log.
 */
export function SubjectsSection() {
  const { branchId, actor } = useBranch()
  const { data: staff, loading } = useMyStaff()
  const { data: subjects, loading: subjectsLoading } = useSubjects()
  const { data: categories } = useSubjectCategories()
  const [search, setSearch] = useState('')
  const mine = useMemo(() => new Set(staff?.subjectIds ?? []), [staff?.subjectIds])
  const q = search.trim().toLowerCase()

  const groups = useMemo(
    () =>
      [...categories.map((c) => ({ id: c.id, name: c.name })), { id: '', name: 'Uncategorized' }]
        .map((g) => {
          const all = subjects.filter((s) => (g.id ? s.categoryId === g.id : !categories.some((c) => c.id === s.categoryId)))
          return { ...g, all, shown: all.filter((s) => !q || s.name.toLowerCase().includes(q)) }
        })
        .filter((g) => g.shown.length > 0),
    [categories, subjects, q],
  )
  const picked = useMemo(() => subjects.filter((s) => mine.has(s.id)), [subjects, mine])

  if (loading) return <Skeleton className="h-72 w-full rounded-xl" />
  if (!staff) return <p className="text-sm text-muted-foreground">{NOT_LINKED}</p>

  const toggle = (s: WithId<Subject>, on: boolean) =>
    setQualification(branchId, actor, staff.id, s.id, on, { staff: staff.name, subject: s.name }).catch((e: Error) =>
      toast.error('Couldn’t update your subjects', { description: e.message }),
    )

  return (
    <div>
      <SectionTitle title="Subjects" description="What you teach. Admins see it when they book sessions." />
      <section className="rounded-xl border bg-card p-5" aria-labelledby="mine-title">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="mine-title" className="text-sm font-semibold">
            You teach
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {picked.length} {picked.length === 1 ? 'subject' : 'subjects'}
          </span>
        </div>
        {picked.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" data-testid="my-subjects">
            {picked.map((s) => (
              <li key={s.id}>
                <span className="inline-flex h-7 items-center gap-1 rounded-full border bg-muted/50 pr-1 pl-3 text-sm">
                  {s.name}
                  <button
                    type="button"
                    aria-label={`Remove ${s.name}`}
                    className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={() => void toggle(s, false)}
                  >
                    <LuX className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{subjectsLoading ? 'Loading…' : 'None yet. Pick the subjects you teach below.'}</p>
        )}
      </section>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">All subjects</h3>
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search subjects…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search subjects" />
        </InputGroup>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {groups.map((g, i) => {
          const count = g.all.filter((s) => mine.has(s.id)).length
          return (
            <Collapsible key={`${g.id}-${!!q}`} defaultOpen={!!q} className={cn(i > 0 && 'border-t')}>
              <CollapsibleTrigger className="group flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/40">
                <LuChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                <span className="flex-1 text-sm font-medium">{g.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs tabular-nums',
                    count ? 'bg-foreground font-medium text-background' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count} of {g.all.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="grid gap-x-4 border-t bg-muted/20 px-4 py-2 sm:grid-cols-2">
                  {g.shown.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-2 text-sm hover:bg-muted/60">
                        <Checkbox checked={mine.has(s.id)} onCheckedChange={(v) => void toggle(s, v === true)} />
                        {s.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
        {!subjectsLoading && groups.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No subjects match “{search}”.</p> : null}
      </div>
    </div>
  )
}
