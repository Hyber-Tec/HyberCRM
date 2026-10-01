import { addDoc, deleteDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useMemo, useState } from 'react'
import { LuEllipsis, LuExternalLink, LuPencil, LuShare2, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { studentLabel } from '@shared/people'
import { type SessionLog } from '@shared/sessions/logs'
import { type ReportMetrics, type ReportNarrative, buildMetrics, localNarrative } from '@shared/sessions/reports'
import { addDays, formatDateKey, formatInstant, todayKey } from '@shared/time'
import type { TimestampLike, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStudentList } from '@/features/data/hooks'
import { addAudit } from '@/lib/audit'
import { db, functions } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { writeBatch } from 'firebase/firestore'

export interface ProgressReport {
  studentId: string
  studentName: string
  startDate: string
  endDate: string
  generatedAt: TimestampLike | null
  generatedBy: string
  generatedByName: string
  sessionCount: number
  sessionIds: string[]
  lastSessionDateKey: string | null
  metrics: ReportMetrics
  narrative: ReportNarrative
  customName: string | null
  sharedWithParents: boolean
}

const aiCallable = httpsCallable<{ branchId: string; mode: 'report'; payload: Record<string, unknown> }, ReportNarrative>(functions, 'sessionAi')

export function reportTitle(r: Pick<ProgressReport, 'customName' | 'studentName' | 'startDate' | 'endDate'>) {
  return r.customName || `${r.studentName} — Progress Report — ${formatDateKey(r.startDate, 'medium')} – ${formatDateKey(r.endDate, 'medium')}`
}

export const RISK_STYLE: Record<string, string> = {
  'On Track': 'border-green-200 bg-green-50 text-green-700',
  'Needs Attention': 'border-amber-200 bg-amber-50 text-amber-800',
  'At Risk': 'border-red-200 bg-red-50 text-red-700',
}

/** Session → Progress Reports (admin and tutor). */
export function ProgressReportsPage({ mode = 'admin' }: { mode?: 'admin' | 'tutor' }) {
  const { branchId, actor, settings, timezone, staffId } = useBranch()
  const { data: students } = useStudentList()
  const today = todayKey(timezone)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [from, setFrom] = useState(addDays(today, -90))
  const [to, setTo] = useState(today)
  const [busy, setBusy] = useState(false)
  const reportsQ = useMemo(() => {
    const base = branchCol(branchId, COL.progressReports)
    return studentId ? query(base, where('studentId', '==', studentId), orderBy('generatedAt', 'desc')) : query(base, orderBy('generatedAt', 'desc'), limit(50))
  }, [branchId, studentId])
  const { data: reports, loading } = useQuery<ProgressReport>(reportsQ, `reports-${branchId}-${studentId}`)
  const isAdmin = mode === 'admin'

  async function generate() {
    const st = students.find((s) => s.id === studentId)
    if (!st) return toast.error('Choose a student.')
    setBusy(true)
    try {
      const seeAll = isAdmin || settings.sessionLogs.tutorsSeeAllLogs
      const base = branchCol(branchId, COL.sessionLogs)
      const snap = await getDocs(
        seeAll
          ? query(base, where('studentId', '==', st.id), where('status', '==', 'submitted'), orderBy('dateKey', 'desc'))
          : query(base, where('tutorId', '==', staffId), orderBy('dateKey', 'desc')),
      )
      const logs = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as SessionLog) }))
        .filter((l) => l.studentId === st.id && l.status === 'submitted' && l.dateKey >= from && l.dateKey <= to)
      if (logs.length === 0) {
        toast.error('No submitted session logs in this date range.')
        return
      }
      const metrics = buildMetrics(logs, settings.sessionLogs.ratingDimensions, settings.progressReports.risk, settings.progressReports.maxTopics)
      let narrative = localNarrative(metrics, st.name)
      if (settings.progressReports.ai.enabled) {
        try {
          const recent = logs.slice(0, 25)
          const res = await aiCallable({
            branchId,
            mode: 'report',
            payload: {
              studentName: st.name,
              startDate: from,
              endDate: to,
              metrics,
              recentLessonNotes: recent.map((l) => `${l.lessonActivity}. ${l.topicCovered}`).join(' | ').slice(0, 2000),
              recentNextFocus: logs.slice(0, 15).map((l) => `${l.nextFocus}. ${l.ai?.nextSessionPlan ?? ''}`).join(' | ').slice(0, 1200),
              recentHomeworkComments: logs.slice(0, 15).map((l) => l.homeworkComments).filter(Boolean).join(' | ').slice(0, 800),
              recentLearningInsights: logs.slice(0, 15).map((l) => l.learningInsight).join(' | ').slice(0, 1000),
            },
          })
          narrative = res.data
        } catch {
          /* keep the deterministic narrative */
        }
      }
      const ref = await addDoc(branchCol(branchId, COL.progressReports), {
        studentId: st.id,
        studentName: st.name,
        startDate: from,
        endDate: to,
        generatedAt: serverTimestamp(),
        generatedBy: actor.email,
        generatedByName: actor.name,
        sessionCount: logs.length,
        sessionIds: logs.map((l) => l.sessionId),
        lastSessionDateKey: logs[0].dateKey,
        metrics,
        narrative,
        customName: null,
        sharedWithParents: false,
      })
      toast.success('Report generated')
      window.open(`/${branchId}/progress-report/${ref.id}`, '_blank', 'noopener')
    } catch (e) {
      toast.error('Could not generate the report', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function act(r: WithId<ProgressReport>, action: 'rename' | 'share' | 'delete') {
    try {
      if (action === 'rename') {
        const name = window.prompt('Report name', reportTitle(r))
        if (name?.trim()) await updateDoc(branchDocRef(branchId, COL.progressReports, r.id), { customName: name.trim() })
      } else if (action === 'share') {
        const batch = writeBatch(db)
        batch.update(branchDocRef(branchId, COL.progressReports, r.id), { sharedWithParents: !r.sharedWithParents })
        addAudit(batch, branchId, actor, {
          action: r.sharedWithParents ? 'report.unshare' : 'report.share',
          category: 'sessions',
          entityType: 'progressReport',
          entityId: r.id,
          studentId: r.studentId,
          studentName: r.studentName,
          summary: `${r.sharedWithParents ? 'Stopped sharing' : 'Shared'} a progress report with ${r.studentName}’s family`,
        })
        await batch.commit()
        toast.success(r.sharedWithParents ? 'No longer shared' : 'Shared with the family')
      } else if (window.confirm(`Permanently delete "${reportTitle(r)}"?`)) {
        await deleteDoc(branchDocRef(branchId, COL.progressReports, r.id))
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader title="Progress Reports" description="Generate progress reports for parents, tutors and administrators from submitted session logs." />
      <Card>
        <CardHeader>
          <CardTitle>Generate report</CardTitle>
          <CardDescription>Uses every submitted session log for the student in the date range.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <OptionPicker
            className="lg:w-72"
            value={studentId}
            onChange={setStudentId}
            options={students.map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade) }))}
            placeholder="Select student…"
          />
          <div className="flex items-center gap-2">
            <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button disabled={busy || !studentId} onClick={() => void generate()}>
            {busy ? <Spinner /> : null} {busy ? 'Generating…' : 'Generate'}
          </Button>
        </CardContent>
      </Card>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead className="hidden md:table-cell">Generated</TableHead>
              <TableHead className="hidden lg:table-cell">Sessions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => window.open(`/${branchId}/progress-report/${r.id}`, '_blank', 'noopener')}>
                <TableCell className="max-w-96">
                  <div className="truncate font-medium">{reportTitle(r)}</div>
                  {r.sharedWithParents ? (
                    <Badge variant="secondary" className="mt-1">
                      Shared with family
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{r.generatedAt ? formatInstant(r.generatedAt.toDate(), timezone, { dateStyle: 'medium' }) : '…'}</TableCell>
                <TableCell className="hidden lg:table-cell">{r.sessionCount}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={RISK_STYLE[r.narrative?.riskLevel ?? r.metrics.riskLevel]}>
                    {r.narrative?.riskLevel ?? r.metrics.riskLevel}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Actions">
                        <LuEllipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => window.open(`/${branchId}/progress-report/${r.id}`, '_blank', 'noopener')}>
                        <LuExternalLink /> Open report
                      </DropdownMenuItem>
                      {isAdmin ? (
                        <>
                          <DropdownMenuItem onSelect={() => void act(r, 'share')}>
                            <LuShare2 /> {r.sharedWithParents ? 'Stop sharing with family' : 'Share with family'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void act(r, 'rename')}>
                            <LuPencil /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => void act(r, 'delete')}>
                            <LuTrash2 /> Delete
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {!loading && reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No reports generated yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export function TutorProgressReportsPage() {
  return <ProgressReportsPage mode="tutor" />
}
