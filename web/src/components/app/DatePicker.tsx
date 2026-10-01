import { useRef, useState } from 'react'
import { LuCalendar, LuX } from 'react-icons/lu'
import { type DateKey, type Weekday, formatDateKey, todayKey } from '@shared/time'
import { useOptionalBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { MonthScroller, type MonthScrollerHandle } from './MonthScroller'

/**
 * A date field whose calendar scrolls vertically through months (owner rule:
 * no ‹ › month arrows anywhere). Replaces the browser's date input.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  isDisabled,
  placeholder = 'Pick a date',
  id,
  disabled,
  className,
  onClear,
  weekStartsOn,
  format = 'medium',
  size = 'default',
  'aria-label': ariaLabel,
}: {
  value: DateKey | null
  onChange: (date: DateKey) => void
  min?: DateKey | null
  max?: DateKey | null
  /** Extra dates that can't be picked (e.g. closed days). */
  isDisabled?: (date: DateKey) => boolean
  placeholder?: string
  id?: string
  disabled?: boolean
  className?: string
  /** Shows a Clear button when there is a value. */
  onClear?: () => void
  weekStartsOn?: Weekday
  format?: 'medium' | 'short' | 'weekdayMedium' | 'long'
  size?: 'default' | 'sm'
  'aria-label'?: string
}) {
  const branch = useOptionalBranch()
  const tz = branch?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const weekStart = weekStartsOn ?? branch?.settings.general.weekStartsOn ?? 'sunday'
  const today = todayKey(tz)
  const [open, setOpen] = useState(false)
  const scroller = useRef<MonthScrollerHandle>(null)
  const [topMonth, setTopMonth] = useState<DateKey>(value ?? today)
  // A year jump for far dates (birthdays): the calendar still scrolls month by month.
  const thisYear = Number(today.slice(0, 4))
  const firstYear = Math.min(Number((min ?? `${thisYear - 90}`).slice(0, 4)), Number((value ?? today).slice(0, 4)))
  const lastYear = Math.max(Number((max ?? `${thisYear + 10}`).slice(0, 4)), Number((value ?? today).slice(0, 4)))
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i)
  const blocked = (d: DateKey) => (!!min && d < min) || (!!max && d > max) || !!isDisabled?.(d)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative w-full', className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size={size === 'sm' ? 'sm' : 'default'}
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn('w-full justify-start font-normal tabular-nums', !value && 'text-muted-foreground', onClear && value && 'pr-8')}
          >
            <LuCalendar className="text-muted-foreground" />
            <span className="truncate">{value ? formatDateKey(value, format) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        {onClear && value && !disabled ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={onClear}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          >
            <LuX className="size-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-72 overflow-hidden p-0" align="start">
        <div className="flex items-center gap-2 border-b px-2 py-1.5">
          <select
            aria-label="Jump to year"
            className="h-7 rounded-md border bg-background px-1.5 text-xs tabular-nums"
            value={topMonth.slice(0, 4)}
            onChange={(e) => scroller.current?.scrollToDate(`${e.target.value}-${topMonth.slice(5, 7)}-01`, { block: 'month', behavior: 'instant' })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{value ? formatDateKey(value, 'weekdayMedium') : ''}</span>
          <Button type="button" variant="ghost" size="xs" onClick={() => scroller.current?.scrollToDate(today, { block: 'month' })}>
            Today
          </Button>
        </div>
        <MonthScroller
          ref={scroller}
          variant="compact"
          anchor={value ?? (min && today < min ? min : today)}
          focusDate={value}
          weekStartsOn={weekStart}
          onTopMonthChange={setTopMonth}
          className="h-72"
          renderDay={(d) => {
            const off = blocked(d)
            const selected = d === value
            return (
              <button
                type="button"
                disabled={off}
                onClick={() => {
                  onChange(d)
                  setOpen(false)
                }}
                aria-label={formatDateKey(d, 'weekdayLong')}
                aria-pressed={selected}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors',
                  selected ? 'bg-foreground font-semibold text-background' : d === today ? 'font-bold text-red-600 ring-1 ring-red-500 ring-inset' : 'hover:bg-muted',
                  off && 'pointer-events-none text-muted-foreground/40 ring-0',
                )}
              >
                {Number(d.slice(8))}
              </button>
            )
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
