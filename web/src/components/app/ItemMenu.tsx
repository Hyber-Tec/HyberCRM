import { Fragment } from 'react'
import type { IconType } from 'react-icons'
import { LuEllipsis } from 'react-icons/lu'
import { Slot } from 'radix-ui'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * One menu of actions for an item (a session, a student, a payroll row…),
 * shown as a right-click menu (`ContextMenuFor`) and as a "⋯" button
 * (`ItemMenuButton`, for touch and discoverability) from the same list.
 */
export type MenuEntry =
  | {
      kind?: 'item'
      label: string
      icon?: IconType
      onSelect: () => void
      destructive?: boolean
      disabled?: boolean
      /** Keyboard hint shown on the right, e.g. "⌘C". */
      shortcut?: string
      separatorBefore?: boolean
    }
  | { kind: 'sub'; label: string; icon?: IconType; entries: MenuEntry[]; disabled?: boolean; separatorBefore?: boolean }
  | {
      kind: 'radio'
      value: string
      options: { value: string; label: string; swatch?: { bg: string; border: string }; disabled?: boolean }[]
      onChange: (value: string) => void
      separatorBefore?: boolean
    }
  | { kind: 'label'; label: string; tone?: 'muted' | 'danger'; separatorBefore?: boolean }

/** Drops empty and falsy entries so callers can write `cond && {...}`. */
export function menu(...entries: (MenuEntry | false | null | undefined)[]): MenuEntry[] {
  return entries.filter((e): e is MenuEntry => !!e && !(e.kind === 'sub' && e.entries.length === 0))
}

/** The context-menu and dropdown parts share their props, so one renderer draws both. */
interface Primitives {
  Item: React.ElementType
  Label: React.ElementType
  Separator: React.ElementType
  Shortcut: React.ElementType
  Sub: React.ElementType
  SubTrigger: React.ElementType
  SubContent: React.ElementType
  RadioGroup: React.ElementType
  RadioItem: React.ElementType
}

const CONTEXT: Primitives = {
  Item: ContextMenuItem,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
  Shortcut: ContextMenuShortcut,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
}

const DROPDOWN: Primitives = {
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  Shortcut: DropdownMenuShortcut,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
}

function Entries({ entries, p }: { entries: MenuEntry[]; p: Primitives }) {
  return entries.map((e, i) => {
    const key = `${e.kind ?? 'item'}-${'label' in e ? e.label : i}-${i}`
    const sep = e.separatorBefore && i > 0 ? <p.Separator /> : null
    if (e.kind === 'label') {
      return (
        <Fragment key={key}>
          {sep}
          <p.Label className={cn('text-xs font-normal', e.tone === 'danger' ? 'font-medium text-red-600' : 'text-muted-foreground')}>{e.label}</p.Label>
        </Fragment>
      )
    }
    if (e.kind === 'radio') {
      return (
        <Fragment key={key}>
          {sep}
          <p.RadioGroup value={e.value} onValueChange={e.onChange}>
            {e.options.map((o) => (
              <p.RadioItem key={o.value} value={o.value} disabled={o.disabled}>
                {o.swatch ? <span className="size-2.5 rounded-full border" style={{ backgroundColor: o.swatch.bg, borderColor: o.swatch.border }} /> : null}
                {o.label}
              </p.RadioItem>
            ))}
          </p.RadioGroup>
        </Fragment>
      )
    }
    if (e.kind === 'sub') {
      const Icon = e.icon
      return (
        <Fragment key={key}>
          {sep}
          <p.Sub>
            <p.SubTrigger disabled={e.disabled}>
              {Icon ? <Icon /> : null}
              {e.label}
            </p.SubTrigger>
            <p.SubContent className="max-h-80 min-w-48 overflow-y-auto">
              <Entries entries={e.entries} p={p} />
            </p.SubContent>
          </p.Sub>
        </Fragment>
      )
    }
    const Icon = e.icon
    return (
      <Fragment key={key}>
        {sep}
        <p.Item variant={e.destructive ? 'destructive' : 'default'} disabled={e.disabled} onSelect={e.onSelect}>
          {Icon ? <Icon /> : null}
          {e.label}
          {e.shortcut ? <p.Shortcut>{e.shortcut}</p.Shortcut> : null}
        </p.Item>
      </Fragment>
    )
  })
}

/**
 * Right-click menu around `children` (a single element). Other props and the ref
 * pass through to that element, so a tooltip trigger can wrap this. With no
 * entries it renders the element alone.
 */
export function ContextMenuFor({
  entries,
  children,
  className,
  disabled,
  ...rest
}: {
  entries: MenuEntry[]
  children: React.ReactElement
  className?: string
  disabled?: boolean
  ref?: React.Ref<HTMLElement>
} & Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  if (disabled || entries.length === 0) return <Slot.Root {...rest}>{children}</Slot.Root>
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild {...rest}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className={cn('w-60', className)}>
        <Entries entries={entries} p={CONTEXT} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The same menu behind a "⋯" button. */
export function ItemMenuButton({
  entries,
  label = 'More actions',
  className,
  align = 'end',
}: {
  entries: MenuEntry[]
  label?: string
  className?: string
  align?: 'start' | 'end'
}) {
  if (entries.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-8', className)} aria-label={label} onClick={(e) => e.stopPropagation()}>
          <LuEllipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60" onClick={(e) => e.stopPropagation()}>
        <Entries entries={entries} p={DROPDOWN} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
