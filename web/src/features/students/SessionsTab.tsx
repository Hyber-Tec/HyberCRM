import { orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuPlus } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { COL } from '@shared/paths'
import { buildReportFacts } from '@shared/reports/facts'
import { progressStatus } from '@shared/reports/status'
import { type SessionLog, averageRating } from '@shared/sessions/logs'
import { type DateKey, formatDateKey, formatTimeRange, todayKey } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { openLog } from '@/features/sessions/SessionLogListPage'
import { NewReportDialog } from '@/features/reports/NewReportDialog'
import { type AnyReport, LEVEL_STYLE, isV2, levelLabel, reportName } from '@/features/reports/model'
import { FlagBadge, HomeworkBadge, StarRating } from '@/features/sessions/widgets'
import { branchCol, useQuery } from '@/lib/firestore'

const PAGE = 10

/** Student profile → Sessions: log summary, logged history, reports and scheduled sessions. */
export function SessionsTab({ student, mode }: { student: WithId<Student>; mode: 'admin' | 'tutor' }) {
  const { branchId, staffId, settings, timezone } = useBranch()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const canCreate = mode === 'admin' || (settings.progressReports.tutorsCanCreate && settings.sessionLogs.tutorsSeeAllLogs)
  const seeAllLogs = mode === 'admin' || settings.sessionLogs.tutorsSeeAllLogs
  const logsQ = useMemo(() => {
    const base = branchCol(branchId, COL.sessionLogs)
    if (seeAllLogs) return query(base, where('studentId', '==', student.id), where('status', '==', 'submitted'), orderBy('dateKey', 'desc'))
    return staffId ? query(base, where('tutorId', '==', staffId), orderBy('dateKey', 'desc')) : null
  }, [branchId, student.id, seeAllLogs, staffId])
  const { data: logsRaw } = useQuery<SessionLog>(logsQ, `student-logs-${student.id}-${seeAllLogs}`)
  const logs = logsRaw.filter((l) => l.studentId === student.id && l.status === 'submitted')
  // Tutors read shared reports here (their own drafts are in Sessions → Progress Reports).
  const reportsQ = useMemo(
    () =>
      mode === 'admin'
        ? query(branchCol(branchId, COL.progressReports), where('studentId', '==', student.id), orderBy('generatedAt', 'desc'))
        : query(branchCol(branchId, COL.progressReports), where('studentId', '==', student.id), where('sharedWithParents', '==', true), orderBy('generatedAt', 'desc')),
    [branchId, student.id, mode],
  )
  const { data: reports } = useQuery<AnyReport>(reportsQ, `student-reports-${student.id}-${mode}`)
  const lastReportTo = useMemo(() => {
    const m = new Map<string, DateKey>()
    for (const r of reports) if (!m.has(r.studentId) || r.endDate > m.get(r.studentId)!) m.set(r.studentId, r.endDate)
    return m
  }, [reports])
  const sessQ = useMemo(() => {
    const base = branchCol(branchId, COL.sessions)
    if (mode === 'tutor') return staffId ? query(base, where('studentId', '==', student.id), where('tutorId', '==', staffId), orderBy('dateKey', 'desc')) : null
    return query(base, where('studentId', '==', student.id), orderBy('dateKey', 'desc'))
  }, [branchId, student.id, mode, staffId])
  const { data: sessionsRaw } = useQuery<Session>(sessQ, `student-sessions-${student.id}-${mode}`)
  const sessions = sessionsRaw.filter((s) => !s.isDeleted)
  // The same figures and status rule as progress reports, over every logged session.
  const summary = useMemo(() => {
    if (!logs.length) return null
    const today = todayKey(timezone)
    const first = logs.reduce((m, l) => (l.dateKey < m ? l.dateKey : m), logs[0].dateKey)
    const { facts } = buildReportFacts({
      period: { from: first, to: today > first ? today : first },
      // No sessions are passed, so "now" only matters for the period's end.
      nowMs: 0,
      today,
      student: { totalSessionHours: student.totalSessionHours ?? 0, conferenceBaselineHours: 0 },
      sessions: [],
      logs,
      upcoming: [],
      dimensions: settings.sessionLogs.ratingDimensions,
      loggableStatuses: settings.sessionLogs.allowForStatuses,
      conference: { enabled: false, everyHours: 0 },
      previous: null,
    })
    return { facts, progress: progressStatus(facts, logs, settings.progressReports.risk) }
  }, [logs, settings, timezone, student.totalSessionHours])
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
          ['Sessions logged', String(logs.length)],
          ['Total hours', (summary?.facts.hours.total ?? 0).toFixed(1)],
          ['Homework done', summary?.facts.homework.percent != null ? `${summary.facts.homework.percent}%` : '—'],
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
          {summary?.progress.level ? (
            <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${LEVEL_STYLE[summary.progress.level].chip}`}>{levelLabel(summary.progress.level, 'staff')}</span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </Card>
      </div>

      {reports.length || canCreate ? (
        <Card className="gap-0 py-0" data-testid="student-reports">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <span className="text-sm font-medium">Progress reports</span>
            {canCreate ? (
              <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
                <LuPlus /> New report
              </Button>
            ) : null}
          </div>
          <div className="divide-y">
            {reports.slice(0, 5).map((r) => (
              <button
                key={r.id}
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => navigate(`/${branchId}/${mode}/sessions/progress-reports/${r.id}`)}
              >
                <span className="flex-1 truncate">{reportName(r).replace(/^./, (c) => c.toUpperCase())}</span>
                {isV2(r) && r.status === 'draft' ? <Badge variant="secondary">Draft</Badge> : <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Shared</span>}
                <span className="hidden text-xs text-muted-foreground sm:inline">{r.sessionCount} sessions</span>
              </button>
            ))}
            {reports.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">No reports yet.</p> : null}
          </div>
        </Card>
      ) : null}
      {creating ? <NewReportDialog open onOpenChange={(o) => !o && setCreating(false)} studentId={student.id} lastReportTo={lastReportTo} /> : null}

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
