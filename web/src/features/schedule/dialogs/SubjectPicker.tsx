import { useMemo, useState } from 'react'
import { LuCheck, LuChevronsUpDown } from 'react-icons/lu'
import { sortSubjects } from '@shared/subjects'
import type { Subject, WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSubjectCategories } from '@/features/data/hooks'
import { cn } from '@/lib/utils'

/**
 * Pick a subject from the branch's list, grouped by category (the chosen tutor's
 * subjects first), or type a free-text subject ("Use “…”"). The tutor's subjects
 * are a hint only: any subject can be booked with any tutor.
 */
export function SubjectPicker({
  subjects,
  value,
  onChange,
  disabled,
  id,
  tutor,
}: {
  subjects: WithId<Subject>[]
  value: { subjectId: string | null; subject: string }
  onChange: (v: { subjectId: string | null; subject: string }) => void
  disabled?: boolean
  id?: string
  /** The session's tutor, to list the subjects they teach first. */
  tutor?: { name: string; subjectIds: readonly string[] } | null
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: categories } = useSubjectCategories()
  const typed = search.trim()
  const exact = subjects.some((s) => s.name.toLowerCase() === typed.toLowerCase())

  const groups = useMemo(() => {
    const sorted = sortSubjects(subjects, categories)
    const out: { key: string; heading: string; items: WithId<Subject>[] }[] = []
    const theirs = new Set(tutor?.subjectIds ?? [])
    const mine = sorted.filter((s) => theirs.has(s.id))
    if (mine.length) out.push({ key: '__tutor', heading: `${tutor?.name.split(' ')[0] ?? 'Tutor'}’s subjects`, items: mine })
    for (const c of categories) {
      const items = sorted.filter((s) => s.categoryId === c.id)
      if (items.length) out.push({ key: c.id, heading: c.name, items })
    }
    const known = new Set(categories.map((c) => c.id))
    const rest = sorted.filter((s) => !known.has(s.categoryId))
    if (rest.length) out.push({ key: '__other', heading: 'Uncategorized', items: rest })
    return out
  }, [subjects, categories, tutor])

  const pick = (v: { subjectId: string | null; subject: string }) => {
    onChange(v)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" disabled={disabled} className={cn('w-full justify-between font-normal', !value.subject && 'text-muted-foreground')}>
          <span className="truncate">{value.subject || 'Choose or type a subject…'}</span>
          <LuChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type a subject…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-80">
            <CommandEmpty>No subjects found.</CommandEmpty>
            {typed && !exact ? (
              <CommandGroup>
                <CommandItem value={`__use__${typed}`} onSelect={() => pick({ subjectId: null, subject: typed })}>
                  <span className="text-indigo-700 dark:text-indigo-300">Use “{typed}”</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {groups.map((g) => (
              <CommandGroup key={g.key} heading={g.heading}>
                {g.items.map((s) => (
                  <CommandItem key={`${g.key}-${s.id}`} value={`${s.name}__${g.key}`} keywords={[s.name]} onSelect={() => pick({ subjectId: s.id, subject: s.name })}>
                    <LuCheck className={cn('size-4', value.subjectId === s.id ? 'opacity-100' : 'opacity-0')} />
                    {s.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
