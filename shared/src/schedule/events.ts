import { type DateKey, type Weekday, diffDays, parseDateKey, startOfWeek, weekdayOf } from '../time'

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'

export interface Recurrence {
  frequency: RecurrenceFrequency
  interval: number
  /** Weekly: the weekdays it repeats on (empty = the start date's weekday). */
  weekdays: Weekday[]
  /** Monthly: day of month (null = the start date's day). */
  monthDay: number | null
  ends: { type: 'never' | 'on' | 'after'; endDate: DateKey | null; occurrences: number | null }
}

export interface ScheduleEvent {
  title: string
  /** Series start date. */
  dateKey: DateKey
  startMin: number
  endMin: number
  notes: string
  recurrence: Recurrence | null
}

function matchesPattern(ev: ScheduleEvent, date: DateKey): boolean {
  const r = ev.recurrence!
  const interval = Math.max(1, Math.floor(r.interval || 1))
  if (r.frequency === 'daily') return diffDays(ev.dateKey, date) % interval === 0
  if (r.frequency === 'weekly') {
    const days = r.weekdays.length ? r.weekdays : [weekdayOf(ev.dateKey)]
    if (!days.includes(weekdayOf(date))) return false
    const weeks = Math.round(diffDays(startOfWeek(ev.dateKey, 'monday'), startOfWeek(date, 'monday')) / 7)
    return weeks % interval === 0
  }
  const s = parseDateKey(ev.dateKey)
  const d = parseDateKey(date)
  const day = r.monthDay ?? s.day
  if (d.day !== day) return false
  const months = (d.year - s.year) * 12 + (d.month - s.month)
  return months % interval === 0
}

/** True when the event (or one occurrence of its series) falls on `date`. */
export function occursOn(ev: ScheduleEvent, date: DateKey): boolean {
  if (date < ev.dateKey) return false
  if (!ev.recurrence) return date === ev.dateKey
  const r = ev.recurrence
  if (r.ends.type === 'on' && r.ends.endDate && date > r.ends.endDate) return false
  if (!matchesPattern(ev, date)) return false
  if (r.ends.type === 'after' && r.ends.occurrences) {
    // Count occurrences from the series start up to this date.
    let count = 0
    for (let k = ev.dateKey; k <= date; k = addDay(k)) {
      if (matchesPattern(ev, k)) count++
      if (count > r.ends.occurrences) return false
    }
  }
  return true
}

function addDay(key: DateKey): DateKey {
  const { year, month, day } = parseDateKey(key)
  const d = new Date(Date.UTC(year, month - 1, day + 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** First-fit event lanes (unlimited), sorted by start then end. */
export function layoutEventLanes<T extends { id: string; startMin: number; endMin: number }>(events: readonly T[]): Map<string, number> {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const laneEnds: number[] = []
  const out = new Map<string, number>()
  for (const e of sorted) {
    let lane = laneEnds.findIndex((end) => end <= e.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(e.endMin)
    } else laneEnds[lane] = e.endMin
    out.set(e.id, lane)
  }
  return out
}

const WD_SHORT: Record<Weekday, string> = {
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}

/** "Every week on Mon, Wed" / "Every 2 days" / "Monthly on day 15". */
export function recurrenceLabel(ev: ScheduleEvent): string {
  const r = ev.recurrence
  if (!r) return 'Does not repeat'
  const n = Math.max(1, r.interval)
  let base: string
  if (r.frequency === 'daily') base = n === 1 ? 'Every day' : `Every ${n} days`
  else if (r.frequency === 'weekly') {
    const days = (r.weekdays.length ? r.weekdays : [weekdayOf(ev.dateKey)]).map((d) => WD_SHORT[d]).join(', ')
    base = `${n === 1 ? 'Every week' : `Every ${n} weeks`} on ${days}`
  } else base = `${n === 1 ? 'Monthly' : `Every ${n} months`} on day ${r.monthDay ?? parseDateKey(ev.dateKey).day}`
  if (r.ends.type === 'on' && r.ends.endDate) base += `, until ${r.ends.endDate}`
  if (r.ends.type === 'after' && r.ends.occurrences) base += `, ${r.ends.occurrences} times`
  return base
}
