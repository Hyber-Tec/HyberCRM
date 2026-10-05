import type { IconType } from 'react-icons'
import { LuBell, LuBookOpen, LuChevronLeft, LuChevronRight, LuKeyRound, LuLogOut, LuSunMoon, LuUserRound, LuWallet } from 'react-icons/lu'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { formatDateKey } from '@shared/time'
import type { Staff, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { StaffStatusBadge } from '@/components/app/StatusBadge'
import { useTheme } from '@/components/app/theme'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { NOTIFICATION_SWITCHES, prefOn } from '../api'
import { NOT_LINKED, useMyStaff } from '../hooks'
import { AccountSection } from './AccountSection'
import { MeAvatar } from './parts'

interface Section {
  to: string
  label: string
  icon: IconType
  /** Short value on the right of the phone list ("5", "Light"). */
  value?: (ctx: { staff: WithId<Staff> | null; theme: string }) => string | null
}

const SECTIONS: Section[] = [
  { to: 'account', label: 'Account details', icon: LuUserRound },
  { to: 'subjects', label: 'Subjects', icon: LuBookOpen, value: ({ staff }) => (staff ? String(staff.subjectIds?.length ?? 0) : null) },
  {
    to: 'notifications',
    label: 'Notifications',
    icon: LuBell,
    value: ({ staff }) => {
      if (!staff) return null
      const on = NOTIFICATION_SWITCHES.filter((s) => prefOn(staff.notificationPrefs, s.key)).length
      return on === NOTIFICATION_SWITCHES.length ? 'All on' : on === 0 ? 'Off' : `${on} of ${NOTIFICATION_SWITCHES.length} on`
    },
  },
  { to: 'security', label: 'Sign-in & security', icon: LuKeyRound },
  { to: 'appearance', label: 'Appearance', icon: LuSunMoon, value: ({ theme }) => theme[0].toUpperCase() + theme.slice(1) },
]

/**
 * Profile: the tutor's own pages. Computers get the sections in a side list;
 * phones get the list on its own (as in the phone app) and open each section.
 */
export function ProfilePage() {
  const { branchId } = useBranch()
  const isMobile = useIsMobile()
  const { pathname } = useLocation()
  const { data: staff, loading } = useMyStaff()
  const base = `/${branchId}/tutor/profile`
  const atIndex = pathname.replace(/\/$/, '') === base
  const current = SECTIONS.find((s) => pathname.startsWith(`${base}/${s.to}`))

  if (isMobile) {
    if (atIndex) {
      return (
        <div className="mx-auto w-full max-w-lg">
          <ProfileHeader staff={staff} loading={loading} />
          <ProfileList base={base} staff={staff} />
        </div>
      )
    }
    return (
      <div className="mx-auto w-full max-w-lg">
        <Link to={base} className="-ml-1 mb-3 inline-flex items-center gap-0.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <LuChevronLeft className="size-4" /> Profile
        </Link>
        <Outlet />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <ProfileHeader staff={staff} loading={loading} />
      {/* Computers: the sections in a side list. Tablets: a row of tabs above the section. */}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Profile" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
          {SECTIONS.map((s) => {
            const active = current ? current.to === s.to : s.to === 'account'
            const value = s.to === 'subjects' ? s.value?.({ staff, theme: '' }) : null
            return (
              <NavLink
                key={s.to}
                to={`${base}/${s.to}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm whitespace-nowrap transition-colors',
                  active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <s.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{s.label}</span>
                {value ? <span className="text-xs text-muted-foreground tabular-nums">{value}</span> : null}
              </NavLink>
            )
          })}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** `/tutor/profile`: the account details on computers (phones show the list instead). */
export function ProfileIndex() {
  const isMobile = useIsMobile()
  return isMobile ? null : <AccountSection />
}

function ProfileHeader({ staff, loading }: { staff: WithId<Staff> | null; loading: boolean }) {
  const { branch, viewAs } = useBranch()
  const { email } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    )
  }
  if (!staff) return <p className="text-sm text-muted-foreground">{NOT_LINKED}</p>
  const since = staff.startDate ? ` since ${formatDateKey(staff.startDate, 'monthYear')}` : ''
  return (
    <header className="flex items-center gap-4">
      <MeAvatar staff={staff} className="size-16 text-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{staff.name}</h1>
          <StaffStatusBadge status={staff.status} />
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          Tutor at {branch.name}
          {since}
        </p>
        {/* The sign-in email (a previewing Super Admin sees the tutor's own). */}
        <p className="truncate text-sm text-muted-foreground">{viewAs ? staff.email : (email ?? staff.email)}</p>
      </div>
    </header>
  )
}

/** Phones: the sections as grouped rows, then Payroll and Sign out (the phone app's Profile). */
function ProfileList({ base, staff }: { base: string; staff: WithId<Staff> | null }) {
  const { branchId } = useBranch()
  const { theme } = useTheme()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const row = (to: string, label: string, Icon: IconType, value?: string | null) => (
    <li key={to}>
      <Link to={to} className="flex min-h-12 items-center gap-3 px-4 py-2.5 active:bg-muted/70" data-testid={`profile-row-${label.toLowerCase().replace(/\W+/g, '-')}`}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <Icon className="size-4" />
        </span>
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        {value ? <span className="text-sm text-muted-foreground tabular-nums">{value}</span> : null}
        <LuChevronRight className="size-4 text-muted-foreground/70" />
      </Link>
    </li>
  )
  const value = (s: Section) => s.value?.({ staff, theme }) ?? null
  const [account, subjects, notifications, security, appearance] = SECTIONS
  return (
    <div className="mt-6 space-y-6">
      <section>
        <h2 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Your account</h2>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {row(`${base}/${account.to}`, account.label, account.icon)}
          {row(`${base}/${subjects.to}`, 'My subjects', subjects.icon, value(subjects))}
          {row(`/${branchId}/tutor/payroll`, 'Payroll', LuWallet)}
        </ul>
      </section>
      <section>
        <h2 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Settings</h2>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {row(`${base}/${notifications.to}`, notifications.label, notifications.icon, value(notifications))}
          {row(`${base}/${security.to}`, security.label, security.icon)}
          {row(`${base}/${appearance.to}`, appearance.label, appearance.icon, value(appearance))}
        </ul>
      </section>
      <button
        type="button"
        onClick={async () => {
          await signOut()
          navigate('/')
        }}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-card text-[15px] font-medium text-red-600 active:bg-muted/70 dark:text-red-400"
      >
        <LuLogOut className="size-4" /> Sign out
      </button>
    </div>
  )
}
