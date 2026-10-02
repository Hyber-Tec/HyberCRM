import { serverTimestamp, updateDoc } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import { LuArrowLeft, LuBookOpen, LuCalendarDays, LuHandshake, LuNotebookPen, LuUserRound } from 'react-icons/lu'
import { Link, useNavigate, useParams } from 'react-router'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { conferenceState } from '@shared/people'
import { type DateKey, addDays } from '@shared/time'
import type { Student, StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDayConfigs, useStaffList } from '@/features/data/hooks'
import { NewReportDialog } from '@/features/reports/NewReportDialog'
import { useSessionDialog } from '@/features/schedule/useSessionDialog'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { studentPrivateRef } from './api'
import { ConferenceTab } from './ConferenceTab'
import { InfoTab } from './InfoTab'
import { IdentityColumn, type ProfileTab } from './profile/IdentityColumn'
import { subjectColors } from './profile/model'
import { useStudentActivity } from './profile/useStudentActivity'
import { SchoolTab } from './SchoolTab'
import { SessionsTab } from './SessionsTab'
import { StudentCalendarView } from './StudentCalendarView'

const TABS: { key: ProfileTab; label: string; icon: IconType; adminOnly: boolean }[] = [
  { key: 'sessions', label: 'Sessions', icon: LuNotebookPen, adminOnly: false },
  { key: 'info', label: 'Info', icon: LuUserRound, adminOnly: false },
  { key: 'school', label: 'School', icon: LuBookOpen, adminOnly: false },
  { key: 'conference', label: 'Conference', icon: LuHandshake, adminOnly: true },
  { key: 'calendar', label: 'Calendar', icon: LuCalendarDays, adminOnly: false },
]

export function StudentProfilePage({ mode = 'admin' }: { mode?: 'admin' | 'tutor' }) {
  const { studentId = '' } = useParams()
  const { branchId, actor } = useBranch()
  const ref = useMemo(() => branchDocRef(branchId, COL.students, studentId), [branchId, studentId])
  const { data: student, loading } = useDoc<Student>(ref)
  const isAdmin = mode === 'admin'
  const base = `/${branchId}/${mode}/students`

  // First time an admin opens a new student: mark it reviewed (Home "new students to follow up").
  const marked = useRef(false)
  useEffect(() => {
    if (!isAdmin || !student || student.followUpReviewedAt || marked.current) return
    marked.current = true
    void updateDoc(ref, { followUpReviewedAt: serverTimestamp(), updatedBy: actor.email }).catch(() => undefined)
  }, [isAdmin, student, ref, actor.email])

  if (loading) return <Skeleton className="h-96 w-full max-w-7xl rounded-xl" />
  if (!student) {
    return (
      <div className="text-sm text-muted-foreground">
        Student not found.{' '}
        <Link to={base} className="underline">
          Back to students
        </Link>
      </div>
    )
  }
  return <StudentProfile student={{ ...student, id: studentId }} mode={mode} base={base} />
}

/**
 * The student page: who the student is on the left (it stays in view), and the
 * Sessions, Info, School, Conference and Calendar tabs on the right.
 */
