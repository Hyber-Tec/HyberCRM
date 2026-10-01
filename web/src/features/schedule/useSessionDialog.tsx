import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { dayHours } from '@shared/availability'
import { type DateKey, todayKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useStaffList, useStudentList, useSubjects } from '@/features/data/hooks'
import { type ScheduleCtx, createSession, deleteSession, updateSession } from './api'
import { SessionDialog, type SessionDialogState } from './dialogs/SessionDialog'

/** Create/edit-session dialog usable outside the schedule page (student calendars). */
export function useSessionDialog() {
  const { branchId, actor, timezone, settings } = useBranch()
  const { data: staff } = useStaffList()
  const { data: students } = useStudentList()
  const { data: subjects } = useSubjects()
  const [state, setState] = useState<SessionDialogState>(null)
  const ctx: ScheduleCtx = useMemo(() => ({ branchId, actor, timezone, settings }), [branchId, actor, timezone, settings])
  const isLocked = useCallback((d: DateKey) => d < todayKey(timezone), [timezone])

  const openCreate = useCallback(
    (studentId: string, dateKey: DateKey) => {
      const st = students.find((s) => s.id === studentId)
      const h = dayHours(dateKey, settings)
      const startMin = h.openMin
      setState({
        mode: 'create',
        draft: {
          studentId,
          studentName: st?.name ?? '',
          studentGrade: st?.grade ?? '',
          dateKey,
          startMin,
          endMin: Math.min(h.closeMin, startMin + settings.schedule.defaultSessionMinutes),
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
        else await createSession(ctx, draft, 'student_calendar')
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
