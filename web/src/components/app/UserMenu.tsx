import { LuBuilding2, LuChevronsUpDown, LuLayoutGrid, LuLogOut, LuShieldCheck } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { PORTAL_LABELS, type Role } from '@shared/roles'
import { useAuth } from '@/auth/AuthProvider'
import { useOptionalBranch } from '@/branch/BranchProvider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { initials } from './BrandMark'
import { ThemeSubmenu } from './ThemeToggle'

export function rememberPortal(branchId: string, role: Role) {
  try {
    localStorage.setItem(`hyber:portal:${branchId}`, role)
  } catch {
    /* storage unavailable */
  }
}

export function rememberedPortal(branchId: string): Role | null {
  try {
    return (localStorage.getItem(`hyber:portal:${branchId}`) as Role | null) ?? null
  } catch {
    return null
  }
}

export function UserAvatar({ className }: { className?: string }) {
  const { user } = useAuth()
  const name = user?.displayName || user?.email || '?'
  return (
    <Avatar className={className}>
      {user?.photoURL ? <AvatarImage src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

export function UserMenu({ variant = 'header', portal }: { variant?: 'header' | 'sidebar'; portal?: Role }) {
  const { user, email, isSuperAdmin, memberships, signOut } = useAuth()
  const branch = useOptionalBranch()
  const navigate = useNavigate()
  const name = branch?.member?.displayName || user?.displayName || email || ''

  const trigger =
    variant === 'sidebar' ? (
      <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
        <UserAvatar className="size-8 rounded-lg" />
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </div>
        <LuChevronsUpDown className="ml-auto size-4" />
      </SidebarMenuButton>
    ) : (
      <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
        <UserAvatar className="size-8" />
      </Button>
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60" align="end" side={variant === 'sidebar' ? 'top' : 'bottom'}>
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        {branch && branch.roles.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Switch portal</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={portal}
              onValueChange={(r) => {
                rememberPortal(branch.branchId, r as Role)
                navigate(`/${branch.branchId}/${r}`)
              }}
            >
              {branch.roles.map((r) => (
                <DropdownMenuRadioItem key={r} value={r}>
                  {PORTAL_LABELS[r]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {memberships.length > 1 || (isSuperAdmin && memberships.length > 0) ? (
            <DropdownMenuItem onSelect={() => navigate('/app?choose=1')}>
              <LuBuilding2 />
              My branches
            </DropdownMenuItem>
          ) : null}
          {isSuperAdmin ? (
            <DropdownMenuItem onSelect={() => navigate('/platform')}>
              <LuShieldCheck />
              Platform
            </DropdownMenuItem>
          ) : null}
          {branch && branch.isAdmin ? (
            <DropdownMenuItem onSelect={() => navigate(`/${branch.branchId}/kiosk`)}>
              <LuLayoutGrid />
              Open kiosk mode
            </DropdownMenuItem>
          ) : null}
          <ThemeSubmenu />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut()
            navigate('/')
          }}
        >
          <LuLogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
