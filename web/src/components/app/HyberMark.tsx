import { cn } from '@/lib/utils'

/** The Hyber CRM product mark (used outside branch context). */
export function HyberMark({ className, withName = false }: { className?: string; withName?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M10 8v16M22 8v16M10 16h12"
          className="stroke-primary-foreground"
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {withName ? <span className="text-lg font-semibold tracking-tight">Hyber CRM</span> : null}
    </div>
  )
}
