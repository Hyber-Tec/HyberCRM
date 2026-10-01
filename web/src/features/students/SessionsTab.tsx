import { orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { COL } from '@shared/paths'
import { formatDateKey, formatTimeRange } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { branchCol, useQuery } from '@/lib/firestore'

const PAGE = 10

export function SessionsTab({ student, mode }: { student: WithId<Student>; mode: 'admin' | 'tutor' }) {
  const { branchId, staffId } = useBranch()
  const q = useMemo(() => {
    const base = branchCol(branchId, COL.sessions)
    if (mode === 'tutor') {
      if (!staffId) return null
      return query(base, where('studentId', '==', student.id), where('tutorId', '==', staffId), orderBy('dateKey', 'desc'))
    }
    return query(base, where('studentId', '==', student.id), orderBy('dateKey', 'desc'))
  }, [branchId, student.id, mode, staffId])
  const { data, loading, error } = useQuery<Session>(q, `student-sessions-${student.id}-${mode}`)
  const [page, setPage] = useState(0)
  const rows = data.filter((s) => !s.isDeleted)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))

  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Tutor</TableHead>
            <TableHead className="hidden sm:table-cell">Subject</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(page * PAGE, page * PAGE + PAGE).map((s) => (
            <TableRow key={s.id}>
              <TableCell className="whitespace-nowrap">{formatDateKey(s.dateKey, 'weekdayMedium')}</TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatTimeRange(s.startMin, s.endMin)}</TableCell>
              <TableCell>{s.tutorName}</TableCell>
              <TableCell className="hidden sm:table-cell">{s.subject || '—'}</TableCell>
              <TableCell>
                <SessionStatusBadge status={s.status} logSubmitted={s.logStatus === 'submitted'} />
              </TableCell>
            </TableRow>
          ))}
          {!loading && rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                {error ? 'Sessions could not be loaded.' : 'No sessions recorded for this student yet.'}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ‹ Prev
          </Button>
          <span className="text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            Next ›
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
