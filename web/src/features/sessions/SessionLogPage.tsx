import { limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IoSparklesSharp } from 'react-icons/io5'
import {
  LuBook,
  LuCircleCheck,
  LuChevronLeft,
  LuChevronRight,
  LuFileText,
  LuFlag,
  LuGrid2X2,
  LuPencil,
  LuSquarePen,
  LuStar,
  LuTriangleAlert,
  LuUser,
  LuX,
} from 'react-icons/lu'
import { Link, useParams } from 'react-router'
import { COL } from '@shared/paths'
import { businessRoundedHours } from '@shared/schedule/hours'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import {
  FLAG_LABELS,
  type LogContent,
  type SessionLog,
  type StudentFlag,
  accuracy,
  averageRating,
  canLog,
  firstMissing,
  ratingKey,
} from '@shared/sessions/logs'
import { topicKind } from '@shared/sessions/topics'
import { formatDateKey, formatTimeRange } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { functions } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { LogDetail } from './LogDetail'
import { FLAG_STYLE, FlagBadge, StarInput, StarRating, TopicPicker } from './widgets'

const submitCallable = httpsCallable<{ branchId: string; sessionId: string; content: LogContent }, { ok: boolean }>(functions, 'submitSessionLog')
const aiCallable = httpsCallable<{ branchId: string; mode: 'polish'; payload: Record<string, string> }, Record<string, string>>(functions, 'sessionAi')

const STEPS = [
  { id: 'prep', label: 'Prepare', icon: LuBook },
  { id: 'session', label: 'Session Info', icon: LuGrid2X2 },
  { id: 'materials', label: 'Materials', icon: LuFileText },
  { id: 'notes', label: 'Notes', icon: LuSquarePen },
  { id: 'evaluation', label: 'Evaluation', icon: LuStar },
  { id: 'review', label: 'Review & Submit', icon: LuCircleCheck },
] as const

const EMPTY: LogContent = {
  sessionType: '',
  topics: [],
  topicCovered: '',
  homeworkStatus: '',
  homeworkComments: '',
  materials: [],
  questionsAttempted: null,
  questionsWrong: null,
  lessonActivity: '',
  learningInsight: '',
  nextFocus: '',
  homeworkGiven: '',
  ratings: {},
  studentFlag: '',
}

function pickContent(log: Partial<SessionLog> | null): LogContent {
  if (!log) return EMPTY
  const out = { ...EMPTY }
  for (const k of Object.keys(EMPTY) as (keyof LogContent)[]) {
    if (log[k] !== undefined && log[k] !== null) (out as Record<string, unknown>)[k] = log[k]
  }
  return out
}

/**
 * Session log workspace (opened in a new tab from the schedule). Steps, fields,
 * validation and labels follow True Education; submitting runs on the server.
 */
