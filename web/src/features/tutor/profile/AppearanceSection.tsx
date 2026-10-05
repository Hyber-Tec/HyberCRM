import { LuCheck } from 'react-icons/lu'
import { type ThemeSetting, useTheme } from '@/components/app/theme'
import { cn } from '@/lib/utils'
import { SectionTitle } from './parts'

const OPTIONS: { value: ThemeSetting; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
  { value: 'system', label: 'System', hint: 'Follows this device' },
]

/** A small drawing of the app in one theme (the system option shows both halves). */
function Preview({ mode }: { mode: ThemeSetting }) {
  const pane = (dark: boolean, className?: string) => (
    <div className={cn('flex h-full gap-1.5 p-2', dark ? 'bg-neutral-900' : 'bg-white', className)}>
      <div className={cn('w-1/4 space-y-1 rounded-sm p-1', dark ? 'bg-neutral-800' : 'bg-neutral-100')}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn('h-1.5 rounded-full', dark ? 'bg-neutral-600' : 'bg-neutral-300')} />
        ))}
      </div>
      <div className="flex-1 space-y-1.5">
        <div className={cn('h-2 w-2/3 rounded-full', dark ? 'bg-neutral-500' : 'bg-neutral-400')} />
        <div className={cn('h-5 rounded-sm', dark ? 'bg-emerald-900/70' : 'bg-emerald-100')} />
        <div className={cn('h-5 rounded-sm', dark ? 'bg-sky-900/70' : 'bg-sky-100')} />
      </div>
    </div>
  )
  if (mode === 'system') {
    return (
      <div className="relative h-full">
        {pane(false)}
        <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">{pane(true)}</div>
      </div>
    )
  }
  return pane(mode === 'dark')
}

/** Profile → Appearance: light, dark or the device's setting (remembered on this device). */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <SectionTitle title="Appearance" description="How the website looks on this device." />
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3 sm:gap-4">
        {OPTIONS.map((o) => {
          const on = theme === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTheme(o.value)}
              className={cn(
                'group overflow-hidden rounded-xl border bg-card text-left transition-shadow',
                on ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:shadow-md',
              )}
            >
              <div className="aspect-[16/10] border-b">
                <Preview mode={o.value} />
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{o.hint}</span>
                </span>
                {on ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                    <LuCheck className="size-3" />
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
