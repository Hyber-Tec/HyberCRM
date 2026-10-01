import { useEffect } from 'react'
import { LuArrowLeftRight, LuChevronRight, LuShieldCheck } from 'react-icons/lu'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { PORTAL_LABELS, type Role } from '@shared/roles'
import { useBranch } from '@/branch/BranchProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { UserMenu, rememberPortal } from '@/components/app/UserMenu'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { type NavGroup, type NavItem, type NavLeaf, PORTAL_NAV, isGroup, navLeaves } from './nav'

function usePortalBase(portal: Role) {
  const { branchId } = useBranch()
  return `/${branchId}/${portal}`
}

function isActivePath(pathname: string, base: string, leaf: NavLeaf) {
  const target = `${base}/${leaf.to}`
  return pathname === target || pathname.startsWith(`${target}/`)
}

function visible(leaf: NavLeaf, can: (p: NonNullable<NavLeaf['restrict']>) => boolean) {
  return !leaf.restrict || can(leaf.restrict)
}

export function PortalLayout({ portal }: { portal: Role }) {
  const branch = useBranch()
  const nav = PORTAL_NAV[portal]
  const base = usePortalBase(portal)
  const { pathname } = useLocation()

  useEffect(() => rememberPortal(branch.branchId, portal), [branch.branchId, portal])

  const current = navLeaves(nav).find((l) => isActivePath(pathname, base, l))
  useEffect(() => {
    document.title = `${current?.label ?? PORTAL_LABELS[portal]} | ${branch.branch.name}`
  }, [current?.label, portal, branch.branch.name])

  return (
    <SidebarProvider>
      <PortalSidebar portal={portal} />
      <SidebarInset className="min-w-0">
        {branch.asSuperAdmin ? <SuperAdminBar /> : null}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <div className="min-w-0 flex-1 truncate text-sm font-medium">{current?.label ?? PORTAL_LABELS[portal]}</div>
          <div className="md:hidden">
            <UserMenu portal={portal} />
          </div>
        </header>
        <div className={cn('min-w-0 flex-1 p-4 sm:p-6', nav.mobileTabs && 'pb-24 md:pb-6')}>
          <Outlet />
        </div>
        {nav.mobileTabs ? <MobileTabs tabs={nav.mobileTabs} base={base} /> : null}
      </SidebarInset>
    </SidebarProvider>
  )
}

function PortalSidebar({ portal }: { portal: Role }) {
  const branch = useBranch()
  const nav = PORTAL_NAV[portal]
  const base = usePortalBase(portal)
  const { branding, name } = branch.branch

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to={`${base}/${nav.main[0] && !isGroup(nav.main[0]) ? nav.main[0].to : ''}`}>
                <BrandMark name={name} logoUrl={branding?.logoUrl} accentColor={branding?.accentColor} />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">{branding?.sidebarTitle || name}</span>
                  <span className="truncate text-xs text-muted-foreground">{PORTAL_LABELS[portal]}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.main.map((item) => (
                <NavEntry key={item.key} item={item} base={base} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {nav.secondary.length > 0 ? (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.secondary.map((item) => (
                  <NavEntry key={item.key} item={item} base={base} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu variant="sidebar" portal={portal} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavEntry({ item, base }: { item: NavItem; base: string }) {
  const { can } = useBranch()
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()

  if (!isGroup(item)) {
    if (!visible(item, can)) return null
    const Icon = item.icon
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={item.label} isActive={isActivePath(pathname, base, item)}>
          <NavLink to={`${base}/${item.to}`} onClick={() => setOpenMobile(false)}>
            {Icon ? <Icon /> : null}
            <span>{item.label}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }
  return <NavGroupEntry group={item} base={base} />
}

function NavGroupEntry({ group, base }: { group: NavGroup; base: string }) {
  const { can } = useBranch()
  const { pathname } = useLocation()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const children = group.children.filter((c) => visible(c, can))
  if (children.length === 0) return null
  const groupActive = children.some((c) => isActivePath(pathname, base, c))
  const Icon = group.icon

  // Collapsed to icons: open the group's pages from a menu.
  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={group.label} isActive={groupActive}>
              <Icon />
              <span>{group.label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {children.map((c) => (
              <DropdownMenuItem key={c.key} asChild>
                <Link to={`${base}/${c.to}`}>{c.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible asChild defaultOpen={groupActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={group.label} isActive={groupActive && state === 'collapsed'}>
            <Icon />
            <span>{group.label}</span>
            <LuChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {children.map((c) => (
              <SidebarMenuSubItem key={c.key}>
                <SidebarMenuSubButton asChild isActive={isActivePath(pathname, base, c)}>
                  <NavLink to={`${base}/${c.to}`} onClick={() => setOpenMobile(false)}>
                    <span>{c.label}</span>
                  </NavLink>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function MobileTabs({ tabs, base }: { tabs: NavLeaf[]; base: string }) {
  const { pathname } = useLocation()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md">
        {tabs.map((t) => {
          const active = isActivePath(pathname, base, t)
          const Icon = t.icon
          return (
            <li key={t.key} className="flex-1">
              <Link
                to={`${base}/${t.to}`}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 text-[11px] font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {Icon ? <Icon className="size-5" /> : null}
                {t.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function SuperAdminBar() {
  const { branch } = useBranch()
  return (
    <div className="flex items-center gap-2 bg-primary px-3 py-1.5 text-xs text-primary-foreground sm:px-4">
      <LuShieldCheck className="size-3.5 shrink-0" />
      <span className="truncate">
        Super Admin · viewing <span className="font-semibold">{branch.name}</span>
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="xs"
          variant="ghost"
          className="h-6 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          asChild
        >
          <Link to="/platform">
            <LuArrowLeftRight /> Switch branch
          </Link>
        </Button>
      </div>
    </div>
  )
}