export function SessionLogPage({ readOnly = false }: { readOnly?: boolean }) {
  const { sessionId = '' } = useParams()
  const { branchId, branch, settings, staffId, isAdmin, actor } = useBranch()
  const sessionRef = useMemo(() => branchDocRef(branchId, COL.sessions, sessionId), [branchId, sessionId])
  const logRef = useMemo(() => branchDocRef(branchId, COL.sessionLogs, sessionId), [branchId, sessionId])
  const { data: session, loading: sLoading, error: sError } = useDoc<Session>(sessionRef)
  const { data: log, loading: lLoading } = useDoc<SessionLog>(logRef)
  const studentRef = useMemo(() => (session ? branchDocRef(branchId, COL.students, session.studentId) : null), [branchId, session])
  const { data: student } = useDoc<Student>(studentRef)

  const isOwnTutor = !!staffId && session?.tutorId === staffId
  const adminEntry = isAdmin && !isOwnTutor
  const submitted = log?.status === 'submitted'
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (session) document.title = `${session.studentName} – Session Log | ${branch.name}`
  }, [session, branch.name])

  if (sLoading || lLoading) return <FullPageSpinner label="Loading session workspace…" />
  if (!session || sError) {
    return <FullPageMessage title="Session not found" description="It may have been deleted, or you don’t have access to it." actions={[{ label: 'Close', onClick: () => window.close() }]} />
  }
  if (!isAdmin && !isOwnTutor && !submitted) {
    return <FullPageMessage title="Not your session" description="You can only log your own sessions." actions={[{ label: 'Close', onClick: () => window.close() }]} />
  }

  const showForm = !readOnly && (!submitted || editing)
  const canEditAfter = isAdmin || (isOwnTutor && settings.sessionLogs.allowEditAfterSubmit)

  return (
    <div className="min-h-svh bg-muted/40">
      <Header session={session} />
      <main className="mx-auto max-w-4xl px-4 pt-4 pb-28">
        {showForm ? (
          canLog(session.status, settings.sessionLogs.allowForStatuses) || submitted ? (
            <LogForm
              session={session}
              student={student}
              existing={log}
              adminEntry={adminEntry}
              actorEmail={actor.email}
              onSubmitted={() => setEditing(false)}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>This session can’t be logged</CardTitle>
                <CardDescription>
                  {SESSION_STATUS_LABELS[session.status]} sessions don’t take a session log. If the student attended, change the status on the schedule first.
                </CardDescription>
              </CardHeader>
            </Card>
          )
        ) : log ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant={submitted ? 'default' : 'secondary'}>{submitted ? 'Submitted' : 'Draft'}</Badge>
              <div className="flex-1" />
              {canEditAfter && !readOnly ? (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <LuPencil /> Edit log
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => window.close()}>
                Close
              </Button>
            </div>
            <LogDetail log={log} />
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No log yet</CardTitle>
              <CardDescription>The tutor hasn’t written a log for this session.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
    </div>
  )
}

function Header({ session }: { session: WithId<Session> }) {
  const { branch } = useBranch()
  const hours = businessRoundedHours(session.endMin - session.startMin)
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
        <BrandMark name={branch.name} logoUrl={branch.branding?.logoUrl} accentColor={branch.branding?.accentColor} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{session.studentName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {session.subject || 'No subject'} · {formatDateKey(session.dateKey, 'medium')} · {formatTimeRange(session.startMin, session.endMin)} ({hours}h)
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="text-muted-foreground">Tutor</div>
          <div className="font-medium">{session.tutorName}</div>
        </div>
      </div>
    </header>
  )
}

function LogForm({
  session,
  student,
  existing,
  adminEntry,
  actorEmail,
  onSubmitted,
}: {
  session: WithId<Session>
  student: WithId<Student> | null
  existing: WithId<SessionLog> | null
  adminEntry: boolean
  actorEmail: string
  onSubmitted: () => void
}) {
  const { branchId, settings } = useBranch()
  const [step, setStep] = useState(0)
  const [c, setC] = useState<LogContent>(() => pickContent(existing))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [materialInput, setMaterialInput] = useState('')
  const dirty = useRef(false)
  const dims = settings.sessionLogs.ratingDimensions
  const isSubmitted = existing?.status === 'submitted'

  const set = <K extends keyof LogContent>(k: K, v: LogContent[K]) => {
    dirty.current = true
    setError(null)
    setC((x) => ({ ...x, [k]: v }))
  }

  // Autosave drafts (only before the first submit; later edits are re-submitted).
  const saveDraft = useCallback(async () => {
    if (!dirty.current || isSubmitted) return
    dirty.current = false
    await setDoc(
      branchDocRef(branchId, COL.sessionLogs, session.id),
      {
        sessionId: session.id,
        ...c,
        status: 'draft',
        tutorId: session.tutorId,
        tutorName: session.tutorName,
        studentId: session.studentId,
        studentName: session.studentName,
        subject: session.subject,
        dateKey: session.dateKey,
        startMin: session.startMin,
        endMin: session.endMin,
        updatedAt: serverTimestamp(),
        updatedBy: actorEmail,
      },
      { merge: true },
    ).catch(() => undefined)
    setSavedAt(Date.now())
  }, [branchId, session, c, actorEmail, isSubmitted])
  useEffect(() => {
    const t = setInterval(() => void saveDraft(), settings.sessionLogs.autosaveSeconds * 1000)
    return () => clearInterval(t)
  }, [saveDraft, settings.sessionLogs.autosaveSeconds])

  const done = [
    true,
    !!c.sessionType && (topicKind(c.sessionType) === 'free' ? !!c.topicCovered.trim() : c.topics.length > 0) && !!c.homeworkStatus,
    c.materials.length > 0 && !!c.questionsAttempted && c.questionsWrong != null && c.questionsWrong <= c.questionsAttempted,
    !!(c.lessonActivity.trim() && c.learningInsight.trim() && c.nextFocus.trim() && c.homeworkGiven.trim()),
    dims.every((d) => (c.ratings[ratingKey(d)] ?? 0) >= 1) && !!c.studentFlag,
  ]
  done.push(done.every(Boolean))

  async function submit() {
    const missing = firstMissing(c, dims)
    if (missing) return setError(`“${missing}” is required before submitting.`)
    setSaving(true)
    try {
      await submitCallable({ branchId, sessionId: session.id, content: c })
      dirty.current = false
      onSubmitted()
    } catch (e) {
      setError((e as { message?: string }).message?.replace(/^.*?: /, '') ?? 'Could not submit the log.')
    } finally {
      setSaving(false)
    }
  }

  async function polish() {
    setPolishing(true)
    try {
      const res = await aiCallable({
        branchId,
        mode: 'polish',
        payload: { lessonActivity: c.lessonActivity, learningInsight: c.learningInsight, nextFocus: c.nextFocus, homeworkGiven: c.homeworkGiven },
      })
      setC((x) => ({ ...x, ...(['lessonActivity', 'learningInsight', 'nextFocus', 'homeworkGiven'] as const).reduce((o, k) => ({ ...o, [k]: res.data[k] ?? x[k] }), {}) }))
      dirty.current = true
    } catch {
      setError('Polishing isn’t available right now.')
    } finally {
      setPolishing(false)
    }
  }

  const acc = accuracy(c.questionsAttempted, c.questionsWrong)

  return (
    <div className="space-y-4">
      {adminEntry ? (
        <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
          <LuUser /> Adding this log on behalf of <span className="font-semibold">{session.tutorName}</span>. The log stays credited to the tutor; your name is recorded as the admin who entered it.
        </div>
      ) : null}
      {isSubmitted ? (
        <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">You’re editing a submitted log. Submitting again updates it and the student’s hours.</div>
      ) : null}
      <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-background p-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
              step === i ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {done[i] && step !== i ? <LuCircleCheck className="size-4 text-green-600" /> : <s.icon className="size-4" />}
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </nav>
      {error && step < 5 ? <ErrorBox text={error} /> : null}

      {step === 0 ? <PrepStep session={session} student={student} /> : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Session info</CardTitle>
            <CardDescription>Set the session type, topic and homework review.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Session type</FieldLabel>
                <Select value={c.sessionType || undefined} onValueChange={(v) => setC((x) => ({ ...x, sessionType: v, topics: [], topicCovered: '' }))}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.sessionLogs.sessionTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Topic covered{topicKind(c.sessionType) !== 'free' ? ' — select one or more' : ''}</FieldLabel>
                {topicKind(c.sessionType) === 'free' ? (
                  <Input value={c.topicCovered} onChange={(e) => set('topicCovered', e.target.value)} placeholder="e.g. Linear equations, comma usage" />
                ) : (
                  <TopicPicker sessionType={c.sessionType} value={c.topics} onChange={(v) => set('topics', v)} />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Homework status</FieldLabel>
                  <Select value={c.homeworkStatus || undefined} onValueChange={(v) => set('homeworkStatus', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {settings.sessionLogs.homeworkStatuses.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Homework comments</FieldLabel>
                  <Input value={c.homeworkComments} onChange={(e) => set('homeworkComments', e.target.value)} placeholder="Notes on completion or quality" />
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Materials & metrics</CardTitle>
            <CardDescription>Log what materials were used and how the student performed.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Materials used</FieldLabel>
                <div className="space-y-1.5">
                  {c.materials.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                      {m.url ? (
                        <a href={m.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-blue-700 underline-offset-2 hover:underline">
                          {m.label}
                        </a>
                      ) : (
                        <span className="flex-1 truncate">{m.label}</span>
                      )}
                      <Button variant="ghost" size="icon-xs" aria-label="Remove" onClick={() => set('materials', c.materials.filter((_, k) => k !== i))}>
                        <LuX />
                      </Button>
                    </div>
                  ))}
                  {c.materials.length === 0 ? <p className="text-sm text-muted-foreground">No materials added yet.</p> : null}
                  <Input
                    value={materialInput}
                    onChange={(e) => setMaterialInput(e.target.value)}
                    placeholder="Type a resource name or paste a link, then press Enter…"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      const v = materialInput.trim()
                      if (!v) return
                      const isLink = /^https?:\/\//i.test(v)
                      if (!c.materials.some((m) => m.label === v)) set('materials', [...c.materials, { label: v, url: isLink ? v : '', type: isLink ? 'link' : 'text' }])
                      setMaterialInput('')
                    }}
                  />
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel>Questions attempted</FieldLabel>
                  <Input inputMode="numeric" value={c.questionsAttempted ?? ''} onChange={(e) => set('questionsAttempted', e.target.value === '' ? null : Math.max(0, Number(e.target.value.replace(/\D/g, ''))))} />
                </Field>
                <Field>
                  <FieldLabel>Questions wrong</FieldLabel>
                  <Input inputMode="numeric" value={c.questionsWrong ?? ''} onChange={(e) => set('questionsWrong', e.target.value === '' ? null : Math.max(0, Number(e.target.value.replace(/\D/g, ''))))} />
                </Field>
                <Field>
                  <FieldLabel>Accuracy</FieldLabel>
                  <div className="flex h-8 items-center text-lg font-semibold tabular-nums">{acc != null ? `${acc}%` : '—'}</div>
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Notes</CardTitle>
              <CardDescription>Document what happened, what was learned and what comes next.</CardDescription>
            </div>
            {settings.sessionLogs.ai.enabled ? (
              <Button variant="outline" size="sm" disabled={polishing} onClick={() => void polish()}>
                {polishing ? <Spinner /> : <IoSparklesSharp />} Polish notes
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {(
                [
                  ['lessonActivity', 'Lesson activity', 'What did you cover? Which problems or skills did you work on?', 8],
                  ['learningInsight', 'Learning insight', 'What did the student understand or struggle with?', 8],
                  ['nextFocus', 'Next focus', 'What should the next session focus on?', 4],
                  ['homeworkGiven', 'Homework given', 'What homework was assigned?', 4],
                ] as const
              ).map(([k, label, ph, rows]) => (
                <Field key={k}>
                  <FieldLabel>{label}</FieldLabel>
                  <Textarea rows={rows} value={c[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} />
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Evaluation</CardTitle>
            <CardDescription>Rate the student’s performance and flag their current status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              {dims.map((d) => (
                <div key={d} className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
                  <span className="text-sm font-medium">{d}</span>
                  <StarInput value={c.ratings[ratingKey(d)] ?? 0} onChange={(v) => set('ratings', { ...c.ratings, [ratingKey(d)]: v })} />
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Student flag</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {settings.sessionLogs.studentFlags.map((f) => {
                  const key = f.key as StudentFlag
                  const on = c.studentFlag === key
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => set('studentFlag', key)}
                      className={cn('flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium', on ? FLAG_STYLE[key] : 'hover:bg-muted')}
                    >
                      {on ? <LuCircleCheck /> : <LuFlag className="text-muted-foreground" />} {f.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 5 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review & submit</CardTitle>
              <CardDescription>Confirm everything looks correct before submitting.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Session type:</span> {c.sessionType || '—'}
              </div>
              <div>
                <span className="text-muted-foreground">Homework:</span> {c.homeworkStatus || '—'}
              </div>
              <div>
                <span className="text-muted-foreground">Questions:</span> {c.questionsAttempted ?? '—'} attempted, {c.questionsWrong ?? '—'} wrong ({acc != null ? `${acc}%` : '—'})
              </div>
              <div>
                <span className="text-muted-foreground">Flag:</span> <FlagBadge flag={c.studentFlag} />
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Topics:</span> {(topicKind(c.sessionType) === 'free' ? [c.topicCovered] : c.topics).filter(Boolean).join('; ') || '—'}
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Materials:</span> {c.materials.map((m) => m.label).join(', ') || '—'}
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Average rating:</span> <StarRating value={averageRating(c.ratings)} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
              {(
                [
                  ['Lesson activity', c.lessonActivity],
                  ['Learning insight', c.learningInsight],
                  ['Next focus', c.nextFocus],
                  ['Homework given', c.homeworkGiven],
                ] as const
              ).map(([label, text]) => (
                <div key={label}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase">{label}</div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{text || '—'}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          {error ? <ErrorBox text={error} /> : null}
        </div>
      ) : null}

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          <span className="flex-1 text-xs text-muted-foreground">{savedAt && Date.now() - savedAt < 4000 ? 'Draft saved' : ''}</span>
          <Button variant="ghost" onClick={() => window.close()}>
            Cancel
          </Button>
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <LuChevronLeft /> Back
            </Button>
          ) : null}
          {step < 5 ? (
            <Button
              onClick={() => {
                void saveDraft()
                setStep(step + 1)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              Next <LuChevronRight />
            </Button>
          ) : (
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? <Spinner /> : <LuCircleCheck />} {isSubmitted ? 'Update log' : 'Submit log'}
            </Button>
          )}
        </div>
      </footer>
      {saving ? (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Spinner className="size-8" />
          <div className="font-semibold">Saving session log</div>
          <div className="text-sm text-muted-foreground">Generating AI notes. Don’t close this window.</div>
        </div>
      ) : null}
    </div>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
      <LuTriangleAlert /> {text}
    </div>
  )
}

/** Step 1: context from the student's previous logs. */
function PrepStep({ session, student }: { session: WithId<Session>; student: WithId<Student> | null }) {
  const { branchId, settings, staffId, isAdmin } = useBranch()
  const canSeeAll = isAdmin || settings.sessionLogs.tutorsSeeAllLogs
  const q = useMemo(
    () =>
      canSeeAll
        ? query(branchCol(branchId, COL.sessionLogs), where('studentId', '==', session.studentId), where('status', '==', 'submitted'), orderBy('dateKey', 'desc'), limit(30))
        : staffId
          ? query(branchCol(branchId, COL.sessionLogs), where('tutorId', '==', staffId), orderBy('dateKey', 'desc'), limit(60))
          : null,
    [branchId, session.studentId, canSeeAll, staffId],
  )
  const { data } = useQuery<SessionLog>(q, `prep-${session.id}-${canSeeAll}`)
  const recent = data.filter((l) => l.sessionId !== session.id && l.status === 'submitted' && l.studentId === session.studentId)
  const [selected, setSelected] = useState<string | null>(null)
  const sameSubject = recent.find((l) => (l.subject || '').toLowerCase() === (session.subject || '').toLowerCase())
  const current = recent.find((l) => l.id === selected) ?? sameSubject ?? recent[0] ?? null

  return (
    <div className="space-y-4">
      {session.note ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <LuFlag className="mt-0.5" /> <span><span className="font-semibold">Admin note:</span> {session.note}</span>
        </div>
      ) : null}
      {student ? (
        <Card className="flex-row flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
          <span>
            <span className="text-muted-foreground">School:</span> {student.school || '—'}
          </span>
          <span>
            <span className="text-muted-foreground">Grade:</span> {student.grade || '—'}
          </span>
          <span>
            <span className="text-muted-foreground">Total hours:</span> {(student.totalSessionHours ?? 0).toFixed(1)}
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
          {current ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatDateKey(current.dateKey, 'medium')}</Badge>
                <Badge variant="outline">{current.subject || current.sessionType}</Badge>
                <FlagBadge flag={current.studentFlag} />
                <Link to={`/${branchId}/session-log/${current.sessionId}/view`} target="_blank" className="ml-auto text-xs underline">
                  View full log
                </Link>
              </div>
              <div>
                <span className="text-muted-foreground">Topic covered:</span> {current.topicCovered || '—'}
              </div>
              {current.ai ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-l-4 border-l-foreground p-2.5">
                    <div className="text-xs font-semibold text-muted-foreground uppercase">Next session plan</div>
                    <div>{current.ai.nextSessionPlan || '—'}</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-xs font-semibold text-muted-foreground uppercase">Session summary</div>
                    <div>{current.ai.sessionSummary || '—'}</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-xs font-semibold text-muted-foreground uppercase">Homework assigned</div>
                    <div>{current.ai.homeworkAssigned || '—'}</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-xs font-semibold text-muted-foreground uppercase">Risk alert</div>
                    <div>{current.ai.riskAlert || '—'}</div>
                  </div>
                </div>
              ) : null}
              <div>
                <span className="text-muted-foreground">Tutor’s next focus note:</span> {current.nextFocus || '—'}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No previous session log found for this student.</p>
          )}
        </CardContent>
      </Card>
      {recent.length ? (
        <Card className="py-0">
          <div className="border-b px-4 py-2 text-sm font-medium">Recent sessions · select one to preview it above</div>
          <div className="divide-y">
            {recent.slice(0, 8).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelected(l.id)}
                className={cn('grid w-full grid-cols-[6rem_1fr_1fr_auto] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/50', current?.id === l.id && 'bg-blue-50 dark:bg-blue-950/30')}
              >
                <span>{formatDateKey(l.dateKey, 'monthDay')}</span>
                <span className="truncate">{l.tutorName}</span>
                <span className="truncate text-muted-foreground">{l.subject}</span>
                <StarRating value={averageRating(l.ratings)} />
              </button>
            ))}
          </div>
        </Card>
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        Flags: {Object.values(FLAG_LABELS).join(' · ')}
      </p>
    </div>
  )
}

export function SessionLogViewPage() {
  return <SessionLogPage readOnly />
}
