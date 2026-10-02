import { limit, orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuArrowRight, LuSearch } from 'react-icons/lu'
import { COL } from '@shared/paths'
import { formatInstant } from '@shared/time'
import type { AuditCategory, AuditEntry } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { actorLabel } from '@/lib/audit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { branchCol, useQuery } from '@/lib/firestore'

const CATEGORIES: { value: AuditCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'event', label: 'Events' },
  { value: 'availability', label: 'Availability' },
  { value: 'people', label: 'People' },
  { value: 'pay', label: 'Pay' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'settings', label: 'Settings' },
  { value: 'access', label: 'Access' },
]

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  tutor: 'Tutor',
  parent: 'Parent',
  student: 'Student',
  system: 'System',
}

/** The branch's append-only audit log (Settings → Audit Log). */
export function AuditLogSection() {
  const { branchId, timezone } = useBranch()
  const [category, setCategory] = useState<AuditCategory | 'all'>('all')
  const [pageSize, setPageSize] = useState(100)
  const [search, setSearch] = useState('')
  const q = useMemo(() => {
    const base = branchCol(branchId, COL.auditLog)
    return category === 'all'
      ? query(base, orderBy('at', 'desc'), limit(pageSize))
      : query(base, where('category', '==', category), orderBy('at', 'desc'), limit(pageSize))
  }, [branchId, category, pageSize])
  const { data, loading, error } = useQuery<AuditEntry>(q, `audit-${branchId}-${category}-${pageSize}`)

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return data
    return data.filter((e) =>
      [e.summary, e.actorName, e.actorEmail, e.studentName, e.tutorName, e.context].some((v) => v?.toLowerCase().includes(s)),
    )
  }, [data, search])

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-semibold">Audit Log</h2>
        <p className="text-sm text-muted-foreground">Every change made in this branch, newest first. Entries can’t be edited or deleted.</p>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select value={category} onValueChange={(v) => setCategory(v as AuditCategory | 'all')}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InputGroup className="sm:w-80">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search people, students, details…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
      </div>
      {error ? <p className="mb-4 text-sm text-destructive">{error.message}</p> : null}
      <Card className="divide-y py-0">
        {rows.map((e) => (
          <div key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
            <div className="w-44 shrink-0 text-xs text-muted-foreground tabular-nums">
              {e.at ? formatInstant(e.at.toDate(), timezone) : 'Saving…'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">{e.summary}</div>
              {e.context ? <div className="text-xs text-muted-foreground">{e.context}</div> : null}
              {e.changes?.length ? (
                <ul className="mt-1 space-y-0.5">
                  {e.changes.map((c, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{c.label}:</span>
                      <span className="line-through decoration-muted-foreground/50">{String(c.from ?? '—')}</span>
                      <LuArrowRight className="size-3" />
                      <span className="text-foreground">{String(c.to ?? '—')}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex shrink-0 items-start gap-2 text-xs sm:w-56 sm:justify-end">
              <span className="truncate text-muted-foreground">{actorLabel(e)}</span>
              <Badge variant="outline">{ROLE_LABEL[e.actorRole] ?? e.actorRole}</Badge>
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-muted-foreground">No entries yet.</div> : null}
      </Card>
      {data.length >= pageSize ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setPageSize((n) => n + 100)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
