import { limit, orderBy, query, where, writeBatch } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuChartLine, LuExternalLink, LuFilePlus, LuPlus, LuTrash2 } from 'react-icons/lu'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { studentLabel } from '@shared/people'
import { type DateKey, formatInstant } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, menu } from '@/components/app/ItemMenu'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStudentList } from '@/features/data/hooks'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { NewReportDialog } from './NewReportDialog'
import { type AnyReport, LEVEL_STYLE, isV2, levelLabel, reportName } from './model'

const PAGE = 20
type Tab = 'all' | 'draft' | 'shared'
const toDate = (t: unknown) => ((t as { toDate?: () => Date } | null)?.toDate ? (t as { toDate: () => Date }).toDate() : null)

/** Sessions → Progress Reports: every report, its state, and New report. Tutors see their drafts and shared reports. */
export function ProgressReportsPage({ mode = 'admin' }: { mode?: 'admin' | 'tutor' }) {
  const { branchId, staffId, settings, timezone, actor } = useBranch()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState<{ studentId: string | null } | null>(null)
  const { confirm, dialog } = useConfirm()
  const admin = mode === 'admin'
  const canCreate = admin || (settings.progressReports.tutorsCanCreate && settings.sessionLogs.tutorsSeeAllLogs)
  const tab: Tab = params.get('tab') === 'draft' || params.get('tab') === 'shared' ? (params.get('tab') as Tab) : 'all'
  const studentId = params.get('student')
  const page = Math.max(1, Number(params.get('page')) || 1) - 1
  const update = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!('page' in patch)) next.delete('page')
        return next
      },
      { replace: true },
    )

  const allQ = useMemo(() => (admin ? query(branchCol(branchId, COL.progressReports), orderBy('generatedAt', 'desc'), limit(400)) : null), [admin, branchId])
  const sharedQ = useMemo(
    () => (!admin ? query(branchCol(branchId, COL.progressReports), where('sharedWithParents', '==', true), orderBy('generatedAt', 'desc'), limit(300)) : null),
    [admin, branchId],
  )
  const mineQ = useMemo(
    () => (!admin && staffId ? query(branchCol(branchId, COL.progressReports), where('generatedBy.staffId', '==', staffId), orderBy('generatedAt', 'desc'), limit(200)) : null),
    [admin, branchId, staffId],
  )
  const all = useQuery<AnyReport>(allQ, `reports-all-${branchId}`)
  const shared = useQuery<AnyReport>(sharedQ, `reports-shared-${branchId}`)
  const mine = useQuery<AnyReport>(mineQ, `reports-mine-${branchId}-${staffId}`)
  const loading = admin ? all.loading : shared.loading || mine.loading
  const reports = useMemo(() => {
    const list = admin ? all.data : [...mine.data, ...shared.data.filter((r) => !mine.data.some((m) => m.id === r.id))]
    return list.sort((a, b) => (toDate(b.generatedAt)?.getTime() ?? 0) - (toDate(a.generatedAt)?.getTime() ?? 0))
  }, [admin, all.data, shared.data, mine.data])
  const { data: students } = useStudentList()

  const lastReportTo = useMemo(() => {
    const m = new Map<string, DateKey>()
    for (const r of reports) if (!m.has(r.studentId) || r.endDate > m.get(r.studentId)!) m.set(r.studentId, r.endDate)
    return m
  }, [reports])

  const stateOf = (r: AnyReport) => (r.status === 'draft' || (!r.sharedWithParents && isV2(r)) ? 'draft' : r.sharedWithParents ? 'shared' : 'draft')
  const rows = reports.filter((r) => (tab === 'all' || stateOf(r) === tab) && (!studentId || r.studentId === studentId))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const shown = rows.slice(Math.min(page, pages - 1) * PAGE, Math.min(page, pages - 1) * PAGE + PAGE)
  const counts = { all: reports.length, draft: reports.filter((r) => stateOf(r) === 'draft').length, shared: reports.filter((r) => stateOf(r) === 'shared').length }
  const editorPath = (id: string) => `/${branchId}/${mode}/sessions/progress-reports/${id}`

  async function remove(r: WithId<AnyReport>) {
    if (!(await confirm({ title: 'Delete this report?', description: `${reportName(r)} for ${r.studentName} will be deleted. This can’t be undone.`, confirmLabel: 'Delete', destructive: true }))) return
    const batch = writeBatch(db)
    batch.delete(branchDocRef(branchId, COL.progressReports, r.id))
    addAudit(batch, branchId, actor, { action: 'report.delete', category: 'sessions', entityType: 'progressReport', entityId: r.id, summary: `Deleted ${r.studentName}'s progress report`, studentId: r.studentId, studentName: r.studentName })
    try {
      await batch.commit()
      toast.success('Report deleted')
    } catch (e) {
      toast.error('Could not delete the report', { description: (e as Error).message })
    }
  }

  const stateLabel = (r: AnyReport) => {
    if (stateOf(r) === 'draft') return <Badge variant="secondary">Draft</Badge>
    const viewed = toDate(r.firstViewedAt)
    const sharedAt = toDate(r.sharedAt) ?? toDate(r.generatedAt)
    return (
      <span className="text-xs whitespace-nowrap">
        <span className="font-medium text-emerald-700 dark:text-emerald-400">Shared</span>
        {sharedAt ? <span className="text-muted-foreground"> {formatInstant(sharedAt, timezone, { month: 'short', day: 'numeric' })}</span> : null}
        {viewed ? <span className="block text-muted-foreground">Viewed {formatInstant(viewed, timezone, { month: 'short', day: 'numeric' })}</span> : null}
      </span>
    )
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Progress Reports"
        description="Create, review and share progress reports with families."
        actions={
          canCreate ? (
            <Button onClick={() => setCreating({ studentId: studentId })}>
              <LuPlus /> New report
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Reports" className="flex rounded-lg bg-muted p-0.5 text-sm font-medium">
          {(
            [
              ['all', 'All'],
              ['draft', 'Drafts'],
              ['shared', 'Shared'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => update({ tab: key === 'all' ? null : key })}
              className={cn('rounded-md px-3 py-1 transition-colors', tab === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label} <span className="text-muted-foreground tabular-nums">{counts[key]}</span>
            </button>
          ))}
        </div>
        <OptionPicker
          className="w-full sm:w-64"
          value={studentId ?? 'all'}
          onChange={(v) => update({ student: v === 'all' ? null : v })}
          options={[{ value: 'all', label: 'All students' }, ...students.map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade) }))]}
        />
      </div>

      {!loading && reports.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuChartLine />
            </EmptyMedia>
            <EmptyTitle>No progress reports yet</EmptyTitle>
            <EmptyDescription>Create one from a student’s session logs. You review it before the family sees it.</EmptyDescription>
          </EmptyHeader>
          {canCreate ? (
            <EmptyContent>
              <Button onClick={() => setCreating({ studentId: null })}>
                <LuPlus /> New report
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="hidden text-right md:table-cell">Sessions</TableHead>
                <TableHead className="hidden text-right md:table-cell">Hours</TableHead>
                <TableHead className="hidden sm:table-cell">Progress</TableHead>
                <TableHead>Report</TableHead>
                <TableHead className="hidden lg:table-cell">Prepared by</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => {
                const v2 = isV2(r)
                const level = v2 ? r.progress?.level : null
                const entries = menu(
                  { kind: 'label', label: `${r.studentName} · ${v2 ? r.period.label : reportName(r)}` },
                  { label: 'Open', icon: LuChartLine, onSelect: () => navigate(editorPath(r.id)) },
                  { label: 'Open printable report', icon: LuExternalLink, onSelect: () => window.open(`/${branchId}/progress-report/${r.id}`, '_blank', 'noopener') },
                  canCreate && { label: 'New report from here', icon: LuFilePlus, separatorBefore: true, onSelect: () => setCreating({ studentId: r.studentId }) },
                  admin && { label: 'Delete', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void remove(r) },
                )
                return (
                  <ContextMenuFor key={r.id} entries={entries}>
                    <TableRow className="cursor-pointer" onClick={() => navigate(editorPath(r.id))} data-testid="report-row">
                      <TableCell>
                        <div className="font-medium">{r.studentName}</div>
                        {v2 && r.student.grade ? <div className="text-xs text-muted-foreground">Grade {r.student.grade}</div> : null}
                      </TableCell>
                      <TableCell>
                        <div className="whitespace-nowrap">{v2 ? r.period.label : reportName(r)}</div>
                        {r.customName ? <div className="max-w-56 truncate text-xs text-muted-foreground">{r.customName}</div> : null}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{r.sessionCount ?? '—'}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{v2 ? r.facts.hours.total : '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {level ? <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', LEVEL_STYLE[level].chip)}>{levelLabel(level, 'staff')}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{stateLabel(r)}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{v2 ? r.generatedBy?.name : '—'}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ItemMenuButton entries={entries} />
                      </TableCell>
                    </TableRow>
                  </ContextMenuFor>
                )
              })}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No reports match these filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {pages > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => update({ page: page > 1 ? String(page) : null })}>
                ‹ Prev
              </Button>
              <span className="text-muted-foreground">
                Page {Math.min(page, pages - 1) + 1} of {pages}
              </span>
              <Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => update({ page: String(page + 2) })}>
                Next ›
              </Button>
            </div>
          ) : null}
        </Card>
      )}
      {creating ? <NewReportDialog open onOpenChange={(o) => !o && setCreating(null)} studentId={creating.studentId} lastReportTo={lastReportTo} /> : null}
      {dialog}
    </div>
  )
}

export function TutorProgressReportsPage() {
  return <ProgressReportsPage mode="tutor" />
}
