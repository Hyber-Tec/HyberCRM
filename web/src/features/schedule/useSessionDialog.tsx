import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { dayHours } from '@shared/availability'
import { type DateKey, todayKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useStaffList, useStudentList, useSubjects } from '@/features/data/hooks'
import { type ScheduleCtx, createSession, deleteSession, updateSession } from './api'
import { SessionDialog, type SessionDialogState } from './dialogs/SessionDialog'

/** Create/edit-session dialog usable outside the schedule page (student calendars, Home). */
export function useSessionDialog({ source = 'student_calendar', enabled = true }: { source?: Session['source']; enabled?: boolean } = {}) {
  const { branchId, actor, timezone, settings, rules } = useBranch()
  // Off for tutors, who can't read the staff list (the dialog is admin-only).
  const { data: staff } = useStaffList(enabled)
  const { data: students } = useStudentList(enabled)
  const { data: subjects } = useSubjects()
  const [state, setState] = useState<SessionDialogState>(null)
  const ctx: ScheduleCtx = useMemo(
    () => ({ branchId, actor, timezone, settings, maxStudentsPerTutor: rules.maxStudentsPerTutor }),
    [branchId, actor, timezone, settings, rules.maxStudentsPerTutor],
  )
  const isLocked = useCallback((d: DateKey) => d < todayKey(timezone), [timezone])

  /** `startMin` defaults to the day's opening time; it is kept inside the day's hours. */
  const openCreate = useCallback(
    (studentId: string | null, dateKey: DateKey, startMin?: number) => {
      const st = studentId ? students.find((s) => s.id === studentId) : undefined
      const h = dayHours(dateKey, settings)
      const start = Math.max(h.openMin, Math.min(startMin ?? h.openMin, h.closeMin - settings.schedule.snapMinutes))
      setState({
        mode: 'create',
        draft: {
          studentId: studentId ?? '',
          studentName: st?.name ?? '',
          studentGrade: st?.grade ?? '',
          dateKey,
          startMin: start,
          endMin: Math.min(h.closeMin, start + settings.schedule.defaultSessionMinutes),
          status: 'pending',
        },
      })
    },
    [students, settings],
  )
  const openEdit = useCallback((s: WithId<Session>) => setState({ mode: 'edit', session: s }), [])

  const element = (
    <SessionDialog
      state={state}
      onClose={() => setState(null)}
      students={students.filter((s) => s.status !== 'finished')}
      staff={staff}
      subjects={subjects}
      isLocked={isLocked}
      onSave={async (draft, existing) => {
        if (existing) await updateSession(ctx, existing, draft)
        else await createSession(ctx, draft, source)
        toast.success(existing ? 'Session updated' : 'Session created')
      }}
      onDelete={async (s) => {
        await deleteSession(ctx, s)
        toast.success('Session moved to Trash')
      }}
      onOpenLog={(s) => window.open(`/${branchId}/session-log/${s.id}`, '_blank', 'noopener')}
    />
  )
  return { element, openCreate, openEdit, isLocked }
}
