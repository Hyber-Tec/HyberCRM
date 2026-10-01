import { type PayPeriod, periodId } from '@shared/pay/periods'
import { formatDateKey } from '@shared/time'
import { Input } from '@/components/ui/input'
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
          <Input type="date" className="w-40" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" className="w-40" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      ) : null}
    </div>
  )
}

export function useDefaultRange(): RangeValue {
  const { current } = usePayPeriods(1)
  return { from: current.start, to: current.end, period: current }
}
