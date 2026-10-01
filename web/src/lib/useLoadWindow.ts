import { useCallback, useState } from 'react'
import { type DateKey, addMonths, endOfMonth, startOfMonth } from '@shared/time'

/**
 * The date range a scrolling month calendar loads data for. It covers the months
 * on screen plus `pad` months either side, and only moves once the view leaves
 * it, so scrolling doesn't re-query every month.
 */
export function useLoadWindow(around: DateKey, pad = 2) {
  const [win, setWin] = useState(() => ({
    from: startOfMonth(addMonths(around, -pad)),
    to: endOfMonth(addMonths(around, pad + 1)),
  }))
  const onVisibleRangeChange = useCallback(
    (from: DateKey, to: DateKey) =>
      setWin((w) => (from >= w.from && to <= w.to ? w : { from: startOfMonth(addMonths(from, -pad)), to: endOfMonth(addMonths(to, pad)) })),
    [pad],
  )
  return { ...win, onVisibleRangeChange }
}
