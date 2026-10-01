import type { IconType } from 'react-icons'
import { LuChevronRight } from 'react-icons/lu'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

export type CardTone = 'default' | 'alert' | 'warn'

const TILE: Record<CardTone, string> = {
  default: 'bg-muted text-foreground',
  alert: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
}

const COUNT: Record<CardTone, string> = {
  default: 'bg-muted text-muted-foreground',
  alert: 'bg-red-600 text-white',
  warn: 'bg-amber-500 text-white',
}

/** Dashboard card: icon tile, title, count chip, optional "Live" tag and a header link. */
export function HomeCard({
  icon: Icon,
  title,
  count,
  tone = 'default',
  live,
  link,
  children,
  bodyClassName,
  testId,
}: {
  icon: IconType
  title: string
  count: number
  tone?: CardTone
  live?: boolean
  link?: { label: string; to: string }
  children: React.ReactNode
  bodyClassName?: string
  testId?: string
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0" data-testid={testId}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', TILE[tone])}>
          <Icon className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', COUNT[tone])}>{count}</span>
          {live ? <LiveTag /> : null}
        </div>
        {link ? (
          <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" asChild>
            <Link to={link.to}>
              {link.label}
              <LuChevronRight />
            </Link>
          </Button>
        ) : null}
      </div>
      <div className={cn('max-h-[360px] overflow-y-auto', bodyClassName)}>{children}</div>
    </Card>
  )
}

export function LiveTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400', className)}>
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      Live
    </span>
  )
}

export type PillTone = 'blue' | 'green' | 'amber' | 'red' | 'slate'

const PILL: Record<PillTone, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
  slate: 'bg-muted text-muted-foreground',
}

export function Pill({ tone, children, className }: { tone: PillTone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', PILL[tone], className)}>{children}</span>
}

export function DayHeader({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        'sticky top-0 z-[1] border-b bg-card/95 px-4 py-1.5 text-[11px] font-semibold tracking-wide uppercase backdrop-blur',
        highlight ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground',
      )}
    >
      {label}
    </div>
  )
}

export function SubHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-3 pb-1 text-xs font-semibold text-blue-600 dark:text-blue-400">{children}</div>
}

export function EmptyRow({ icon: Icon, children }: { icon?: IconType; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
      {Icon ? <Icon className="size-4" /> : null}
      {children}
    </div>
  )
}

export interface RowAction {
  label: string
  onSelect: () => void
  destructive?: boolean
  separatorBefore?: boolean
}

/**
 * A clickable list row. With `to` it is a real link (Cmd/Ctrl/middle click
 * opens a new tab); with `onOpen` it is a button. `actions` add a right-click menu.
 */
export function HomeRow({
  to,
  onOpen,
  actions,
  className,
  children,
}: {
  to?: string
  onOpen?: () => void
  actions?: RowAction[]
  className?: string
  children: React.ReactNode
}) {
  const cls = cn('flex w-full items-center gap-3 border-b px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none', className)
  const row = to ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onOpen}>
      {children}
    </button>
  )
  if (!actions?.length) return row
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {actions.map((a) => (
          <MenuEntry key={a.label} action={a} />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function MenuEntry({ action }: { action: RowAction }) {
  return (
    <>
      {action.separatorBefore ? <ContextMenuSeparator /> : null}
      <ContextMenuItem variant={action.destructive ? 'destructive' : 'default'} onSelect={action.onSelect}>
        {action.label}
      </ContextMenuItem>
    </>
  )
}

export function openInNewTab(path: string) {
  window.open(path, '_blank', 'noopener')
}
