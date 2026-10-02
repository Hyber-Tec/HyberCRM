import { useState } from 'react'
import { LuPlus, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { todayKey } from '@shared/time'
import type { Student, StudentSchool, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { saveSchoolRecord } from './api'

const EMPTY: StudentSchool = { courses: {}, gradeSnapshots: [], plan: '' }

/** The record without blank course rows (the old grid saved empty cells). */
const normalize = (r: Partial<StudentSchool> | null | undefined): StudentSchool => {
  const full = { ...EMPTY, ...(r ?? {}) }
  return { ...full, courses: Object.fromEntries(Object.entries(full.courses).map(([k, v]) => [k, v.map((x) => x.trim()).filter(Boolean)])) }
}

function band(grade: string): { label: string; columns: string[] } {
  const g = grade.trim().toLowerCase()
  if (['k', 'kg', 'kindergarten'].includes(g)) return { label: 'Elementary school', columns: ['1', '2', '3', '4', '5'] }
  const n = Number(g)
  if (/^\d+$/.test(g) && n <= 5) return { label: 'Elementary school', columns: ['1', '2', '3', '4', '5'] }
  if (/^\d+$/.test(g) && n <= 8) return { label: 'Middle school', columns: ['6', '7', '8'] }
  return { label: 'High school', columns: ['9', '10', '11', '12'] }
}

const ordinal = (n: string) => `${n}${n === '1' ? 'st' : n === '2' ? 'nd' : n === '3' ? 'rd' : 'th'}`

/** Letter grades get a color (A green, B blue, C amber, D or F red); anything else stays plain. */
function gradeTone(g: string): string {
  const letter = g.trim().toUpperCase()[0]
  if (letter === 'A') return 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900'
  if (letter === 'B') return 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900'
  if (letter === 'C') return 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900'
  if (letter === 'D' || letter === 'F') return 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900'
  return 'bg-muted text-foreground ring-border'
}

function GradeChip({ grade }: { grade: string | null }) {
  if (!grade) return <span className="w-9 text-center text-muted-foreground/50">—</span>
  return <span className={cn('inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold ring-1 ring-inset', gradeTone(grade))}>{grade}</span>
}

/**
 * Student page → School: one card per school year of the student's grade band
 * (courses with their latest grade), report-card grades by date, and the plan.
 * Admins and tutors keep it up to date.
 */
export function SchoolTab({ student }: { student: WithId<Student> }) {
  const { branchId, actor, timezone } = useBranch()
  const saved = normalize(student.schoolRecord)
  const [rec, setRec] = useState<StudentSchool>(saved)
  const [shownFor, setShownFor] = useState(student.schoolRecord)
  const [busy, setBusy] = useState(false)
  // A save (here or elsewhere) brings the latest record in.
  if (student.schoolRecord !== shownFor) {
    setShownFor(student.schoolRecord)
    setRec(normalize(student.schoolRecord))
  }

  const today = todayKey(timezone)
  const { label, columns } = band(student.grade ?? '')
  // A new, still empty course row isn't a change yet.
  const dirty = JSON.stringify(normalize(rec)) !== JSON.stringify(saved)
  const first = student.firstName || student.name.split(' ')[0]
  const courseNames = [
    ...new Map(
      columns
        .flatMap((c) => rec.courses[c] ?? [])
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n] as const),
    ).values(),
  ]
  // The newest report card first, for each course's latest grade.
  const byDate = [...rec.gradeSnapshots].map((s, i) => ({ s, i })).sort((a, b) => b.s.date.localeCompare(a.s.date))
  const latestGrade = (course: string) => byDate.find(({ s }) => s.grades[course]?.trim())?.s.grades[course]?.trim() ?? null

  // School years: the student's grade is this school year (from August).
  const gradeNow = /^\d+$/.test((student.grade ?? '').trim()) ? Number(student.grade) : null
  const startYear = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 8 ? 1 : 0)
  const yearOf = (col: string) => {
    if (gradeNow === null) return null
    const start = startYear + (Number(col) - gradeNow)
    return `${start}–${String((start + 1) % 100).padStart(2, '0')}`
  }

  function setCourse(col: string, row: number, value: string) {
    const list = [...(rec.courses[col] ?? [])]
    while (list.length <= row) list.push('')
    list[row] = value
    setRec({ ...rec, courses: { ...rec.courses, [col]: list } })
  }
  function addCourse(col: string) {
    setRec({ ...rec, courses: { ...rec.courses, [col]: [...(rec.courses[col] ?? []), ''] } })
  }
  function setGrade(snapshot: number, course: string, value: string) {
    setRec({ ...rec, gradeSnapshots: rec.gradeSnapshots.map((s, i) => (i === snapshot ? { ...s, grades: { ...s.grades, [course]: value } } : s)) })
  }

  async function save() {
    setBusy(true)
    try {
      await saveSchoolRecord(branchId, actor, student.id, normalize(rec))
      toast.success('School info saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{label} courses</h2>
        <p className="text-sm text-muted-foreground">One card per school year, based on {first}’s grade. The grade next to a course is from the latest report card.</p>
      </div>
      <div className={cn('grid gap-3 md:grid-cols-2', columns.length >= 4 && '2xl:grid-cols-4', columns.length === 3 && 'xl:grid-cols-3', columns.length === 5 && 'xl:grid-cols-3')} data-testid="school-years">
        {columns.map((col) => {
          const list = rec.courses[col] ?? []
          const now = gradeNow !== null && Number(col) === gradeNow
          const nextYear = gradeNow !== null && Number(col) === gradeNow + 1
          const years = yearOf(col)
          return (
            <div key={col} className={cn('flex flex-col rounded-xl border bg-card p-4', now && 'ring-2 ring-indigo-200 dark:ring-indigo-900')}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{ordinal(col)} grade</div>
                  {years ? <div className="text-xs text-muted-foreground">{years}</div> : null}
                </div>
                {now ? (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">This year</span>
                ) : nextYear ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Next year</span>
                ) : null}
              </div>
              <ul className="mt-3 flex-1 space-y-1.5">
                {list.map((course, row) => (
                  <li key={row} className="flex items-center gap-2">
                    <input
                      className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-muted/50 px-2.5 text-sm outline-none hover:border-border focus:border-ring focus:bg-background"
                      value={course}
                      placeholder="Course name"
                      aria-label={`${ordinal(col)} grade course ${row + 1}`}
                      onChange={(e) => setCourse(col, row, e.target.value)}
                    />
                    <GradeChip grade={course.trim() ? latestGrade(course.trim()) : null} />
                  </li>
                ))}
                {list.length === 0 ? <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">No courses yet</li> : null}
              </ul>
              <Button variant="ghost" size="xs" className="mt-2 -ml-1 self-start" onClick={() => addCourse(col)}>
                <LuPlus /> Add course
              </Button>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border bg-card p-5" data-testid="school-grades">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Grades</h2>
            <p className="text-sm text-muted-foreground">One column per report card.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRec({ ...rec, gradeSnapshots: [...rec.gradeSnapshots, { date: today, grades: {} }] })}>
            <LuPlus /> New date column
          </Button>
        </div>
        {courseNames.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add courses above to start tracking grades.</p>
        ) : rec.gradeSnapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a date column for the first report card.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Course</th>
                  {rec.gradeSnapshots.map((s, i) => (
                    <th key={i} className="px-2 py-2 font-medium">
                      <div className="flex items-center gap-1">
                        <DatePicker
                          size="sm"
                          className="w-36"
                          value={s.date || null}
                          onChange={(d) => setRec({ ...rec, gradeSnapshots: rec.gradeSnapshots.map((x, idx) => (idx === i ? { ...x, date: d } : x)) })}
                          aria-label="Report card date"
                        />
                        <Button variant="ghost" size="icon-sm" aria-label="Remove column" onClick={() => setRec({ ...rec, gradeSnapshots: rec.gradeSnapshots.filter((_, idx) => idx !== i) })}>
                          <LuX />
                        </Button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courseNames.map((course) => (
                  <tr key={course} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{course}</td>
                    {rec.gradeSnapshots.map((s, i) => {
                      const g = s.grades[course] ?? ''
                      return (
                        <td key={i} className="px-2 py-2">
                          <input
                            className={cn(
                              'h-7 w-16 rounded-md text-center text-xs font-semibold outline-none focus:ring-2 focus:ring-ring/40',
                              g.trim() ? cn('ring-1 ring-inset', gradeTone(g)) : 'border border-dashed border-border bg-transparent font-normal',
                            )}
                            placeholder="—"
                            value={g}
                            aria-label={`${course} grade`}
                            onChange={(e) => setGrade(i, course, e.target.value)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold">Plan</h2>
        <p className="mb-3 text-sm text-muted-foreground">Goals and the plan agreed with the family.</p>
        <Textarea rows={5} value={rec.plan} onChange={(e) => setRec({ ...rec, plan: e.target.value })} placeholder="Write the plan here…" />
      </div>

      {dirty ? (
        <div className="sticky bottom-4 z-20 flex items-center justify-end gap-2 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>
          <Button variant="outline" disabled={busy} onClick={() => setRec(saved)}>
            Discard
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? <Spinner /> : null} Save
          </Button>
        </div>
      ) : null}
    </div>
  )
}