function StudentProfile({ student, mode, base }: { student: WithId<Student>; mode: 'admin' | 'tutor'; base: string }) {
  const { tab = 'sessions' } = useParams()
  const navigate = useNavigate()
  const { branchId, rules, settings } = useBranch()
  const isAdmin = mode === 'admin'
  const activity = useStudentActivity(student, mode)
  const privRef = useMemo(() => (isAdmin ? studentPrivateRef(branchId, student.id) : null), [isAdmin, branchId, student.id])
  const { data: priv, loading: privLoading } = useDoc<StudentPrivateProfile>(privRef)
  // Tutors can't read the staff list; their page has no session dialog either.
  const { data: staff } = useStaffList(isAdmin)
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const sessionDialog = useSessionDialog({ enabled: isAdmin })
  const [reporting, setReporting] = useState(false)
  const { map: dayConfigs } = useDayConfigs(activity.today, addDays(activity.today, 30))

  // No Conference tab when the branch doesn't track parent conferences.
  const tabs = TABS.filter((t) => (isAdmin || !t.adminOnly) && (t.key !== 'conference' || rules.conferences.enabled))
  const active = (tabs.some((t) => t.key === tab) ? tab : 'sessions') as ProfileTab
  const go = (t: ProfileTab) => navigate(`${base}/${student.id}/${t}`, { replace: true })
  const canCreateReport = isAdmin || (settings.progressReports.tutorsCanCreate && settings.sessionLogs.tutorsSeeAllLogs)
  const conference = isAdmin && rules.conferences.enabled ? conferenceState({ totalSessionHours: student.totalSessionHours, baselineHours: student.conference?.baselineHours ?? 0 }, rules.conferences.everyHours) : null
  const colorOf = useMemo(() => {
    const count = new Map<string, number>()
    for (const l of activity.logs) count.set(l.subject, (count.get(l.subject) ?? 0) + 1)
    for (const s of activity.sessions) if (!count.has(s.subject)) count.set(s.subject, 0)
    return subjectColors([...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s))
  }, [activity.logs, activity.sessions])

  /** A new session for this student: on a picked day, or the next open day. */
  const newSession = (dateKey?: DateKey) => {
    let d = dateKey ?? activity.today
    if (sessionDialog.isLocked(d)) return
    if (!dateKey) for (let i = 0; i < 14 && !dayHours(d, settings, dayConfigs).isOpen; i++) d = addDays(d, 1)
    sessionDialog.openCreate(student.id, d)
  }
  const openSession = (id: string) => {
    const s = activity.sessions.find((x) => x.id === id)
    if (s) sessionDialog.openEdit(s)
  }

  return (
    <div className="max-w-7xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2.5">
        <Link to={base}>
          <LuArrowLeft /> Students
        </Link>
      </Button>
      <div className="grid gap-6 lg:grid-cols-[19.5rem_minmax(0,1fr)]">
        <IdentityColumn
          student={student}
          activity={activity}
          priv={priv ?? null}
          isAdmin={isAdmin}
          conference={conference}
          staffById={staffById}
          canCreateReport={canCreateReport}
          onTab={go}
          onNewSession={() => newSession()}
          onNewReport={() => setReporting(true)}
          onOpenSession={openSession}
        />
        <div className="min-w-0">
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <div className="inline-flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Student">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active === t.key}
                  onClick={() => go(t.key)}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition [&_svg]:size-4',
                    active === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <t.icon />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5">
            {active === 'sessions' ? (
              <SessionsTab
                student={student}
                mode={mode}
                activity={activity}
                colorOf={colorOf}
                canCreateReport={canCreateReport}
                onNewReport={() => setReporting(true)}
                onOpenSession={openSession}
              />
            ) : null}
            {active === 'info' ? <InfoTab key={student.id} student={student} readOnly={!isAdmin} priv={priv ?? null} privLoading={privLoading} /> : null}
            {active === 'school' ? <SchoolTab student={student} /> : null}
            {active === 'conference' && conference ? <ConferenceTab student={student} weeklyHours={activity.weeklyHours} /> : null}
            {active === 'calendar' ? (
              <StudentCalendarView studentId={student.id} readOnly={!isAdmin} onCreate={(d) => newSession(d)} onOpen={(s) => sessionDialog.openEdit(s)} />
            ) : null}
          </div>
        </div>
      </div>
      {isAdmin ? sessionDialog.element : null}
      {reporting ? <NewReportDialog open onOpenChange={(o) => !o && setReporting(false)} studentId={student.id} lastReportTo={activity.lastReportTo} /> : null}
    </div>
  )
}

export function TutorStudentProfilePage() {
  return <StudentProfilePage mode="tutor" />
}
