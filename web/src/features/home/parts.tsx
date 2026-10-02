import { initials } from '@/components/app/BrandMark'
import { cn } from '@/lib/utils'

/** A person's initials in their calendar color (or a neutral tint). */
export function PersonDot({ name, color, size = 'sm', className }: { name: string; color?: string | null; size?: 'xs' | 'sm'; className?: string }) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'xs' ? 'size-4 text-[8px]' : 'size-7 text-[11px]',
        !color && 'bg-muted text-muted-foreground',
        className,
      )}
      style={color ? { backgroundColor: `${color}24`, color } : undefined}
    >
      {initials(name)}
    </span>
  )
}

export type Tone = 'muted' | 'live' | 'done' | 'warn' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  muted: 'bg-muted text-muted-foreground',
  live: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
  done: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 ring-inset dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900',
  warn: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 ring-inset dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  danger: 'bg-red-50 text-red-700 ring-1 ring-red-200 ring-inset dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  info: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200 ring-inset dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900',
}

export function StatePill({ tone, children, pulse, title }: { tone: Tone; children: React.ReactNode; pulse?: boolean; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone])}>
      {pulse ? <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
      {children}
    </span>
  )
}

/** "A", "A and B", "A, B and 3 more". */
export function nameList(names: string[], max = 2): string {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}`
  return shown[0] ?? ''
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}
