import { limit, orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { IoSparklesSharp } from 'react-icons/io5'
import { LuChevronDown, LuExternalLink, LuHistory, LuUser } from 'react-icons/lu'
import { COL } from '@shared/paths'
import { FLAG_LABELS, type SessionLog, accuracy, averageRating, ratingKey } from '@shared/sessions/logs'
import { formatInstant } from '@shared/time'
import type { AuditEntry, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { FlagBadge, HomeworkBadge, StarInput, StarRating } from '../widgets'

export function isNoRisk(text: string) {
  return /^(no |none|no urgent)/i.test(text.trim())
}

type Stamp = { toDate?: () => Date } | null | undefined
const toDate = (t: unknown) => ((t as Stamp)?.toDate ? (t as { toDate: () => Date }).toDate() : null)

/** A submitted (or draft) log, read-only: record, AI overview, session info, notes, evaluation; admins also get context and history. */
export function LogView({ log }: { log: WithId<SessionLog> }) {
  const { settings, isAdmin, timezone } = useBranch()
  const ai = log.ai
  const when = (t: unknown) => {
    const d = toDate(t)
    return d ? formatInstant(d, timezone) : null
  }
  const submitted = toDate(log.submittedAt)
  const ended = toDate(log.endAt)
  const lateHours = submitted && ended ? Math.round(((submitted.getTime() - ended.getTime()) / 3_600_000) * 10) / 10 : null
  const avg = averageRating(log.ratings)
  const acc = log.accuracyPercent ?? accuracy(log.questionsAttempted, log.questionsWrong)
  const topics = log.topics?.length ? log.topics : log.topicCovered ? log.topicCovered.split('; ') : []

  return (
    <div className="space-y-4">
      <Card className="gap-0 py-0" data-testid="log-record">
        <dl className="grid gap-x-6 gap-y-2.5 px-4 py-4 text-sm sm:grid-cols-2">
          <Row label="Status">
            <Badge variant={log.status === 'submitted' ? 'default' : 'secondary'}>{log.status === 'submitted' ? 'Submitted' : 'Draft'}</Badge>
          </Row>
          {submitted ? (
            <Row label="Submitted">
              {when(log.submittedAt)} by {log.enteredBy?.name || log.tutorName}
              {lateHours !== null && lateHours > 0 ? <span className="text-muted-foreground"> · {lateHours} h after the session ended</span> : null}
            </Row>
          ) : null}
          {log.enteredByAdmin ? (
            <Row label="Entered by admin">
              {log.enteredByAdmin.name} on behalf of {log.tutorName}
            </Row>
          ) : null}
          {log.lastEditedBy ? (
            <Row label="Last edited">
              {when(log.lastEditedBy.at)} by {log.lastEditedBy.name}
              {log.editCount ? <span className="text-muted-foreground"> · {log.editCount} edit{log.editCount > 1 ? 's' : ''}</span> : null}
            </Row>
          ) : null}
          <Row label="Billed hours">{log.usedHours ? `${log.usedHours} h` : '—'}</Row>
          <Row label="Session type">{log.sessionType || '—'}</Row>
        </dl>
      </Card>

      {log.enteredByAdmin ? (
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
          <LuUser className="mt-0.5 shrink-0" />
          <span>
            Entered by admin {log.enteredByAdmin.name} on behalf of <span className="font-semibold">{log.tutorName}</span>. The log stays credited to the tutor.
          </span>
        </div>
      ) : null}

      {ai && (ai.sessionSummary || ai.nextSessionPlan || ai.homeworkAssigned || ai.riskAlert) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IoSparklesSharp /> AI overview
              {ai.provider === 'local_fallback' ? <Badge variant="outline">Auto summary</Badge> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ai.sessionSummary ? (
              <div className="rounded-xl bg-muted/60 p-4">
                <div className="text-xs font-semibold text-muted-foreground">Session summary</div>
                <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap">{ai.sessionSummary}</p>
              </div>
            ) : null}
            {ai.nextSessionPlan ? <AiBlock title="Next session plan" text={ai.nextSessionPlan} className="border-l-[3px] border-l-foreground" /> : null}
            {ai.homeworkAssigned ? <AiBlock title="Homework assigned" text={ai.homeworkAssigned} /> : null}
            {ai.riskAlert ? (
              <AiBlock
                title="Risk alert"
                text={ai.riskAlert}
                className={isNoRisk(ai.riskAlert) ? 'border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Session info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Block label="Session type">{log.sessionType || '—'}</Block>
            <Block label="Homework status">
              <HomeworkBadge status={log.homeworkStatus} />
            </Block>
            <Block label="Student flag">
              <FlagBadge flag={log.studentFlag} />
            </Block>
            <Block label="Questions attempted">{log.questionsAttempted ?? '—'}</Block>
            <Block label="Questions wrong">{log.questionsWrong ?? '—'}</Block>
            <Block label="Accuracy">{acc === null ? '—' : `${acc}%`}</Block>
          </div>
          {log.homeworkComments ? <Block label="Homework comments">{log.homeworkComments}</Block> : null}
          {topics.length ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{topics.length > 1 ? 'Topics covered' : 'Topic covered'}</div>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <Badge key={t} variant="secondary" className="font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {log.materials?.length ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                Materials used · {log.materials.length} item{log.materials.length > 1 ? 's' : ''}
              </div>
              <ul className="space-y-1 text-sm">
                {log.materials.map((m) => (
                  <li key={`${m.label}|${m.url}`}>
                    {m.url ? (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                        {m.label} <LuExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      m.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              ['Lesson activity', log.lessonActivity],
              ['Learning insight', log.learningInsight],
              ['Next focus', log.nextFocus],
              ['Homework given', log.homeworkGiven],
            ] as const
          ).map(([label, text]) => (
            <div key={label}>
              <div className="text-xs font-medium text-muted-foreground">{label}</div>
              <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-wrap">{text?.trim() ? text : '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Student evaluation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {settings.sessionLogs.ratingDimensions.map((d) => (
            <div key={d} className="flex items-center justify-between gap-3 text-sm">
              <span>{d}</span>
              <StarInput value={log.ratings?.[ratingKey(d)] ?? 0} label={d} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t pt-2 text-sm">
            <span className="font-medium">Average</span>
            <StarRating value={avg} />
          </div>
        </CardContent>
      </Card>

      {isAdmin ? <AdminContext log={log} /> : null}
      {isAdmin && log.status === 'submitted' ? <LogHistory log={log} /> : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}

function AiBlock({ title, text, className }: { title: string; text: string; className?: string }) {
  return (
    <div className={cn('rounded-lg border p-3', className)}>
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  )
}

/** What the admin knew then: the admin note at the time and the plan the previous session left for this one. */
function AdminContext({ log }: { log: WithId<SessionLog> }) {
  const { branchId } = useBranch()
  const [open, setOpen] = useState(false)
  const q = useMemo(
    () => (open ? query(branchCol(branchId, COL.sessionLogs), where('studentId', '==', log.studentId), where('dateKey', '<=', log.dateKey), orderBy('dateKey', 'desc'), limit(4)) : null),
    [branchId, log.studentId, log.dateKey, open],
  )
  const { data } = useQuery<SessionLog>(q, `ctx-${log.id}`)
  const previous = data.find((l) => l.id !== log.id && l.status === 'submitted' && (l.dateKey < log.dateKey || l.startMin < log.startMin))
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="gap-0 py-0 print:hidden">
        <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left font-semibold">
          Context
          <LuChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t px-4 py-3 text-sm">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Admin note at the time</div>
              <p className="mt-0.5 whitespace-pre-wrap">{log.sessionNote?.trim() || '—'}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Plan from the previous session</div>
              <p className="mt-0.5 whitespace-pre-wrap">{previous ? previous.ai?.nextSessionPlan || previous.nextFocus || '—' : '—'}</p>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

/** Every submit and edit of this log, with what changed. */
function LogHistory({ log }: { log: WithId<SessionLog> }) {
  const { branchId, timezone } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.auditLog), where('entityId', '==', log.sessionId), orderBy('at', 'desc'), limit(30)), [branchId, log.sessionId])
  const { data } = useQuery<AuditEntry>(q, `log-history-${log.sessionId}`)
  const entries = data.filter((a) => a.entityType === 'sessionLog')
  if (!entries.length) return null
  const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))
  return (
    <Card className="print:hidden" data-testid="log-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuHistory /> History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {entries.map((a) => (
            <li key={a.id} className="text-sm">
              <div>
                <span className="text-muted-foreground tabular-nums">{a.at ? formatInstant((a.at as { toDate: () => Date }).toDate(), timezone) : ''}</span> · {a.actorName} ·{' '}
                <span className="font-medium">{a.action === 'sessionLog.edit' ? 'Updated' : a.action === 'sessionLog.sync' ? 'Updated to match the schedule' : 'Submitted'}</span>
              </div>
              {a.changes?.length ? (
                <ul className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {a.changes.map((c) => (
                    <li key={c.field} className="list-disc">
                      {c.to === 'edited' ? `${c.label} edited` : `${c.label}: ${fmt(c.from)} → ${fmt(c.to)}`}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export { FLAG_LABELS }
