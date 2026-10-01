import { useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { type DateKey, isDateKey, todayKey } from '@shared/time'
import type { ScheduleView } from '@shared/settings/defaults'
import { useBranch } from '@/branch/BranchProvider'

/** `/scheduling/schedule/{day|week|month}/{YYYY-MM-DD}` (+ `?mode=master`). */
export function useScheduleRoute(basePath: string) {
  const params = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { settings, timezone } = useBranch()
  const rest = (params['*'] ?? '').split('/').filter(Boolean)
  const viewParam = rest[0] as ScheduleView | undefined
  const dateParam = rest[1]

  const view: ScheduleView = viewParam === 'day' || viewParam === 'week' || viewParam === 'month' ? viewParam : settings.schedule.defaultView
  const date: DateKey = dateParam && isDateKey(dateParam) ? dateParam : todayKey(timezone)
  const master = search.get('mode') === 'master'
  const explicit = !!viewParam && !!dateParam && isDateKey(dateParam)

  const go = useCallback(
    (next: { view?: ScheduleView; date?: DateKey; master?: boolean }, replace = false) => {
      const v = next.view ?? view
      const d = next.date ?? date
      const m = next.master ?? master
      navigate(`${basePath}/${v}/${d}${m ? '?mode=master' : ''}`, { replace })
    },
    [navigate, basePath, view, date, master],
  )

  return useMemo(() => ({ view, date, master, explicit, go }), [view, date, master, explicit, go])
}
