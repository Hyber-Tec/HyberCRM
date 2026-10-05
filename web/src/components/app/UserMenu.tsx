import { useState } from 'react'
import { LuArrowLeftRight, LuChevronsUpDown, LuKeyRound, LuLayoutGrid, LuLogOut } from 'react-icons/lu'
import { useNavigate } from 'react-router'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { initials } from './BrandMark'
import { SignInSecurityDialog } from './SignInSecurity'
import { ThemeSubmenu } from './ThemeToggle'

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

export function UserMenu({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const { user, email, isSuperAdmin, memberships, signOut } = useAuth()
  const branch = useOptionalBranch()
  const navigate = useNavigate()
  const [security, setSecurity] = useState(false)
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
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60" align="end" side={variant === 'sidebar' ? 'top' : 'bottom'}>
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {isSuperAdmin || memberships.length > 1 ? (
            // Super Admin: the Platform dashboard lists every branch; others pick among theirs.
            <DropdownMenuItem onSelect={() => navigate(isSuperAdmin ? '/platform' : '/app?choose=1')}>
              <LuArrowLeftRight />
              Switch branch
            </DropdownMenuItem>
          ) : null}
          {branch && branch.isAdmin ? (
            <DropdownMenuItem onSelect={() => navigate(`/${branch.branchId}/kiosk`)}>
              <LuLayoutGrid />
              Open kiosk mode
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setSecurity(true)}>
            <LuKeyRound />
            Sign-in & security
          </DropdownMenuItem>
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
    <SignInSecurityDialog open={security} onOpenChange={setSecurity} />
    </>
  )
}
