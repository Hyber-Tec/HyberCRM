import { collection, doc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import {
  LuArrowLeft,
  LuCircleAlert,
  LuEllipsis,
  LuExternalLink,
  LuEye,
  LuPencil,
  LuRefreshCw,
  LuSend,
  LuSparkles,
  LuTrash2,
  LuUndo2,
} from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { COL, branchColPath } from '@shared/paths'
import { logFingerprint } from '@shared/reports/compose'
import { NARRATIVE_LABELS, type NarrativeKey, type ReportNarrative, type ReportOptions, type SectionMeta } from '@shared/reports/types'
import type { SessionLog } from '@shared/sessions/logs'
import { formatDateKey, formatInstant } from '@shared/time'
import type { Member } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { type EditApi, ReportDocument, StatusChip } from './ReportDocument'
import { type AnyReport, type ProgressReportDoc, callableMessage, isV2, levelLabel, regenerateReport, reportName, shareReport } from './model'

const toDate = (t: unknown) => ((t as { toDate?: () => Date } | null)?.toDate ? (t as { toDate: () => Date }).toDate() : null)

/** Sessions → Progress Reports → a report: review, edit, rewrite with AI, share. */
export function ReportEditorPage() {
  const { reportId = '' } = useParams()
  const navigate = useNavigate()
  const { branchId, branch, timezone, isAdmin, staffId, settings, actor } = useBranch()
  const portal = isAdmin ? 'admin' : 'tutor'
  const listPath = `/${branchId}/${portal}/sessions/progress-reports`
  const ref = useMemo(() => branchDocRef(branchId, COL.progressReports, reportId), [branchId, reportId])
  const { data: r, loading } = useDoc<AnyReport>(ref)
  const [editing, setEditing] = useState<{ narrative: ReportNarrative; meta: Partial<Record<NarrativeKey, SectionMeta>>; touched: Set<NarrativeKey> } | null>(null)
  const [busy, setBusy] = useState<NarrativeKey | 'all' | 'refresh' | 'save' | null>(null)
  const [sharing, setSharing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    if (r && isV2(r)) document.title = `${r.student.name} – Progress report | ${branch.name}`
  }, [r, branch.name])

  if (loading) return <FullPageSpinner label="Loading the report…" />
  if (!r) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-lg font-semibold">Report not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate(listPath)}>
          Back to Progress Reports
        </Button>
      </div>
    )
  }
  if (!isV2(r)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-lg font-semibold">This report needs updating</h1>
        <p className="mt-1 text-sm text-muted-foreground">It was made with an earlier version. Create a new report for this student instead.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate(listPath)}>
          Back to Progress Reports
        </Button>
      </div>
    )
  }

  const report = r
  const draft = report.status === 'draft'
  const mine = !!staffId && report.generatedBy?.staffId === staffId
  const mayEdit = draft && (isAdmin || mine)
  const aiOn = settings.progressReports.ai.enabled
  const viewed = toDate(report.firstViewedAt)
  const sharedAt = toDate(report.sharedAt)

  const startEdit = () => setEditing({ narrative: structuredClone(report.narrative), meta: { ...(report.narrativeMeta?.sections ?? {}) }, touched: new Set() })
  const editApi: EditApi | null = editing
    ? {
        narrative: editing.narrative,
        meta: editing.meta,
        busy: busy && busy !== 'save' && busy !== 'refresh' && busy !== 'all' ? busy : null,
        onChange: (key, value) =>
          setEditing((e) => (e ? { ...e, narrative: { ...e.narrative, [key]: value }, meta: { ...e.meta, [key]: { source: 'staff', editedBy: actor.name } }, touched: new Set(e.touched).add(key) } : e)),
        onRestore: (key) =>
          setEditing((e) =>
            e
              ? {
                  ...e,
                  narrative: { ...e.narrative, [key]: structuredClone(report.narrativeOriginal?.[key] ?? report.narrative[key]) },
                  meta: { ...e.meta, [key]: report.narrativeMeta?.sections?.[key]?.source === 'staff' ? { source: report.narrativeMeta.source } : (report.narrativeMeta?.sections?.[key] ?? { source: 'template' }) },
                  touched: new Set(e.touched).add(key),
                }
              : e,
          ),
        onRewrite: aiOn
          ? async (key) => {
              if (editing.touched.size) {
                const ok = await confirm({ title: 'Save your edits first?', description: 'Rewriting reloads this section from the server. Save your other changes before rewriting.', confirmLabel: 'Save and rewrite' })
                if (!ok) return
                await save(false)
              }
              setBusy(key)
              try {
                await regenerateReport({ branchId, reportId, section: key })
                toast.success(`${NARRATIVE_LABELS[key]} rewritten`)
                setEditing(null)
              } catch (e) {
                toast.error(callableMessage(e, 'AI isn’t available right now.'))
              } finally {
                setBusy(null)
              }
            }
          : null,
      }
    : null

  async function save(close = true) {
    if (!editing) return
    setBusy('save')
    try {
      const batch = writeBatch(db)
      const changed = [...editing.touched]
      const sections = { ...(report.narrativeMeta?.sections ?? {}) }
      for (const k of changed) sections[k] = editing.meta[k]?.source === 'staff' ? { source: 'staff', editedBy: actor.name, editedAt: new Date().toISOString() } : (editing.meta[k] ?? { source: 'template' })
      batch.update(ref, { narrative: editing.narrative, narrativeMeta: { ...report.narrativeMeta, sections }, updatedAt: serverTimestamp(), updatedBy: actor.email })
      addAudit(batch, branchId, actor, {
        action: 'report.edit',
        category: 'sessions',
        entityType: 'progressReport',
        entityId: reportId,
        summary: `Edited ${report.student.name}'s progress report`,
        studentId: report.studentId,
        studentName: report.student.name,
        changes: changed.map((k) => ({ field: `narrative.${k}`, label: NARRATIVE_LABELS[k], from: null, to: 'edited' })),
      })
      await batch.commit()
      toast.success('Report saved')
      if (close) setEditing(null)
      else setEditing((e) => (e ? { ...e, touched: new Set() } : e))
    } catch (e) {
      toast.error('Could not save the report', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function cancelEdit() {
    if (editing?.touched.size && !(await confirm({ title: 'Discard your changes?', description: 'Your edits to this report won’t be saved.', confirmLabel: 'Discard', destructive: true }))) return
    setEditing(null)
  }

  async function regenerateAll() {
    if (!(await confirm({ title: 'Rewrite every section with AI?', description: 'Sections you edited are replaced too. You can restore each one afterwards from its earlier draft.', confirmLabel: 'Rewrite all' }))) return
    setBusy('all')
    try {
      await regenerateReport({ branchId, reportId, section: 'all' })
      toast.success('Report rewritten')
    } catch (e) {
      toast.error(callableMessage(e, 'AI isn’t available right now.'))
    } finally {
      setBusy(null)
    }
  }

  async function refresh() {
    setBusy('refresh')
    try {
      await regenerateReport({ branchId, reportId, refresh: true })
      toast.success('Figures updated from the latest session logs')
    } catch (e) {
      toast.error(callableMessage(e, 'Could not update the report.'))
    } finally {
      setBusy(null)
    }
  }

  async function unshare() {
    if (!(await confirm({ title: 'Stop sharing this report?', description: 'The family won’t see it in their portal until you share it again.', confirmLabel: 'Stop sharing' }))) return
    try {
      await shareReport({ branchId, reportId, share: false, notify: false })
      toast.success('The report is a draft again')
    } catch (e) {
      toast.error(callableMessage(e, 'Could not change the report.'))
    }
  }

  async function remove() {
    if (!(await confirm({ title: 'Delete this report?', description: `${reportName(report)} for ${report.student.name} will be deleted. This can’t be undone.`, confirmLabel: 'Delete', destructive: true }))) return
    const batch = writeBatch(db)
    batch.delete(ref)
    addAudit(batch, branchId, actor, { action: 'report.delete', category: 'sessions', entityType: 'progressReport', entityId: reportId, summary: `Deleted ${report.student.name}'s progress report (${report.period.label})`, studentId: report.studentId, studentName: report.student.name })
    try {
      await batch.commit()
      toast.success('Report deleted')
      navigate(listPath)
    } catch (e) {
      toast.error('Could not delete the report', { description: (e as Error).message })
    }
  }

  return (
    <div className="-m-4 min-h-[calc(100svh-3rem)] sm:-m-6">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => (editing ? void cancelEdit().then(() => navigate(listPath)) : navigate(listPath))}>
            <LuArrowLeft /> Progress Reports
          </Button>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{report.student.name}</div>
            <div className="truncate text-xs text-muted-foreground">{reportName(report)}</div>
          </div>
          <Badge variant={draft ? 'secondary' : 'default'} data-testid="report-state">
            {draft ? 'Draft' : viewed ? `Viewed ${formatInstant(viewed, timezone, { month: 'short', day: 'numeric' })}` : `Shared${sharedAt ? ` ${formatInstant(sharedAt, timezone, { month: 'short', day: 'numeric' })}` : ''}`}
          </Badge>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void cancelEdit()}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy === 'save'} onClick={() => void save()}>
                {busy === 'save' ? <Spinner /> : null} Save
              </Button>
            </>
          ) : (
            <>
              {mayEdit ? (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <LuPencil /> Edit
                </Button>
              ) : null}
              {isAdmin ? (
                draft ? (
                  <Button size="sm" onClick={() => setSharing(true)}>
                    <LuSend /> Share with family
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void unshare()}>
                    <LuUndo2 /> Stop sharing
                  </Button>
                )
              ) : null}
              <Button variant="outline" size="sm" onClick={() => window.open(`/${branchId}/progress-report/${reportId}`, '_blank', 'noopener')}>
                <LuExternalLink /> Print / PDF
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <LuEllipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {mayEdit && aiOn ? (
                    <DropdownMenuItem disabled={!!busy} onSelect={() => void regenerateAll()}>
                      <LuSparkles /> Rewrite all with AI
                    </DropdownMenuItem>
                  ) : null}
                  {mayEdit ? (
                    <DropdownMenuItem disabled={!!busy} onSelect={() => void refresh()}>
                      <LuRefreshCw /> Update figures from the logs
                    </DropdownMenuItem>
                  ) : null}
                  {isAdmin ? (
                    <DropdownMenuItem onSelect={() => setRenaming(true)}>
                      <LuPencil /> Rename
                    </DropdownMenuItem>
                  ) : null}
                  {isAdmin ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                        <LuTrash2 /> Delete
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
        {busy === 'all' || busy === 'refresh' ? (
          <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-2 text-sm text-muted-foreground sm:px-6" role="status">
            <Spinner /> {busy === 'all' ? 'Rewriting the report with AI… This takes about 20 seconds.' : 'Updating the figures…'}
          </div>
        ) : null}
        {!draft && !editing ? (
          <div className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground sm:px-6">
            Shared reports are locked. {isAdmin ? 'Stop sharing to change it.' : 'An admin can stop sharing it to make changes.'}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="report-canvas -mx-4 rounded-none py-6 sm:mx-0 sm:rounded-xl sm:px-4 sm:py-8">
          <ReportDocument report={report} audience="family" timezone={timezone} logoUrl={branch.branding?.logoUrl ?? null} edit={editApi} />
        </div>
        <FactsPanel report={report} reportId={reportId} mayEdit={mayEdit && !editing} onRefresh={() => void refresh()} />
      </div>
      {isAdmin && sharing ? <ShareDialog report={report} reportId={reportId} onClose={() => setSharing(false)} /> : null}
      {renaming ? <RenameDialog report={report} reportId={reportId} onClose={() => setRenaming(false)} /> : null}
      {dialog}
    </div>
  )
}

/** Staff-only: why the status is what it is, what the report is built from, and what to check. */
function FactsPanel({ report: r, reportId, mayEdit, onRefresh }: { report: ProgressReportDoc; reportId: string; mayEdit: boolean; onRefresh: () => void }) {
  const { branchId, actor, timezone } = useBranch()
  const logsQ = useMemo(
    () => query(branchCol(branchId, COL.sessionLogs), where('studentId', '==', r.studentId), where('status', '==', 'submitted'), where('dateKey', '>=', r.startDate), where('dateKey', '<=', r.endDate)),
    [branchId, r.studentId, r.startDate, r.endDate],
  )
  const { data: logs, loading } = useQuery<SessionLog>(logsQ, `report-logs-${r.studentId}-${r.startDate}-${r.endDate}`)
  const stale = !loading && logFingerprint(logs) !== r.source.fingerprint
  const review = (Object.entries(r.narrativeMeta?.sections ?? {}) as [NarrativeKey, SectionMeta][]).filter(([, m]) => m?.needsReview)
  const level = r.progress?.level ?? null
  const generated = toDate(r.generatedAt)

  async function setOption(key: keyof ReportOptions, value: boolean) {
    const batch = writeBatch(db)
    batch.update(branchDocRef(branchId, COL.progressReports, reportId), { [`options.${key}`]: value, updatedAt: serverTimestamp(), updatedBy: actor.email })
    try {
      await batch.commit()
    } catch (e) {
      toast.error('Could not change the setting', { description: (e as Error).message })
    }
  }

  return (
    <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start" data-testid="report-facts">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Progress status</h2>
        <div className="mt-2">{level ? <StatusChip level={level} audience="staff" /> : <span className="text-sm text-muted-foreground">Not enough sessions for a status</span>}</div>
        {r.progress?.drivers?.length ? (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {r.progress.drivers.map((d) => (
              <li key={d.code}>
                {d.code === 'flags' ? (
                  <>
                    {d.label}: <span className="font-medium text-foreground">{`${d.value} session${d.value === 1 ? '' : 's'}`}</span>{' '}
                    {r.progress.rule === 'any' ? '(one is enough)' : `(${d.threshold}% or more of the sessions, or the last two)`}
                  </>
                ) : (
                  <>
                    {d.label}: <span className="font-medium text-foreground">{`${d.value}${d.code === 'homework' || d.code === 'attendance' ? '%' : ''}`}</span> (below{' '}
                    {d.threshold}
                    {d.code === 'homework' || d.code === 'attendance' ? '%' : ''})
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : level === 'on_track' ? (
          <p className="mt-2 text-xs text-muted-foreground">Homework, focus, motivation and session flags are all within the center’s targets.</p>
        ) : null}
        <p className="mt-3 text-[11px] text-muted-foreground">Families see “{level ? levelLabel(level, 'family') : '—'}”. The status is calculated, never written by AI.</p>
      </section>

      {stale || r.facts.attendance.unlogged || review.length ? (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <LuCircleAlert className="size-4" /> Check before sharing
          </h2>
          {stale ? (
            <div>
              Some session logs changed after this report was made.
              {mayEdit ? (
                <Button size="xs" variant="outline" className="ml-2 bg-white" onClick={onRefresh}>
                  Update figures
                </Button>
              ) : null}
            </div>
          ) : null}
          {r.facts.attendance.unlogged ? (
            <div>
              {r.facts.attendance.unlogged} past session{r.facts.attendance.unlogged === 1 ? '' : 's'} in this period {r.facts.attendance.unlogged === 1 ? 'has' : 'have'} no submitted log.
            </div>
          ) : null}
          {review.map(([k, m]) => (
            <div key={k}>
              <span className="font-medium">{NARRATIVE_LABELS[k]}:</span> {(m.reasons ?? []).join(' · ')}
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">Built from</h2>
        <dl className="mt-2 space-y-1.5 text-xs">
          <Row label="Period">{r.period.label}</Row>
          <Row label="Session logs">{r.source.logCount}</Row>
          <Row label="Prepared">
            {generated ? formatInstant(generated, timezone, { dateStyle: 'medium', timeStyle: 'short' }) : '—'} by {r.generatedBy?.name}
          </Row>
          <Row label="Written by">{r.narrativeMeta?.source === 'ai' ? 'AI, reviewed by staff' : 'Standard text'}</Row>
        </dl>
        {logs.length ? (
          <ul className="mt-3 max-h-56 divide-y overflow-y-auto rounded-lg border text-xs">
            {[...logs]
              .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
              .map((l) => (
                <li key={l.sessionId}>
                  <a href={`/${branchId}/session-log/${l.sessionId}/view`} target="_blank" rel="noopener" className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50">
                    <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{formatDateKey(l.dateKey, 'monthDay')}</span>
                    <span className="min-w-0 flex-1 truncate">{l.subject || l.sessionType}</span>
                    <LuExternalLink className="size-3 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">Show in the report</h2>
        <div className="mt-3 space-y-2.5">
          {(
            [
              ['showStatus', 'Progress status'],
              ['showPractice', 'Practice accuracy'],
              ['showResources', 'Resources used'],
              ...(r.facts.conference.enabled ? ([['showConference', 'Next parent conference']] as const) : []),
            ] as [keyof ReportOptions, string][]
          ).map(([key, label]) => (
            <label key={key} className={cn('flex items-center justify-between gap-3', !mayEdit && 'opacity-60')}>
              <span>{label}</span>
              <Switch checked={r.options[key]} disabled={!mayEdit} onCheckedChange={(v) => void setOption(key, v)} aria-label={label} />
            </label>
          ))}
        </div>
      </section>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** Share with family: who gets it, an optional email, and a last check. */
function ShareDialog({ report: r, reportId, onClose }: { report: ProgressReportDoc; reportId: string; onClose: () => void }) {
  const { branchId, settings } = useBranch()
  const parentsQ = useMemo(() => query(collection(db, branchColPath(branchId, COL.members)), where('studentIds', 'array-contains', r.studentId)), [branchId, r.studentId])
  const studentQ = useMemo(() => query(collection(db, branchColPath(branchId, COL.members)), where('studentId', '==', r.studentId)), [branchId, r.studentId])
  const parents = useQuery<Member>(parentsQ, `share-parents-${r.studentId}`)
  const students = useQuery<Member>(studentQ, `share-student-${r.studentId}`)
  const recipients = [...parents.data, ...students.data].filter((m, i, all) => m.status === 'active' && (m.role === 'parent' || m.role === 'student') && all.findIndex((x) => x.email === m.email) === i)
  const [notify, setNotify] = useState(settings.progressReports.emailFamiliesOnShare)
  const [busy, setBusy] = useState(false)
  const checks = [
    { ok: !!r.narrative.overview.trim(), text: 'The overview is written' },
    { ok: !!r.narrative.tutorNote.trim(), text: 'A note from the tutor (optional)' },
    { ok: !Object.values(r.narrativeMeta?.sections ?? {}).some((m) => m?.needsReview), text: 'No section needs checking' },
  ]

  async function share() {
    setBusy(true)
    try {
      const res = await shareReport({ branchId, reportId, share: true, notify: notify && recipients.length > 0 })
      const n = res.data.notify
      if (n?.status === 'sent') toast.success(`Shared and emailed to ${n.recipients} ${n.recipients === 1 ? 'person' : 'people'}`)
      else if (n?.status === 'not_configured') toast.success('Shared. Email isn’t set up yet, so the family will see it in their portal.')
      else if (n?.status === 'failed') toast.warning('Shared, but the email couldn’t be sent. The family will see it in their portal.')
      else toast.success('Shared with the family')
      onClose()
    } catch (e) {
      toast.error(callableMessage(e, 'Could not share the report.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share with family</DialogTitle>
          <DialogDescription>
            {r.student.name}’s {r.period.label} report will appear in the family portal. Shared reports are locked until you stop sharing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Who can see it</div>
            {parents.loading || students.loading ? (
              <Spinner />
            ) : recipients.length ? (
              <ul className="space-y-1">
                {recipients.map((m) => (
                  <li key={m.email} className="flex items-center gap-2">
                    <LuEye className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{m.displayName || m.email}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No parent or student account is linked to {r.student.name} yet. It will appear for them once one is added.</p>
            )}
          </div>
          {recipients.length && settings.progressReports.emailFamiliesOnShare ? (
            <label className="flex items-center gap-2">
              <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
              Email them a link to the report
            </label>
          ) : null}
          <ul className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
            {checks.map((c) => (
              <li key={c.text} className={cn('flex items-center gap-2', c.ok ? 'text-foreground' : 'text-amber-700 dark:text-amber-400')}>
                <span>{c.ok ? '✓' : '•'}</span>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void share()} disabled={busy}>
            {busy ? <Spinner /> : <LuSend />} Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RenameDialog({ report: r, reportId, onClose }: { report: ProgressReportDoc; reportId: string; onClose: () => void }) {
  const { branchId, actor } = useBranch()
  const [name, setName] = useState(r.customName ?? '')
  const save = async () => {
    const batch = writeBatch(db)
    batch.update(doc(db, branchColPath(branchId, COL.progressReports), reportId), { customName: name.trim() || null, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, { action: 'report.rename', category: 'sessions', entityType: 'progressReport', entityId: reportId, summary: `Renamed ${r.student.name}'s progress report`, studentId: r.studentId, studentName: r.student.name })
    try {
      await batch.commit()
      toast.success('Report renamed')
      onClose()
    } catch (e) {
      toast.error('Could not rename the report', { description: (e as Error).message })
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename report</DialogTitle>
          <DialogDescription>Leave it empty to use “{r.period.label} progress report”.</DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${r.period.label} progress report`} aria-label="Report name" onKeyDown={(e) => e.key === 'Enter' && void save()} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

