import { query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import {
  LuArrowDown,
  LuArrowUp,
  LuCalendarDays,
  LuCircleAlert,
  LuCircleCheck,
  LuExternalLink,
  LuGraduationCap,
  LuListFilter,
  LuMessageSquareText,
  LuNotebookPen,
  LuRefreshCw,
  LuSearch,
  LuUserPlus,
} from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import {
  STUDENT_STATUSES,
  STUDENT_STATUS_LABELS,
  conferenceState,
  isInactiveStudent,
  nextGrade,
  relativeDayLabel,
} from '@shared/people'
import { addDays, formatDateKey, todayKey } from '@shared/time'
import type { Session, Student, StudentStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, menu } from '@/components/app/ItemMenu'
import { PageHeader } from '@/components/app/PageHeader'
import { StudentStatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStudentList } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { advanceGrades, createStudent, restartConferenceCycle, setStudentStatus } from './api'

type SortKey = 'name' | 'grade' | 'signUp' | 'hours'
type ConferenceFilter = 'all' | 'needed' | 'ok'

/** Student IDs a tutor teaches: sessions in the last 90 days or upcoming. */
function useTaughtStudentIds(enabled: boolean): Set<string> | null {
  const { branchId, staffId, timezone } = useBranch()
  const from = addDays(todayKey(timezone), -90)
  const q = useMemo(
    () => (enabled && staffId ? query(branchCol(branchId, COL.sessions), where('tutorId', '==', staffId), where('dateKey', '>=', from)) : null),
    [enabled, staffId, branchId, from],
  )
  const { data, loading } = useQuery<Session>(q, `taught-${staffId}-${from}`)
  return useMemo(() => (enabled ? (loading ? null : new Set(data.filter((s) => !s.isDeleted).map((s) => s.studentId))) : null), [enabled, data, loading])
}

export function StudentDirectoryPage({ mode = 'admin' }: { mode?: 'admin' | 'tutor' }) {
  const { branchId, actor, rules, timezone } = useBranch()
  const navigate = useNavigate()
  const { data: students, loading } = useStudentList()
  const taught = useTaughtStudentIds(mode === 'tutor')
  const today = todayKey(timezone)
  const isAdmin = mode === 'admin'
  const base = `/${branchId}/${mode}/students`

  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<StudentStatus[]>([])
  const [conference, setConference] = useState<ConferenceFilter>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'signUp', dir: 'desc' })
  const [creating, setCreating] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  // Parent conferences are a branch rule; when off, nothing about them shows.
  const conferencesOn = rules.conferences.enabled
  const cycle = rules.conferences.everyHours

  /** A student row's actions: right-click, or the "⋯" button. */
  const rowMenu = (s: WithId<Student>, conf: { needed: boolean }) =>
    menu(
      { kind: 'label', label: s.name },
      { label: 'Open student profile', icon: LuGraduationCap, onSelect: () => navigate(`${base}/${s.id}`) },
      { label: 'Open in new tab', icon: LuExternalLink, onSelect: () => window.open(`${base}/${s.id}`, '_blank') },
      { label: 'Sessions', icon: LuNotebookPen, onSelect: () => navigate(`${base}/${s.id}/sessions`) },
      { label: 'Calendar', icon: LuCalendarDays, onSelect: () => navigate(`${base}/${s.id}/calendar`) },
      isAdmin && {
        kind: 'sub',
        label: 'Change status',
        separatorBefore: true,
        entries: [
          {
            kind: 'radio',
            value: s.status,
            options: STUDENT_STATUSES.map((st) => ({ value: st, label: STUDENT_STATUS_LABELS[st] })),
            onChange: (v) => void setStudentStatus(branchId, actor, s, v as StudentStatus).catch((err) => toast.error((err as Error).message)),
          },
        ],
      },
      isAdmin && conferencesOn && { label: 'Conference notes', icon: LuMessageSquareText, onSelect: () => navigate(`${base}/${s.id}/conference`), separatorBefore: true },
      isAdmin &&
        conferencesOn && {
          label: `Skip & restart ${cycle} hours`,
          icon: LuRefreshCw,
          disabled: !conf.needed,
          onSelect: () => void restartConferenceCycle(branchId, actor, s).then(() => toast.success(`Restarted the ${cycle}-hour cycle`)),
        },
    )
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = students
      .filter((s) => !taught || taught.has(s.id))
      .filter((s) => !q || s.nameLower.includes(q))
      .filter((s) => statuses.length === 0 || statuses.includes(s.status))
      .filter((s) => {
        if (conference === 'all' || !conferencesOn) return true
        if (isInactiveStudent(s.status)) return false
        const c = conferenceState({ totalSessionHours: s.totalSessionHours, baselineHours: s.conference?.baselineHours ?? 0 }, cycle)
        return conference === 'needed' ? c.needed : !c.needed
      })
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.nameLower.localeCompare(b.nameLower) * dir
        case 'grade':
          return ((Number(a.grade) || 0) - (Number(b.grade) || 0)) * dir
        case 'hours':
          return ((a.totalSessionHours ?? 0) - (b.totalSessionHours ?? 0)) * dir
        case 'signUp': {
          const av = a.signUpDate ?? ''
          const bv = b.signUpDate ?? ''
          if (!av && bv) return 1
          if (av && !bv) return -1
          return av.localeCompare(bv) * dir || a.nameLower.localeCompare(b.nameLower)
        }
      }
    })
  }, [students, taught, search, statuses, conference, sort, cycle, conferencesOn])

  const header = (key: SortKey, label: string, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : key === 'hours' || key === 'signUp' ? 'desc' : 'asc' }))}
      >
        {label}
        {sort.key === key ? sort.dir === 'asc' ? <LuArrowUp className="size-3" /> : <LuArrowDown className="size-3" /> : null}
      </button>
    </TableHead>
  )

  return (
    <div>
      <PageHeader
        title="Students"
        description={mode === 'tutor' ? 'Students you teach (last 90 days and upcoming).' : `${rows.length} of ${students.length} students`}
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" onClick={() => setAdvancing(true)}>
                <LuGraduationCap /> Advance grades
              </Button>
              <Button onClick={() => setCreating(true)}>
                <LuUserPlus /> Add student
              </Button>
            </>
          ) : null
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-start sm:w-44">
              <LuListFilter />
              {statuses.length === 0 ? 'Status: All' : `Status: ${statuses.length} selected`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuCheckboxItem checked={statuses.length === 0} onCheckedChange={() => setStatuses([])}>
              All
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {STUDENT_STATUSES.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={statuses.includes(s)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(v) => setStatuses((prev) => (v ? [...prev, s] : prev.filter((x) => x !== s)))}
              >
                {STUDENT_STATUS_LABELS[s]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {conferencesOn ? (
          <Select value={conference} onValueChange={(v) => setConference(v as ConferenceFilter)}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Conference: All</SelectItem>
              <SelectItem value="needed">Conference: Needed</SelectItem>
              <SelectItem value="ok">Conference: Not needed</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {header('name', 'Name')}
              {header('grade', 'Grade', 'w-20')}
              <TableHead className="w-40">Status</TableHead>
              {header('signUp', 'Sign up', 'hidden lg:table-cell')}
              <TableHead className="hidden md:table-cell">Last session</TableHead>
              <TableHead className="hidden md:table-cell">Next session</TableHead>
              {header('hours', 'Hours', 'hidden sm:table-cell')}
              {conferencesOn ? <TableHead className="hidden xl:table-cell">Conference</TableHead> : null}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => {
              const conf = conferenceState({ totalSessionHours: s.totalSessionHours, baselineHours: s.conference?.baselineHours ?? 0 }, cycle)
              const showConf = !isInactiveStudent(s.status) && !!s.lastSessionDate
              return (
                <ContextMenuFor key={s.id} entries={rowMenu(s, conf)}>
                  <TableRow className="cursor-pointer" onClick={() => navigate(`${base}/${s.id}`)}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.grade || '—'}</TableCell>
                    <TableCell onClick={(e) => isAdmin && e.stopPropagation()}>
                      {isAdmin ? (
                        <Select
                          value={s.status}
                          onValueChange={(v) =>
                            void setStudentStatus(branchId, actor, s, v as StudentStatus).catch((err) => toast.error((err as Error).message))
                          }
                        >
                          <SelectTrigger size="sm" className="h-auto border-0 bg-transparent p-0 shadow-none [&>svg]:hidden">
                            <StudentStatusBadge status={s.status} />
                          </SelectTrigger>
                          <SelectContent>
                            {STUDENT_STATUSES.map((st) => (
                              <SelectItem key={st} value={st}>
                                {STUDENT_STATUS_LABELS[st]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <StudentStatusBadge status={s.status} />
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {s.signUpDate ? formatDateKey(s.signUpDate, 'short') : '—'}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <DateWithRelative date={s.lastSessionDate} today={today} />
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <DateWithRelative date={s.nextSessionDate && s.nextSessionDate >= today ? s.nextSessionDate : null} today={today} />
                    </TableCell>
                    <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                      {s.lastSessionDate ? `${Math.round((s.totalSessionHours ?? 0) * 10) / 10}h` : '—'}
                    </TableCell>
                    {conferencesOn ? (
                    <TableCell className="hidden xl:table-cell">
                      {showConf ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
                            conf.needed ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                          )}
                        >
                          {conf.needed ? <LuCircleAlert className="size-3" /> : <LuCircleCheck className="size-3" />}
                          {conf.needed ? 'Conference due' : 'On track'} · {conf.hoursSince.toFixed(1)}/{cycle}h
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    ) : null}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ItemMenuButton entries={rowMenu(s, conf)} label="Actions" />
                    </TableCell>
                  </TableRow>
                </ContextMenuFor>
              )
            })}
            {!loading && taught !== null && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No students found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      {isAdmin ? (
        <>
          <NewStudentDialog open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`${base}/${id}/info`)} />
          <GradeAdvanceDialog open={advancing} onOpenChange={setAdvancing} students={students} />
        </>
      ) : null}
    </div>
  )
}

function DateWithRelative({ date, today }: { date: string | null | undefined; today: string }) {
  if (!date) return <span className="text-muted-foreground">—</span>
  return (
    <div className="leading-tight">
      <div>{formatDateKey(date, 'short')}</div>
      <div className="text-xs text-muted-foreground">{relativeDayLabel(date, today)}</div>
    </div>
  )
}

function NewStudentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const { branchId, actor, settings, timezone } = useBranch()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [grade, setGrade] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!firstName.trim()) return toast.error('Enter the student’s first name.')
            setBusy(true)
            try {
              const id = await createStudent(branchId, actor, { firstName, lastName, grade, signUpDate: todayKey(timezone) })
              onOpenChange(false)
              setFirstName('')
              setLastName('')
              setGrade('')
              onCreated(id)
            } catch (err) {
              toast.error('Could not add the student', { description: (err as Error).message })
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add student</DialogTitle>
            <DialogDescription>New students start as Signed Up and become Enrolled after their first session.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ns-first">First name</FieldLabel>
                <Input id="ns-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
              </Field>
              <Field>
                <FieldLabel htmlFor="ns-last">Last name</FieldLabel>
                <Input id="ns-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Grade</FieldLabel>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a grade" />
                </SelectTrigger>
                <SelectContent>
                  {settings.students.gradeOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      {/^\d+$/.test(g) ? `Grade ${g}` : g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null} Add student
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GradeAdvanceDialog({ open, onOpenChange, students }: { open: boolean; onOpenChange: (o: boolean) => void; students: WithId<Student>[] }) {
  const { branchId, actor } = useBranch()
  const numeric = students.filter((s) => nextGrade(s.grade) !== null)
  const skipped = students.length - numeric.length
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const defaults = useMemo(() => new Set(numeric.filter((s) => !isInactiveStudent(s.status) && Number(s.grade) < 12).map((s) => s.id)), [numeric])
  const current = selected ?? defaults

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setSelected(null)
      }}
    >
      <DialogContent className="max-h-[90svh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Advance grades</DialogTitle>
          <DialogDescription>
            Moves the selected students up one grade, usually once a year. {skipped > 0 ? `${skipped} students without a numeric grade are skipped.` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {current.size} of {numeric.length} selected
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(current.size === numeric.length ? new Set() : new Set(numeric.map((s) => s.id)))}>
            {current.size === numeric.length ? 'Deselect all' : 'Select all'}
          </Button>
        </div>
        <div className="max-h-[50svh] divide-y overflow-y-auto rounded-lg border">
          {numeric.map((s) => (
            <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Checkbox
                checked={current.has(s.id)}
                onCheckedChange={(v) => {
                  const next = new Set(current)
                  if (v === true) next.add(s.id)
                  else next.delete(s.id)
                  setSelected(next)
                }}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <StudentStatusBadge status={s.status} className="hidden sm:inline-flex" />
              <span className="w-16 text-right tabular-nums text-muted-foreground">
                {s.grade} → {nextGrade(s.grade)}
              </span>
              {Number(s.grade) >= 12 ? <LuCircleAlert className="size-4 text-amber-500" aria-label="Beyond grade 12" /> : null}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || current.size === 0}
            onClick={async () => {
              setBusy(true)
              try {
                const list = numeric.filter((s) => current.has(s.id)).map((s) => ({ id: s.id, name: s.name, grade: s.grade, next: nextGrade(s.grade)! }))
                await advanceGrades(branchId, actor, list)
                toast.success(`${list.length} students moved up one grade`)
                onOpenChange(false)
                setSelected(null)
              } catch (e) {
                toast.error('Could not advance grades', { description: (e as Error).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner /> : null} Advance {current.size} students
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TutorStudentDirectoryPage() {
  return <StudentDirectoryPage mode="tutor" />
}
