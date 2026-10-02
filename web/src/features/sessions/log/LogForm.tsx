import { serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { IoSparklesSharp } from 'react-icons/io5'
import {
  LuCheck,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuCircleCheck,
  LuClock,
  LuExternalLink,
  LuInfo,
  LuPenLine,
  LuPlus,
  LuTriangleAlert,
  LuUndo2,
  LuUser,
  LuX,
} from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import {
  FLAG_LABELS,
  type LogContent,
  type Material,
  type SessionLog,
  type StudentFlag,
  accuracy,
  allMissing,
  averageRating,
  ratingKey,
  stepOfField,
  submitError,
  suggestFlag,
  topicString,
} from '@shared/sessions/logs'
import { topicKind } from '@shared/sessions/topics'
import { formatMinutes } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { functions } from '@/lib/firebase'
import { branchDocRef } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { ChipGroup, RequiredMark, StarInput, TopicPicker, wordCount } from '../widgets'
import { LogHeader } from './LogHeader'
import { PrepareStep } from './PrepareStep'
import { matchingLog, sameSubject, usePreviousLogs } from './data'

const submitCallable = httpsCallable<{ branchId: string; sessionId: string; content: LogContent }, { ok: boolean }>(functions, 'submitSessionLog')
const aiCallable = httpsCallable<{ branchId: string; mode: 'polish'; payload: Record<string, string> }, Record<string, string>>(functions, 'sessionAi')

const STEPS = ['Prepare', 'Session Info', 'Materials', 'Notes', 'Evaluation', 'Review & Submit'] as const

const EMPTY_LOG: LogContent = {
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
  if (!log) return EMPTY_LOG
  const out = { ...EMPTY_LOG }
  for (const k of Object.keys(EMPTY_LOG) as (keyof LogContent)[]) {
    if (log[k] !== undefined && log[k] !== null) (out as Record<string, unknown>)[k] = log[k]
  }
  return out
}

type NoteKey = 'lessonActivity' | 'learningInsight' | 'nextFocus' | 'homeworkGiven'

/** The four notes are the session record: TE's guidance placeholders, tall boxes, and a soft nudge when very short. */
const NOTES: { key: NoteKey; label: string; placeholder: string; minHeight: string; nudgeUnder: number; nudge: string }[] = [
  {
    key: 'lessonActivity',
    label: 'Lesson activity',
    placeholder:
      'What did you cover during the session? Include specific topics, exercises, and how the student engaged. Write as much detail as you need — this becomes the core session record.',
    minHeight: 'min-h-60',
    nudgeUnder: 25,
    nudge: 'Add a little more detail: topics, exercises and how the student engaged.',
  },
  {
    key: 'learningInsight',
    label: 'Learning insight',
    placeholder: 'What did the student understand well? Where did they struggle? What patterns did you notice in their thinking or approach? Any breakthroughs or setbacks?',
    minHeight: 'min-h-60',
    nudgeUnder: 25,
    nudge: 'Say what clicked, what didn’t, and why.',
  },
  {
    key: 'nextFocus',
    label: 'Next focus',
    placeholder: 'What should be prioritized in the next session? Include specific skills, topics, or strategies to revisit.',
    minHeight: 'min-h-40',
    nudgeUnder: 8,
    nudge: 'Name the skills or topics to revisit.',
  },
  {
    key: 'homeworkGiven',
    label: 'Homework given',
    placeholder: 'What homework was assigned? Be specific about pages, problem numbers, tasks, or practice sets so the student and parent know exactly what to do.',
    minHeight: 'min-h-40',
    nudgeUnder: 8,
    nudge: 'Add pages, problem numbers or practice sets.',
  },
]

const FLAG_ACTIVE: Record<StudentFlag, string> = {
  on_track: 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300',
  needs_attention: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  at_risk: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
}

type SaveState = { state: 'idle' | 'saving' | 'saved' | 'error'; at?: number }

/**
 * The session log form (tutor, or an admin on the tutor's behalf): True
 * Education's six steps, fields, wording and validation, with drafts saved as
 * you type and submitting on the server. `editingSubmitted`: re-submitting a
 * submitted log (no drafts; Cancel returns to the log).
 */
export function LogForm({
  session,
  student,
  existing,
  adminEntry,
  onDone,
  onCancelEdit,
}: {
  session: WithId<Session>
  student: WithId<Student> | null
  existing: WithId<SessionLog> | null
  /** An admin who isn't the session's tutor. */
  adminEntry: boolean
  onDone: () => void
  onCancelEdit?: () => void
}) {
  const { branchId, settings, actor, timezone, isAdmin } = useBranch()
  const navigate = useNavigate()
  const dims = settings.sessionLogs.ratingDimensions
  const aiOn = settings.sessionLogs.ai.enabled
  const isSubmitted = existing?.status === 'submitted'
  const { logs: previous, loading: previousLoading } = usePreviousLogs(session)
  const last = useMemo(() => matchingLog(previous, session), [previous, session])
  // The type, free-text topics and materials are suggested from earlier logs in the same subject only.
  const sameLogs = useMemo(() => previous.filter((l) => sameSubject(l, session)), [previous, session])

  const [step, setStep] = useState(0)
  const [c, setC] = useState<LogContent>(() => pickContent(existing))
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [undo, setUndo] = useState<Record<NoteKey, string> | null>(null)
  const [save, setSave] = useState<SaveState>({ state: 'idle' })
  const [draftBanner, setDraftBanner] = useState(existing?.status === 'draft')
  const { confirm, dialog } = useConfirm()
  const [typeSuggested, setTypeSuggested] = useState(false)
  const dirty = useRef(false)
  const latest = useRef(c)
  useLayoutEffect(() => {
    latest.current = c
  })
  const topRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)

  // On narrow screens the step strip scrolls sideways: keep the current step in view (sideways only).
  useEffect(() => {
    const strip = tabsRef.current
    const tab = strip?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!strip || !tab) return
    const a = strip.getBoundingClientRect()
    const b = tab.getBoundingClientRect()
    if (b.left < a.left) strip.scrollLeft -= a.left - b.left + 8
    else if (b.right > a.right) strip.scrollLeft += b.right - a.right + 8
  }, [step])

  // Before the session starts the log saves as a draft only; the notice goes when it starts.
  const startsAt = (session.startAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
  const [notStarted, setNotStarted] = useState(() => startsAt > Date.now())
  useEffect(() => {
    if (!notStarted) return
    const t = setTimeout(() => setNotStarted(false), Math.min(Math.max(0, startsAt - Date.now()), 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [notStarted, startsAt])

  // Preselect the session type of the last log in the same subject, once (tagged; the tutor can change it).
  const suggested = useRef(false)
  const lastSame = sameLogs[0]
  useEffect(() => {
    if (suggested.current || existing || previousLoading) return
    suggested.current = true
    if (lastSame && !latest.current.sessionType && settings.sessionLogs.sessionTypes.includes(lastSame.sessionType)) {
      setC((x) => ({ ...x, sessionType: lastSame.sessionType }))
      setTypeSuggested(true)
    }
  }, [existing, previousLoading, lastSame, settings.sessionLogs.sessionTypes])

  const set = <K extends keyof LogContent>(k: K, v: LogContent[K]) => {
    dirty.current = true
    setError(null)
    if (k === 'sessionType') setTypeSuggested(false)
    if ((NOTES as { key: string }[]).some((n) => n.key === k)) setUndo(null)
    setC((x) => ({ ...x, [k]: v }))
  }

  // Drafts (before the first submit only): 2 s after typing stops, every few seconds at most,
  // and when the tab is hidden or closed. A submitted log changes only by submitting again.
  const saveDraft = useCallback(async () => {
    if (!dirty.current || isSubmitted) return
    dirty.current = false
    setSave({ state: 'saving' })
    try {
      await setDoc(
        branchDocRef(branchId, COL.sessionLogs, session.id),
        {
          sessionId: session.id,
          ...latest.current,
          status: 'draft',
          tutorId: session.tutorId,
          tutorName: session.tutorName,
          studentId: session.studentId,
          studentName: session.studentName,
          subject: session.subject,
          subjectId: session.subjectId ?? null,
          dateKey: session.dateKey,
          startMin: session.startMin,
          endMin: session.endMin,
          updatedAt: serverTimestamp(),
          updatedBy: actor.email,
        },
        { merge: true },
      )
      setSave({ state: 'saved', at: Date.now() })
    } catch {
      dirty.current = true
      setSave({ state: 'error' })
    }
  }, [branchId, session, actor.email, isSubmitted])

  useEffect(() => {
    if (!dirty.current || isSubmitted) return
    const t = setTimeout(() => void saveDraft(), 2000)
    return () => clearTimeout(t)
  }, [c, saveDraft, isSubmitted])
  useEffect(() => {
    const t = setInterval(() => void saveDraft(), Math.max(5, settings.sessionLogs.autosaveSeconds) * 1000)
    const onHide = () => document.visibilityState === 'hidden' && void saveDraft()
    const onLeave = () => void saveDraft()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onLeave)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onLeave)
    }
  }, [saveDraft, settings.sessionLogs.autosaveSeconds])

  const missing = useMemo(() => allMissing(c, dims), [c, dims])
  const missingSteps = new Set(missing.map(stepOfField))
  const done = [true, ...[1, 2, 3, 4].map((s) => !missingSteps.has(s as 1 | 2 | 3 | 4)), missing.length === 0]

  function go(next: number, scroll = false) {
    setStep(next)
    if (scroll) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function submit() {
    setTried(true)
    const invalid = submitError(c, dims)
    if (invalid) return setError(invalid)
    if (notStarted) return setError(`You can submit this log once the session starts at ${formatMinutes(session.startMin)}. Your draft is saved.`)
    setSubmitting(true)
    // Pending draft saves stop here: the submit carries the content itself.
    const wasDirty = dirty.current
    dirty.current = false
    try {
      await submitCallable({ branchId, sessionId: session.id, content: c })
      toast.success(isSubmitted ? 'Session log updated' : 'Session log submitted')
      // The overlay stays up until the page shows the submitted log.
      onDone()
    } catch (e) {
      dirty.current = wasDirty
      setError((e as { message?: string }).message?.replace(/^.*?: /, '') ?? 'Save failed. Please try again.')
      setSubmitting(false)
    }
  }

  async function polish() {
    setPolishing(true)
    const before = Object.fromEntries(NOTES.map((n) => [n.key, c[n.key]])) as Record<NoteKey, string>
    try {
      const res = await aiCallable({
        branchId,
        mode: 'polish',
        payload: { ...before, subject: session.subject, topicCovered: topicString(c.sessionType, c.topics, c.topicCovered) },
      })
      const next = Object.fromEntries(NOTES.map((n) => [n.key, res.data[n.key]?.trim() ? res.data[n.key] : before[n.key]])) as Record<NoteKey, string>
      if (NOTES.every((n) => next[n.key] === before[n.key])) {
        toast.info('Nothing to polish right now.')
        return
      }
      dirty.current = true
      setC((x) => ({ ...x, ...next }))
      setUndo(before)
    } catch {
      setError('Polishing isn’t available right now.')
    } finally {
      setPolishing(false)
    }
  }

  async function cancel() {
    if (isSubmitted) {
      if (dirty.current && !(await confirm({ title: 'Discard unsaved changes?', description: 'Your changes to this log won’t be saved.', confirmLabel: 'Discard', destructive: true }))) return
      onCancelEdit?.()
      return
    }
    const list = `/${branchId}/${isAdmin ? 'admin' : 'tutor'}/sessions/log`
    void saveDraft().finally(() => {
      window.close()
      // A tab the app didn't open can't close itself: go to the Session Log instead.
      setTimeout(() => navigate(list), 200)
    })
  }

  const header = (
    <LogHeader
      snap={session}
      status={isSubmitted ? 'editing' : existing?.status === 'draft' || save.state === 'saved' ? 'draft' : null}
      subtitle="Session workspace"
    />
  )
  const lastSaved = (existing?.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.()
  const saveText = isSubmitted
    ? 'Changes save when you update the log.'
    : save.state === 'saving'
      ? 'Saving…'
      : save.state === 'saved' && save.at
        ? `Draft saved · ${new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: timezone }).format(save.at)}`
        : save.state === 'error'
          ? 'Couldn’t save the draft — retrying'
          : ''
  const acc = accuracy(c.questionsAttempted, c.questionsWrong)
  const kind = topicKind(c.sessionType)
  // Recent topics of the same kind: free text from this subject's logs, SAT/ACT paths from any; not already chosen.
  const recentTopics = useMemo(() => {
    const out: string[] = []
    for (const l of kind === 'free' ? sameLogs : previous) {
      if (topicKind(l.sessionType) !== kind) continue
      for (const t of kind === 'free' ? [l.topicCovered] : (l.topics ?? [])) if (t?.trim() && !out.includes(t.trim())) out.push(t.trim())
      if (out.length >= 5) break
    }
    return out.slice(0, 5)
  }, [sameLogs, previous, kind])
  const shownTopics = recentTopics.filter((t) => (kind === 'free' ? t !== c.topicCovered.trim() : !c.topics.includes(t)))
  const materials = c.materials
  const recentMaterials = useMemo(() => {
    const out: Material[] = []
    for (const l of sameLogs.slice(0, 3)) for (const m of l.materials ?? []) if (!out.some((x) => x.label === m.label && x.url === m.url)) out.push(m)
    return out.filter((m) => !materials.some((x) => x.label === m.label && x.url === m.url)).slice(0, 8)
  }, [sameLogs, materials])

  return (
    <div className="min-h-svh bg-muted/40">
      {header}
      <main ref={topRef} className="mx-auto max-w-4xl scroll-mt-20 space-y-4 px-4 pt-4 pb-32">
        {isAdmin ? <p className="-mb-1 text-xs text-muted-foreground">Student, tutor and time come from the schedule.</p> : null}
        {adminEntry && !isSubmitted ? (
          <Banner tone="violet" icon={LuUser}>
            Adding this log on behalf of <span className="font-semibold">{session.tutorName || 'the tutor'}</span>. The log stays credited to the tutor — your name is recorded as the admin who
            entered it.
          </Banner>
        ) : null}
        {isSubmitted ? (
          adminEntry ? (
            <Banner tone="violet" icon={LuUser}>
              Editing <span className="font-semibold">{session.tutorName}</span>’s submitted log. Submitting again updates it and the student’s hours; your changes are recorded in the log’s
              history.
            </Banner>
          ) : (
            <Banner tone="muted" icon={LuPenLine}>
              You’re editing a submitted log. Submitting again updates it and the student’s hours.
            </Banner>
          )
        ) : null}
        {draftBanner ? (
          <Banner tone="blue" icon={LuCircleCheck} onDismiss={() => setDraftBanner(false)}>
            Draft restored{lastSaved ? ` — last saved ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(lastSaved)}` : ''}. Your previous
            progress has been recovered.
          </Banner>
        ) : null}
        {notStarted && !isSubmitted ? (
          <Banner tone="amber" icon={LuClock}>
            This session starts at {formatMinutes(session.startMin)}. You can write the log now; it saves as a draft, and you can submit it once the session has started.
          </Banner>
        ) : null}

        <nav aria-label="Steps" className="rounded-xl border bg-background p-1.5">
          <div ref={tabsRef} className="flex gap-1 overflow-x-auto">
            {STEPS.map((label, i) => {
              const active = step === i
              const flagged = tried && i >= 1 && i <= 4 && missingSteps.has(i as 1 | 2 | 3 | 4)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'relative flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors sm:px-2.5',
                    active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {done[i] && !active && i > 0 ? (
                    <LuCircleCheck className="size-4 text-green-600" />
                  ) : (
                    <span className={cn('flex size-5 items-center justify-center rounded-full text-[11px] font-semibold', active ? 'bg-background/20' : 'bg-muted')}>{i + 1}</span>
                  )}
                  <span className={cn(active ? 'inline' : 'sr-only sm:not-sr-only')}>{label}</span>
                  {flagged ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-red-600" aria-label="Missing fields" /> : null}
                </button>
              )
            })}
          </div>
          <div className="mx-1 mt-1.5 h-0.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${(done.slice(1, 5).filter(Boolean).length / 4) * 100}%` }} />
          </div>
        </nav>

        {error && step < 5 ? <ErrorBox text={error} /> : null}

        {step === 0 ? <PrepareStep session={session} student={student} logs={previous} loading={previousLoading} /> : null}

        {step === 1 ? (
          <div className="space-y-4">
            <StepTitle title="Session info" text="Set the session type, topic, and homework review." />
            <Card>
              <CardHeader>
                <CardTitle>Session setup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>
                    Session type <RequiredMark />
                    {typeSuggested ? <Badge variant="secondary" className="ml-2 font-normal">From last session</Badge> : null}
                  </Label>
                  <ChipGroup
                    label="Session type"
                    value={c.sessionType}
                    options={settings.sessionLogs.sessionTypes.map((t) => ({ value: t, label: t }))}
                    onChange={(v) => {
                      if (v === c.sessionType) return
                      // A new type starts its topics over (True Education).
                      dirty.current = true
                      setError(null)
                      setTypeSuggested(false)
                      setC((x) => ({ ...x, sessionType: v, topics: [], topicCovered: topicKind(v) === 'free' && topicKind(x.sessionType) === 'free' ? x.topicCovered : '' }))
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Topic covered <RequiredMark />
                    {kind !== 'free' ? <span className="font-normal text-muted-foreground"> — select one or more</span> : null}
                  </Label>
                  {kind === 'free' ? (
                    <Input value={c.topicCovered} onChange={(e) => set('topicCovered', e.target.value)} placeholder="e.g., Linear equations, Comma usage" aria-label="Topic covered" />
                  ) : (
                    <TopicPicker sessionType={c.sessionType} value={c.topics} onChange={(v) => set('topics', v)} />
                  )}
                  {shownTopics.length && c.sessionType ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Recent topics:</span>
                      {shownTopics.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="max-w-full truncate rounded-full border bg-background px-2 py-0.5 hover:bg-muted"
                          onClick={() => (kind === 'free' ? set('topicCovered', t) : set('topics', [...c.topics, t]))}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Homework review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>
                    Homework status <RequiredMark />
                  </Label>
                  {last && (last.homeworkGiven || last.ai?.homeworkAssigned) ? (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Homework given last session:</span> {last.homeworkGiven || last.ai?.homeworkAssigned}
                    </p>
                  ) : null}
                  <ChipGroup
                    label="Homework status"
                    value={c.homeworkStatus}
                    options={settings.sessionLogs.homeworkStatuses.map((t) => ({ value: t, label: t }))}
                    onChange={(v) => set('homeworkStatus', v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Homework comments</Label>
                  <Input value={c.homeworkComments} onChange={(e) => set('homeworkComments', e.target.value)} placeholder="Notes on completion or quality" aria-label="Homework comments" />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <StepTitle title="Materials & metrics" text="Log what materials were used and how the student performed." />
            <Card>
              <CardHeader>
                <CardTitle>
                  Material used <RequiredMark />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.materials.length ? (
                  <ul className="divide-y rounded-lg border">
                    {c.materials.map((m, i) => (
                      <li key={`${m.label}|${m.url}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                        {m.url ? (
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                            <span className="truncate">{m.label}</span> <LuExternalLink className="size-3.5 shrink-0" />
                          </a>
                        ) : (
                          <span className="min-w-0 truncate">{m.label}</span>
                        )}
                        <button type="button" aria-label="Remove" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => set('materials', c.materials.filter((_, j) => j !== i))}>
                          <LuX className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No materials added yet. Type a resource name or paste a link below and press Enter.</p>
                )}
                <MaterialInput onAdd={(m) => !c.materials.some((x) => x.label === m.label && x.url === m.url) && set('materials', [...c.materials, m])} />
                {recentMaterials.length ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Used recently:</span>
                    {recentMaterials.map((m) => (
                      <button key={`${m.label}|${m.url}`} type="button" className="max-w-64 truncate rounded-full border bg-background px-2 py-0.5 hover:bg-muted" onClick={() => set('materials', [...c.materials, m])}>
                        + {m.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Performance metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>
                      Questions attempted <RequiredMark />
                    </Label>
                    <Input inputMode="numeric" placeholder="0" aria-label="Questions attempted" value={c.questionsAttempted ?? ''} onChange={(e) => set('questionsAttempted', toCount(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Questions wrong <RequiredMark />
                    </Label>
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      aria-label="Questions wrong"
                      aria-invalid={c.questionsWrong != null && c.questionsAttempted != null && c.questionsWrong > c.questionsAttempted}
                      value={c.questionsWrong ?? ''}
                      onChange={(e) => set('questionsWrong', toCount(e.target.value))}
                    />
                    {c.questionsWrong != null && c.questionsAttempted != null && c.questionsWrong > c.questionsAttempted ? (
                      <p className="text-xs text-red-600">Can’t be more than questions attempted.</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>Accuracy</Label>
                    <div className="text-2xl leading-9 font-semibold tabular-nums">{acc === null ? '—' : `${acc}%`}</div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${acc ?? 0}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-lg">Session notes</CardTitle>
                  <CardDescription>Document what happened, what was learned, and what comes next.</CardDescription>
                </div>
                {aiOn ? (
                  undo ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setC((x) => ({ ...x, ...undo }))
                        setUndo(null)
                        dirty.current = true
                      }}
                    >
                      <LuUndo2 /> Undo polish
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled={polishing || submitting || NOTES.every((n) => !c[n.key].trim())} onClick={() => void polish()}>
                      {polishing ? <Spinner /> : <IoSparklesSharp />} {polishing ? 'Polishing…' : 'Polish notes'}
                    </Button>
                  )
                ) : null}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <p className="flex items-start gap-1.5">
                    <LuInfo className="mt-px size-3.5 shrink-0" /> These four answers are the session record. Admins read them, and they feed progress reports for parents.
                  </p>
                  {aiOn ? <p className="pl-5">Polish uses AI to improve grammar and clarity while preserving all your details.</p> : null}
                </div>
                {last && (last.ai?.nextSessionPlan || last.nextFocus) ? (
                  <Collapsible>
                    <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                      <LuChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" /> Last session’s plan
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <p className="mt-2 rounded-lg border-l-[3px] border-l-foreground bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">{last.ai?.nextSessionPlan || last.nextFocus}</p>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
                {NOTES.map((n) => {
                  const words = wordCount(c[n.key])
                  return (
                    <div key={n.key} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label>
                          {n.label} <RequiredMark />
                        </Label>
                        <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                          <LuPenLine className="size-3" /> Write in full sentences
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {words} word{words === 1 ? '' : 's'}
                        </span>
                      </div>
                      <Textarea
                        aria-label={n.label}
                        value={c[n.key]}
                        onChange={(e) => set(n.key, e.target.value)}
                        onBlur={() => void saveDraft()}
                        readOnly={polishing}
                        placeholder={n.placeholder}
                        className={cn('max-h-[70vh] resize-y text-[15px] leading-relaxed', n.minHeight)}
                      />
                      {words > 0 && words < n.nudgeUnder ? <p className="text-xs text-muted-foreground">{n.nudge}</p> : null}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <StepTitle title="Student evaluation" text="Rate the student’s performance and flag their current status." />
            <Card>
              <CardHeader>
                <CardTitle>
                  Performance ratings <RequiredMark />
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {dims.map((d) => (
                  <div key={d} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm font-medium">
                      {d} <RequiredMark />
                    </span>
                    <StarInput label={d} value={c.ratings[ratingKey(d)] ?? 0} onChange={(v) => set('ratings', { ...c.ratings, [ratingKey(d)]: v })} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  Student flag <RequiredMark />
                </CardTitle>
                <CardDescription>Summarize the student’s overall status this session.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div role="radiogroup" aria-label="Student flag" className="grid gap-2 sm:grid-cols-3">
                  {settings.sessionLogs.studentFlags.map((f) => {
                    const on = c.studentFlag === f.key
                    return (
                      <button
                        key={f.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set('studentFlag', f.key as StudentFlag)}
                        className={cn(
                          'flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors',
                          on ? FLAG_ACTIVE[f.key as StudentFlag] : 'bg-background hover:bg-muted',
                        )}
                      >
                        {on ? <LuCheck className="size-4" /> : null}
                        {f.label}
                      </button>
                    )
                  })}
                </div>
                {suggestFlag(c.ratings) && !c.studentFlag ? (
                  <p className="text-xs text-muted-foreground">Suggested from the ratings: {FLAG_LABELS[suggestFlag(c.ratings)!]}</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {step === 5 ? (
          <ReviewStep c={c} dims={dims} missing={missing} onGo={(s) => go(s, true)} error={error} isSubmitted={isSubmitted} />
        ) : null}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 sm:flex-nowrap sm:py-3">
          {saveText ? (
            <span className="w-full truncate text-xs text-muted-foreground sm:w-auto sm:min-w-0 sm:flex-1" data-testid="draft-status">
              {saveText}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => void cancel()}>
            Cancel
          </Button>
          {step > 0 ? (
            <Button variant="outline" onClick={() => go(step - 1)}>
              <LuChevronLeft /> Back
            </Button>
          ) : null}
          {step < 5 ? (
            <Button
              onClick={() => {
                void saveDraft()
                go(step + 1, true)
              }}
            >
              Next <LuChevronRight />
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? <Spinner /> : <LuCircleCheck />} {submitting ? 'Submitting…' : isSubmitted ? 'Update log' : 'Submit log'}
            </Button>
          )}
          </div>
        </div>
      </footer>

      {dialog}
      {submitting ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-sm" role="status">
          <div className="rounded-xl border bg-card px-6 py-5 text-center shadow-lg">
            <Spinner className="mx-auto size-6" />
            <div className="mt-3 font-semibold">Saving session log</div>
            {aiOn ? <div className="text-sm text-muted-foreground">Generating AI notes. Don’t close this window.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function toCount(v: string): number | null {
  const d = v.replace(/[^\d]/g, '')
  return d === '' ? null : Number(d)
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium">{children}</div>
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
      <LuTriangleAlert className="mt-0.5 shrink-0" /> {text}
    </div>
  )
}

const BANNER_TONES = {
  violet: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
  blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200',
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  muted: 'border-border bg-background text-muted-foreground',
}

function Banner({ tone, icon: Icon, children, onDismiss }: { tone: keyof typeof BANNER_TONES; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', BANNER_TONES[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {onDismiss ? (
        <button type="button" className="shrink-0 text-xs font-medium underline underline-offset-2" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

/** Add a material: a pasted link becomes a link, anything else a named resource (True Education). */
function MaterialInput({ onAdd }: { onAdd: (m: Material) => void }) {
  const [value, setValue] = useState('')
  const add = () => {
    const v = value.trim()
    if (!v) return
    onAdd(/^https?:\/\//i.test(v) ? { label: v, url: v, type: 'link' } : { label: v, url: '', type: 'text' })
    setValue('')
  }
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type a resource name or paste a link, then press Enter…"
        aria-label="Add material"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          add()
        }}
      />
      <Button type="button" variant="outline" disabled={!value.trim()} onClick={add}>
        <LuPlus /> Add
      </Button>
    </div>
  )
}

const STEP_NAMES: Record<1 | 2 | 3 | 4, string> = { 1: 'Session Info', 2: 'Materials', 3: 'Notes', 4: 'Evaluation' }

/** Step 6: everything read back (True Education's four cards), what's still missing, and an Edit link per card. */
function ReviewStep({
  c,
  dims,
  missing,
  onGo,
  error,
  isSubmitted,
}: {
  c: LogContent
  dims: string[]
  missing: string[]
  onGo: (step: number) => void
  error: string | null
  isSubmitted: boolean
}) {
  const acc = accuracy(c.questionsAttempted, c.questionsWrong)
  const topics = topicKind(c.sessionType) === 'free' ? (c.topicCovered.trim() ? [c.topicCovered.trim()] : []) : c.topics
  const editLink = (s: number) => (
    <Button variant="ghost" size="sm" className="-my-1 h-7 text-xs" onClick={() => onGo(s)}>
      Edit
    </Button>
  )
  const blocks: [string, React.ReactNode][] = [
    ['Session type', c.sessionType || '—'],
    ['Homework status', c.homeworkStatus || '—'],
    ['Questions attempted', c.questionsAttempted ?? '—'],
    ['Questions wrong', c.questionsWrong ?? '—'],
    ['Accuracy', acc === null ? '—' : `${acc}%`],
    ['Student flag', c.studentFlag ? FLAG_LABELS[c.studentFlag as StudentFlag] : '—'],
  ]
  return (
    <div className="space-y-4">
      <StepTitle title="Review & submit" text="Confirm everything looks correct before submitting." />
      {missing.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30" data-testid="review-missing">
          <div className="font-medium text-amber-900 dark:text-amber-200">Before you {isSubmitted ? 'update' : 'submit'}:</div>
          <ul className="mt-1.5 space-y-1">
            {([1, 2, 3, 4] as const)
              .filter((s) => missing.some((m) => stepOfField(m) === s))
              .map((s) => (
                <li key={s} className="flex flex-wrap items-center gap-x-2 text-amber-900 dark:text-amber-200">
                  <span>
                    {missing
                      .filter((m) => stepOfField(m) === s)
                      .map((m) => m.charAt(0) + m.slice(1).toLowerCase())
                      .join(', ')}
                  </span>
                  <button type="button" className="text-xs font-medium underline underline-offset-2" onClick={() => onGo(s)}>
                    Go to {STEP_NAMES[s]}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Session info</CardTitle>
          {editLink(1)}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {blocks.map(([label, v]) => (
              <div key={label} className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-0.5 text-sm font-medium">{v}</div>
              </div>
            ))}
          </div>
          {c.homeworkComments.trim() ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">Homework comments</div>
              <div className="mt-0.5 text-sm">{c.homeworkComments}</div>
            </div>
          ) : null}
          {topics.length ? (
            <div className="border-t pt-3">
              <div className="mb-1.5 text-xs text-muted-foreground">{topics.length > 1 ? 'Topics covered' : 'Topic covered'}</div>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <Badge key={t} variant="secondary" className="font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {c.materials.length ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Materials used</CardTitle>
            {editLink(2)}
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-xs text-muted-foreground">
              {c.materials.length} item{c.materials.length > 1 ? 's' : ''} selected
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {c.materials.map((m) => (
                <li key={`${m.label}|${m.url}`}>
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                      {m.label}
                    </a>
                  ) : (
                    m.label
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Session notes</CardTitle>
          {editLink(3)}
        </CardHeader>
        <CardContent className="space-y-4">
          {NOTES.map((n) => (
            <div key={n.key}>
              <div className="text-xs text-muted-foreground">{n.label}</div>
              <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{c[n.key].trim() || '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Student evaluation</CardTitle>
          {editLink(4)}
        </CardHeader>
        <CardContent className="space-y-2">
          {dims.map((d) => (
            <div key={d} className="flex items-center justify-between gap-3 text-sm">
              <span>{d}</span>
              <StarInput value={c.ratings[ratingKey(d)] ?? 0} label={d} />
            </div>
          ))}
          {averageRating(c.ratings) !== null ? (
            <div className="border-t pt-2 text-right text-xs text-muted-foreground">Average {averageRating(c.ratings)?.toFixed(1)}/5</div>
          ) : null}
        </CardContent>
      </Card>
      {error ? <ErrorBox text={error} /> : null}
    </div>
  )
}
