import { useState } from 'react'
import { LuPlus, LuStar, LuX } from 'react-icons/lu'
import { ACT_TOPICS, SAT_PSAT_TOPICS, topicKind } from '@shared/sessions/topics'
import { FLAG_LABELS, type StudentFlag } from '@shared/sessions/logs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function StarInput({ value, onChange, disabled, label }: { value: number; onChange?: (v: number) => void; disabled?: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled || !onChange}
          aria-label={label ? `${label} ${n} out of 5` : `${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange?.(n)}
          className="transition-transform enabled:hover:scale-110"
        >
          <LuStar className={cn('size-5', n <= value ? 'fill-amber-400 text-amber-400' : 'text-neutral-300 dark:text-neutral-600')} />
        </button>
      ))}
      <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{value ? `${value}/5` : '—/5'}</span>
    </div>
  )
}

/** Small read-only partial-star display (e.g. 4.2). */
export function StarRating({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums">
      <span className="relative inline-block text-sm leading-none">
        <span className="text-neutral-300">★★★★★</span>
        <span className="absolute inset-0 overflow-hidden text-amber-400" style={{ width: `${(value / 5) * 100}%` }}>
          ★★★★★
        </span>
      </span>
      {value.toFixed(1)}
    </span>
  )
}

export const FLAG_STYLE: Record<StudentFlag, string> = {
  on_track: 'border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40',
  needs_attention: 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40',
  at_risk: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40',
}

export function FlagBadge({ flag }: { flag: StudentFlag | '' | null | undefined }) {
  if (!flag) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="outline" className={FLAG_STYLE[flag]}>
      {FLAG_LABELS[flag]}
    </Badge>
  )
}

export function HomeworkBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase()
  const cls =
    s === 'completed'
      ? 'border-green-200 bg-green-50 text-green-800'
      : s.includes('partial')
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : s === 'not done'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-border bg-muted text-muted-foreground'
  return status ? (
    <Badge variant="outline" className={cls}>
      {status}
    </Badge>
  ) : (
    <span className="text-muted-foreground">—</span>
  )
}

/** SAT/PSAT: Section › Domain › Skill. ACT: Subject › Category. Partial paths are allowed. */
export function TopicPicker({ sessionType, value, onChange, disabled }: { sessionType: string; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const kind = topicKind(sessionType)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [c, setC] = useState('')
  const add = () => {
    const path = [a, b, c].filter(Boolean).join(' > ')
    if (path && !value.includes(path)) onChange([...value, path])
    setA('')
    setB('')
    setC('')
  }
  const level1 = kind === 'sat' ? Object.keys(SAT_PSAT_TOPICS) : Object.keys(ACT_TOPICS)
  const level2 = kind === 'sat' ? (a ? Object.keys(SAT_PSAT_TOPICS[a] ?? {}) : []) : a ? ACT_TOPICS[a] ?? [] : []
  const level3 = kind === 'sat' && a && b ? SAT_PSAT_TOPICS[a]?.[b] ?? [] : []
  const sel = (val: string, set: (v: string) => void, options: string[], placeholder: string, reset?: () => void) => (
    <Select
      value={val || undefined}
      disabled={disabled || options.length === 0}
      onValueChange={(v) => {
        set(v)
        reset?.()
      }}
    >
      <SelectTrigger className="min-w-36 flex-1">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  return (
    <div className="space-y-2">
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              {!disabled ? (
                <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
                  <LuX className="size-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-2">
          {sel(a, setA, level1, kind === 'sat' ? 'Section…' : 'Subject…', () => (setB(''), setC('')))}
          {sel(b, setB, level2, kind === 'sat' ? 'Domain…' : 'Category…', () => setC(''))}
          {kind === 'sat' ? sel(c, setC, level3, 'Skill…') : null}
          <Button type="button" variant="outline" size="sm" disabled={!a} onClick={add}>
            <LuPlus /> Add
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Red required marker (True Education's `*`). */
export function RequiredMark() {
  return (
    <span className="text-red-600" aria-hidden="true">
      *
    </span>
  )
}

export function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

/**
 * One-click choice among a few options (session type, homework status, flag):
 * radio buttons shown as chips.
 */
export function ChipGroup({
  value,
  options,
  onChange,
  label,
  disabled,
  className,
}: {
  value: string
  options: { value: string; label: string; activeClass?: string }[]
  onChange: (v: string) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60',
              on ? (o.activeClass ?? 'border-foreground bg-foreground text-background') : 'bg-background text-foreground hover:bg-muted',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
