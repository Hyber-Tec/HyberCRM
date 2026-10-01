import { useMemo } from 'react'
import { formatMinutes } from '@shared/time'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** Select a time of day as minutes after midnight. */
export function TimeSelect({
  value,
  onChange,
  step = 30,
  min = 0,
  max = 1440,
  id,
  disabled,
  className,
}: {
  value: number
  onChange: (minutes: number) => void
  step?: number
  min?: number
  max?: number
  id?: string
  disabled?: boolean
  className?: string
}) {
  const options = useMemo(() => {
    const out: number[] = []
    for (let m = min; m <= max; m += step) out.push(m)
    if (!out.includes(value)) out.push(value)
    return out.sort((a, b) => a - b)
  }, [min, max, step, value])
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger id={id} className={cn('w-32', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((m) => (
          <SelectItem key={m} value={String(m)}>
            {m === 1440 ? '12:00 AM (midnight)' : formatMinutes(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
