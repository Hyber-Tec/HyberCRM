import { orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { COL } from '@shared/paths'
import { type SessionLog, averageRating } from '@shared/sessions/logs'
import { buildMetrics } from '@shared/sessions/reports'
import { formatDateKey, formatTimeRange } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { openLog } from '@/features/sessions/SessionLogListPage'
import { type ProgressReport, RISK_STYLE, reportTitle } from '@/features/sessions/reportModel'
import { FlagBadge, HomeworkBadge, StarRating } from '@/features/sessions/widgets'
import { branchCol, useQuery } from '@/lib/firestore'

const PAGE = 10

/** Student profile → Sessions: log summary, logged history, reports and scheduled sessions. */
export function SessionsTab({ student, mode }: { student: WithId<Student>; mode: 'admin' | 'tutor' }) {
  const { branchId, staffId, settings } = useBranch()
  const seeAllLogs = mode === 'admin' || settings.sessionLogs.tutorsSeeAllLogs
  const logsQ = useMemo(() => {
    const base = branchCol(branchId, COL.sessionLogs)
    if (seeAllLogs) return query(base, where('studentId', '==', student.id), where('status', '==', 'submitted'), orderBy('dateKey', 'desc'))
    return staffId ? query(base, where('tutorId', '==', staffId), orderBy('dateKey', 'desc')) : null
  }, [branchId, student.id, seeAllLogs, staffId])
  const { data: logsRaw } = useQuery<SessionLog>(logsQ, `student-logs-${student.id}-${seeAllLogs}`)
  const logs = logsRaw.filter((l) => l.studentId === student.id && l.status === 'submitted')
  const reportsQ = useMemo(() => query(branchCol(branchId, COL.progressReports), where('studentId', '==', student.id), orderBy('generatedAt', 'desc')), [branchId, student.id])
  const { data: reports } = useQuery<ProgressReport>(reportsQ, `student-reports-${student.id}`)
  const sessQ = useMemo(() => {
    const base = branchCol(branchId, COL.sessions)
    if (mode === 'tutor') return staffId ? query(base, where('studentId', '==', student.id), where('tutorId', '==', staffId), orderBy('dateKey', 'desc')) : null
    return query(base, where('studentId', '==', student.id), orderBy('dateKey', 'desc'))
  }, [branchId, student.id, mode, staffId])
  const { data: sessionsRaw } = useQuery<Session>(sessQ, `student-sessions-${student.id}-${mode}`)
  const sessions = sessionsRaw.filter((s) => !s.isDeleted)
  const metrics = useMemo(() => buildMetrics(logs, settings.sessionLogs.ratingDimensions, settings.progressReports.risk), [logs, settings])
  const avg = useMemo(() => {
    const vals = logs.map((l) => averageRating(l.ratings)).filter((v): v is number => v !== null)
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
  }, [logs])
  const [page, setPage] = useState(0)
  const [sPage, setSPage] = useState(0)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ['Sessions logged', String(metrics.totalSessions)],
          ['Total hours', metrics.totalHours.toFixed(1)],
          ['Homework done', metrics.homeworkCompletionRate != null ? `${metrics.homeworkCompletionRate}%` : '—'],
        ].map(([k, v]) => (
          <Card key={k} className="gap-1 px-4 py-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="text-xl font-semibold tabular-nums">{v}</div>
          </Card>
        ))}
        <Card className="gap-1 px-4 py-3">
          <div className="text-xs text-muted-foreground">Avg rating</div>
          <StarRating value={avg} />
        </Card>
        <Card className="gap-1 px-4 py-3">
          <div className="text-xs text-muted-foreground">Status</div>
          <Badge variant="outline" className={RISK_STYLE[metrics.riskLevel]}>
            {metrics.totalSessions ? metrics.riskLevel : '—'}
          </Badge>
        </Card>
      </div>

      {reports.length ? (
        <Card className="py-0">
          <div className="border-b px-4 py-2 text-sm font-medium">Progress reports</div>
          <div className="divide-y">
            {reports.slice(0, 5).map((r) => (
              <button
                key={r.id}
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => window.open(`/${branchId}/progress-report/${r.id}`, '_blank', 'noopener')}
              >
                <span className="flex-1 truncate">{reportTitle(r)}</span>
                <span className="text-xs text-muted-foreground">{r.sessionCount} sessions</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="py-0">
        <div className="border-b px-4 py-2 text-sm font-medium">Session history (logs)</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="hidden md:table-cell">Time</TableHead>
              <TableHead>Tutor</TableHead>
              <TableHead className="hidden sm:table-cell">Subject</TableHead>
              <TableHead className="hidden md:table-cell">Homework</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead className="hidden lg:table-cell">Flag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.slice(page * PAGE, page * PAGE + PAGE).map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => openLog(branchId, l.sessionId, true)}>
                <TableCell className="whitespace-nowrap">{formatDateKey(l.dateKey, 'medium')}</TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatTimeRange(l.startMin, l.endMin)}</TableCell>
                <TableCell>{l.tutorName}</TableCell>
                <TableCell className="hidden sm:table-cell">{l.subject}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <HomeworkBadge status={l.homeworkStatus} />
                </TableCell>
                <TableCell>
                  <StarRating value={averageRating(l.ratings)} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <FlagBadge flag={l.studentFlag} />
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No sessions recorded for this student yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <Pager page={page} total={logs.length} onPage={setPage} />
      </Card>

      <Card className="py-0">
        <div className="border-b px-4 py-2 text-sm font-medium">Scheduled sessions</div>
        <Table>
          <TableBody>
            {sessions.slice(sPage * PAGE, sPage * PAGE + PAGE).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap">{formatDateKey(s.dateKey, 'weekdayMedium')}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatTimeRange(s.startMin, s.endMin)}</TableCell>
                <TableCell>{s.tutorName}</TableCell>
                <TableCell className="hidden sm:table-cell">{s.subject || '—'}</TableCell>
                <TableCell>
                  <SessionStatusBadge status={s.status} logSubmitted={s.logStatus === 'submitted'} />
                </TableCell>
              </TableRow>
            ))}
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center text-sm text-muted-foreground">No sessions scheduled.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        <Pager page={sPage} total={sessions.length} onPage={setSPage} />
      </Card>
    </div>
  )
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE))
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm">
      <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
        ‹ Prev
      </Button>
      <span className="text-muted-foreground">
        Page {page + 1} of {pages}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        Next ›
      </Button>
    </div>
  )
}
