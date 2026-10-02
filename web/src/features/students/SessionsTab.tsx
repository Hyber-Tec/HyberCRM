import { useState } from 'react'
import { LuChevronDown, LuChevronRight, LuEye, LuFileText, LuPlus, LuTrendingDown, LuTrendingUp } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { SESSION_STATUS_STYLE } from '@shared/schedule/status'
import { averageRating } from '@shared/sessions/logs'
import { formatDateKey } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Button } from '@/components/ui/button'
import { LEVEL_STYLE, isV2, levelLabel, reportName } from '@/features/reports/model'
import { openLog } from '@/features/sessions/SessionLogListPage'
import { FlagBadge, HomeworkBadge, StarRating } from '@/features/sessions/widgets'
import { cn } from '@/lib/utils'
import { WeeklyAccuracyChart } from './profile/charts'
import { timeSpan } from './profile/model'
import type { StudentActivity } from './profile/useStudentActivity'

const LOGS_STEP = 6
const SCHEDULE_STEP = 7

/** Student page → Sessions: key numbers, practice by week, session logs, scheduled sessions and progress reports. */
export function SessionsTab({
  student,
  mode,
  activity,
  colorOf,
  canCreateReport,
  onNewReport,
  onOpenSession,
}: {
  student: WithId<Student>
  mode: 'admin' | 'tutor'
  activity: StudentActivity
  colorOf: (subject: string) => string
  canCreateReport: boolean
  onNewReport: () => void
  onOpenSession: (id: string) => void
}) {
  const { branchId, settings } = useBranch()
  const navigate = useNavigate()
  const { logs, sessions, reports, summary, avgRating, practiceWeeks, today, nowMin } = activity
  const [shown, setShown] = useState(LOGS_STEP)
  const [open, setOpen] = useState<string | null>(null)
  const [when, setWhen] = useState<'up' | 'past'>('up')
  const [schedShown, setSchedShown] = useState(SCHEDULE_STEP)
  const firstOpen = open ?? logs[0]?.id ?? null
  const first = student.firstName || student.name.split(' ')[0]

  const facts = summary?.facts
  const hw = facts?.homework
  const practice = facts?.practice
  const level = summary?.progress.level ?? null
  const accNow = practice ? (practice.latePercent ?? practice.percent) : null
  const accDelta = practice && practice.earlyPercent !== null && practice.latePercent !== null ? practice.latePercent - practice.earlyPercent : null

  const happened = (s: { dateKey: string; endMin: number }) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin)
  const schedule = when === 'up' ? sessions.filter((s) => !happened(s)) : sessions.filter(happened).reverse()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card md:grid-cols-4" data-testid="student-stats">
        <StatCell label="Homework done" className="border-r border-b md:border-b-0">
          <div className="text-2xl font-semibold tabular-nums">{hw?.percent != null ? `${hw.percent}%` : '—'}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            {hw?.percent != null ? (
              <>
                <div className="h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
                  <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${hw.percent}%` }} />
                </div>
                <div className="mt-1.5">
                  {hw.completed} of {hw.assigned} assignments
                </div>
              </>
            ) : (
              'No homework logged yet'
            )}
          </div>
        </StatCell>
        <StatCell label="Average rating" className="border-b md:border-r md:border-b-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold tabular-nums">{avgRating !== null ? avgRating.toFixed(1) : '—'}</span>
            {avgRating !== null ? <Stars value={avgRating} /> : null}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {logs.length ? `Across ${settings.sessionLogs.ratingDimensions.length} areas, ${logs.length} session${logs.length === 1 ? '' : 's'}` : 'No sessions logged yet'}
          </div>
        </StatCell>
        <StatCell label="Practice accuracy" className="border-r">
          <div className="text-2xl font-semibold tabular-nums">{accNow !== null ? `${accNow}%` : '—'}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            {accDelta !== null && accDelta !== 0 ? (
              <>
                <span className={cn('font-medium', accDelta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                  {accDelta > 0 ? '+' : ''}
                  {accDelta} pts
                </span>{' '}
                since the first sessions
              </>
            ) : practice ? (
              `${practice.correct} of ${practice.attempted} questions`
            ) : (
              'No practice questions logged'
            )}
          </div>
        </StatCell>
        <StatCell label="Progress status">
          <div className="pt-1">
            {level ? (
              <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ring-inset', LEVEL_STYLE[level].chip)}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: LEVEL_STYLE[level].dot }} />
                {levelLabel(level, 'staff')}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Same rule as progress reports</div>
        </StatCell>
      </div>

      {practiceWeeks.length >= 2 ? (
        <div className="rounded-xl border bg-card p-5" data-testid="practice-chart">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Practice accuracy</h2>
              <p className="text-sm text-muted-foreground">Practice questions answered correctly, from the session logs, by week</p>
            </div>
            {practice && practice.earlyPercent !== null && practice.latePercent !== null ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                  practice.latePercent >= practice.earlyPercent ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
                )}
              >
                {practice.latePercent >= practice.earlyPercent ? <LuTrendingUp className="size-3.5" /> : <LuTrendingDown className="size-3.5" />}
                {practice.earlyPercent}% → {practice.latePercent}%
              </span>
            ) : null}
          </div>
          <div className="mt-3">
            <WeeklyAccuracyChart weeks={practiceWeeks} />
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card" data-testid="student-logs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold">Session logs</h2>
            <p className="text-sm text-muted-foreground">Newest first. Open one to see what was covered.</p>
          </div>
          <span className="text-sm text-muted-foreground">
            <b className="font-medium text-foreground tabular-nums">{logs.length}</b> log{logs.length === 1 ? '' : 's'}
          </span>
        </div>
        {logs.length ? (
          <ul className="divide-y">
            {logs.slice(0, shown).map((l) => {
              const expanded = firstOpen === l.id
              const rating = averageRating(l.ratings)
              const topic = l.topicCovered || l.topics?.[0] || ''
              return (
                <li key={l.id}>
                  <button type="button" className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-muted/40" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : l.id)}>
                    <div className="flex w-11 shrink-0 flex-col items-center rounded-lg border py-1 leading-tight">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">{formatDateKey(l.dateKey, 'monthDay').split(' ')[0]}</span>
                      <span className="text-lg font-semibold tabular-nums">{Number(l.dateKey.slice(8))}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(l.subject) }} />
                        <span className="shrink-0">{l.subject || 'No subject'}</span>
                        {topic ? <span className="hidden truncate font-normal text-muted-foreground sm:inline">· {topic}</span> : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatDateKey(l.dateKey, 'weekdayMedium').split(',')[0]} · {timeSpan(l.startMin, l.endMin)} · {l.tutorName}
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <HomeworkBadge status={l.homeworkStatus} />
                    </div>
                    <div className="w-20 text-right">
                      <StarRating value={rating} />
                    </div>
                    <LuChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded ? (
                    <div className="border-t border-dashed bg-muted/30 px-5 py-4 sm:pl-[5.25rem]">
                      <div className="mb-3 flex flex-wrap gap-2 md:hidden">
                        <HomeworkBadge status={l.homeworkStatus} />
                      </div>
                      <div className="grid gap-4 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">What we noticed</div>
                          <p className="mt-1 leading-relaxed whitespace-pre-wrap">{l.learningInsight || l.lessonActivity || '—'}</p>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">Next focus</div>
                          <p className="mt-1 leading-relaxed whitespace-pre-wrap">{l.nextFocus || '—'}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {(l.questionsAttempted ?? 0) > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Practice:{' '}
                            <b className="text-foreground tabular-nums">
                              {Math.max(0, (l.questionsAttempted ?? 0) - (l.questionsWrong ?? 0))}/{l.questionsAttempted}
                            </b>{' '}
                            correct
                            {l.accuracyPercent != null ? ` (${l.accuracyPercent}%)` : ''}
                          </span>
                        ) : null}
                        {l.studentFlag ? <FlagBadge flag={l.studentFlag} /> : null}
                        <Button variant="outline" size="sm" className="ml-auto" onClick={() => openLog(branchId, l.sessionId, true)}>
                          Open the full log
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No sessions logged for {first} yet.</p>
        )}
        {logs.length > shown ? (
          <div className="border-t p-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + LOGS_STEP)}>
              <LuChevronDown /> Show more
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border bg-card" data-testid="student-schedule">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-base font-semibold">Scheduled sessions</h2>
            <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="Which sessions">
              {(
                [
                  ['up', 'Upcoming'],
                  ['past', 'Past'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={when === v}
                  onClick={() => {
                    setWhen(v)
                    setSchedShown(SCHEDULE_STEP)
                  }}
                  className={cn('h-7 rounded-md px-2.5 font-medium whitespace-nowrap', when === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {schedule.length ? (
            <ol className="px-5 py-4">
              {schedule.slice(0, schedShown).map((s, i, list) => {
                const st = SESSION_STATUS_STYLE[s.status]
                return (
                  <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < list.length - 1 ? <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" /> : null}
                    <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-card" style={{ backgroundColor: st.bg, boxShadow: `0 0 0 1px ${st.border}` }}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: colorOf(s.subject) }} />
                    </span>
                    <button
                      type="button"
                      disabled={mode !== 'admin'}
                      onClick={() => onOpenSession(s.id)}
                      className="min-w-0 flex-1 rounded-lg px-2 py-0.5 text-left enabled:hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">
                          {formatDateKey(s.dateKey, 'weekdayMedium')} · {timeSpan(s.startMin, s.endMin)}
                        </div>
                        <SessionStatusBadge status={s.status} logSubmitted={s.logStatus === 'submitted'} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.subject || 'No subject'} with {s.tutorName}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{when === 'up' ? 'No upcoming sessions.' : 'No past sessions.'}</p>
          )}
          {schedule.length > schedShown ? (
            <div className="border-t p-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => setSchedShown((n) => n + SCHEDULE_STEP)}>
                <LuChevronDown /> Show more
              </Button>
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-xl border bg-card" data-testid="student-reports">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-base font-semibold">Progress reports</h2>
            {canCreateReport ? (
              <Button variant="outline" size="sm" onClick={onNewReport}>
                <LuPlus /> New report
              </Button>
            ) : null}
          </div>
          {reports.length ? (
            <ul className="divide-y">
              {reports.map((r) => {
                const draft = isV2(r) && r.status === 'draft'
                const viewed = isV2(r) ? r.firstViewedAt : null
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/40"
                      onClick={() => navigate(`/${branchId}/${mode}/sessions/progress-reports/${r.id}`)}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
                        <LuFileText className={cn('size-4', draft ? 'text-muted-foreground' : 'text-violet-600')} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{reportName(r).replace(/^./, (c) => c.toUpperCase())}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {formatDateKey(r.startDate, 'monthDay')} – {formatDateKey(r.endDate, 'medium')}
                          {r.sessionCount != null ? ` · ${r.sessionCount} sessions` : ''}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs">
                          {draft ? (
                            <>
                              <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">Draft</span>
                              {isV2(r) && r.generatedBy?.name ? <span className="text-muted-foreground">by {r.generatedBy.name}</span> : null}
                            </>
                          ) : (
                            <>
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Shared</span>
                              <span className="inline-flex items-center gap-1 text-muted-foreground">{viewed ? <><LuEye className="size-3" /> Viewed</> : 'Not viewed yet'}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <LuChevronRight className="size-4 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">No reports yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCell({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0 p-4', className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Stars({ value }: { value: number }) {
  return (
    <span className="relative inline-block text-base leading-none" aria-label={`${value} out of 5`}>
      <span className="text-neutral-300 dark:text-neutral-600">★★★★★</span>
      <span className="absolute inset-0 overflow-hidden whitespace-nowrap text-amber-400" style={{ width: `${(value / 5) * 100}%` }}>
        ★★★★★
      </span>
    </span>
  )
}
