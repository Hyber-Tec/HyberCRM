import { useEffect, useState } from 'react'
import { LuPlus, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { todayKey } from '@shared/time'
import type { Student, StudentSchool, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { saveSchoolRecord } from './api'

const EMPTY: StudentSchool = { courses: {}, gradeSnapshots: [], plan: '' }

function band(grade: string): { label: string; columns: string[] } {
  const g = grade.trim().toLowerCase()
  if (['k', 'kg', 'kindergarten'].includes(g)) return { label: 'Elementary school', columns: ['1', '2', '3', '4', '5'] }
  const n = Number(g)
  if (/^\d+$/.test(g) && n <= 5) return { label: 'Elementary school', columns: ['1', '2', '3', '4', '5'] }
  if (/^\d+$/.test(g) && n <= 8) return { label: 'Middle school', columns: ['6', '7', '8'] }
  return { label: 'High school', columns: ['9', '10', '11', '12'] }
}

const ordinal = (n: string) => `${n}${n === '1' ? 'st' : n === '2' ? 'nd' : n === '3' ? 'rd' : 'th'}`

export function SchoolTab({ student }: { student: WithId<Student> }) {
  const { branchId, actor, timezone } = useBranch()
  const [rec, setRec] = useState<StudentSchool>({ ...EMPTY, ...(student.schoolRecord ?? {}) })
  const [busy, setBusy] = useState(false)
  useEffect(() => setRec({ ...EMPTY, ...(student.schoolRecord ?? {}) }), [student.schoolRecord])

  const { label, columns } = band(student.grade ?? '')
  const rows = Math.max(6, ...columns.map((c) => rec.courses[c]?.length ?? 0))
  const dirty = JSON.stringify(rec) !== JSON.stringify({ ...EMPTY, ...(student.schoolRecord ?? {}) })
  const courseNames = [
    ...new Map(
      columns
        .flatMap((c) => rec.courses[c] ?? [])
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n] as const),
    ).values(),
  ]

  function setCourse(col: string, row: number, value: string) {
    const list = [...(rec.courses[col] ?? [])]
    while (list.length <= row) list.push('')
    list[row] = value
    setRec({ ...rec, courses: { ...rec.courses, [col]: list } })
  }

  function setGrade(snapshot: number, course: string, value: string) {
    setRec({
      ...rec,
      gradeSnapshots: rec.gradeSnapshots.map((s, i) => (i === snapshot ? { ...s, grades: { ...s.grades, [course]: value } } : s)),
    })
  }

  async function save() {
    setBusy(true)
    try {
      const cleaned: StudentSchool = {
        ...rec,
        courses: Object.fromEntries(Object.entries(rec.courses).map(([k, v]) => [k, v.map((x) => x.trim())])),
      }
      await saveSchoolRecord(branchId, actor, student.id, cleaned)
      toast.success('School info saved')
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{label} courses</CardTitle>
          <CardDescription>Courses by school year, based on the student’s grade.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-1 text-left font-medium text-muted-foreground">
                    {ordinal(c)} grade
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {columns.map((c) => (
                    <td key={c}>
                      <Input
                        className="h-8"
                        placeholder={r === 0 ? 'Course' : ''}
                        value={rec.courses[c]?.[r] ?? ''}
                        onChange={(e) => setCourse(c, r, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setRec({ ...rec, courses: { ...rec.courses, [columns[0]]: [...(rec.courses[columns[0]] ?? Array(rows).fill('')), ''] } })}
          >
            <LuPlus /> Add row
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Grades</CardTitle>
            <CardDescription>One column per report card.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRec({ ...rec, gradeSnapshots: [...rec.gradeSnapshots, { date: todayKey(timezone), grades: {} }] })}
          >
            <LuPlus /> New date column
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {courseNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add courses above to start tracking grades.</p>
          ) : (
            <table className="border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="px-1 text-left font-medium text-muted-foreground">Course</th>
                  {rec.gradeSnapshots.map((s, i) => (
                    <th key={i} className="px-1">
                      <div className="flex items-center gap-1">
                        <DatePicker
                          size="sm"
                          className="w-40"
                          value={s.date || null}
                          onChange={(d) => setRec({ ...rec, gradeSnapshots: rec.gradeSnapshots.map((x, idx) => (idx === i ? { ...x, date: d } : x)) })}
                          aria-label="Grade date"
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove column"
                          onClick={() => setRec({ ...rec, gradeSnapshots: rec.gradeSnapshots.filter((_, idx) => idx !== i) })}
                        >
                          <LuTrash2 />
                        </Button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courseNames.map((course) => (
                  <tr key={course}>
                    <td className="pr-3 font-medium whitespace-nowrap">{course}</td>
                    {rec.gradeSnapshots.map((s, i) => (
                      <td key={i}>
                        <Input className="h-8 w-40" placeholder="Grade" value={s.grades[course] ?? ''} onChange={(e) => setGrade(i, course, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={4} value={rec.plan} onChange={(e) => setRec({ ...rec, plan: e.target.value })} placeholder="Write plan here…" />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setRec({ ...EMPTY, ...(student.schoolRecord ?? {}) })}>
          Discard
        </Button>
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save
        </Button>
      </div>
    </div>
  )
}
