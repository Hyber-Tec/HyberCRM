import { orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuExternalLink, LuPlus } from 'react-icons/lu'
import { COL } from '@shared/paths'
import { studentLabel } from '@shared/people'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import { type SessionLog, averageRating, canLog } from '@shared/sessions/logs'
import { addDays, formatDateKey, formatTimeRange, todayKey } from '@shared/time'
import type { Session } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStaffList, useStudentList } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { FlagBadge, HomeworkBadge, StarRating } from './widgets'

const PAGE = 20

export function openLog(branchId: string, sessionId: string, view = false) {
  window.open(`/${branchId}/session-log/${sessionId}${view ? '/view' : ''}`, '_blank', 'noopener')
}

/** Session → Log (admin and tutor). */
export function SessionLogListPage({ mode = 'admin' }: { mode?: 'admin' | 'tutor' }) {
  const { branchId, settings, staffId, timezone } = useBranch()
  const today = todayKey(timezone)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [from, setFrom] = useState(addDays(today, -14))
  const [to, setTo] = useState(today)
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState(false)
  const { data: students } = useStudentList()
  const seeAll = mode === 'admin' || settings.sessionLogs.tutorsSeeAllLogs

  const q = useMemo(() => {
    const base = branchCol(branchId, COL.sessionLogs)
    if (!seeAll) return staffId ? query(base, where('tutorId', '==', staffId), orderBy('dateKey', 'desc')) : null
    if (studentId) return query(base, where('studentId', '==', studentId), orderBy('dateKey', 'desc'))
    return query(base, where('status', '==', 'submitted'), where('dateKey', '>=', from), where('dateKey', '<=', to), orderBy('dateKey', 'desc'))
  }, [branchId, seeAll, staffId, studentId, from, to])
  const { data, loading } = useQuery<SessionLog>(q, `logs-${branchId}-${seeAll}-${studentId}-${from}-${to}`)
  const rows = data
    .filter((l) => l.status === 'submitted')
    .filter((l) => (!studentId || l.studentId === studentId) && (!from || l.dateKey >= from) && (!to || l.dateKey <= to))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Session Log"
        description="Search and review tutoring session logs. Click a row to open the full log."
        actions={
          mode === 'admin' ? (
            <Button onClick={() => setAdding(true)}>
              <LuPlus /> Add session log
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <OptionPicker
          className="lg:w-72"
          value={studentId ?? 'all'}
          onChange={(v) => {
            setStudentId(v === 'all' ? null : v)
            setPage(0)
          }}
          options={[{ value: 'all', label: 'All students' }, ...students.map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade) }))]}
        />
        <div className="flex items-center gap-2">
          <Input type="date" className="w-40" value={from} onChange={(e) => (setFrom(e.target.value), setPage(0))} />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" className="w-40" value={to} onChange={(e) => (setTo(e.target.value), setPage(0))} />
        </div>
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
              <TableHead className="hidden md:table-cell">Homework</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead className="hidden lg:table-cell">Flag</TableHead>
              <TableHead className="hidden sm:table-cell text-right">Hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(page * PAGE, page * PAGE + PAGE).map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => openLog(branchId, l.sessionId, true)}>
                <TableCell className="whitespace-nowrap">{formatDateKey(l.dateKey, 'medium')}</TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatTimeRange(l.startMin, l.endMin)}</TableCell>
                <TableCell className="font-medium">{l.studentName}</TableCell>
                <TableCell className="hidden sm:table-cell">{l.tutorName}</TableCell>
                <TableCell className="hidden lg:table-cell">{l.subject}</TableCell>
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
            ))}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No session logs found for the selected filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {pages > 1 ? (
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm">
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ‹ Prev
            </Button>
            <span className="text-muted-foreground">
              Page {page + 1} of {pages}
            </span>
            <Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              Next ›
            </Button>
          </div>
        ) : null}
      </Card>
      {mode === 'admin' ? <AddLogDialog open={adding} onOpenChange={setAdding} /> : null}
    </div>
  )
}

export function TutorSessionLogListPage() {
  return <SessionLogListPage mode="tutor" />
}

/** Admin: pick a tutor and a session, then write the log on their behalf. */
function AddLogDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { branchId, settings, timezone } = useBranch()
  const { data: staff } = useStaffList()
  const tutors = staff.filter((s) => s.roles.includes('tutor') && s.status !== 'finished')
  const today = todayKey(timezone)
  const [tutorId, setTutorId] = useState<string | null>(null)
  const [from, setFrom] = useState(addDays(today, -30))
  const [to, setTo] = useState(today)
  const [filter, setFilter] = useState('')
  const sessQ = useMemo(
    () => (open && tutorId ? query(branchCol(branchId, COL.sessions), where('tutorId', '==', tutorId), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [open, tutorId, branchId, from, to],
  )
  const { data: sessions, loading } = useQuery<Session>(sessQ, `addlog-${tutorId}-${from}-${to}`)
  const rows = sessions
    .filter((s) => !s.isDeleted && s.studentName.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.startMin - a.startMin)
  const missing = rows.filter((s) => s.logStatus !== 'submitted' && canLog(s.status, settings.sessionLogs.allowForStatuses) && s.dateKey <= today).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add session log</DialogTitle>
          <DialogDescription>Pick a tutor and a session, then fill in the log on their behalf. Logs open in a new tab and stay credited to the tutor.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <OptionPicker className="sm:w-56" value={tutorId} onChange={setTutorId} options={tutors.map((t) => ({ value: t.id, label: t.name }))} placeholder="Choose a tutor…" />
          <Input type="date" className="sm:w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" className="sm:w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input placeholder="Filter by student" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground">{tutorId ? (loading ? 'Loading sessions…' : `${rows.length} sessions · ${missing} missing logs`) : 'Select a tutor to see their sessions.'}</div>
        <div className="-mx-2 max-h-[55svh] divide-y overflow-y-auto">
          {rows.map((s) => {
            const logged = s.logStatus === 'submitted'
            const loggable = canLog(s.status, settings.sessionLogs.allowForStatuses)
            const ended = s.dateKey <= today
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
                <Badge variant="outline">{SESSION_STATUS_LABELS[s.status]}</Badge>
                <span className={logged ? 'text-green-700' : ended && loggable ? 'text-orange-700' : 'text-muted-foreground'}>
                  {logged ? 'Log submitted' : !loggable ? 'No log needed' : ended ? 'Log missing' : 'Upcoming'}
                </span>
                {loggable || logged ? (
                  <Button size="sm" variant={logged ? 'outline' : 'default'} onClick={() => openLog(branchId, s.id, false)}>
                    {logged ? <LuExternalLink /> : <LuPlus />} {logged ? 'Open log' : 'Add log'}
                  </Button>
                ) : null}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
