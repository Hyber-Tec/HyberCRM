import { useMemo, useState } from 'react'
import { LuChevronRight, LuSearch } from 'react-icons/lu'
import { COL } from '@shared/paths'
import type { Staff } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { useSubjectCategories, useSubjects } from '@/features/data/hooks'
import { setQualification } from '@/features/employees/api'
import { branchDocRef, useDoc } from '@/lib/firestore'

export function MySubjectsPage() {
  const { branchId, staffId, actor } = useBranch()
  const ref = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  const { data: staff } = useDoc<Staff>(ref)
  const { data: subjects } = useSubjects()
  const { data: categories } = useSubjectCategories()
  const [search, setSearch] = useState('')
  const mine = new Set(staff?.subjectIds ?? [])
  const q = search.trim().toLowerCase()

  const groups = [
    ...categories.map((c) => ({ id: c.id, name: c.name })),
    { id: '', name: 'Uncategorized' },
  ]
    .map((g) => ({
      ...g,
      subjects: subjects.filter((s) => (g.id ? s.categoryId === g.id : !categories.some((c) => c.id === s.categoryId)) && (!q || s.name.toLowerCase().includes(q))),
    }))
    .filter((g) => g.subjects.length > 0)

  if (!staffId) return <p className="text-sm text-muted-foreground">Your employee record isn’t linked yet. Ask an admin.</p>

  return (
    <div className="max-w-3xl">
      <PageHeader title="My Subjects" description={`You are qualified to teach ${mine.size} subjects. Tap a subject to change it.`} />
      <InputGroup className="mb-4 sm:w-72">
        <InputGroupAddon>
          <LuSearch />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search subjects…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </InputGroup>
      <div className="space-y-2">
        {groups.map((g) => {
          const count = g.subjects.filter((s) => mine.has(s.id)).length
          return (
            <Collapsible key={`${g.id}-${!!q}`} defaultOpen={!!q}>
              <Card className="gap-0 py-0">
                <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left">
                  <LuChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
                  <span className="flex-1 font-medium">{g.name}</span>
                  <Badge variant={count ? 'default' : 'secondary'}>
                    {count}/{g.subjects.length}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="divide-y border-t">
                    {g.subjects.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                        <Checkbox
                          checked={mine.has(s.id)}
                          onCheckedChange={(v) => void setQualification(branchId, actor, staffId, s.id, v === true)}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
