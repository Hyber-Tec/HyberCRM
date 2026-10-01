import { useState } from 'react'
import { LuCheck, LuChevronsUpDown, LuPlus, LuX } from 'react-icons/lu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface PickerOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}

/** Searchable single-select. */
export function OptionPicker({
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  searchPlaceholder = 'Search…',
  id,
  disabled,
  className,
  allowCreate,
}: {
  value: string | null
  onChange: (value: string) => void
  options: PickerOption[]
  placeholder?: string
  searchPlaceholder?: string
  id?: string
  disabled?: boolean
  className?: string
  /** Offer the typed text as a new value when nothing matches it exactly. */
  allowCreate?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const typed = search.trim()
  const canCreate = !!allowCreate && !!typed && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase())
  const selected = options.find((o) => o.value === value) ?? (allowCreate && value ? { value, label: value } : undefined)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <LuChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            {canCreate ? null : <CommandEmpty>Nothing found.</CommandEmpty>}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ''} ${o.value}`}
                  disabled={o.disabled}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <LuCheck className={cn('size-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
                </CommandItem>
              ))}
              {canCreate ? (
                <CommandItem
                  value={`__create__ ${typed}`}
                  onSelect={() => {
                    onChange(typed)
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <LuPlus className="size-4" />
                  <span className="flex-1 truncate">Add “{typed}”</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Searchable multi-select with removable chips. */
export function MultiOptionPicker({
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  searchPlaceholder = 'Search…',
  id,
}: {
  value: string[]
  onChange: (value: string[]) => void
  options: PickerOption[]
  placeholder?: string
  searchPlaceholder?: string
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const byValue = new Map(options.map((o) => [o.value, o]))
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 pr-1">
              {byValue.get(v)?.label ?? v}
              <button
                type="button"
                className="rounded-sm opacity-60 hover:opacity-100"
                onClick={() => toggle(v)}
                aria-label={`Remove ${byValue.get(v)?.label ?? v}`}
              >
                <LuX className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} variant="outline" role="combobox" className="w-full justify-between font-normal text-muted-foreground">
            {placeholder}
            <LuChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>Nothing found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ''} ${o.value}`} onSelect={() => toggle(o.value)}>
                    <LuCheck className={cn('size-4', value.includes(o.value) ? 'opacity-100' : 'opacity-0')} />
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
