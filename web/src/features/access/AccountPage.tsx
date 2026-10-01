import { orderBy, query } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuCheck, LuCopy, LuEllipsis, LuPencil, LuSearch, LuTrash2, LuUserPlus, LuX } from 'react-icons/lu'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { ROLES, ROLE_LABELS, type Role, sortRoles } from '@shared/roles'
import { formatInstant } from '@shared/time'
import type { Member, SignupRequest, Staff, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { initials } from '@/components/app/BrandMark'
import { PageHeader } from '@/components/app/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { branchCol, useQuery } from '@/lib/firestore'
import { MemberDialog } from './MemberDialog'
import { rejectRequest, removeMember } from './api'

type RoleFilter = 'all' | Role

export function AccountPage() {
  const { branchId, branch, actor, isOwner, isSuperAdmin, timezone } = useBranch()
  const members = useQuery<Member>(useMemo(() => query(branchCol(branchId, COL.members), orderBy('email')), [branchId]), `members-${branchId}`)
  const staff = useQuery<Staff>(useMemo(() => query(branchCol(branchId, COL.staff), orderBy('nameLower')), [branchId]), `staff-${branchId}`)
  const students = useQuery<Student>(useMemo(() => query(branchCol(branchId, COL.students), orderBy('nameLower')), [branchId]), `students-${branchId}`)
  const requests = useQuery<SignupRequest>(
    useMemo(() => query(branchCol(branchId, COL.signupRequests), orderBy('createdAt', 'desc')), [branchId]),
    `requests-${branchId}`,
  )

  const [search_] = useSearchParams()
  const tabParam = search_.get('tab')
  const [filter, setFilter] = useState<RoleFilter>('all')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<{ member: WithId<Member> | null; request: WithId<SignupRequest> | null } | null>(null)
  const [removing, setRemoving] = useState<WithId<Member> | null>(null)
  const [rejecting, setRejecting] = useState<WithId<SignupRequest> | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const staffById = useMemo(() => new Map(staff.data.map((s) => [s.id, s])), [staff.data])
  const studentById = useMemo(() => new Map(students.data.map((s) => [s.id, s])), [students.data])

  const counts = useMemo(() => {
    const c: Record<RoleFilter, number> = { all: members.data.length, admin: 0, tutor: 0, parent: 0, student: 0 }
    for (const m of members.data) for (const r of m.roles ?? []) c[r] += 1
    return c
  }, [members.data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.data
      .filter((m) => filter === 'all' || m.roles?.includes(filter))
      .filter((m) => !q || m.email.includes(q) || (m.displayName ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email))
  }, [members.data, filter, search])

  const pending = requests.data.filter((r) => r.status === 'pending')
  const signupUrl = `${window.location.origin}/${branchId}/signup`

  function linkedLabel(m: WithId<Member>): string {
    const parts: string[] = []
    if (m.staffId) parts.push(staffById.get(m.staffId)?.name ?? 'Employee record')
    if (m.studentId) parts.push(studentById.get(m.studentId)?.name ?? 'Student record')
    if (m.studentIds?.length) {
      parts.push(`Parent of ${m.studentIds.map((id) => studentById.get(id)?.firstName ?? '…').join(', ')}`)
    }
    return parts.join(' · ')
  }

  return (
    <div>
      <PageHeader
        title="Account"
        description={`Who can sign in to ${branch.name}, and as what. People sign in with Google; access is matched by email.`}
        actions={
          <Button onClick={() => setDialog({ member: null, request: null })}>
            <LuUserPlus /> Add person
          </Button>
        }
      />
      <Tabs defaultValue={tabParam === 'requests' ? 'requests' : 'people'}>
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="requests">
            Sign-up requests
            {pending.length > 0 ? (
              <Badge className="ml-1 h-5 min-w-5 rounded-full px-1.5 tabular-nums">{pending.length}</Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={filter}
              onValueChange={(v) => v && setFilter(v as RoleFilter)}
              className="flex-wrap"
            >
              <ToggleGroupItem value="all">
                All <span className="ml-1 text-muted-foreground tabular-nums">{counts.all}</span>
              </ToggleGroupItem>
              {ROLES.map((r) => (
                <ToggleGroupItem key={r} value={r}>
                  {ROLE_LABELS[r]}s <span className="ml-1 text-muted-foreground tabular-nums">{counts[r]}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <InputGroup className="sm:w-72">
              <InputGroupAddon>
                <LuSearch />
              </InputGroupAddon>
              <InputGroupInput placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </InputGroup>
          </div>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="hidden lg:table-cell">Linked to</TableHead>
                  <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          {m.photoURL ? <AvatarImage src={m.photoURL} alt="" referrerPolicy="no-referrer" /> : null}
                          <AvatarFallback>{initials(m.displayName || m.email)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {m.displayName || '—'}
                            {m.isOwner ? (
                              <Badge variant="outline" className="ml-2 align-middle">
                                Owner
                              </Badge>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {sortRoles(m.roles ?? []).map((r) => (
                          <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'}>
                            {ROLE_LABELS[r]}
                          </Badge>
                        ))}
                        {m.status !== 'active' ? <Badge variant="destructive">Paused</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-64 truncate text-sm text-muted-foreground lg:table-cell">
                      {linkedLabel(m) || '—'}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {m.lastLoginAt ? formatInstant(m.lastLoginAt.toDate(), timezone) : 'Not signed in yet'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Actions">
                            <LuEllipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ member: m, request: null })}>
                            <LuPencil /> Edit access
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={(m.isOwner && !isSuperAdmin) || (m.roles.includes('admin') && !isOwner) || m.id === actor.email}
                            onSelect={() => setRemoving(m)}
                          >
                            <LuTrash2 /> Remove access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!members.loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {members.data.length === 0 ? 'Nobody has access yet. Add the first person.' : 'No one matches these filters.'}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-4 space-y-4">
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Sign-up page</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{signupUrl}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(signupUrl)
                toast.success('Link copied')
              }}
            >
              <LuCopy /> Copy link
            </Button>
          </Card>
          {requests.data.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No sign-up requests</EmptyTitle>
                <EmptyDescription>Share the sign-up page with new tutors, parents and students.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2">
              {requests.data.map((r) => (
                <Card key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <Avatar className="size-9">
                    {r.photoURL ? <AvatarImage src={r.photoURL} alt="" referrerPolicy="no-referrer" /> : null}
                    <AvatarFallback>{initials(`${r.firstName} ${r.lastName}`)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">
                      {r.firstName} {r.lastName}{' '}
                      <Badge variant="secondary" className="ml-1">
                        {ROLE_LABELS[r.requestedRole]}
                      </Badge>
                      {r.status !== 'pending' ? (
                        <Badge variant={r.status === 'approved' ? 'outline' : 'destructive'} className="ml-1">
                          {r.status === 'approved' ? 'Approved' : 'Declined'}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.email}
                      {r.phone ? ` · ${r.phone}` : ''}
                      {r.createdAt ? ` · ${formatInstant(r.createdAt.toDate(), timezone)}` : ''}
                    </div>
                    {r.studentNames ? <div className="mt-1 text-xs">Child: {r.studentNames}</div> : null}
                    {r.message ? <div className="mt-1 text-xs text-muted-foreground">“{r.message}”</div> : null}
                  </div>
                  {r.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRejecting(r)}>
                        <LuX /> Decline
                      </Button>
                      <Button size="sm" onClick={() => setDialog({ member: null, request: r })}>
                        <LuCheck /> Approve
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MemberDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        member={dialog?.member ?? null}
        request={dialog?.request ?? null}
        members={members.data}
        staff={staff.data}
        students={students.data}
      />

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.displayName || removing?.email} won’t be able to sign in to {branch.name}. Their employee or student
              records stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!removing) return
                try {
                  await removeMember(branchId, actor, removing)
                  toast.success('Access removed')
                } catch (e) {
                  toast.error('Could not remove access', { description: (e as Error).message })
                }
              }}
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejecting !== null} onOpenChange={(o) => !o && (setRejecting(null), setRejectNote(''))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this request?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejecting?.firstName} {rejecting?.lastName} ({rejecting?.email}) will see that the request was declined.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Optional note for the person" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!rejecting) return
                await rejectRequest(branchId, actor, rejecting, rejectNote.trim())
                setRejectNote('')
                toast.success('Request declined')
              }}
            >
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
