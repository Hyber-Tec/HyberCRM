import { useState } from 'react'
import { LuCheck, LuChevronsUpDown } from 'react-icons/lu'
import type { Subject, WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** Pick a subject from the catalog, or type a free-text subject ("Use “…”"). */
export function SubjectPicker({
  subjects,
  value,
  onChange,
  disabled,
  id,
}: {
  subjects: WithId<Subject>[]
  value: { subjectId: string | null; subject: string }
  onChange: (v: { subjectId: string | null; subject: string }) => void
  disabled?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const typed = search.trim()
  const exact = subjects.some((s) => s.name.toLowerCase() === typed.toLowerCase())
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" disabled={disabled} className={cn('w-full justify-between font-normal', !value.subject && 'text-muted-foreground')}>
          <span className="truncate">{value.subject || 'Choose or type a subject…'}</span>
          <LuChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type a subject…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No subjects found.</CommandEmpty>
            {typed && !exact ? (
              <CommandGroup>
                <CommandItem
                  value={`__use__${typed}`}
                  onSelect={() => {
                    onChange({ subjectId: null, subject: typed })
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <span className="text-indigo-700 dark:text-indigo-300">Use “{typed}”</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup>
              {subjects.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => {
                    onChange({ subjectId: s.id, subject: s.name })
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <LuCheck className={cn('size-4', value.subjectId === s.id ? 'opacity-100' : 'opacity-0')} />
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
