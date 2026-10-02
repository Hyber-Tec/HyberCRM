import { orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuCalendarDays, LuExternalLink, LuFilePen, LuGraduationCap, LuNotebookPen, LuPencil, LuPlus } from 'react-icons/lu'
import { useNavigate, useSearchParams } from 'react-router'
import { COL } from '@shared/paths'
import { studentLabel } from '@shared/people'
import { FLAG_LABELS, type SessionLog, type StudentFlag, averageRating, canLog } from '@shared/sessions/logs'
import { addDays, formatDateKey, formatTimeRange, isDateKey, todayKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { DatePicker } from '@/components/app/DatePicker'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStaffList, useStudentList } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'
import { FlagBadge, HomeworkBadge, StarRating } from './widgets'

const PAGE = 20

type StatusFilter = 'submitted' | 'draft' | 'missing'
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'draft', label: 'Drafts' },
  { value: 'missing', label: 'Missing' },
]
const FLAGS = Object.keys(FLAG_LABELS) as StudentFlag[]

export function openLog(branchId: string, sessionId: string, view = false) {
  window.open(`/${branchId}/session-log/${sessionId}${view ? '/view' : ''}`, '_blank', 'noopener')
}

const endMillis = (s: Pick<Session, 'endAt'>) => (s.endAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0

/** A session that should have a submitted log by now: loggable, ended, and not logged (True Education's "Log missing"). */
function logMissing(s: WithId<Session>, allowed: readonly Session['status'][], now: number) {
  return !s.isDeleted && s.logStatus !== 'submitted' && canLog(s.status, allowed) && endMillis(s) <= now
}

/**
 * Session → Session Log (admin and tutor). Filters live in the URL. Admins
 * also see drafts and missing logs (sessions that ended without a submitted
 * log), and can add a log on a tutor's behalf.
 */
export function SessionLogListPage({ mode = 'admin' }: { mode?: 'admin' | 'tutor' }) {
  const { branchId, settings, staffId, timezone } = useBranch()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const admin = mode === 'admin'
  const seeAll = admin || settings.sessionLogs.tutorsSeeAllLogs
  const today = todayKey(timezone, now)

  const studentId = params.get('student')
  const tutorId = seeAll ? params.get('tutor') : null
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const from = fromParam && isDateKey(fromParam) ? fromParam : addDays(today, -14)
  const to = toParam && isDateKey(toParam) && toParam >= from ? toParam : today
  const statusParam = params.get('status')
  const status: StatusFilter = admin && (statusParam === 'draft' || statusParam === 'missing') ? statusParam : 'submitted'
  const flagParam = params.get('flag')
  const flag = FLAGS.includes(flagParam as StudentFlag) ? (flagParam as StudentFlag) : null
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1) - 1
  const update = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k)
          else next.set(k, v)
        }
        if (!('page' in patch)) next.delete('page')
        return next
      },
      { replace: true },
    )
  const filtered = !!(studentId || tutorId || fromParam || toParam || (admin && statusParam) || flag)

  const { data: students } = useStudentList()
  // Admins pick from the staff list; tutors (who can't read it) from the tutors in the loaded logs.
  const { data: staff } = useStaffList(admin)
  const student = students.find((s) => s.id === studentId)

  // One indexed equality (student, tutor or status) plus the date range; the rest is filtered here.
  const logsQ = useMemo(() => {
    if (status === 'missing') return null
    const base = branchCol(branchId, COL.sessionLogs)
    const range = [where('dateKey', '>=', from), where('dateKey', '<=', to), orderBy('dateKey', 'desc')] as const
    if (!seeAll) return staffId ? query(base, where('tutorId', '==', staffId), ...range) : null
    if (studentId) return query(base, where('studentId', '==', studentId), ...range)
    if (tutorId) return query(base, where('tutorId', '==', tutorId), ...range)
    return query(base, where('status', '==', status), ...range)
  }, [branchId, status, seeAll, staffId, studentId, tutorId, from, to])
  const logs = useQuery<SessionLog>(logsQ, `logs-${branchId}-${status}-${seeAll ? 'all' : staffId}-${studentId}-${tutorId}-${from}-${to}`)

  const missingQ = useMemo(
    () =>
      status === 'missing'
        ? query(branchCol(branchId, COL.sessions), where('logStatus', 'in', ['none', 'draft']), where('dateKey', '>=', from), where('dateKey', '<=', to))
        : null,
    [branchId, status, from, to],
  )
  const missing = useQuery<Session>(missingQ, `logs-missing-${branchId}-${from}-${to}`)

  const allowed = settings.sessionLogs.allowForStatuses
  const logRows = logs.data
    .filter((l) => l.status === status && (!studentId || l.studentId === studentId) && (!tutorId || l.tutorId === tutorId) && (!flag || l.studentFlag === flag))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.startMin - a.startMin)
  const missingRows = missing.data
    .filter((s) => logMissing(s, allowed, now) && (!studentId || s.studentId === studentId) && (!tutorId || s.tutorId === tutorId))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.startMin - a.startMin)
  const tutorOptions = admin
    ? staff.filter((t) => t.role === 'tutor').map((t) => ({ value: t.id, label: t.name }))
    : [...new Map(logs.data.map((l) => [l.tutorId, l.tutorName])).entries()]
        .map(([value, label]) => ({ value, label: label || 'Tutor' }))
        .sort((a, b) => a.label.localeCompare(b.label))
  const count = status === 'missing' ? missingRows.length : logRows.length
  const loading = status === 'missing' ? missing.loading : logs.loading
  const error = status === 'missing' ? missing.error : logs.error
  const pages = Math.max(1, Math.ceil(count / PAGE))
  const shown = Math.min(page, pages - 1)
  const slice = <T,>(rows: T[]) => rows.slice(shown * PAGE, shown * PAGE + PAGE)
  const schedulePath = (dateKey: string) => (admin ? `/${branchId}/admin/schedule/day/${dateKey}` : `/${branchId}/tutor/schedule?date=${dateKey}`)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Session Log"
        description="Search and review tutoring session logs. Click any row to open the full session detail."
        actions={
          admin ? (
            <Button onClick={() => setAdding(true)}>
              <LuPlus /> Add session log
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <OptionPicker
          className="w-full sm:w-64"
          value={studentId ?? 'all'}
          onChange={(v) => update({ student: v === 'all' ? null : v })}
          options={[{ value: 'all', label: 'All students' }, ...students.map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade) }))]}
        />
        {seeAll ? (
          <OptionPicker
            className="w-full sm:w-52"
            value={tutorId ?? 'all'}
            onChange={(v) => update({ tutor: v === 'all' ? null : v })}
            options={[{ value: 'all', label: 'All tutors' }, ...tutorOptions]}
          />
        ) : null}
        <div className="flex items-center gap-2">
          <DatePicker className="w-38" value={from} onChange={(d) => update({ from: d, to: d > to ? d : toParam })} aria-label="From" />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker className="w-38" value={to} min={from} onChange={(d) => update({ to: d })} aria-label="To" />
        </div>
        {admin ? (
          <Select value={status} onValueChange={(v) => update({ status: v === 'submitted' ? null : v })}>
            <SelectTrigger className="w-32" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select value={flag ?? 'all'} onValueChange={(v) => update({ flag: v === 'all' ? null : v })} disabled={status === 'missing'}>
          <SelectTrigger className="w-40" aria-label="Flag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All flags</SelectItem>
            {FLAGS.map((f) => (
              <SelectItem key={f} value={f}>
                {FLAG_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" data-testid="log-meta">
          {error
            ? 'Could not load session logs right now. Please try again.'
            : loading
              ? 'Loading session logs…'
              : `${count} session${count === 1 ? '' : 's'}${student ? ` for ${student.name}` : ''} — click a row to open detail`}
        </p>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </Button>
        ) : null}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="hidden md:table-cell">Time</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="hidden sm:table-cell">Tutor</TableHead>
              <TableHead className="hidden lg:table-cell">Subject</TableHead>
              {status === 'missing' ? (
                <>
                  <TableHead colSpan={3}>Log</TableHead>
                  <TableHead className="hidden sm:table-cell" />
                </>
              ) : (
                <>
                  <TableHead className="hidden md:table-cell">Homework</TableHead>
                  <TableHead>Avg rating</TableHead>
                  <TableHead className="hidden lg:table-cell">Flag</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Hours</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {status === 'missing'
              ? slice(missingRows).map((s) => (
                  <ContextMenuFor
                    key={s.id}
                    entries={menu(
                      { kind: 'label', label: `${s.studentName} · ${formatDateKey(s.dateKey, 'medium')}` },
                      { label: `Add log on behalf of ${s.tutorName}`, icon: LuFilePen, onSelect: () => openLog(branchId, s.id) },
                      { label: 'Open in schedule', icon: LuCalendarDays, separatorBefore: true, onSelect: () => navigate(schedulePath(s.dateKey)) },
                      { label: 'Open student profile', icon: LuGraduationCap, onSelect: () => navigate(`/${branchId}/${mode}/students/${s.studentId}`) },
                    )}
                  >
                    <TableRow className="cursor-pointer" data-testid="log-missing-row" onClick={() => openLog(branchId, s.id)}>
                      <TableCell className="whitespace-nowrap">{formatDateKey(s.dateKey, 'medium')}</TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatTimeRange(s.startMin, s.endMin)}</TableCell>
                      <TableCell className="font-medium">{s.studentName}</TableCell>
                      <TableCell className="hidden sm:table-cell">{s.tutorName}</TableCell>
                      <TableCell className="hidden lg:table-cell">{s.subject || '—'}</TableCell>
                      <TableCell colSpan={3}>
                        <div className="flex flex-wrap items-center gap-2">
                          {s.logStatus === 'draft' ? (
                            <Badge variant="secondary">Draft</Badge>
                          ) : (
                            <Badge className="border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" variant="outline">
                              Missing
                            </Badge>
                          )}
                          <SessionStatusBadge status={s.status} />
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right sm:table-cell">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            openLog(branchId, s.id)
                          }}
                        >
                          {s.logStatus === 'draft' ? <LuFilePen /> : <LuPlus />} {s.logStatus === 'draft' ? 'Finish log' : 'Add log'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  </ContextMenuFor>
                ))
              : slice(logRows).map((l) => {
                  const own = !!staffId && l.tutorId === staffId
                  const mayEdit = admin || (own && (l.status === 'draft' || settings.sessionLogs.allowEditAfterSubmit))
                  return (
                    <ContextMenuFor
                      key={l.id}
                      entries={menu(
                        { kind: 'label', label: `${l.studentName} · ${formatDateKey(l.dateKey, 'medium')}` },
                        { label: l.status === 'draft' ? 'Open draft' : 'Open log', icon: LuNotebookPen, onSelect: () => openLog(branchId, l.sessionId, true) },
                        mayEdit && {
                          label: l.status === 'draft' ? (own ? 'Continue the log' : `Finish on behalf of ${l.tutorName}`) : 'Edit log',
                          icon: l.status === 'draft' ? LuFilePen : LuPencil,
                          onSelect: () => openLog(branchId, l.sessionId),
                        },
                        (admin || own) && { label: 'Open in schedule', icon: LuCalendarDays, separatorBefore: true, onSelect: () => navigate(schedulePath(l.dateKey)) },
                        { label: 'Open student profile', icon: LuGraduationCap, separatorBefore: !(admin || own), onSelect: () => navigate(`/${branchId}/${mode}/students/${l.studentId}`) },
                      )}
                    >
                      <TableRow className="cursor-pointer" data-testid="log-row" onClick={() => openLog(branchId, l.sessionId, true)}>
                        <TableCell className="whitespace-nowrap">{formatDateKey(l.dateKey, 'medium')}</TableCell>
                        <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatTimeRange(l.startMin, l.endMin)}</TableCell>
                        <TableCell className="font-medium">
                          {l.studentName}
                          {l.status === 'draft' ? (
                            <Badge variant="secondary" className="ml-2 align-middle">
                              Draft
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{l.tutorName}</TableCell>
                        <TableCell className="hidden lg:table-cell">{l.subject || '—'}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <HomeworkBadge status={l.homeworkStatus} />
                        </TableCell>
                        <TableCell>
                          <StarRating value={averageRating(l.ratings)} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <FlagBadge flag={l.studentFlag} />
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{l.usedHours ? `${l.usedHours.toFixed(1)} hrs` : '—'}</TableCell>
                      </TableRow>
                    </ContextMenuFor>
                  )
                })}
            {!loading && !error && count === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  {status === 'missing'
                    ? 'No missing session logs for the selected filters.'
                    : status === 'draft'
                      ? 'No drafts for the selected filters.'
                      : 'No session logs found for the selected filters.'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {pages > 1 ? (
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm">
            <Button variant="ghost" size="sm" disabled={shown === 0} onClick={() => update({ page: shown > 1 ? String(shown) : null })}>
              ‹ Prev
            </Button>
            <span className="text-muted-foreground">
              Page {shown + 1} of {pages}
            </span>
            <Button variant="ghost" size="sm" disabled={shown >= pages - 1} onClick={() => update({ page: String(shown + 2) })}>
              Next ›
            </Button>
          </div>
        ) : null}
      </Card>
      {admin ? <AddLogDialog open={adding} onOpenChange={setAdding} /> : null}
    </div>
  )
}

export function TutorSessionLogListPage() {
  return <SessionLogListPage mode="tutor" />
}

/** Admin: pick a tutor and a session, then write the log on their behalf (True Education's "Add Session Log"). */
function AddLogDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { branchId, settings, timezone } = useBranch()
  const now = useNow(60_000)
  const { data: staff } = useStaffList()
  const tutors = staff.filter((s) => s.role === 'tutor' && s.status !== 'finished')
  const today = todayKey(timezone, now)
  const [picked, setPicked] = useState<string | null>(null)
  const [from, setFrom] = useState(addDays(today, -30))
  const [to, setTo] = useState(today)
  const [filter, setFilter] = useState('')
  const allowed = settings.sessionLogs.allowForStatuses

  // Missing logs per tutor in the range: shown in the picker, and the tutor with the most is preselected.
  const missingQ = useMemo(
    () => (open ? query(branchCol(branchId, COL.sessions), where('logStatus', 'in', ['none', 'draft']), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [open, branchId, from, to],
  )
  const { data: unlogged } = useQuery<Session>(missingQ, `addlog-missing-${from}-${to}`)
  const { missingByTutor, busiestId } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of unlogged) if (logMissing(s, allowed, now)) counts.set(s.tutorId, (counts.get(s.tutorId) ?? 0) + 1)
    const first = tutors.slice().sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name))[0]
    return { missingByTutor: counts, busiestId: first?.id ?? null }
  }, [unlogged, allowed, now, tutors])
  const tutorId = picked ?? busiestId

  const sessQ = useMemo(
    () => (open && tutorId ? query(branchCol(branchId, COL.sessions), where('tutorId', '==', tutorId), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [open, tutorId, branchId, from, to],
  )
  const { data: sessions, loading } = useQuery<Session>(sessQ, `addlog-${tutorId}-${from}-${to}`)
  const rows = sessions
    .filter((s) => !s.isDeleted && s.studentName.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.startMin - a.startMin)
  const missingCount = rows.filter((s) => logMissing(s, allowed, now)).length

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setPicked(null)
      }}
    >
      <DialogContent className="max-h-[88svh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add session log</DialogTitle>
          <DialogDescription>Pick a tutor and a session, then fill in the log on their behalf.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <OptionPicker
            className="sm:w-60"
            value={tutorId}
            onChange={setPicked}
            options={tutors.map((t) => ({ value: t.id, label: t.name, hint: missingByTutor.get(t.id) ? `${missingByTutor.get(t.id)} missing` : undefined }))}
            placeholder="Choose a tutor…"
          />
          <DatePicker className="sm:w-38" value={from} onChange={(d) => (setFrom(d), d > to && setTo(d))} aria-label="From" />
          <DatePicker className="sm:w-38" value={to} min={from} onChange={setTo} aria-label="To" />
          <Input placeholder="Filter by student" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground">
          {tutorId ? (loading ? 'Loading sessions…' : `${rows.length} session${rows.length === 1 ? '' : 's'} · ${missingCount} missing log${missingCount === 1 ? '' : 's'}`) : 'Select a tutor to see their sessions.'}
        </div>
        <div className="-mx-2 max-h-[50svh] divide-y overflow-y-auto">
          {rows.map((s) => {
            const logged = s.logStatus === 'submitted'
            const draft = s.logStatus === 'draft'
            const loggable = canLog(s.status, allowed)
            const ended = endMillis(s) <= now
            const state = logged
              ? { text: 'Log submitted', className: 'text-green-700 dark:text-green-400' }
              : !loggable
                ? { text: 'No log needed', className: 'text-muted-foreground' }
                : draft
                  ? { text: ended ? 'Draft · not submitted' : 'Draft', className: 'text-amber-700 dark:text-amber-400' }
                  : ended
                    ? { text: 'Log missing', className: 'text-red-700 dark:text-red-400' }
                    : { text: 'Upcoming', className: 'text-muted-foreground' }
            return (
              <div key={s.id} className="flex flex-col gap-2 px-2 py-2.5 text-sm sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {formatDateKey(s.dateKey, 'weekdayMedium')} · {formatTimeRange(s.startMin, s.endMin)}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {s.studentName} · {s.subject || 'No subject'}
                  </div>
                </div>
                <SessionStatusBadge status={s.status} />
                <span className={`w-36 text-xs font-medium sm:text-right ${state.className}`}>{state.text}</span>
                {loggable || logged ? (
                  <Button size="sm" className="sm:w-28" variant={logged ? 'outline' : 'default'} onClick={() => openLog(branchId, s.id, logged)}>
                    {logged ? <LuExternalLink /> : draft ? <LuFilePen /> : <LuPlus />} {logged ? 'Open log' : draft ? 'Finish log' : 'Add log'}
                  </Button>
                ) : (
                  <span className="hidden sm:block sm:w-28" />
                )}
              </div>
            )
          })}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Logs open in a new tab and are credited to the tutor.</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
