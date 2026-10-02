import { createContext, useContext, useEffect, useMemo } from 'react'
import { LuChevronRight, LuMenu, LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { PORTAL_LABELS, type Portal } from '@shared/roles'
import { useUnreadAnnouncementCount } from '@/features/announcements/api'
import { ActivityToasts } from '@/features/audit/ActivityToasts'
import { useAttention } from '@/features/home/attention'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useBranch } from '@/branch/BranchProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { UserMenu } from '@/components/app/UserMenu'
import { ViewAsControl } from '@/components/app/ViewAs'
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { type NavGroup, type NavItem, type NavLeaf, PORTAL_NAV, isGroup, navLeaves } from './nav'

/** Live counts shown next to nav entries, by nav key (Home: needs attention; tutor Announcements: unread). */
const NavBadges = createContext<Record<string, number>>({})

function NavBadgesProvider({ portal, children }: { portal: Portal; children: React.ReactNode }) {
  const attention = useAttention(portal === 'admin')
  const unread = useUnreadAnnouncementCount(portal === 'tutor')
  const total = portal === 'admin' ? attention.total : 0
  const value = useMemo(() => ({ home: total, announcements: unread }), [total, unread])
  // Installed app icon: unread announcements in the tutor portal (TE's News count).
  useEffect(() => {
    if (portal !== 'tutor') return
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (unread > 0) void nav.setAppBadge?.(unread).catch(() => undefined)
    else void nav.clearAppBadge?.().catch(() => undefined)
  }, [portal, unread])
  return <NavBadges.Provider value={value}>{children}</NavBadges.Provider>
}

function badgeText(n: number) {
  return n > 99 ? '99+' : String(n)
}

