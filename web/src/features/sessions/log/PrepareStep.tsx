import { httpsCallable } from 'firebase/functions'
import { useEffect, useMemo, useState } from 'react'
import { IoSparklesSharp } from 'react-icons/io5'
import { LuBook, LuChevronLeft, LuChevronRight, LuExternalLink, LuFlag, LuMessageSquareText, LuUser } from 'react-icons/lu'
import { STUDENT_STATUS_LABELS } from '@shared/people'
import { type SessionLog, averageRating } from '@shared/sessions/logs'
import { formatDateKey } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { functions } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import { isNoRisk } from './LogView'
import { matchingLog } from './data'
import { FlagBadge, StarRating } from '../widgets'

const contextCallable = httpsCallable<{ branchId: string; sessionId: string }, { conferenceNote: { date: string; text: string; authorName: string } | null }>(
  functions,
  'sessionLogContext',
)

const PAGE = 6

/** Step 1: what to know before the session (read-only). */
export function PrepareStep({
  session,
  student,
  logs,
  loading,
}: {
  session: WithId<Session>
  student: WithId<Student> | null
  logs: WithId<SessionLog>[]
  loading: boolean
}) {
  const { branchId, rules, isAdmin } = useBranch()
  const [selected, setSelected] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [note, setNote] = useState<{ date: string; text: string; authorName: string } | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)

  // The latest parent conference note (when the branch holds conferences), served to the session's tutor.
  useEffect(() => {
    if (!rules.conferences.enabled) return
    let live = true
    contextCallable({ branchId, sessionId: session.id })
      .then((r) => live && setNote(r.data.conferenceNote))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [branchId, session.id, rules.conferences.enabled])

  const current = useMemo(() => logs.find((l) => l.id === selected) ?? matchingLog(logs, session), [logs, selected, session])
  const pages = Math.max(1, Math.ceil(logs.length / PAGE))
  const shown = logs.slice(page * PAGE, page * PAGE + PAGE)
  const profilePath = `/${branchId}/${isAdmin ? 'admin' : 'tutor'}/students/${session.studentId}/info`
  const viewPath = (l: SessionLog) => `/${branchId}/session-log/${l.sessionId}/view`

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Session preparation</h2>
        <p className="text-sm text-muted-foreground">Review what happened last session and key context before you begin.</p>
      </div>

      {session.note ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <LuFlag className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Admin note:</span> {session.note}
          </span>
        </div>
      ) : null}

      {student ? (
        <Card className="flex-row flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <LuUser className="text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">School:</span> {student.school || '—'}
          </span>
          <span>
            <span className="text-muted-foreground">Grade:</span> {student.grade || '—'}
          </span>
          <span>
            <span className="text-muted-foreground">Total hours:</span> {(student.totalSessionHours ?? 0).toFixed(1)}
          </span>
          <span>
            <span className="text-muted-foreground">Status:</span> {STUDENT_STATUS_LABELS[student.status] ?? student.status}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-3">
            {note ? (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline" onClick={() => setNoteOpen(true)}>
                <LuMessageSquareText className="size-3.5" /> View parent note ({formatDateKey(note.date, 'medium')})
              </button>
            ) : null}
            <a href={profilePath} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline">
              Full profile <LuExternalLink className="size-3.5" />
            </a>
          </span>
          {student.learningNote ? (
            <span className="w-full">
              <span className="text-muted-foreground">Learning notes:</span> {student.learningNote}
            </span>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IoSparklesSharp /> From last session
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : current ? (
            <div className="space-y-3 text-sm" data-testid="prep-last-session">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatDateKey(current.dateKey, 'medium')}</Badge>
                <Badge variant="outline">{current.subject || current.sessionType}</Badge>
                <FlagBadge flag={current.studentFlag} />
                <a href={viewPath(current)} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline">
                  View full log <LuExternalLink className="size-3.5" />
                </a>
              </div>
              {current.topicCovered ? (
                <div>
                  <span className="text-muted-foreground">Topic covered:</span> {current.topicCovered}
                </div>
              ) : null}
              <AiCards log={current} />
              {current.nextFocus ? (
                <div className="text-sm">
                  <span className="text-muted-foreground">Tutor’s next focus note:</span> <span className="whitespace-pre-wrap">{current.nextFocus}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
              <LuBook className="size-5" />
              No previous session log found for this student.
            </div>
          )}
        </CardContent>
      </Card>

      {logs.length > 0 ? (
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div>
              <div className="font-semibold">Recent sessions</div>
              <div className="text-xs text-muted-foreground">Select a session to preview it above</div>
            </div>
            {pages > 1 ? (
              <div className="flex items-center gap-1 text-xs tabular-nums">
                <Button variant="ghost" size="icon-xs" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <LuChevronLeft />
                </Button>
                {page + 1} / {pages}
                <Button variant="ghost" size="icon-xs" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                  <LuChevronRight />
                </Button>
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Tutor</th>
                  <th className="hidden px-2 py-2 font-medium sm:table-cell">Subject</th>
                  <th className="hidden px-2 py-2 font-medium md:table-cell">Topic</th>
                  <th className="px-2 py-2 font-medium">Rating</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const on = current?.id === l.id
                  return (
                    <tr
                      key={l.id}
                      tabIndex={0}
                      title="Click to preview this session above"
                      onClick={() => setSelected(l.id)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(l.id))}
                      className={cn('cursor-pointer border-t outline-none hover:bg-muted/60 focus-visible:bg-muted/60', on && 'bg-sky-50 shadow-[inset_3px_0_0_#2563eb] dark:bg-sky-950/30')}
                    >
                      <td className="px-4 py-2 whitespace-nowrap tabular-nums">{formatDateKey(l.dateKey, 'medium')}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{l.tutorName}</td>
                      <td className="hidden px-2 py-2 sm:table-cell">{l.subject || l.sessionType}</td>
                      <td className="hidden max-w-56 truncate px-2 py-2 text-muted-foreground md:table-cell">{l.topicCovered || '—'}</td>
                      <td className="px-2 py-2">
                        <StarRating value={averageRating(l.ratings)} />
                      </td>
                      <td className="pr-3">
                        <a
                          href={viewPath(l)}
                          target="_blank"
                          rel="noopener"
                          title="Open full session log in a new tab"
                          aria-label="Open full session log"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <LuExternalLink className="size-3.5" />
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Parent conference — {note ? formatDateKey(note.date, 'medium') : ''}</DialogTitle>
          </DialogHeader>
          <p className="max-h-[60vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">{note?.text || 'No content.'}</p>
          {note?.authorName ? <p className="text-xs text-muted-foreground">Written by {note.authorName}</p> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The earlier log's AI notes: next plan (highlighted), summary, homework, risk; empty ones hidden. */
function AiCards({ log }: { log: SessionLog }) {
  const ai = log.ai
  if (!ai) return null
  const cards = [
    { title: 'Next session plan', text: ai.nextSessionPlan, accent: true },
    { title: 'Session summary', text: ai.sessionSummary },
    { title: 'Homework assigned', text: ai.homeworkAssigned },
    { title: 'Risk alert', text: ai.riskAlert, risk: true },
  ].filter((c) => c.text?.trim())
  if (!cards.length) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {cards.map((c) => (
        <div
          key={c.title}
          className={cn(
            'rounded-lg border p-3',
            c.accent && 'border-l-[3px] border-l-foreground',
            c.risk && (isNoRisk(c.text) ? 'border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'),
          )}
        >
          <div className="text-xs font-semibold text-muted-foreground">{c.title}</div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{c.text}</p>
        </div>
      ))}
    </div>
  )
}
