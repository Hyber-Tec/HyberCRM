import { useBranch } from '@/branch/BranchProvider'
import { StudentMonthCalendar } from '@/features/schedule/StudentMonthCalendar'
import { useSessionDialog } from '@/features/schedule/useSessionDialog'

/** A student's sessions month by month; admins create and edit sessions from here. */
export function StudentCalendarView({ studentId, readOnly = false }: { studentId: string; readOnly?: boolean }) {
  return readOnly ? <ReadOnlyCalendar studentId={studentId} /> : <EditableCalendar studentId={studentId} />
}

function ReadOnlyCalendar({ studentId }: { studentId: string }) {
  const { staffId } = useBranch()
  return <StudentMonthCalendar studentId={studentId} tutorId={staffId} />
}

function EditableCalendar({ studentId }: { studentId: string }) {
  const dialog = useSessionDialog()
  return (
    <div>
      <StudentMonthCalendar
        studentId={studentId}
        onPickDay={(d) => !dialog.isLocked(d) && dialog.openCreate(studentId, d)}
        onPickSession={(s) => dialog.openEdit(s)}
      />
      <p className="mt-2 text-xs text-muted-foreground">Click a day to create a session · Click a session to view or edit it · Scroll for other months.</p>
      {dialog.element}
    </div>
  )
}
