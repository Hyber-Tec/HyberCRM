import { useEffect, useRef } from 'react'
import type { IconType } from 'react-icons'
import {
  LuArrowDownRight,
  LuArrowRight,
  LuArrowUpRight,
  LuBookOpen,
  LuCalendarCheck,
  LuCalendarClock,
  LuCheck,
  LuCircleAlert,
  LuCircleCheck,
  LuCircleDashed,
  LuFlag,
  LuHeartHandshake,
  LuHouse,
  LuLifeBuoy,
  LuLoader,
  LuNotebookPen,
  LuSparkles,
  LuTarget,
  LuTrendingUp,
} from 'react-icons/lu'
import { levelLabel } from '@shared/reports/status'
import type { NarrativeKey, ProgressReportDoc, ReportNarrative, SectionMeta } from '@shared/reports/types'
import { type DateKey, addDays, endOfMonth, formatDateKey, formatInstant, formatMinutes, startOfMonth } from '@shared/time'
import { cn } from '@/lib/utils'
import { AccuracyChart, CumulativeHours, Dumbbell, HomeworkBar, HoursDonut, INK, STATUS_COLORS, SessionStrip, Sparkline } from './charts'

export const DEFAULT_ACCENT = '#1e3a8a'

/** Letter minus the @page margins (index.css), in CSS pixels. */
const PRINT_WIDTH = 730
const PRINT_HEIGHT = 955

/**
 * Before printing, each report page is scaled (never below 70%) so it fills
 * exactly one sheet whatever the length of its text; after printing it's reset.
 */
function usePrintFit(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const pages = () => [...(root.current?.querySelectorAll<HTMLElement>('.report-page') ?? [])]
    const fit = () => {
      for (const el of pages()) {
        el.style.zoom = ''
        el.style.maxWidth = 'none'
        let zoom = 1
        for (let i = 0; i < 5; i++) {
          el.style.width = `${PRINT_WIDTH / zoom}px`
          const next = Math.max(0.7, Math.min(1, PRINT_HEIGHT / el.scrollHeight))
          if (Math.abs(next - zoom) < 0.005) break
          zoom = next
        }
        el.style.width = `${PRINT_WIDTH / zoom}px`
        el.style.zoom = String(zoom)
      }
    }
    const reset = () => {
      for (const el of pages()) {
        el.style.width = ''
        el.style.maxWidth = ''
        el.style.zoom = ''
      }
    }
    // Measured again once print styles apply (they tighten the spacing).
    const media = window.matchMedia('print')
    const onMedia = (e: MediaQueryListEvent) => (e.matches ? fit() : reset())
    media.addEventListener('change', onMedia)
    window.addEventListener('beforeprint', fit)
    window.addEventListener('afterprint', reset)
    return () => {
      media.removeEventListener('change', onMedia)
      window.removeEventListener('beforeprint', fit)
      window.removeEventListener('afterprint', reset)
    }
  }, [root])
}

export interface EditApi {
  narrative: ReportNarrative
  meta: Partial<Record<NarrativeKey, SectionMeta>>
  onChange: <K extends NarrativeKey>(key: K, value: ReportNarrative[K]) => void
  /** Rewrites a section with AI (null when AI is off). */
  onRewrite: ((key: NarrativeKey) => void) | null
  onRestore: (key: NarrativeKey) => void
  busy: NarrativeKey | null
}

const toDate = (t: unknown) => ((t as { toDate?: () => Date } | null)?.toDate ? (t as { toDate: () => Date }).toDate() : null)
const hoursText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const wholeMonth = (from: DateKey, to: DateKey) => from === startOfMonth(from) && to === endOfMonth(from)

/**
 * The family-facing progress report (Round 3 design option C, "Hybrid"): page 1
 * is the summary, pages 2–3 the details. The paper stays light in dark mode and
 * prints to clean Letter pages. With `edit`, the written sections are editable.
 */
