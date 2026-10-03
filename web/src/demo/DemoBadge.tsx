import { useState } from 'react'
import { LuArrowUpRight, LuX } from 'react-icons/lu'

/** The full-page demo's corner note: it's a sandbox, and the way back to the website. */
export function DemoBadge() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 print:hidden">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/95 py-1 pr-1 pl-3 text-xs shadow-lg backdrop-blur">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Live demo
        </span>
        <span className="hidden text-muted-foreground sm:inline">· Try anything. Changes stay in this tab.</span>
        <a href="/" className="ml-1 flex items-center gap-0.5 rounded-full bg-foreground px-2.5 py-1 font-medium text-background hover:bg-foreground/90">
          hybercrm.com <LuArrowUpRight className="size-3" />
        </a>
        <button type="button" aria-label="Hide" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setOpen(false)}>
          <LuX className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
