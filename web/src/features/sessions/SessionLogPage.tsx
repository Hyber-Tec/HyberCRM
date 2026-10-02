import { useEffect, useMemo, useState } from 'react'
import { LuCalendarDays, LuFilePen, LuPencil, LuPrinter, LuX } from 'react-icons/lu'
import { type NavigateFunction, useNavigate, useParams } from 'react-router'
import { COL } from '@shared/paths'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import { type SessionLog, canLog } from '@shared/sessions/logs'
import type { Session, Student } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { Button } from '@/components/ui/button'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { LogForm } from './log/LogForm'
import { LogHeader } from './log/LogHeader'
import { LogView } from './log/LogView'

/** Close a tab the app opened; a tab it can't close goes to `fallback` instead. */
function closeOrGo(navigate: NavigateFunction, fallback: string) {
  window.close()
  setTimeout(() => navigate(fallback), 200)
}

/**
 * The session log, opened in its own tab from the schedule or the Session Log
 * list. `/session-log/:id` is the form (a submitted log opens read-only with an
 * Edit button); `/session-log/:id/view` always opens read-only. True
 * Education's structure: a six-step form for the tutor (or an admin on the
 * tutor's behalf), a view page, and an edit page for submitted logs.
 */
export function SessionLogPage({ readOnly = false }: { readOnly?: boolean }) {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { branchId, branch, settings, staffId, isAdmin, timezone } = useBranch()
  const sessionRef = useMemo(() => branchDocRef(branchId, COL.sessions, sessionId), [branchId, sessionId])
  const logRef = useMemo(() => branchDocRef(branchId, COL.sessionLogs, sessionId), [branchId, sessionId])
  const { data: liveSession, loading: sLoading } = useDoc<Session>(sessionRef)
  const { data: log, loading: lLoading, error: lError } = useDoc<SessionLog>(logRef)
  const session = liveSession && !liveSession.isDeleted ? liveSession : null
  const studentId = session?.studentId ?? null
  const studentRef = useMemo(() => (studentId ? branchDocRef(branchId, COL.students, studentId) : null), [branchId, studentId])
  const { data: student } = useDoc<Student>(studentRef)
  const [editing, setEditing] = useState(false)

  const name = session?.studentName || log?.studentName
  useEffect(() => {
    if (name) document.title = `${name} – Session Log | ${branch.name}`
  }, [name, branch.name])

  if (sLoading || lLoading) return <FullPageSpinner label="Loading session log…" />

  const portal = isAdmin ? 'admin' : 'tutor'
  const listPath = `/${branchId}/${portal}/sessions/log`
  const close = () => closeOrGo(navigate, listPath)
  const closeAction = { label: 'Close', onClick: close }
  const isOwnTutor = !!staffId && !!session && session.tutorId === staffId
  const submitted = log?.status === 'submitted'
  const loggable = !!session && (submitted || canLog(session.status, settings.sessionLogs.allowForStatuses))
  const mayWrite = !!session && (isAdmin || isOwnTutor)
  const mayEdit = mayWrite && loggable && (!submitted || isAdmin || settings.sessionLogs.allowEditAfterSubmit)

  if (lError && !session) {
    return <FullPageMessage title="Session log not available" description="It may have been deleted, or you don’t have access to it." actions={[closeAction]} />
  }

  // The form: a new or draft log (unless opened read-only), or a submitted log being edited.
  if (session && mayEdit && (editing || (!readOnly && !submitted))) {
    return (
      <LogForm
        key={submitted ? 'edit' : 'new'}
        session={session}
        student={student}
        existing={log}
        adminEntry={isAdmin && !isOwnTutor}
        onDone={() => setEditing(false)}
        onCancelEdit={() => setEditing(false)}
      />
    )
  }

  if (log && (submitted || readOnly || !mayWrite)) {
    const schedulePath = isAdmin ? `/${branchId}/admin/schedule/day/${log.dateKey}` : `/${branchId}/tutor/schedule?date=${log.dateKey}`
    const savedAt = (log.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.()
    const editLabel = submitted ? 'Edit log' : isOwnTutor ? 'Continue the log' : `Finish this log on behalf of ${log.tutorName || 'the tutor'}`
    return (
      <div className="min-h-svh bg-muted/40 print:bg-background">
        <LogHeader snap={log} status={submitted ? 'submitted' : 'draft'} subtitle="Session log" usedHours={submitted ? log.usedHours : null} />
        <main className="mx-auto max-w-4xl space-y-4 px-4 pt-4 pb-16">
          <div className="flex flex-wrap items-center justify-end gap-2 print:hidden" data-testid="log-actions">
            {liveSession?.isDeleted ? <span className="mr-auto text-sm text-muted-foreground">This session was deleted from the schedule.</span> : null}
            {mayEdit ? (
              <Button size="sm" onClick={() => setEditing(true)}>
                {submitted ? <LuPencil /> : <LuFilePen />} {editLabel}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <LuPrinter /> Print
            </Button>
            {session && (isAdmin || isOwnTutor) ? (
              <Button size="sm" variant="outline" onClick={() => navigate(schedulePath)}>
                <LuCalendarDays /> Open in schedule
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={close}>
              <LuX /> Close
            </Button>
          </div>
          {!submitted ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="log-draft">
              <span className="font-semibold">Draft — not submitted yet.</span>
              {savedAt ? ` Last saved ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(savedAt)}.` : ''}
            </div>
          ) : null}
          <LogView log={log} />
        </main>
      </div>
    )
  }

  if (liveSession?.isDeleted) {
    return <FullPageMessage title="This session was deleted" description="It was removed from the schedule, so it can’t take a session log." actions={[closeAction]} />
  }
  if (!session) {
    return <FullPageMessage title="Session not found" description="It may have been deleted, or you don’t have access to it." actions={[closeAction]} />
  }
  if (!mayWrite) {
    return <FullPageMessage title="No log yet" description="The tutor hasn’t written a log for this session." actions={[closeAction]} />
  }
  if (!loggable) {
    return (
      <FullPageMessage
        title="This session can’t be logged"
        description={`${SESSION_STATUS_LABELS[session.status]} sessions don’t take a session log. If the student attended, change the status on the schedule first.`}
        actions={[
          ...(isAdmin ? [{ label: 'Open in schedule', onClick: () => navigate(`/${branchId}/admin/schedule/day/${session.dateKey}`), variant: 'outline' as const }] : []),
          closeAction,
        ]}
      />
    )
  }
  // Read-only route, nothing written yet.
  return (
    <FullPageMessage
      title="No log yet"
      description={isOwnTutor ? 'You haven’t written a log for this session.' : 'The tutor hasn’t written a log for this session.'}
      actions={[
        {
          label: isOwnTutor ? 'Write the log' : `Write log on behalf of ${session.tutorName || 'the tutor'}`,
          onClick: () => navigate(`/${branchId}/session-log/${session.id}`, { replace: true }),
        },
        { ...closeAction, variant: 'outline' },
      ]}
    />
  )
}

export function SessionLogViewPage() {
  return <SessionLogPage readOnly />
}
