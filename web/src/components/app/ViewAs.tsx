import { useMemo, useState } from 'react'
import { LuCheck, LuEye } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { studentLabel } from '@shared/people'
import { portalOf } from '@shared/roles'
import { type ViewAs, useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMembers, useStaffList, useStudentList } from '@/features/data/hooks'
import { cn } from '@/lib/utils'

type PickRole = 'tutor' | 'parent' | 'student'

const PICK_TITLE: Record<PickRole, string> = { tutor: 'Preview as a tutor', parent: 'Preview as a parent', student: 'Preview as a student' }

/** Super Admin only: preview the app as another role. It changes what is shown, never their access. */
export function ViewAsControl({ className }: { className?: string }) {
  const { isSuperAdmin, viewAs, setViewAs, branchId } = useBranch()
  const navigate = useNavigate()
  const [picking, setPicking] = useState<PickRole | null>(null)
  if (!isSuperAdmin) return null

  const go = (next: ViewAs | null) => {
    setViewAs(next)
    navigate(`/${branchId}/${next ? portalOf(next.role) : 'admin'}`)
  }
  const mark = (on: boolean) => <LuCheck className={cn('ml-auto size-4', on ? 'opacity-100' : 'opacity-0')} />
  const who = (role: PickRole) => (viewAs?.role === role ? <span className="max-w-28 truncate text-xs text-muted-foreground">{viewAs.name}</span> : null)

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="View the app as"
                className={cn('shrink-0 text-muted-foreground', viewAs && 'bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-300', className)}
              >
                <LuEye />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">View the app as…</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="end" className="w-72">
          <DropdownMenuLabel className="text-violet-600 dark:text-violet-400">View the app as</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => go(null)}>
            Yourself (Super Admin) {mark(!viewAs)}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => go({ role: 'admin' })}>
            A regular admin {mark(viewAs?.role === 'admin')}
          </DropdownMenuItem>
          {(['tutor', 'parent', 'student'] as const).map((r) => (
            <DropdownMenuItem key={r} onSelect={() => setPicking(r)}>
              A {r}… {who(r)}
              {mark(viewAs?.role === r)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Only changes what you see. Your access stays the same. Only super admins can see this.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {picking ? (
        <PersonPicker
          role={picking}
          onClose={() => setPicking(null)}
          onPick={(next) => {
            setPicking(null)
            go(next)
          }}
        />
      ) : null}
    </>
  )
}

function PersonPicker({ role, onClose, onPick }: { role: PickRole; onClose: () => void; onPick: (v: ViewAs) => void }) {
  const { data: staff } = useStaffList()
  const { data: students } = useStudentList()
  const { data: members } = useMembers(role === 'parent')
  const studentName = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students])

  const options = useMemo((): { key: string; label: string; hint?: string; value: ViewAs }[] => {
    if (role === 'tutor') {
      return staff
        .filter((s) => s.role === 'tutor' && s.status !== 'finished')
        .map((s) => ({ key: s.id, label: s.name, value: { role: 'tutor', staffId: s.id, name: s.name } }))
    }
    if (role === 'student') {
      return students
        .filter((s) => s.status !== 'finished')
        .map((s) => ({ key: s.id, label: studentLabel(s.name, s.grade), value: { role: 'student', studentId: s.id, name: s.name } }))
    }
    // Parents with a sign-in first, then any student's family.
    const parents = members
      .filter((m) => m.role === 'parent' && m.studentIds?.length)
      .map((m) => {
        const kids = m.studentIds.map((id) => studentName.get(id) ?? '…').join(', ')
        const name = m.displayName || m.email
        return { key: m.id, label: name, hint: kids, value: { role: 'parent' as const, studentIds: m.studentIds, name } }
      })
    const families = students
      .filter((s) => s.status !== 'finished')
      .map((s) => ({ key: `family-${s.id}`, label: `Parent of ${s.name}`, value: { role: 'parent' as const, studentIds: [s.id], name: `Parent of ${s.name}` } }))
    return [...parents, ...families]
  }, [role, staff, students, members, studentName])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>{PICK_TITLE[role]}</DialogTitle>
          <DialogDescription>Pick whose view to open. You can switch back from the eye icon or the bar at the top.</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Search…" autoFocus />
          <CommandList className="max-h-80">
            <CommandEmpty>Nobody found.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.key} value={`${o.label} ${o.hint ?? ''} ${o.key}`} onSelect={() => onPick(o.value)}>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="max-w-40 truncate text-xs text-muted-foreground">{o.hint}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
