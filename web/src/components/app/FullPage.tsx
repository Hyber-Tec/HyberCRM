import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { HyberMark } from './HyberMark'

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Spinner className="size-6" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  )
}

interface Action {
  label: string
  to?: string
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost'
}

export function FullPageMessage({
  title,
  description,
  actions = [],
  children,
}: {
  title: string
  description?: React.ReactNode
  actions?: Action[]
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <HyberMark className="mx-auto mb-6" />
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="mt-2 text-sm text-muted-foreground">{description}</div> : null}
        {children}
        {actions.length > 0 ? (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {actions.map((a) =>
              a.to ? (
                <Button key={a.label} variant={a.variant ?? 'default'} asChild>
                  <Link to={a.to}>{a.label}</Link>
                </Button>
              ) : (
                <Button key={a.label} variant={a.variant ?? 'default'} onClick={a.onClick}>
                  {a.label}
                </Button>
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
