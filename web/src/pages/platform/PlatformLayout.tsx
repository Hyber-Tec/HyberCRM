import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { HyberMark } from '@/components/app/HyberMark'
import { UserMenu } from '@/components/app/UserMenu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/platform', label: 'Branches', end: true },
  { to: '/platform/admins', label: 'Platform admins', end: false },
]

export function PlatformLayout() {
  useEffect(() => {
    document.title = 'Platform | Hyber CRM'
  }, [])
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/platform" className="flex items-center gap-2">
            <HyberMark withName />
            <Badge variant="secondary">Platform</Badge>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </div>
        <nav className="flex gap-1 border-t px-4 py-1.5 sm:hidden">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cn('rounded-md px-3 py-1 text-sm', isActive ? 'bg-muted font-medium' : 'text-muted-foreground')
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