function usePortalBase(portal: Portal) {
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

export function PortalLayout({ portal }: { portal: Portal }) {
  const branch = useBranch()
  const nav = PORTAL_NAV[portal]
  const base = usePortalBase(portal)
  const { pathname } = useLocation()

  const current = navLeaves(nav).find((l) => isActivePath(pathname, base, l))
  useEffect(() => {
    document.title = `${current?.label ?? PORTAL_LABELS[portal]} | ${branch.branch.name}`
  }, [current?.label, portal, branch.branch.name])

  return (
    <NavBadgesProvider portal={portal}>
    <SidebarProvider>
      <PortalSidebar portal={portal} />
      <SidebarInset className="min-w-0">
        <MobileTopBar portal={portal} />
        <div className={cn('min-w-0 flex-1 p-4 sm:p-6', nav.mobileTabs && 'pb-24 md:pb-6')}>
          <Outlet />
        </div>
        {nav.mobileTabs ? <MobileTabs tabs={nav.mobileTabs} base={base} /> : null}
        {portal === 'admin' ? <ActivityToasts /> : null}
      </SidebarInset>
    </SidebarProvider>
    </NavBadgesProvider>
  )
}

function PortalSidebar({ portal }: { portal: Portal }) {
  const nav = PORTAL_NAV[portal]
  const base = usePortalBase(portal)
  const { isMobile } = useSidebar()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarBrand portal={portal} homeTo={`${base}/${nav.main[0] && !isGroup(nav.main[0]) ? nav.main[0].to : ''}`} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {nav.main.map((item) => (
                <NavEntry key={item.key} item={item} base={base} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {nav.secondary.length > 0 ? (
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
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
          <SidebarMenuItem className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col-reverse">
            <div className="min-w-0 flex-1">
              <UserMenu variant="sidebar" />
            </div>
            {portal === 'tutor' && !isMobile ? <NotificationBell /> : null}
            <ViewAsControl />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

const TOGGLE_KEYS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘B' : 'Ctrl+B'

/** Branch logo and name, with the sidebar's own open/close button (True Education's collapse arrow). */
function SidebarBrand({ portal, homeTo }: { portal: Portal; homeTo: string }) {
  const { branch } = useBranch()
  const { state, isMobile, toggleSidebar } = useSidebar()
  const mark = <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} />
  const bigMark = <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} className="size-11 rounded-xl text-sm" />

  // Collapsed to icons: the logo opens the sidebar and shows the open icon on hover.
  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" tooltip={`Open sidebar (${TOGGLE_KEYS})`} onClick={toggleSidebar} aria-label="Open sidebar" className="group/brand">
            <span className="relative flex size-8 shrink-0 items-center justify-center">
              <span className="transition-opacity group-hover/brand:opacity-0">{mark}</span>
              <LuPanelLeftOpen className="absolute size-4! opacity-0 transition-opacity group-hover/brand:opacity-100" />
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <SidebarMenu className="min-w-0 flex-1">
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild className="h-15 gap-3 px-2">
            <Link to={homeTo}>
              {bigMark}
              <div className="grid flex-1 gap-0.5 text-left leading-tight">
                <span className="truncate text-base font-semibold tracking-tight">{branch.branding?.sidebarTitle || branch.name}</span>
                <span className="truncate text-xs text-muted-foreground">{PORTAL_LABELS[portal]}</span>
              </div>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {isMobile ? (
        <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" onClick={toggleSidebar} aria-label="Close menu">
          <LuPanelLeftClose />
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" onClick={toggleSidebar} aria-label="Close sidebar">
              <LuPanelLeftClose />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Close sidebar ({TOGGLE_KEYS})</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/** Phones only: the sidebar is off-screen, so a slim bar opens it. */
function MobileTopBar({ portal }: { portal: Portal }) {
  const { branch } = useBranch()
  const { toggleSidebar } = useSidebar()
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Open menu">
        <LuMenu />
      </Button>
      <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} className="size-6" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{branch.branding?.sidebarTitle || branch.name}</span>
      {portal === 'tutor' ? <NotificationBell /> : null}
      <UserMenu />
    </header>
  )
}

function NavEntry({ item, base }: { item: NavItem; base: string }) {
  const { can } = useBranch()
  const badges = useContext(NavBadges)
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()

  if (!isGroup(item)) {
    if (!visible(item, can)) return null
    const Icon = item.icon
    const badge = badges[item.key] ?? 0
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={badge ? `${item.label} (${badge})` : item.label} isActive={isActivePath(pathname, base, item)} className="h-9 gap-2.5 px-2.5 text-[15px] [&_svg]:size-[18px]">
          <NavLink to={`${base}/${item.to}`} onClick={() => setOpenMobile(false)}>
            {Icon ? <Icon /> : null}
            <span>{item.label}</span>
          </NavLink>
        </SidebarMenuButton>
        {badge ? (
          <>
            <SidebarMenuBadge className="rounded-full bg-red-500 px-1.5 text-white peer-hover/menu-button:text-white peer-data-[active=true]/menu-button:text-white" data-testid={`nav-badge-${item.key}`}>
              {badgeText(badge)}
            </SidebarMenuBadge>
            <span className="pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full bg-red-500 group-data-[collapsible=icon]:block" />
          </>
        ) : null}
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
            <SidebarMenuButton tooltip={group.label} isActive={groupActive} className="h-9 gap-2.5 px-2.5 text-[15px] [&_svg]:size-[18px]">
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
          <SidebarMenuButton tooltip={group.label} isActive={groupActive && state === 'collapsed'} className="h-9 gap-2.5 px-2.5 text-[15px] [&_svg]:size-[18px]">
            <Icon />
            <span>{group.label}</span>
            <LuChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mt-1 ml-[1.15rem] gap-1">
            {children.map((c) => (
              <SidebarMenuSubItem key={c.key}>
                <SidebarMenuSubButton asChild isActive={isActivePath(pathname, base, c)} className="h-8 px-2.5 text-[14.5px] data-[size=md]:text-[14.5px]">
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
  const badges = useContext(NavBadges)
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
                <span className="relative">
                  {Icon ? <Icon className="size-5" /> : null}
                  {badges[t.key] ? (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
                      {badgeText(badges[t.key])}
                    </span>
                  ) : null}
                </span>
                {t.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
