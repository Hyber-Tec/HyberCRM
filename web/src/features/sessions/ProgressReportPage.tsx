import { useEffect, useMemo } from 'react'
import { LuPrinter, LuX } from 'react-icons/lu'
import { useParams } from 'react-router'
import { COL } from '@shared/paths'
import { formatDateKey, formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { Button } from '@/components/ui/button'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { type ProgressReport, reportTitle } from './reportModel'

/** Printable student progress report (`/branch/progress-report/:id`). */
export function ProgressReportPage() {
  const { reportId = '' } = useParams()
  const { branchId, branch, timezone, settings } = useBranch()
  const ref = useMemo(() => branchDocRef(branchId, COL.progressReports, reportId), [branchId, reportId])
  const { data: r, loading } = useDoc<ProgressReport>(ref)
  useEffect(() => {
    document.title = `Progress Report | ${branch.name}`
  }, [branch.name])

  if (loading) return <FullPageSpinner />
  if (!r) return <FullPageMessage title="Report not found" description="It may have been deleted, or it isn’t shared with you." actions={[{ label: 'Close', onClick: () => window.close() }]} />

  const m = r.metrics
  const n = r.narrative
  const risk = n?.riskLevel ?? m.riskLevel
  const section = (title: string, body: React.ReactNode) => (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">{title}</h2>
      {body}
    </section>
  )

  return (
    <div className="min-h-svh bg-neutral-100 py-6 print:bg-white print:py-0 dark:bg-neutral-950">
      <div className="mx-auto mb-4 flex max-w-3xl justify-between px-4 print:hidden">
        <Button variant="outline" onClick={() => window.close()}>
          <LuX /> Close
        </Button>
        <Button onClick={() => window.print()}>
          <LuPrinter /> Print / Save PDF
        </Button>
      </div>
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white text-neutral-900 shadow-sm print:max-w-none print:rounded-none print:shadow-none">
        <header className="bg-neutral-900 px-8 py-7 text-white [print-color-adjust:exact]">
          <div className="flex items-center gap-3">
            <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} className="size-10" />
            <div className="text-xs font-semibold tracking-[0.2em] uppercase opacity-80">{branch.name}</div>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Student Progress Report</h1>
          <div className="mt-1 text-sm opacity-80">
            {formatDateKey(r.startDate, 'long')} – {formatDateKey(r.endDate, 'long')}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
            {[
              ['Student', r.studentName],
              ['Sessions', String(m.totalSessions)],
              ['Total hours', `${m.totalHours.toFixed(1)} hrs`],
              ['Report date', r.generatedAt ? formatInstant(r.generatedAt.toDate(), timezone, { dateStyle: 'medium' }) : '—'],
              ['Tutor(s)', m.tutors.slice(0, 2).join(', ') || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-xs opacity-60">{k}</div>
                <div className="font-medium">{v}</div>
              </div>
            ))}
          </div>
          <span
            className={cn(
              'mt-5 inline-block rounded-full border px-3 py-1 text-xs font-semibold',
              risk === 'At Risk' ? 'border-red-300 text-red-200' : risk === 'Needs Attention' ? 'border-amber-300 text-amber-200' : 'border-sky-300 text-sky-200',
            )}
          >
            {risk}
          </span>
        </header>
        <div className="space-y-7 px-8 py-7">
          {n?.overallProgress ? section('Summary', <p className="leading-relaxed">{n.overallProgress}</p>) : null}
          {section(
            'Hours summary',
            m.subjectHours.length ? (
              <div className="space-y-2">
                {m.subjectHours.map((s) => (
                  <div key={s.subject} className="grid grid-cols-[10rem_1fr_5rem] items-center gap-3 text-sm">
                    <span className="truncate">{s.subject}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div className="h-full rounded-full bg-neutral-800" style={{ width: `${s.percent}%` }} />
                    </div>
                    <span className="text-right tabular-nums">
                      {s.hours} hrs · {s.percent}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No session hours recorded in this period.</p>
            ),
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            {section(
              'Attendance',
              <p className="text-sm">
                Total sessions: <span className="font-semibold">{m.totalSessions}</span>
              </p>,
            )}
            {section(
              'Homework',
              <div className="space-y-0.5 text-sm">
                <div>
                  Completion rate: <span className="font-semibold">{m.homeworkCompletionRate != null ? `${m.homeworkCompletionRate}%` : 'N/A'}</span>
                </div>
                <div className="text-neutral-500">
                  Completed {m.homeworkCompleted} · Partial {m.homeworkPartial} · Not done {m.homeworkNotDone}
                </div>
              </div>,
            )}
          </div>
          {section('Academic progress', <p className="text-sm leading-relaxed">{n?.academicProgress || 'Academic progress will appear here after the report is generated with session data.'}</p>)}
          <div className="grid gap-6 sm:grid-cols-2">
            {section('Class performance', <p className="text-sm leading-relaxed">{n?.classPerformance || '—'}</p>)}
            {section('Homework analysis', <p className="text-sm leading-relaxed">{n?.homeworkAnalysis || '—'}</p>)}
          </div>
          {section(
            'Learning habits & engagement',
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                {settings.sessionLogs.ratingDimensions.map((d) => {
                  const v = m.averages[d.toLowerCase()]
                  return (
                    <div key={d} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-sm">
                      <span>{d}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-neutral-700 to-neutral-500" style={{ width: `${((v ?? 0) / 5) * 100}%` }} />
                      </div>
                      <span className="text-right tabular-nums">{v != null ? v.toFixed(1) : '—'}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-sm leading-relaxed">{n?.learningHabitsNarrative || ''}</p>
            </div>,
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            {section(
              'Key strengths',
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {(n?.keyStrengths ?? []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>,
            )}
            {section(
              'Areas for improvement',
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {(n?.areasForImprovement ?? []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>,
            )}
          </div>
          {n?.instructorComments ? section('Instructor comments', <p className="text-sm leading-relaxed italic">{n.instructorComments}</p>) : null}
          {n?.goalsAndActionPlan?.length
            ? section(
                'Goals & action plan',
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {n.goalsAndActionPlan.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ol>,
              )
            : null}
        </div>
        <footer className="border-t px-8 py-4 text-xs text-neutral-500">
          {branch.name} · {reportTitle(r)} · Report ID {reportId}
        </footer>
      </article>
    </div>
  )
}
