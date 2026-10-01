import { IoSparklesSharp } from 'react-icons/io5'
import { LuExternalLink, LuUser } from 'react-icons/lu'
import { type SessionLog, ratingKey } from '@shared/sessions/logs'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { FlagBadge, HomeworkBadge, StarInput } from './widgets'

export function isNoRisk(text: string) {
  return /^(no |none|no urgent)/i.test(text.trim())
}

/** Read-only session log (True Education's detail view). */
export function LogDetail({ log }: { log: SessionLog }) {
  const { settings } = useBranch()
  const ai = log.ai
  return (
    <div className="space-y-4">
      {log.enteredByAdmin ? (
        <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
          <LuUser /> Entered by admin {log.enteredByAdmin.name} on behalf of <span className="font-semibold">{log.tutorName}</span>.
        </div>
      ) : null}
      {ai && (ai.sessionSummary || ai.nextSessionPlan) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IoSparklesSharp /> AI overview
              {ai.provider === 'local_fallback' ? <Badge variant="outline">Auto summary</Badge> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ai.sessionSummary ? <p className="text-sm leading-relaxed">{ai.sessionSummary}</p> : null}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-l-4 border-l-foreground bg-muted/40 p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Next session plan</div>
                <div className="mt-1 text-sm">{ai.nextSessionPlan || '—'}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Homework assigned</div>
                <div className="mt-1 text-sm">{ai.homeworkAssigned || '—'}</div>
              </div>
              <div
                className={cn(
                  'rounded-lg border border-l-4 p-3',
                  isNoRisk(ai.riskAlert) ? 'border-green-200 border-l-green-500 bg-green-50 dark:bg-green-950/30' : 'border-amber-200 border-l-amber-500 bg-amber-50 dark:bg-amber-950/30',
                )}
              >
                <div className="text-xs font-semibold text-muted-foreground uppercase">Risk alert</div>
                <div className="mt-1 text-sm">{ai.riskAlert || '—'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Session info</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Session type" value={log.sessionType} />
          <Info label="Homework" value={<HomeworkBadge status={log.homeworkStatus} />} />
          <Info label="Flag" value={<FlagBadge flag={log.studentFlag} />} />
          <Info label="Questions attempted" value={log.questionsAttempted ?? '—'} />
          <Info label="Questions wrong" value={log.questionsWrong ?? '—'} />
          <Info label="Accuracy" value={log.accuracyPercent != null ? `${log.accuracyPercent}%` : '—'} />
          {log.homeworkComments ? <Info label="Homework comments" value={log.homeworkComments} wide /> : null}
          <Info
            label="Topics covered"
            wide
            value={
              <div className="flex flex-wrap gap-1">
                {(log.topics?.length ? log.topics : log.topicCovered ? [log.topicCovered] : []).map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            }
          />
          <Info
            label={`${log.materials?.length ?? 0} material(s) used`}
            wide
            value={
              <ul className="space-y-0.5">
                {(log.materials ?? []).map((m, i) => (
                  <li key={i}>
                    {m.url ? (
                      <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline-offset-2 hover:underline">
                        {m.label} <LuExternalLink className="size-3" />
                      </a>
                    ) : (
                      m.label
                    )}
                  </li>
                ))}
              </ul>
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Session notes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['Lesson activity', log.lessonActivity],
              ['Learning insight', log.learningInsight],
              ['Next focus', log.nextFocus],
              ['Homework given', log.homeworkGiven],
            ] as const
          ).map(([label, text]) => (
            <div key={label}>
              <div className="text-xs font-semibold text-muted-foreground uppercase">{label}</div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{text || '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Student evaluation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {settings.sessionLogs.ratingDimensions.map((d) => (
            <div key={d} className="flex items-center justify-between gap-4 text-sm">
              <span>{d}</span>
              <StarInput value={log.ratings?.[ratingKey(d)] ?? 0} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Info({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'sm:col-span-2 lg:col-span-3')}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  )
}
