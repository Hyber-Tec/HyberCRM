import { query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuCalendarDays, LuPlus } from 'react-icons/lu'
import { Link } from 'react-router'
import { COL } from '@shared/paths'
import { formatInstant, nowMinutes, toInstant } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { useStaffList } from '@/features/data/hooks'
import { useSessionDialog } from '@/features/schedule/useSessionDialog'
import type { ClockShift } from '@/features/timeclock/api'
import { branchCol, useQuery } from '@/lib/firestore'
import { ClockOutDialog } from './ClockOutDialog'
import { InBuildingCard } from './InBuildingCard'
import { NeedsYouCard } from './NeedsYouCard'
import { TodayCard } from './TodayCard'
import { useAttention } from './attention'
import { plural } from './parts'

function greeting(minutes: number) {
  if (minutes < 12 * 60) return 'Good morning'
  if (minutes < 17 * 60) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Admin → Home (Round 3, option 1 "Today"): a calm agenda of today's sessions
 * with a red "now" line, and a side rail with what needs the admin and who is
 * in the building.
 */
export function AdminHomePage() {
  const { branchId, timezone, actor } = useBranch()
  const attention = useAttention()
  const { today, now } = attention
  const nowMin = nowMinutes(timezone, new Date(now))
  const [fixing, setFixing] = useState<WithId<ClockShift> | null>(null)
  const sessionDialog = useSessionDialog({ source: 'manual' })
  const { data: staff } = useStaffList()
  const colors = useMemo(() => new Map(staff.map((s) => [s.id, s.color || null])), [staff])
  const conflictMap = useMemo(() => new Map(attention.conflicts.map((c) => [c.session.id, c.conflicts])), [attention.conflicts])

  const sessionsQ = useMemo(() => query(branchCol(branchId, COL.sessions), where('dateKey', '==', today)), [branchId, today])
  const { data: sessions, loading } = useQuery<Session>(sessionsQ, `home-today-${branchId}-${today}`)
  const active = sessions.filter((s) => !s.isDeleted && s.status !== 'canceled')
  const tutorCount = new Set(active.map((s) => s.tutorId)).size

  const date = formatInstant(toInstant(today, 720, timezone), timezone, { weekday: 'long', month: 'long', day: 'numeric' })
  const firstName = actor.name.trim().split(/\s+/)[0]
  const needs = attention.total
  // New sessions start at the next half hour (inside the day's hours).
  const nextSlot = Math.ceil((nowMin + 1) / 30) * 30

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{date}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greeting(nowMin)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground" data-testid="home-summary">
            {loading ? 'Loading today…' : active.length ? `${plural(active.length, 'session')} with ${plural(tutorCount, 'tutor')} today.` : 'No sessions today.'}{' '}
            {needs ? (
              <span className="font-medium text-foreground">
                {plural(needs, 'thing')} need{needs === 1 ? 's' : ''} you.
              </span>
            ) : attention.loading ? null : (
              'Nothing needs you right now.'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/${branchId}/admin/schedule/day/${today}`}>
              <LuCalendarDays /> Open schedule
            </Link>
          </Button>
          <Button onClick={() => sessionDialog.openCreate(null, today, nextSlot)}>
            <LuPlus /> New session
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="order-2 lg:order-1">
          <TodayCard
            sessions={sessions}
            loading={loading}
            today={today}
            now={now}
            nowMin={nowMin}
            conflictsOf={(id) => conflictMap.get(id)}
            colorOf={(id) => colors.get(id) ?? null}
            onEdit={sessionDialog.openEdit}
          />
        </div>
        <div className="order-1 space-y-6 lg:order-2">
          <NeedsYouCard attention={attention} onFixClock={setFixing} />
          <InBuildingCard shifts={attention.shifts} sessions={sessions} today={today} nowMin={nowMin} colorOf={(id) => colors.get(id) ?? null} />
        </div>
      </div>
      <ClockOutDialog shift={fixing} onClose={() => setFixing(null)} />
      {sessionDialog.element}
    </div>
  )
}
