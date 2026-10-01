import { cn } from '@/lib/utils'

export function initials(name: string, max = 2): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, max).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** A branch's logo, or a monogram in the branch accent color. */
export function BrandMark({
  name,
  logoUrl,
  accentColor,
  className,
}: {
  name: string
  logoUrl?: string | null
  accentColor?: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={cn('size-8 shrink-0 rounded-lg border bg-white object-contain', className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground',
        className,
      )}
      style={accentColor ? { backgroundColor: accentColor, color: '#fff' } : undefined}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  )
}
