import { useMemo, useState } from 'react'
import { LuCheck, LuChevronsUpDown } from 'react-icons/lu'
import { COMMON_TIME_ZONES } from '@shared/time'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

function allZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')
  } catch {
    return [...COMMON_TIME_ZONES]
  }
}

export function TimeZonePicker({
  value,
  onChange,
  id,
  disabled,
}: {
  value: string
  onChange: (tz: string) => void
  id?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const zones = useMemo(allZones, [])
  const others = useMemo(() => zones.filter((z) => !COMMON_TIME_ZONES.includes(z)), [zones])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" disabled={disabled} className="w-full justify-between font-normal">
          {value || 'Choose a time zone'}
          <LuChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search time zones…" />
          <CommandList>
            <CommandEmpty>No time zone found.</CommandEmpty>
            {[
              { heading: 'Common', items: COMMON_TIME_ZONES },
              { heading: 'All time zones', items: others },
            ].map((g) => (
              <CommandGroup key={g.heading} heading={g.heading}>
                {g.items.map((z) => (
                  <CommandItem
                    key={z}
                    value={z}
                    onSelect={() => {
                      onChange(z)
                      setOpen(false)
                    }}
                  >
                    <LuCheck className={cn('size-4', value === z ? 'opacity-100' : 'opacity-0')} />
                    {z}
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
