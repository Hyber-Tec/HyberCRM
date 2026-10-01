import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { studentLabel } from '@shared/people'
import { type DateKey, startOfMonth, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { useStudentList } from '@/features/data/hooks'
import { StudentMonthCalendar } from '@/features/schedule/StudentMonthCalendar'
import { useSessionDialog } from '@/features/schedule/useSessionDialog'

/** A student's sessions month by month; admins create and edit sessions from here. */
export function StudentCalendarView({ studentId, readOnly = false }: { studentId: string; readOnly?: boolean }) {
  return readOnly ? <ReadOnlyCalendar studentId={studentId} /> : <EditableCalendar studentId={studentId} />
}

function ReadOnlyCalendar({ studentId }: { studentId: string }) {
  const { timezone, staffId } = useBranch()
  const [month, setMonth] = useState<DateKey>(() => startOfMonth(todayKey(timezone)))
  return <StudentMonthCalendar studentId={studentId} month={month} onMonth={setMonth} tutorId={staffId} />
}

function EditableCalendar({ studentId }: { studentId: string }) {
  const { timezone } = useBranch()
  const [month, setMonth] = useState<DateKey>(() => startOfMonth(todayKey(timezone)))
  const dialog = useSessionDialog()
  return (
    <div>
      <StudentMonthCalendar
        studentId={studentId}
        month={month}
        onMonth={setMonth}
        onPickDay={(d) => !dialog.isLocked(d) && dialog.openCreate(studentId, d)}
        onPickSession={(s) => dialog.openEdit(s)}
      />
      <p className="mt-2 text-xs text-muted-foreground">Click a day to create a session · Click a session to view or edit it.</p>
      {dialog.element}
    </div>
  )
}

export function StudentCalendarPage() {
  const { data: students } = useStudentList()
  const [params, setParams] = useSearchParams()
  const studentId = params.get('student')
  const selected = students.find((s) => s.id === studentId)
  return (
    <div className="max-w-6xl">
      <PageHeader
        title={selected ? `${selected.name} · Schedule` : 'Student Calendar'}
        actions={
          <div className="flex gap-2">
            <OptionPicker
              className="w-64"
              value={studentId}
              onChange={(id) => setParams({ student: id })}
              options={students.map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade) }))}
              placeholder="Select student…"
              searchPlaceholder="Search student…"
            />
            {studentId ? (
              <Button variant="outline" onClick={() => setParams({})}>
                Clear
              </Button>
            ) : null}
          </div>
        }
      />
      {studentId ? (
        <StudentCalendarView key={studentId} studentId={studentId} />
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Select a student</EmptyTitle>
            <EmptyDescription>See their sessions month by month and schedule new ones on any open day.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
