import { type PayPeriod, periodId } from '@shared/pay/periods'
import { formatDateKey } from '@shared/time'
import { DatePicker } from '@/components/app/DatePicker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePayPeriods } from './hooks'

export interface RangeValue {
  from: string
  to: string
  /** Set when the range is exactly a pay period. */
  period: PayPeriod | null
}

export function periodLabel(p: PayPeriod) {
  return `${formatDateKey(p.start, 'monthDay')} – ${formatDateKey(p.end, 'medium')}`
}

export function PeriodPicker({ value, onChange, lockedThrough }: { value: RangeValue; onChange: (v: RangeValue) => void; lockedThrough?: string | null }) {
  const { current, recent } = usePayPeriods(12)
  const selected = value.period ? periodId(value.period) : 'custom'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={selected}
        onValueChange={(v) => {
          if (v === 'custom') onChange({ ...value, period: null })
          else {
            const p = recent.find((x) => periodId(x) === v)!
            onChange({ from: p.start, to: p.end, period: p })
          }
        }}
      >
        <SelectTrigger className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {recent.map((p) => (
            <SelectItem key={periodId(p)} value={periodId(p)}>
              {periodLabel(p)}
              {periodId(p) === periodId(current) ? ' (current)' : ''}
              {lockedThrough && p.end <= lockedThrough ? ' · locked' : ''}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom range…</SelectItem>
        </SelectContent>
      </Select>
      {!value.period ? (
        <>
          <DatePicker className="w-40" value={value.from || null} onChange={(d) => onChange({ ...value, from: d })} aria-label="From" />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker className="w-40" value={value.to || null} min={value.from || null} onChange={(d) => onChange({ ...value, to: d })} aria-label="To" />
        </>
      ) : null}
    </div>
  )
}

export function useDefaultRange(): RangeValue {
  const { current } = usePayPeriods(1)
  return { from: current.start, to: current.end, period: current }
}
