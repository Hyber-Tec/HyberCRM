import { serverTimestamp, updateDoc } from 'firebase/firestore'
import { useEffect, useMemo, useRef } from 'react'
import { LuArrowLeft } from 'react-icons/lu'
import { Link, useNavigate, useParams } from 'react-router'
import { COL } from '@shared/paths'
import type { Student } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { StudentStatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { ConferenceTab } from './ConferenceTab'
import { InfoTab } from './InfoTab'
import { SchoolTab } from './SchoolTab'
import { SessionsTab } from './SessionsTab'
import { StudentCalendarView } from './StudentCalendarView'

const TABS = [
  { key: 'sessions', label: 'Sessions', adminOnly: false },
  { key: 'info', label: 'Info', adminOnly: false },
  { key: 'school', label: 'School', adminOnly: false },
  { key: 'conference', label: 'Conference', adminOnly: true },
  { key: 'calendar', label: 'Calendar', adminOnly: false },
] as const

export function StudentProfilePage({ mode = 'admin' }: { mode?: 'admin' | 'tutor' }) {
  const { studentId = '', tab = 'sessions' } = useParams()
  const { branchId, actor } = useBranch()
  const navigate = useNavigate()
  const ref = useMemo(() => branchDocRef(branchId, COL.students, studentId), [branchId, studentId])
  const { data: student, loading } = useDoc<Student>(ref)
  const isAdmin = mode === 'admin'
  const base = `/${branchId}/${mode}/students`
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly)
  const active = tabs.some((t) => t.key === tab) ? tab : 'sessions'

  // First time an admin opens a new student: mark it reviewed (Home "new students to follow up").
  const marked = useRef(false)
  useEffect(() => {
    if (!isAdmin || !student || student.followUpReviewedAt || marked.current) return
    marked.current = true
    void updateDoc(ref, { followUpReviewedAt: serverTimestamp(), updatedBy: actor.email }).catch(() => undefined)
  }, [isAdmin, student, ref, actor.email])

  if (loading) return <Skeleton className="h-96 w-full max-w-5xl rounded-xl" />
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
  const s = { ...student, id: studentId }

  return (
    <div className="max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link to={base}>
          <LuArrowLeft /> Students
        </Link>
      </Button>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{student.name}</h1>
        <StudentStatusBadge status={student.status} />
        {student.grade ? <span className="text-sm text-muted-foreground">Grade {student.grade}</span> : null}
        <span className="text-sm text-muted-foreground tabular-nums">{(student.totalSessionHours ?? 0).toFixed(1)} hrs</span>
      </div>
      <Tabs value={active} onValueChange={(v) => navigate(`${base}/${studentId}/${v}`, { replace: true })}>
        <TabsList variant="line" className="mb-4 w-full justify-start overflow-x-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {active === 'sessions' ? <SessionsTab student={s} mode={mode} /> : null}
      {active === 'info' ? <InfoTab student={s} readOnly={!isAdmin} /> : null}
      {active === 'school' ? <SchoolTab student={s} /> : null}
      {active === 'conference' && isAdmin ? <ConferenceTab student={s} /> : null}
      {active === 'calendar' ? <StudentCalendarView studentId={studentId} readOnly={!isAdmin} /> : null}
    </div>
  )
}

export function TutorStudentProfilePage() {
  return <StudentProfilePage mode="tutor" />
}