export function ReportDocument({
  report: r,
  audience,
  timezone,
  logoUrl,
  edit,
}: {
  report: ProgressReportDoc
  audience: 'family' | 'staff'
  timezone: string
  logoUrl?: string | null
  edit?: EditApi | null
}) {
  const accent = r.snapshot?.accentColor || DEFAULT_ACCENT
  const rootRef = useRef<HTMLDivElement>(null)
  usePrintFit(rootRef)
  const n = edit?.narrative ?? r.narrative
  const f = r.facts
  const o = r.options
  const editing = !!edit
  const colorOf = (subject: string) => f.hours.bySubject.find((s) => s.subject === subject)?.color ?? f.hours.bySubject.find((s) => s.subject === 'Other')?.color ?? '#9a9893'
  const prepared = toDate(r.sharedAt) ?? toDate(r.generatedAt)
  const preparedText = prepared ? formatInstant(prepared, timezone, { month: 'long', day: 'numeric', year: 'numeric' }) : formatDateKey(r.period.to, 'long')
  const month = wholeMonth(r.period.from, r.period.to)
  const prevShort = f.previous ? (/^[A-Z][a-z]+ \d{4}$/.test(f.previous.periodLabel) ? f.previous.periodLabel.slice(0, 3) : 'last report') : null
  const nextLabel = month ? formatDateKey(addDays(r.period.to, 1), 'monthYear').split(' ')[0] : null
  const tutors = f.tutors
  const level = r.progress?.level ?? null
  const attendedSeries = r.series.sessions.filter((s) => s.status === 'attended')
  const brand = r.snapshot?.branchName ?? ''
  const contact = [brand, r.snapshot?.contact?.phone, r.snapshot?.contact?.email, r.snapshot?.contact?.website].filter(Boolean).join(' · ')
  const show = (k: NarrativeKey) => {
    const v = n[k]
    return editing || (Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim())
  }

  // Sparklines: running totals over the period's sessions.
  const hoursLine = running(attendedSeries.map((s) => s.hours), (sum) => sum)
  const scheduled = r.series.sessions.filter((s) => s.status === 'attended' || s.status === 'missed')
  const attendanceLine = running(scheduled.map((s) => (s.status === 'attended' ? 1 : 0)), (sum, n) => Math.round((sum / n) * 100))
  const withHomework = r.series.sessions.filter((s) => s.homework && s.homework !== 'not_assigned')
  const homeworkLine = running(withHomework.map((s) => (s.homework === 'completed' ? 1 : 0)), (sum, n) => Math.round((sum / n) * 100))
  const accuracyPoints = r.series.sessions.filter((s) => s.status === 'attended' && s.accuracy !== null).map((s) => ({ dateKey: s.dateKey, accuracy: s.accuracy as number }))

  const delta = (v: number | null, unit: string): { text: string; tone: 'up' | 'down' | 'flat' } | null => {
    if (v === null || !prevShort) return null
    if (v === 0) return { text: `same as ${prevShort}`, tone: 'flat' }
    return { text: `${v > 0 ? '+' : '−'}${hoursText(Math.abs(v))}${unit} vs. ${prevShort}`, tone: v > 0 ? 'up' : 'down' }
  }

  const tiles: Tile[] = [
    { label: 'Sessions attended', value: String(f.attendance.attended), sub: { text: f.attendance.missed ? `of ${f.attendance.scheduled} scheduled` : 'every scheduled session', tone: 'flat' } },
    { label: 'Tutoring hours', value: hoursText(f.hours.total), spark: hoursLine, sub: delta(f.deltas.hours, '') ?? { text: `${hoursText(f.hours.toDate)} hours in all`, tone: 'flat' } },
    ...(f.attendance.percent !== null
      ? [{ label: 'Attendance', value: `${f.attendance.percent}%`, spark: attendanceLine, sub: delta(f.deltas.attendance, ' pts') ?? { text: `${f.attendance.attended} of ${f.attendance.scheduled} sessions`, tone: 'flat' as const } }]
      : []),
    ...(f.homework.percent !== null
      ? [{ label: 'Homework done', value: `${f.homework.percent}%`, spark: homeworkLine, sub: delta(f.deltas.homework, ' pts') ?? { text: `${f.homework.completed} of ${f.homework.assigned} assignments`, tone: 'flat' as const } }]
      : []),
    ...(o.showPractice && f.practice?.percent != null
      ? [
          {
            label: 'Practice accuracy',
            value: `${f.practice.percent}%`,
            spark: accuracyPoints.map((p) => p.accuracy),
            sub:
              f.practice.change === 'up' && f.practice.earlyPercent !== null
                ? { text: `up from ${f.practice.earlyPercent}%`, tone: 'up' as const }
                : (delta(f.deltas.accuracy, ' pts') ?? { text: `${f.practice.attempted} questions`, tone: 'flat' as const }),
          },
        ]
      : []),
  ]

  const footer = (page: number) => (
    <div className="mt-auto flex items-end justify-between gap-4 border-t pt-4 text-[11px]" style={{ borderColor: INK.hairline, color: INK.muted }}>
      <div>
        {contact ? <div className="font-medium" style={{ color: INK.secondary }}>{contact}</div> : null}
        <div>Questions about this report? We’re happy to talk. · Prepared {preparedText}</div>
      </div>
      <div className="shrink-0 tabular-nums">Page {page} of 3</div>
    </div>
  )

  const hasPractice = o.showPractice && accuracyPoints.length >= 2
  const habits = f.engagement.filter((e) => e.average !== null)
  const habitRows = habits.map((e) => ({ label: e.dimension, from: e.firstHalf ?? e.average ?? 0, to: e.secondHalf ?? e.average ?? 0 }))
  const halvesKnown = habits.some((e) => e.firstHalf !== null && e.secondHalf !== null)
  const periodMonth = month ? formatDateKey(r.period.from, 'monthYear').split(' ')[0].slice(0, 3) : null

  return (
    <div ref={rootRef} className="report-doc space-y-6 font-sans text-[#0b0b0b] antialiased print:space-y-0">
      {r.status === 'draft' ? <div className="report-watermark">Draft</div> : null}
      {/* ------------------------------------------------------------ page 1 */}
      <section className="report-page overflow-hidden">
        <div className="relative px-6 pt-8 pb-7 sm:px-12" style={{ background: `linear-gradient(180deg, ${accent}0f, transparent)` }}>
          <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} />
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {logoUrl || r.snapshot?.logoUrl ? (
                <img src={logoUrl || r.snapshot.logoUrl || ''} alt="" className="size-11 shrink-0 rounded-xl border bg-white object-contain p-1" style={{ borderColor: INK.hairline }} />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: accent }}>
                  {brand.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[15px] font-semibold">{brand}</div>
                <div className="text-[11px]" style={{ color: INK.muted }}>
                  Progress report · {r.period.label}
                </div>
              </div>
            </div>
            <div className="hidden shrink-0 text-right text-[11px] sm:block" style={{ color: INK.muted }}>
              {r.student.lastName ? `Prepared for the ${r.student.lastName} family` : 'Prepared'}
              <div className="font-medium" style={{ color: INK.secondary }}>
                {preparedText}
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4 sm:flex-nowrap">
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
              <h1 className="text-[34px] leading-tight font-semibold tracking-tight" data-testid="report-student">
                {r.student.name}
              </h1>
              <div className="mt-1 text-[13px]" style={{ color: INK.secondary }}>
                {[r.student.grade ? `Grade ${r.student.grade}` : '', r.student.school, tutors.length ? `${tutors.length > 1 ? 'Tutors' : 'Tutor'}: ${tutors.slice(0, 3).join(', ')}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            {o.showStatus && level ? (
              <div className="shrink-0 sm:text-right">
                <StatusChip level={level} audience={audience} />
                <div className="mt-1.5 text-[11px]" style={{ color: INK.muted }}>
                  Based on attendance, homework and session notes
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col px-6 pb-10 sm:px-12">
          <div className={cn('grid grid-cols-2 gap-3', tiles.length >= 5 ? 'sm:grid-cols-5' : tiles.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
            {tiles.map((t) => (
              <KpiTile key={t.label} tile={t} color={accent} />
            ))}
          </div>

          {show('overview') ? (
            <div className="mt-8 break-inside-avoid print:mt-5">
              <Heading icon={LuSparkles} accent={accent}>
                {month ? 'This month at a glance' : 'This period at a glance'}
              </Heading>
              <EditableText k="overview" value={n.overview} edit={edit} className="mt-3 text-[15px] leading-[1.65]" placeholder="Three or four sentences: the focus, the main progress and the next step." />
            </div>
          ) : null}

          {show('strengths') || show('focusAreas') ? (
            <div className="mt-7 grid gap-4 sm:grid-cols-2 print:mt-5">
              {show('strengths') ? (
                <div className="break-inside-avoid rounded-2xl p-5" style={{ background: '#0ca30c0d', boxShadow: 'inset 0 0 0 1px #0ca30c26' }}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#087a08]">
                    <LuTrendingUp className="size-4" /> Strengths
                  </div>
                  <EditableList k="strengths" items={n.strengths} edit={edit} icon={<LuCheck className="mt-0.5 size-4 shrink-0 text-[#0ca30c]" />} max={4} />
                </div>
              ) : null}
              {show('focusAreas') ? (
                <div className="break-inside-avoid rounded-2xl p-5" style={{ background: '#fab2190f', boxShadow: 'inset 0 0 0 1px #fab21933' }}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#9a6b00]">
                    <LuTarget className="size-4" /> Focus areas
                  </div>
                  <EditableList k="focusAreas" items={n.focusAreas} edit={edit} icon={<LuArrowRight className="mt-0.5 size-4 shrink-0 text-[#d29200]" />} max={3} />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={cn('mt-8 grid gap-6 print:mt-5', hasPractice ? 'sm:grid-cols-[1.4fr_1fr]' : '')}>
            {hasPractice ? (
              <div className="break-inside-avoid">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[13px] font-semibold">Practice accuracy</h3>
                  <span className="text-[11px]" style={{ color: INK.muted }}>
                    {f.practice?.attempted} questions
                  </span>
                </div>
                <div className="mt-2 max-w-[440px]">
                  <AccuracyChart points={accuracyPoints} color={colorOf(f.hours.bySubject[0]?.subject ?? '')} />
                </div>
                {show('practice') ? <EditableText k="practice" value={n.practice} edit={edit} className="mt-1 text-[12.5px] leading-[1.55] text-[#52514e]" placeholder="One or two sentences on practice accuracy." /> : null}
              </div>
            ) : null}
            {f.hours.bySubject.length ? (
              <div className="break-inside-avoid">
                <h3 className="text-[13px] font-semibold">Where the time went</h3>
                <div className="mt-3 flex items-center gap-4">
                  <HoursDonut data={f.hours.bySubject} total={Math.round(f.hours.total * 10) / 10} />
                  <div className="min-w-0 space-y-2 text-[12px]">
                    {f.hours.bySubject.map((s) => (
                      <div key={s.subject} className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="min-w-0 flex-1 truncate">{s.subject}</span>
                        <span className="font-semibold tabular-nums">{hoursText(s.hours)} h</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-10 print:mt-6">{footer(1)}</div>
        </div>
      </section>

      {/* ------------------------------------------------------------ page 2 */}
      <section className="report-page flex flex-col px-6 py-10 sm:px-12 print:py-8">
        <div className="break-inside-avoid">
          <Heading icon={LuCalendarCheck} accent={accent}>
            Attendance and time
          </Heading>
          <div className="mt-5">
            <SessionStrip sessions={r.series.sessions} colorOf={colorOf} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px]" style={{ color: INK.secondary }}>
            <div className="flex flex-wrap gap-3">
              {f.hours.bySubject.map((s) => (
                <span key={s.subject} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                  {s.subject}
                </span>
              ))}
              {f.attendance.missed ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex size-2.5 rounded-full border-2" style={{ borderColor: STATUS_COLORS.critical }} />
                  Missed
                </span>
              ) : null}
              {f.attendance.canceled ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-3 rounded" style={{ background: INK.muted }} />
                  Canceled
                </span>
              ) : null}
            </div>
            {f.attendance.percent !== null ? (
              <span>
                {f.attendance.attended} of {f.attendance.scheduled} sessions · {f.attendance.percent}%
              </span>
            ) : null}
          </div>
          {attendedSeries.length > 1 ? (
            <div className="mt-6 max-w-[680px]">
              <CumulativeHours sessions={r.series.sessions} from={r.period.from} to={r.period.to} color={accent} />
            </div>
          ) : null}
          <div className="mt-1 text-[11px]" style={{ color: INK.muted }}>
            {consistencyLine(f)}
          </div>
        </div>

        {show('academicProgress') || f.skills.length ? (
          <div className="mt-10 break-inside-avoid print:mt-6">
            <Heading icon={LuBookOpen} accent={accent}>
              What we worked on
            </Heading>
            {show('academicProgress') ? (
              <EditableText k="academicProgress" value={n.academicProgress} edit={edit} className="mt-3 text-[14px] leading-[1.65] text-[#52514e]" placeholder="What was covered and what the student can now do better." />
            ) : null}
            {f.skills.length ? (
              <div className="mt-5 space-y-2.5 print:mt-3 print:space-y-1.5">
                {f.skills.map((a) => (
                  <div key={a.area} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                    <div className="shrink-0 pt-1 text-[12px] sm:w-52">
                      <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: colorOf(a.subject) }} />
                      <span className="font-medium">{a.area.split(' › ')[0]}</span>
                      {a.area.includes(' › ') ? <span style={{ color: INK.muted }}> › {a.area.split(' › ').slice(1).join(' › ')}</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {a.skills.map((s) => (
                        <span key={s.name} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-[12px]" style={{ borderColor: INK.hairline }}>
                          {s.name}
                          {s.sessions > 1 ? <span className="rounded bg-zinc-100 px-1 text-[10px] font-semibold text-[#52514e]">{s.sessions}×</span> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {o.showResources && f.resources.length ? (
              <div className="mt-5 text-[12px]" style={{ color: INK.secondary }}>
                <span className="font-medium text-[#0b0b0b]">Resources we used:</span>{' '}
                {f.resources.slice(0, 8).map((m, i) => (
                  <span key={m.label}>
                    {i ? ' · ' : ''}
                    {m.url ? (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="underline decoration-[#e1e0d9] underline-offset-2">
                        {m.label}
                      </a>
                    ) : (
                      m.label
                    )}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-10 grid gap-8 sm:grid-cols-2 print:mt-6">
          {habitRows.length ? (
            <div className="break-inside-avoid">
              <Heading icon={LuHeartHandshake} accent={accent}>
                Learning habits
              </Heading>
              {show('engagement') ? <EditableText k="engagement" value={n.engagement} edit={edit} className="mt-3 text-[13.5px] leading-[1.6] text-[#52514e]" placeholder="Effort, focus and confidence in sessions." /> : null}
              <div className="mt-4 max-w-[340px]">
                <Dumbbell rows={habitRows} color={accent} />
              </div>
              {halvesKnown ? (
                <div className="mt-1 flex gap-4 text-[11px]" style={{ color: INK.muted }}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full border-2" style={{ borderColor: accent }} />
                    {periodMonth ? `Early ${periodMonth}.` : 'Earlier sessions'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: accent }} />
                    {periodMonth ? `Late ${periodMonth}.` : 'Later sessions'}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          {f.homework.assigned > 0 || show('homework') ? (
            <div className="break-inside-avoid">
              <Heading icon={LuNotebookPen} accent={accent}>
                Homework
              </Heading>
              {show('homework') ? <EditableText k="homework" value={n.homework} edit={edit} className="mt-3 text-[13.5px] leading-[1.6] text-[#52514e]" placeholder="Homework follow-through this period." /> : null}
              {f.homework.percent !== null ? (
                <>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-[32px] leading-none font-semibold">{f.homework.percent}%</span>
                    {f.deltas.homework !== null && prevShort ? (
                      <span className={cn('pb-1 text-[12px] font-medium', f.deltas.homework > 0 ? 'text-[#087a08]' : f.deltas.homework < 0 ? 'text-[#b42318]' : 'text-[#898781]')}>
                        {f.deltas.homework === 0 ? `same as ${prevShort}` : `${f.deltas.homework > 0 ? '+' : '−'}${Math.abs(f.deltas.homework)} pts vs. ${prevShort}`}
                      </span>
                    ) : (
                      <span className="pb-1 text-[12px]" style={{ color: INK.muted }}>
                        completed
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <HomeworkBar completed={f.homework.completed} partial={f.homework.partial} notDone={f.homework.notDone} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px]" style={{ color: INK.secondary }}>
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2.5 rounded-sm" style={{ background: STATUS_COLORS.good }} />
                      Completed {f.homework.completed}
                    </span>
                    {f.homework.partial ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2.5 rounded-sm" style={{ background: STATUS_COLORS.warning }} />
                        Partly done {f.homework.partial}
                      </span>
                    ) : null}
                    {f.homework.notDone ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2.5 rounded-sm" style={{ background: STATUS_COLORS.critical }} />
                        Not done {f.homework.notDone}
                      </span>
                    ) : null}
                    {f.homework.notAssigned ? <span style={{ color: INK.muted }}>Not assigned {f.homework.notAssigned}</span> : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-10 print:mt-6">{footer(2)}</div>
      </section>

      {/* ------------------------------------------------------------ page 3 */}
      <section className="report-page flex flex-col px-6 py-10 sm:px-12 print:py-8">
        <div className={cn('grid gap-8', show('previousGoals') && (n.previousGoals.length || editing) && f.previous ? 'sm:grid-cols-[1.35fr_1fr]' : '')}>
          {show('goals') ? (
            <div className="break-inside-avoid">
              <Heading icon={LuFlag} accent={accent}>
                {nextLabel ? `Goals for ${nextLabel}` : 'Goals for the coming weeks'}
              </Heading>
              <EditableGoals edit={edit} goals={n.goals} accent={accent} />
            </div>
          ) : null}
          {f.previous && (n.previousGoals.length || editing) ? (
            <div className="break-inside-avoid rounded-2xl bg-[#f6f5f1] p-5">
              <h3 className="text-[13px] font-semibold">Goals from {f.previous.periodLabel}</h3>
              <EditablePreviousGoals edit={edit} goals={n.previousGoals} prevGoals={f.previous.goals} />
            </div>
          ) : null}
        </div>

        {show('homeSupport') ? (
          <div className="mt-10 break-inside-avoid print:mt-6">
            <Heading icon={LuHouse} accent={accent}>
              How you can help at home
            </Heading>
            {editing ? (
              <EditableList k="homeSupport" items={n.homeSupport} edit={edit} max={3} />
            ) : (
              <div className={cn('mt-4 grid gap-3', n.homeSupport.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                {n.homeSupport.map((tip, i) => (
                  <div key={i} className="rounded-xl border p-4 text-[13px] leading-snug" style={{ borderColor: INK.hairline }}>
                    <span className="text-[11px] font-semibold" style={{ color: accent }}>
                      Tip {i + 1}
                    </span>
                    <div className="mt-1">{tip}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {show('tutorNote') ? (
          <figure className="mt-10 break-inside-avoid rounded-2xl p-6" style={{ background: `${accent}0a`, boxShadow: `inset 3px 0 0 ${accent}` }}>
            <figcaption className="text-[13px] font-semibold">A note from your tutor</figcaption>
            {editing ? (
              <EditableText k="tutorNote" value={n.tutorNote} edit={edit} className="mt-2 text-[14.5px] leading-[1.65]" placeholder="Two or three warm sentences from the tutor (left out of the report when empty)." />
            ) : (
              <blockquote className="mt-2 text-[14.5px] leading-[1.65]">“{n.tutorNote}”</blockquote>
            )}
            {tutors[0] ? (
              <div className="mt-3 text-[12px]">
                <span className="font-medium">{tutors[0]}</span> <span style={{ color: INK.muted }}>· Tutor, {brand}</span>
              </div>
            ) : null}
          </figure>
        ) : null}

        <div className="mt-10 break-inside-avoid print:mt-6">
          <Heading icon={LuCalendarClock} accent={accent}>
            Coming up
          </Heading>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ComingUp label="Next session">
              {f.next.session
                ? `${formatDateKey(f.next.session.dateKey, 'weekdayMedium')} · ${formatMinutes(f.next.session.startMin)}${f.next.session.subject ? ` · ${f.next.session.subject}` : ''}${f.next.session.tutorName ? ` with ${f.next.session.tutorName}` : ''}`
                : 'Not booked yet'}
            </ComingUp>
            <ComingUp label="Booked ahead">
              {f.next.bookedNext4Weeks ? `${f.next.bookedNext4Weeks} session${f.next.bookedNext4Weeks === 1 ? '' : 's'} in the next four weeks` : 'Nothing booked in the next four weeks'}
            </ComingUp>
            {o.showConference && f.conference.enabled && f.conference.hoursUntil !== null ? (
              <ComingUp label="Next parent conference">
                {f.conference.hoursUntil <= 0 ? 'Due now — we’ll be in touch to schedule it' : `After about ${hoursText(f.conference.hoursUntil)} more tutoring hours`}
              </ComingUp>
            ) : null}
          </div>
        </div>
        {r.snapshot?.aiDisclosure && r.narrativeMeta?.source === 'ai' ? (
          <div className="mt-8 text-[10px]" style={{ color: INK.muted }}>
            Written with the help of AI and reviewed by our team.
          </div>
        ) : null}
        <div className="mt-10 print:mt-6">{footer(3)}</div>
      </section>
    </div>
  )

}

// --------------------------------------------------------------- editors

function EditableText({
  k,
  value,
  edit,
  className,
  placeholder,
}: {
  k: 'overview' | 'academicProgress' | 'practice' | 'engagement' | 'homework' | 'tutorNote'
  value: string
  edit?: EditApi | null
  className?: string
  placeholder: string
}) {
  if (!edit) return <p className={className}>{value}</p>
  return (
    <SectionTools k={k} edit={edit}>
      <textarea
        aria-label={k}
        data-section={k}
        value={value}
        placeholder={placeholder}
        onChange={(e) => edit.onChange(k, e.target.value)}
        className={cn('field-sizing-content w-full resize-none rounded-lg border border-dashed border-[#c9c7bf] bg-white/60 p-2 outline-none focus:border-solid focus:border-[#52514e]', className)}
      />
    </SectionTools>
  )
}

function EditableList({ k, items, edit, icon, max }: { k: 'strengths' | 'focusAreas' | 'homeSupport'; items: string[]; edit?: EditApi | null; icon?: React.ReactNode; max: number }) {
  if (!edit) {
    return (
      <ul className="mt-3 space-y-2">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-snug">
            {icon}
            {t}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <SectionTools k={k} edit={edit}>
      <ul className="mt-3 space-y-2">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            {icon}
            <textarea
              aria-label={`${k} ${i + 1}`}
              value={t}
              onChange={(e) => edit.onChange(k, items.map((x, j) => (j === i ? e.target.value : x)))}
              className="field-sizing-content min-w-0 flex-1 resize-none rounded-md border border-dashed border-[#c9c7bf] bg-white/60 px-2 py-1 text-[13.5px] leading-snug outline-none focus:border-solid focus:border-[#52514e]"
            />
            <button type="button" aria-label="Remove" className="mt-1 text-[#898781] hover:text-[#b42318]" onClick={() => edit.onChange(k, items.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {items.length < max ? (
        <button type="button" className="mt-2 text-[12px] font-medium text-[#52514e] underline underline-offset-2" onClick={() => edit.onChange(k, [...items, ''])}>
          + Add
        </button>
      ) : null}
    </SectionTools>
  )
}

function EditableGoals({ edit, goals, accent }: { edit?: EditApi | null; goals: ReportNarrative['goals']; accent: string }) {
  if (!edit) {
    return (
      <ol className="mt-5 space-y-3">
        {goals.map((g, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: accent }}>
              {i + 1}
            </span>
            <div>
              <div className="text-[14px] font-medium">{g.goal}</div>
              {g.measure ? (
                <div className="mt-0.5 text-[12px]" style={{ color: INK.secondary }}>
                  <span className="font-medium">How we’ll measure it:</span> {g.measure}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    )
  }
  const set = (i: number, patch: Partial<ReportNarrative['goals'][number]>) => edit.onChange('goals', goals.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  return (
    <SectionTools k="goals" edit={edit}>
      <ol className="mt-5 space-y-3">
        {goals.map((g, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: accent }}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <textarea aria-label={`Goal ${i + 1}`} value={g.goal} onChange={(e) => set(i, { goal: e.target.value })} className={EDIT_INPUT} />
              <textarea aria-label={`How we’ll measure goal ${i + 1}`} value={g.measure} placeholder="How we’ll measure it" onChange={(e) => set(i, { measure: e.target.value })} className={cn(EDIT_INPUT, 'text-[12px]')} />
            </div>
            <button type="button" aria-label="Remove goal" className="mt-1 text-[#898781] hover:text-[#b42318]" onClick={() => edit.onChange('goals', goals.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ol>
      {goals.length < 4 ? (
        <button type="button" className="mt-2 text-[12px] font-medium text-[#52514e] underline underline-offset-2" onClick={() => edit.onChange('goals', [...goals, { goal: '', measure: '' }])}>
          + Add goal
        </button>
      ) : null}
    </SectionTools>
  )
}

function EditablePreviousGoals({ edit, goals, prevGoals }: { edit?: EditApi | null; goals: ReportNarrative['previousGoals']; prevGoals: string[] }) {
  const STATUS = {
    met: { icon: LuCircleCheck, label: 'Met', color: '#087a08' },
    progress: { icon: LuLoader, label: 'In progress', color: '#9a6b00' },
    not_yet: { icon: LuCircleDashed, label: 'Not yet', color: '#898781' },
  } as const
  if (!edit) {
    return (
      <ul className="mt-3 space-y-2">
        {goals.map((g, i) => {
          const st = STATUS[g.status]
          return (
            <li key={i} className="flex items-start gap-2.5 text-[13px]">
              <st.icon className="mt-0.5 size-4 shrink-0" style={{ color: st.color }} />
              <div>
                <span className="font-medium">{g.goal}</span>{' '}
                <span className="text-[11px] font-semibold" style={{ color: st.color }}>
                  · {st.label}
                </span>
                {g.note ? <div className="text-[12px]" style={{ color: INK.muted }}>{g.note}</div> : null}
              </div>
            </li>
          )
        })}
      </ul>
    )
  }
  const set = (i: number, patch: Partial<ReportNarrative['previousGoals'][number]>) => edit.onChange('previousGoals', goals.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  return (
    <SectionTools k="previousGoals" edit={edit}>
      <ul className="mt-3 space-y-3">
        {goals.map((g, i) => (
          <li key={i} className="space-y-1">
            <div className="text-[13px] font-medium">{g.goal}</div>
            <select aria-label={`Status of ${g.goal}`} value={g.status} onChange={(e) => set(i, { status: e.target.value as 'met' | 'progress' | 'not_yet' })} className="rounded-md border bg-white px-2 py-1 text-[12px]">
              <option value="met">Met</option>
              <option value="progress">In progress</option>
              <option value="not_yet">Not yet</option>
            </select>
            <textarea aria-label={`Note on ${g.goal}`} value={g.note} onChange={(e) => set(i, { note: e.target.value })} className={cn(EDIT_INPUT, 'text-[12px]')} />
          </li>
        ))}
      </ul>
      {prevGoals.filter((pg) => !goals.some((g) => g.goal === pg)).length ? (
        <button
          type="button"
          className="mt-2 text-[12px] font-medium text-[#52514e] underline underline-offset-2"
          onClick={() => edit.onChange('previousGoals', [...goals, ...prevGoals.filter((pg) => !goals.some((g) => g.goal === pg)).map((pg) => ({ goal: pg, status: 'progress' as const, note: '' }))])}
        >
          + Add last period’s goals
        </button>
      ) : null}
    </SectionTools>
  )
}

const EDIT_INPUT =
  'field-sizing-content w-full resize-none rounded-md border border-dashed border-[#c9c7bf] bg-white/60 px-2 py-1 text-[14px] leading-snug outline-none focus:border-solid focus:border-[#52514e]'

/** In edit mode: where the text came from, a warning when a check failed, and the AI and restore actions. */
function SectionTools({ k, edit, children }: { k: NarrativeKey; edit: EditApi; children: React.ReactNode }) {
  const meta = edit.meta[k]
  const source = meta?.source === 'staff' ? 'Edited' : meta?.source === 'ai' ? 'AI draft' : 'Standard text'
  return (
    <div className="group/section relative mt-2 rounded-xl ring-1 ring-transparent ring-offset-4 transition hover:ring-[#e1e0d9] print:ring-0">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px] print:hidden">
        <span className="rounded-full bg-[#f1f0eb] px-2 py-0.5 font-medium text-[#52514e]">{source}</span>
        {meta?.needsReview ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800" title={(meta.reasons ?? []).join('\n')}>
            <LuCircleAlert className="size-3" /> Check this
          </span>
        ) : null}
        <span className="ml-auto flex gap-1">
          {edit.onRewrite ? (
            <button
              type="button"
              disabled={!!edit.busy}
              onClick={() => edit.onRewrite?.(k)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[#52514e] hover:bg-[#f1f0eb] disabled:opacity-50"
            >
              {edit.busy === k ? <LuLoader className="size-3 animate-spin" /> : <LuSparkles className="size-3" />} {edit.busy === k ? 'Rewriting…' : 'Rewrite with AI'}
            </button>
          ) : null}
          <button type="button" onClick={() => edit.onRestore(k)} className="rounded-md px-1.5 py-0.5 font-medium text-[#52514e] hover:bg-[#f1f0eb]">
            Restore draft
          </button>
        </span>
      </div>
      {meta?.needsReview && meta.reasons?.length ? <div className="mb-1 text-[11px] text-amber-800 print:hidden">{meta.reasons.join(' · ')}</div> : null}
      {children}
    </div>
  )
}

interface Tile {
  label: string
  value: string
  spark?: number[]
  sub: { text: string; tone: 'up' | 'down' | 'flat' } | null
}

function KpiTile({ tile: t, color }: { tile: Tile; color: string }) {
  const Arrow = t.sub?.tone === 'up' ? LuArrowUpRight : t.sub?.tone === 'down' ? LuArrowDownRight : null
  return (
    <div className="flex min-w-0 break-inside-avoid flex-col overflow-hidden rounded-xl border p-3.5" style={{ borderColor: INK.hairline }}>
      <div className="min-h-7 text-[11px] leading-tight font-medium" style={{ color: INK.secondary }}>
        {t.label}
      </div>
      <div className="mt-1 text-[26px] leading-none font-semibold tracking-tight">{t.value}</div>
      <div className="mt-2 h-[18px]">{t.spark ? <Sparkline values={t.spark} color={color} /> : null}</div>
      {t.sub ? (
        <div className={cn('mt-1.5 inline-flex items-start gap-1 text-[11px] leading-tight font-medium', t.sub.tone === 'up' ? 'text-[#087a08]' : t.sub.tone === 'down' ? 'text-[#b42318]' : 'text-[#898781]')}>
          {Arrow ? <Arrow className="size-3.5 shrink-0" /> : null}
          {t.sub.text}
        </div>
      ) : null}
    </div>
  )
}

function Heading({ icon: Icon, accent, children }: { icon: IconType; accent: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 break-after-avoid">
      <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: `${accent}12`, color: accent }}>
        <Icon className="size-4" />
      </span>
      <h2 className="text-[18px] font-semibold tracking-tight">{children}</h2>
    </div>
  )
}

function ComingUp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: INK.hairline }}>
      <div className="text-[11px] font-medium" style={{ color: INK.muted }}>
        {label}
      </div>
      <div className="mt-1 text-[13px] font-medium">{children}</div>
    </div>
  )
}

export function StatusChip({ level, audience }: { level: 'on_track' | 'needs_attention' | 'at_risk'; audience: 'family' | 'staff' }) {
  const s = {
    on_track: { icon: LuCircleCheck, bg: '#0ca30c14', fg: '#087a08', ring: '#0ca30c40' },
    needs_attention: { icon: LuCircleAlert, bg: '#fab2191a', fg: '#9a6b00', ring: '#fab21959' },
    at_risk: { icon: LuLifeBuoy, bg: '#d03b3b14', fg: '#b42318', ring: '#d03b3b40' },
  }[level]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }} data-testid="report-status">
      <s.icon className="size-4" />
      {levelLabel(level, audience)}
    </span>
  )
}

/** Running values: f(sum of the first n values, n) for each n. */
function running(values: number[], f: (sum: number, n: number) => number): number[] {
  const out: number[] = []
  values.reduce((sum, v, i) => {
    const next = sum + v
    out.push(f(next, i + 1))
    return next
  }, 0)
  return out
}

/** "Met every week · about 3 sessions a week · 90-minute sessions". */
function consistencyLine(f: ProgressReportDoc['facts']): string {
  const parts: string[] = []
  const c = f.consistency
  if (f.attendance.attended) {
    if (c.weeksWithSessions >= c.weeksInPeriod) parts.push('Met every week')
    else if (c.weeksWithSessions === c.weeksInPeriod - 1) parts.push('Met every week but one')
    else parts.push(`Met in ${c.weeksWithSessions} of ${c.weeksInPeriod} weeks`)
  }
  if (c.sessionsPerWeek && c.sessionsPerWeek >= 1) {
    const perWeek = Math.round(c.sessionsPerWeek * 2) / 2
    parts.push(`about ${perWeek} session${perWeek === 1 ? '' : 's'} a week`)
  }
  if (f.hours.averageSessionMinutes) parts.push(`${f.hours.averageSessionMinutes}-minute sessions`)
  return parts.join(' · ')
}
