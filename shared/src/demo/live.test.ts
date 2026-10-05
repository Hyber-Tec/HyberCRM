import { describe, expect, it, vi } from 'vitest'
import { effectiveRanges, dayHours, rangesContain } from '../availability'
import { peakConcurrency } from '../schedule/lanes'
import { billedHours } from '../schedule/hours'
import { resolveBusinessRules } from '../settings/businessRules'
import { resolveSettings } from '../settings/resolve'
import type { SessionStatus } from '../settings/defaults'
import { type DateKey, addDays, minutesOf, toInstant, weekdayOf } from '../time'
import { DEMO_BUSINESS_RULES, buildDemoData } from './seed'
import {
  type LiveContext,
  type LiveData,
  type LivePlan,
  type LiveUnit,
  type LiveWindows,
  type LiveWrite,
  applyUnits,
  batchUnits,
  isSampleSessionId,
  liveShiftId,
  liveToday,
  nightlyWindows,
  planNightly,
  planTick,
  tickWindows,
} from './live'

// Each test builds a whole sample center and runs days of the planner on it.
vi.setConfig({ testTimeout: 120_000 })

// ------------------------------------------------------------ a tiny Firestore

type Data = Record<string, unknown>
interface Entry {
  data: Data
  v: number
}

/** Documents by collection path, then ID (so a snapshot reads only the collections it needs). */
class Store {
  cols = new Map<string, Map<string, Entry>>()
  static split(path: string): [string, string] {
    const i = path.lastIndexOf('/')
    return [path.slice(0, i), path.slice(i + 1)]
  }
  get(path: string): Entry | undefined {
    const [c, id] = Store.split(path)
    return this.cols.get(c)?.get(id)
  }
  has(path: string) {
    return this.get(path) !== undefined
  }
  set(path: string, e: Entry) {
    const [c, id] = Store.split(path)
    let m = this.cols.get(c)
    if (!m) this.cols.set(c, (m = new Map()))
    m.set(id, e)
  }
  delete(path: string) {
    const [c, id] = Store.split(path)
    this.cols.get(c)?.delete(id)
  }
  /** [id, entry] pairs of a collection. */
  list(colPath: string): [string, Entry][] {
    return [...(this.cols.get(colPath)?.entries() ?? [])]
  }
}

function clone<T>(v: T): T {
  if (v instanceof Date) return new Date(v.getTime()) as T
  if (Array.isArray(v)) return v.map(clone) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as T
  return v
}

function setPath(obj: Data, path: string, value: unknown) {
  const parts = path.split('.')
  let cur = obj
  for (const p of parts.slice(0, -1)) {
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {}
    cur = cur[p] as Data
  }
  cur[parts[parts.length - 1]] = value
}

function getPath(obj: Data, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, p) => (cur && typeof cur === 'object' ? (cur as Data)[p] : undefined), obj)
}

let autoId = 0

/** Commits writes atomically with Firestore's preconditions (create: absent; update: present, same version). */
function commit(store: Store, writes: LiveWrite[]) {
  const next = new Map<string, Entry | null>()
  const get = (p: string) => (next.has(p) ? next.get(p)! : (store.get(p) ?? null))
  for (const w of writes) {
    if (w.op === 'add') {
      next.set(`${w.path}/auto-${++autoId}`, { data: clone(w.data), v: 1 })
      continue
    }
    const cur = get(w.path)
    if (w.op === 'create') {
      if (cur) throw new Error(`already exists: ${w.path}`)
      next.set(w.path, { data: clone(w.data), v: 1 })
    } else if (w.op === 'set') next.set(w.path, { data: clone(w.data), v: (cur?.v ?? 0) + 1 })
    else if (w.op === 'delete') next.set(w.path, null)
    else {
      if (!cur) throw new Error(`not found: ${w.path}`)
      if (w.ifVersion !== undefined && w.ifVersion !== cur.v) throw new Error(`changed meanwhile: ${w.path}`)
      const data = clone(cur.data)
      for (const [k, v] of Object.entries(w.data)) setPath(data, k, clone(v))
      for (const [k, n] of Object.entries(w.increment ?? {})) setPath(data, k, Math.round(((Number(getPath(data, k)) || 0) + n) * 100) / 100)
      next.set(w.path, { data, v: cur.v + 1 })
    }
  }
  for (const [p, e] of next) {
    if (e) store.set(p, e)
    else store.delete(p)
  }
}

function applyAll(store: Store, units: readonly LiveUnit[]) {
  for (const u of units) commit(store, u.writes)
}

const B = 'demo-academy'
const base = (b = B) => `branches/${b}`

function docs(store: Store, col: string, b = B): (Data & { id: string; version: number })[] {
  return store.list(`${base(b)}/${col}`).map(([id, e]) => ({ ...e.data, id, version: e.v }))
}

const inRange = (d: unknown, r: { from: DateKey; to: DateKey }) => typeof d === 'string' && d >= r.from && d <= r.to

function snapshot(store: Store, win: LiveWindows, b = B): LiveData {
  const branch = store.get(base(b))!.data
  const of = (col: string) => docs(store, col, b)
  return {
    staff: of('staff') as never,
    students: of('students') as never,
    subjects: of('subjects') as never,
    dayConfigs: of('dayConfigs').filter((d) => inRange(d.dateKey, win.dayConfigs)) as never,
    availability: of('availability').filter((d) => inRange(d.dateKey, win.availability)) as never,
    sessions: of('sessions').filter((d) => inRange(d.dateKey, win.sessions)) as never,
    shifts: of('clockShifts').filter((d) => inRange(d.dateKey, win.shifts)) as never,
    openShifts: of('openShifts').map((d) => ({ staffId: d.id, shiftId: String(d.shiftId) })),
    state: (branch.liveDemoState as never) ?? null,
  }
}

function ctxOf(store: Store, now: Date, b = B): LiveContext {
  const branch = store.get(base(b))!.data
  return {
    branchId: b,
    timezone: String(branch.timezone),
    settings: resolveSettings(branch.settings as never),
    rules: resolveBusinessRules(branch.businessRules as never),
    now,
  }
}

function nightly(store: Store, now: Date, b = B): LivePlan {
  const ctx = ctxOf(store, now, b)
  const plan = planNightly(ctx, snapshot(store, nightlyWindows(liveToday(ctx).today), b))
  applyAll(store, plan.units)
  return plan
}

function tick(store: Store, now: Date, b = B): LivePlan {
  const ctx = ctxOf(store, now, b)
  const plan = planTick(ctx, snapshot(store, tickWindows(liveToday(ctx).today), b))
  applyAll(store, plan.units)
  return plan
}

/** What the autoConfirmSessions function does: pending sessions starting within 24 hours become Confirmed. */
function autoConfirm(store: Store, now: Date, b = B) {
  for (const [id, e] of store.list(`${base(b)}/sessions`)) {
    if (e.data.status !== 'pending' || e.data.isDeleted) continue
    const startMs = (e.data.startAt as Date).getTime()
    if (startMs > now.getTime() && startMs <= now.getTime() + 24 * 3_600_000) commit(store, [{ op: 'update', path: `${base(b)}/sessions/${id}`, data: { status: 'confirmed', confirmedBy: 'auto' } }])
  }
}

/** What the autoClockOut function does at the branch's midnight. */
function autoClockOut(store: Store, now: Date, b = B) {
  const tz = String(store.get(base(b))!.data.timezone)
  for (const o of docs(store, 'openShifts', b)) {
    const path = `${base(b)}/clockShifts/${o.shiftId}`
    const s = store.get(path)!.data
    const cutoff = toInstant(addDays(String(s.dateKey), 1), 0, tz)
    if (now < cutoff) continue
    commit(store, [
      { op: 'update', path, data: { clockOutAt: cutoff, outDateKey: addDays(String(s.dateKey), 1), outMin: 0, status: 'closed', autoClosed: true } },
      { op: 'delete', path: `${base(b)}/openShifts/${o.id}` },
    ])
  }
}

function seeded(o: { tz?: string; today?: DateKey; now?: Date; max?: number; b?: string } = {}): Store {
  const tz = o.tz ?? 'America/New_York'
  const today = o.today ?? '2026-10-04'
  const now = o.now ?? toInstant(today, 900, tz)
  const b = o.b ?? B
  const store = new Store()
  const rules = { ...DEMO_BUSINESS_RULES, maxStudentsPerTutor: o.max ?? DEMO_BUSINESS_RULES.maxStudentsPerTutor }
  store.set(base(b), { data: { name: 'Demo Academy', status: 'active', timezone: tz, settings: {}, businessRules: rules, liveDemo: true }, v: 1 })
  for (const d of buildDemoData({ branchId: b, timezone: tz, today, createdBy: 'owner@example.com', now, maxStudentsPerTutor: rules.maxStudentsPerTutor })) {
    store.set(d.path, { data: clone(d.data), v: 1 })
  }
  return store
}

/** The audit entries about a document. */
const auditsOf = (store: Store, entityId: string) => docs(store, 'auditLog').filter((a) => a.entityId === entityId)

const at = (dateKey: DateKey, hhmm: string, tz = 'America/New_York') => toInstant(dateKey, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), tz)
const MAYA = 'demo-maya-thompson'
const live = (s: Data) => !s.isDeleted && s.status !== 'canceled'
const json = (p: LivePlan) => JSON.stringify(p)

/** Every invariant of a schedule: lanes within the rule, no student twice at once, sessions inside availability and hours. */
function checkSchedule(store: Store, from: DateKey, to: DateKey, max: number) {
  const settings = resolveSettings({})
  const sessions = docs(store, 'sessions').filter((s) => inRange(s.dateKey, { from, to }) && live(s))
  const avail = new Map(docs(store, 'availability').map((a) => [`${a.staffId}|${a.dateKey}`, a]))
  const byTutorDay = new Map<string, typeof sessions>()
  const byStudentDay = new Map<string, typeof sessions>()
  for (const s of sessions) {
    byTutorDay.set(`${s.tutorId}|${s.dateKey}`, [...(byTutorDay.get(`${s.tutorId}|${s.dateKey}`) ?? []), s])
    byStudentDay.set(`${s.studentId}|${s.dateKey}`, [...(byStudentDay.get(`${s.studentId}|${s.dateKey}`) ?? []), s])
  }
  for (const [k, list] of byTutorDay) {
    const items = list.map((s) => ({ id: s.id, startMin: Number(s.startMin), endMin: Number(s.endMin) }))
    for (const s of items) expect(peakConcurrency(items, s.startMin, s.endMin), k).toBeLessThanOrEqual(max)
  }
  for (const [k, list] of byStudentDay) {
    for (const a of list) for (const b of list) if (a.id < b.id) expect(Number(a.startMin) < Number(b.endMin) && Number(b.startMin) < Number(a.endMin), `${k} ${a.id} ${b.id}`).toBe(false)
  }
  for (const s of sessions) {
    if (!s.id.startsWith('demo-live-')) continue
    const a = avail.get(`${s.tutorId}|${s.dateKey}`)
    const ranges = a ? effectiveRanges(a.ranges as never, dayHours(String(s.dateKey), settings)) : []
    expect(rangesContain(ranges, Number(s.startMin), Number(s.endMin)), `${s.id} inside availability`).toBe(true)
  }
}

// ------------------------------------------------------------------- tests

describe('live demo: a fortnight of running by itself', () => {
  // Seeded on Sunday 10/4 (closed), then nightly runs at 1:15 and ticks every 15 minutes through Friday 10/16.
  const store = seeded()
  const startTotals = new Map(docs(store, 'students').map((s) => [s.id, Number(s.totalSessionHours)]))
  const beforeLogs = new Set(docs(store, 'sessionLogs').map((l) => l.id))
  const plans: { day: DateKey; nightly: LivePlan; ticks: LivePlan[] }[] = []
  for (let day = '2026-10-05'; day <= '2026-10-16'; day = addDays(day, 1)) {
    autoClockOut(store, at(day, '00:10'))
    const n = nightly(store, at(day, '01:15'))
    const ticks: LivePlan[] = []
    for (let m = 8 * 60; m < 24 * 60; m += 15) {
      const now = toInstant(day, m, 'America/New_York')
      if (m % 60 === 0) autoConfirm(store, now)
      ticks.push(tick(store, now))
    }
    plans.push({ day, nightly: n, ticks })
  }
  const end = at('2026-10-16', '23:50')
  const today = '2026-10-16'

  it('keeps availability six weeks and sessions three weeks ahead', () => {
    const avail = docs(store, 'availability')
    expect(avail.some((a) => a.dateKey === addDays(today, 42))).toBe(true)
    const sessions = docs(store, 'sessions')
    for (let d = addDays(today, 1); d <= addDays(today, 21); d = addDays(d, 1)) {
      if (weekdayOf(d) === 'sunday') continue
      const tutors = new Set(sessions.filter((s) => s.dateKey === d && live(s)).map((s) => s.tutorId))
      expect(tutors.size, `tutors on ${d}`).toBeGreaterThanOrEqual(2)
    }
    const state = store.get(base())!.data.liveDemoState as Data
    expect(state.availabilityThrough).toBe(addDays(today, 42))
    expect(state.sessionsThrough).toBe(addDays(today, 21))
  })

  it('books within the rules: lanes, one place at a time, availability, enrolled students, the tutor’s subjects', () => {
    // From the seed's today on (Ava's scripted history before it can stack a fourth student on her tutors).
    checkSchedule(store, '2026-10-04', addDays(today, 21), 3)
    const students = new Map(docs(store, 'students').map((s) => [s.id, s]))
    const staff = new Map(docs(store, 'staff').map((s) => [s.id, s]))
    const mine = docs(store, 'sessions').filter((s) => s.id.startsWith('demo-live-s-'))
    expect(mine.length).toBeGreaterThan(50)
    for (const s of mine) {
      expect(students.get(String(s.studentId))?.status).toBe('enrolled')
      expect((staff.get(String(s.tutorId))?.subjectIds as string[]).includes(String(s.subjectId)), s.id).toBe(true)
      expect(s.startAt).toEqual(toInstant(String(s.dateKey), Number(s.startMin), 'America/New_York'))
    }
  })

  it('settles the past like the server: logs, attendance, hours; leaves the test tutor’s last three days', () => {
    const sessions = docs(store, 'sessions').filter((s) => isSampleSessionId(s.id) && live(s) && String(s.dateKey) <= today)
    const open = (s: Data) => (s.status === 'pending' || s.status === 'confirmed') && s.logStatus === 'none'
    const ended = sessions.filter((s) => toInstant(String(s.dateKey), Number(s.endMin), 'America/New_York') <= end)
    // Maya: everything from the last three days (and today) still open; nothing older within the settle window.
    const maya = ended.filter((s) => s.tutorId === MAYA)
    expect(maya.filter((s) => String(s.dateKey) >= addDays(today, -3)).every(open)).toBe(true)
    expect(maya.filter((s) => String(s.dateKey) >= addDays(today, -3)).length).toBeGreaterThan(0)
    expect(maya.filter((s) => String(s.dateKey) < addDays(today, -3) && String(s.dateKey) >= addDays(today, -7)).some(open)).toBe(false)
    // Others: a few late logs in the last two days only.
    const others = ended.filter((s) => s.tutorId !== MAYA && String(s.dateKey) >= addDays(today, -7))
    const left = others.filter(open)
    expect(left.every((s) => String(s.dateKey) >= addDays(today, -2))).toBe(true)
    expect(left.length).toBeGreaterThan(0)
    expect(left.length / others.length).toBeLessThan(0.25)
    // Logs carry the server's fields.
    const logs = docs(store, 'sessionLogs').filter((l) => !beforeLogs.has(l.id))
    expect(logs.length).toBeGreaterThan(100)
    const byId = new Map(docs(store, 'sessions').map((s) => [s.id, s]))
    for (const l of logs) {
      const s = byId.get(l.id)!
      expect(l.status).toBe('submitted')
      expect(l.usedHours).toBe(billedHours(Number(s.endMin) - Number(s.startMin), 'te_business'))
      expect((l.ai as Data).provider).toBe('local_fallback')
      expect((l.enteredBy as Data).role).toBe('tutor')
      expect(s.status).toBe('present')
      expect(s.logStatus).toBe('submitted')
      expect((s.logSubmittedAt as Date).getTime()).toBeGreaterThanOrEqual((s.endAt as Date).getTime())
    }
    const submits = docs(store, 'auditLog').filter((a) => a.action === 'sessionLog.submit' && logs.some((l) => l.id === a.entityId))
    expect(submits.length).toBe(logs.length)
    expect(submits.every((a) => a.actorName === 'System' && a.actorRole === 'system')).toBe(true)
    // A few no-shows, with the hours billed.
    const noShows = docs(store, 'sessions').filter((s) => s.status === 'no_show' && s.updatedBy === 'system')
    expect(noShows.length).toBeGreaterThan(0)
    // Student totals moved by exactly the hours billed.
    const delta = new Map<string, number>()
    for (const l of logs) delta.set(String(l.studentId), (delta.get(String(l.studentId)) ?? 0) + Number(l.usedHours))
    for (const s of noShows) delta.set(String(s.studentId), (delta.get(String(s.studentId)) ?? 0) + Number(s.noShowAppliedHours))
    for (const st of docs(store, 'students')) {
      const expected = Math.round(((startTotals.get(st.id) ?? 0) + (delta.get(st.id) ?? 0)) * 100) / 100
      expect(Number(st.totalSessionHours), st.id).toBeCloseTo(expected, 2)
      if (delta.has(st.id)) expect(String(st.lastSessionDate) >= '2026-10-01').toBe(true)
    }
  })

  it('clocks every tutor in and out once a day, in the kiosk’s shape', () => {
    const shifts = docs(store, 'clockShifts')
    for (let d = '2026-10-05'; d <= today; d = addDays(d, 1)) {
      const tutors = new Set(docs(store, 'sessions').filter((s) => s.dateKey === d && live(s)).map((s) => String(s.tutorId)))
      for (const t of tutors) expect(shifts.filter((s) => s.staffId === t && s.dateKey === d).length, `${t} ${d}`).toBe(1)
    }
    const mine = shifts.find((x) => x.id.startsWith('demo-live-shift-') && x.status === 'closed' && !x.autoClosed)!
    const one = store.get(`${base()}/clockShifts/${mine.id}`)!.data
    expect(Object.keys(one)).toEqual([
      'staffId', 'staffName', 'dateKey', 'inMin', 'clockInAt', 'clockOutAt', 'outDateKey', 'outMin', 'status', 'source',
      'autoClosed', 'autoCorrected', 'forcedType', 'note', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy',
    ])
    expect(one.status).toBe('closed')
    expect(minutesOf(one.clockInAt as Date, 'America/New_York')).toBe(one.inMin)
    const first = Math.min(...docs(store, 'sessions').filter((s) => s.tutorId === one.staffId && s.dateKey === one.dateKey && live(s)).map((s) => Number(s.startMin)))
    expect(first - Number(one.inMin)).toBeGreaterThanOrEqual(5)
    expect(first - Number(one.inMin)).toBeLessThanOrEqual(15)
    // Nobody is left clocked in at midnight except the odd forgotten clock-out.
    expect(docs(store, 'openShifts').length).toBeLessThanOrEqual(2)
  })

  it('makes at most one schedule change a weekday for the test tutor, never into a conflict', () => {
    for (const { day, ticks } of plans) {
      const changes = ticks.flatMap((t) => t.units.filter((u) => u.kind === 'change'))
      expect(changes.length).toBeLessThanOrEqual(1)
      if (['saturday', 'sunday'].includes(weekdayOf(day))) expect(changes.length).toBe(0)
      for (const c of changes) {
        const w = c.writes[0]
        const id = w.path.split('/').pop()!
        const s = store.get(`${base()}/sessions/${id}`)!.data
        expect(s.tutorId).toBe(MAYA)
        expect(store.get(`${base()}/auditLog/demo-live-change-${day}`)?.data.actorName).toBe('System')
      }
    }
    const days = plans.filter((p) => p.ticks.some((t) => t.units.some((u) => u.kind === 'change'))).length
    expect(days).toBeGreaterThanOrEqual(3)
    checkSchedule(store, '2026-10-05', today, 3)
  })

  it('posts the week’s news on Mondays, once, with a notification request', () => {
    const posts = docs(store, 'announcements').filter((a) => a.id.startsWith('demo-live-a-'))
    expect(posts.map((p) => p.id).sort()).toEqual(['demo-live-a-2026-10-05', 'demo-live-a-2026-10-12'])
    for (const p of posts) {
      expect(p.notifyRequestedAt).toBeInstanceOf(Date)
      expect(p.audienceType).toBe('all')
      expect(String(p.contentText).length).toBeGreaterThan(20)
    }
    expect(posts[0].title).not.toBe(posts[1].title)
  })

  it('changes nothing when run again', () => {
    const ctx = ctxOf(store, end)
    expect(planNightly(ctx, snapshot(store, nightlyWindows(today))).units).toEqual([])
    expect(planTick(ctx, snapshot(store, tickWindows(today))).units).toEqual([])
  })
})

describe('live demo: determinism and idempotence', () => {
  it('plans the same writes from the same snapshot', () => {
    const a = seeded()
    const b = seeded()
    const now = at('2026-10-05', '01:15')
    const p1 = planNightly(ctxOf(a, now), snapshot(a, nightlyWindows('2026-10-05')))
    const p2 = planNightly(ctxOf(b, now), snapshot(b, nightlyWindows('2026-10-05')))
    expect(json(p1)).toBe(json(p2))
    expect(p1.counts.session).toBeGreaterThan(0)
    expect(p1.counts.availability).toBeGreaterThan(0)
  })

  it('a second run right after the first writes nothing', () => {
    const s = seeded()
    nightly(s, at('2026-10-05', '01:15'))
    expect(nightly(s, at('2026-10-05', '01:20')).units).toEqual([])
    tick(s, at('2026-10-05', '15:00'))
    expect(tick(s, at('2026-10-05', '15:00')).units).toEqual([])
  })

  it('keeps the students-per-tutor rule of the branch (one-to-one)', () => {
    const s = seeded({ max: 1 })
    for (let d = '2026-10-05'; d <= '2026-10-08'; d = addDays(d, 1)) {
      nightly(s, at(d, '01:15'))
      for (let m = 600; m < 1440; m += 30) tick(s, toInstant(d, m, 'America/New_York'))
    }
    checkSchedule(s, '2026-10-05', '2026-10-29', 1)
  })
})

describe('live demo: never overwrites people’s edits', () => {
  it('leaves availability people set, and doesn’t refill a day they cleared', () => {
    const s = seeded()
    const own = `${base()}/availability/${MAYA}_2026-11-10`
    put(s, own, { staffId: MAYA, dateKey: '2026-11-10', ranges: [{ startMin: 900, endMin: 960 }], unavailable: false })
    nightly(s, at('2026-10-05', '01:15'))
    expect(s.get(own)!.data.ranges).toEqual([{ startMin: 900, endMin: 960 }])
    // Cleared after the planner covered it: stays cleared.
    const covered = docs(s, 'availability').find((a) => a.staffId === 'demo-daniel-kim' && String(a.dateKey) > '2026-11-01')!
    s.delete(`${base()}/availability/${covered.id}`)
    nightly(s, at('2026-10-06', '01:15'))
    expect(s.has(`${base()}/availability/${covered.id}`)).toBe(false)
  })

  it('books no sessions for a tutor and day people already planned, trashed or canceled ones included', () => {
    const s = seeded()
    nightly(s, at('2026-10-05', '01:15'))
    // The day that comes into the three-week window on the next night.
    const day = addDays('2026-10-06', 21)
    const tutor = docs(s, 'availability').find((a) => a.dateKey === day)!.staffId as string
    put(s, `${base()}/sessions/manual-1`, { tutorId: tutor, tutorName: 'X', studentId: 'demo-student-ava-patel', studentName: 'Ava Patel', subject: 'SAT Math', status: 'pending', dateKey: day, startMin: 900, endMin: 960, logStatus: 'none', isDeleted: true })
    nightly(s, at('2026-10-06', '01:15'))
    expect(docs(s, 'sessions').filter((x) => x.tutorId === tutor && x.dateKey === day).map((x) => x.id)).toEqual(['manual-1'])
    expect(docs(s, 'sessions').some((x) => x.dateKey === day && x.tutorId !== tutor)).toBe(true)
  })

  it('settles only sample sessions still open, never a draft, a person’s session or one changed meanwhile', async () => {
    const s = seeded({ today: '2026-10-02', now: at('2026-10-02', '12:00') })
    const day = '2026-10-02'
    const others = docs(s, 'sessions').filter((x) => x.dateKey === day && x.tutorId !== MAYA && live(x)).map((x) => x.id)
    expect(others.length).toBeGreaterThan(3)
    const draft = others[0]
    s.get(`${base()}/sessions/${draft}`)!.data.logStatus = 'draft'
    put(s, `${base()}/sessions/manual-2`, { ...s.get(`${base()}/sessions/${others[1]}`)!.data, studentId: 'demo-student-x', status: 'confirmed', logStatus: 'none' })
    const plan = planNightly(ctxOf(s, at('2026-10-03', '01:15')), snapshot(s, nightlyWindows('2026-10-03')))
    const settled = plan.units.filter((u) => u.kind === 'log' || u.kind === 'no_show').map((u) => u.key.split(' ')[1])
    expect(settled).not.toContain(draft)
    expect(settled).not.toContain('manual-2')
    expect(settled.length).toBeGreaterThan(2)
    // After the read: a draft the trigger hasn't mirrored yet, and a person's edit.
    const logged = plan.units.filter((u) => u.kind === 'log').map((u) => u.key.split(' ')[1])
    const [hidden, raced] = logged
    put(s, `${base()}/sessionLogs/${hidden}`, { sessionId: hidden, status: 'draft', lessonActivity: 'Mine' })
    commit(s, [{ op: 'update', path: `${base()}/sessions/${raced}`, data: { note: 'Changed by a person' } }])
    const skipped: string[] = []
    const result = await applyUnits(plan.units, async (w) => commit(s, w), (u) => skipped.push(u.key))
    expect(skipped.sort()).toEqual([`log ${hidden}`, `log ${raced}`].sort())
    expect(result.applied).toBe(plan.units.length - 2)
    expect(s.get(`${base()}/sessionLogs/${hidden}`)!.data.lessonActivity).toBe('Mine')
    expect(s.get(`${base()}/sessions/${hidden}`)!.data.status).not.toBe('present')
    expect(s.get(`${base()}/sessions/${raced}`)!.data).toMatchObject({ note: 'Changed by a person', logStatus: 'none' })
    expect(s.has(`${base()}/sessionLogs/${raced}`)).toBe(false)
    expect(s.get(`${base()}/sessions/manual-2`)!.data.status).toBe('confirmed')
  })

  it('adds no shift where the tutor already has one, and leaves a kiosk shift open', () => {
    const s = seeded()
    nightly(s, at('2026-10-05', '01:15'))
    const tutor = docs(s, 'sessions').find((x) => x.dateKey === '2026-10-05' && live(x) && x.tutorId !== MAYA)!.tutorId as string
    put(s, `${base()}/clockShifts/kiosk-1`, { staffId: tutor, staffName: 'X', dateKey: '2026-10-05', inMin: 600, status: 'open' })
    put(s, `${base()}/openShifts/${tutor}`, { shiftId: 'kiosk-1' })
    for (let m = 600; m < 1440; m += 15) tick(s, toInstant('2026-10-05', m, 'America/New_York'))
    expect(docs(s, 'clockShifts').filter((x) => x.staffId === tutor && x.dateKey === '2026-10-05').map((x) => x.id)).toEqual(['kiosk-1'])
    expect(s.get(`${base()}/clockShifts/kiosk-1`)!.data.status).toBe('open')
    nightly(s, at('2026-10-06', '01:15'))
    expect(docs(s, 'clockShifts').filter((x) => x.staffId === tutor && x.dateKey === '2026-10-05').length).toBe(1)
  })
})

describe('live demo: the day as it happens', () => {
  it('clocks in before the first session and out after the last, as the kiosk writes it', () => {
    const s = seeded()
    nightly(s, at('2026-10-05', '01:15'))
    const day = '2026-10-06'
    nightly(s, at(day, '01:15'))
    const first = new Map<string, number>()
    for (const x of docs(s, 'sessions').filter((x) => x.dateKey === day && live(x))) first.set(String(x.tutorId), Math.min(first.get(String(x.tutorId)) ?? 9999, Number(x.startMin)))
    const [tutor, startMin] = [...first.entries()].sort((a, b) => a[1] - b[1])[0]
    tick(s, toInstant(day, startMin - 16, 'America/New_York'))
    expect(s.has(`${base()}/openShifts/${tutor}`)).toBe(false)
    let opened = false
    for (let m = startMin - 15; m <= startMin; m += 15) opened ||= tick(s, toInstant(day, m, 'America/New_York')).units.some((u) => u.kind === 'clock_in')
    expect(opened).toBe(true)
    const pointer = s.get(`${base()}/openShifts/${tutor}`)!.data
    expect(pointer.shiftId).toBe(liveShiftId(day, tutor))
    const shift = s.get(`${base()}/clockShifts/${pointer.shiftId}`)!.data
    expect(shift).toMatchObject({ status: 'open', clockOutAt: null, outDateKey: null, outMin: null, source: 'kiosk', autoClosed: false, forcedType: null })
    expect(pointer.clockInAt).toEqual(shift.clockInAt)
    expect(auditsOf(s, String(pointer.shiftId))).toEqual([expect.objectContaining({ action: 'shift.clock_in', via: 'kiosk', actorName: 'System' })])
    for (let m = startMin; m < 1440; m += 15) tick(s, toInstant(day, m, 'America/New_York'))
    const closed = s.get(`${base()}/clockShifts/${pointer.shiftId}`)!.data
    const last = Math.max(...docs(s, 'sessions').filter((x) => x.dateKey === day && x.tutorId === tutor && live(x)).map((x) => Number(x.endMin)))
    if (closed.status === 'closed') {
      expect(Number(closed.outMin) - last).toBeGreaterThanOrEqual(10)
      expect(Number(closed.outMin) - last).toBeLessThanOrEqual(30)
      expect(s.has(`${base()}/openShifts/${tutor}`)).toBe(false)
    }
  })

  it('writes today’s logs shortly after sessions end, never the test tutor’s', () => {
    const s = seeded()
    nightly(s, at('2026-10-05', '01:15'))
    const day = '2026-10-06'
    nightly(s, at(day, '01:15'))
    for (let m = 600; m < 1440; m += 15) tick(s, toInstant(day, m, 'America/New_York'))
    const todays = docs(s, 'sessions').filter((x) => x.dateKey === day && live(x))
    expect(todays.filter((x) => x.tutorId === MAYA).every((x) => x.logStatus === 'none')).toBe(true)
    const others = todays.filter((x) => x.tutorId !== MAYA)
    expect(others.filter((x) => x.logStatus === 'submitted').length / others.length).toBeGreaterThan(0.6)
  })

  it('moves or adds one session for the test tutor on a weekday morning, then stops', () => {
    // Confirm Maya's sessions as the auto-confirm job would by then.
    const s = seeded()
    nightly(s, at('2026-10-05', '01:15'))
    let day = '2026-10-06'
    let changed: LivePlan | null = null
    for (; day <= '2026-10-16' && !changed; day = addDays(day, 1)) {
      nightly(s, at(day, '01:15'))
      for (const x of docs(s, 'sessions').filter((x) => x.dateKey === day && x.status === 'pending')) commit(s, [{ op: 'update', path: `${base()}/sessions/${x.id}`, data: { status: 'confirmed' as SessionStatus } }])
      for (let m = 540; m < 720; m += 15) {
        const p = tick(s, toInstant(day, m, 'America/New_York'))
        if (p.units.some((u) => u.kind === 'change')) {
          changed = p
          expect(m).toBeGreaterThanOrEqual(585)
          expect(m).toBeLessThan(660)
        }
      }
    }
    expect(changed).not.toBeNull()
    const d = addDays(day, -1)
    const unit = changed!.units.find((u) => u.kind === 'change')!
    expect(changed!.notes.length).toBe(1)
    const sessionWrite = unit.writes[0]
    const session = s.get(sessionWrite.path)!.data
    expect(session.tutorId).toBe(MAYA)
    expect(session.dateKey).toBe(d)
    expect(Number(session.startMin)).toBeGreaterThanOrEqual(660)
    if (sessionWrite.op === 'create') expect(['pending', 'confirmed']).toContain(session.status)
    else if (sessionWrite.op === 'update') expect(Object.keys(sessionWrite.data)).toEqual(expect.arrayContaining(['startMin', 'endMin', 'startAt', 'endAt', 'dayEndAt']))
    checkSchedule(s, d, d, 3)
    expect((s.get(base())!.data.liveDemoState as Data).changeDate).toBe(d)
    expect(tick(s, toInstant(d, 900, 'America/New_York')).units.filter((u) => u.kind === 'change')).toEqual([])
  })

  it('posts only on Monday mornings', () => {
    const s = seeded()
    expect(tick(s, at('2026-10-05', '08:30')).units.some((u) => u.kind === 'announcement')).toBe(false)
    expect(tick(s, at('2026-10-05', '09:45')).units.some((u) => u.kind === 'announcement')).toBe(true)
    expect(tick(s, at('2026-10-05', '10:00')).units.some((u) => u.kind === 'announcement')).toBe(false)
    expect(tick(s, at('2026-10-06', '09:45')).units.some((u) => u.kind === 'announcement')).toBe(false)
  })
})

describe('live demo: time zones', () => {
  it('plans each branch in its own zone', () => {
    // 3:30 UTC on Tuesday 10/6 is 12:30 PM Tuesday in Seoul and 8:30 PM Monday in Los Angeles.
    const now = new Date('2026-10-06T03:30:00Z')
    const seoul = seeded({ tz: 'Asia/Seoul', today: '2026-10-05', now: toInstant('2026-10-05', 900, 'Asia/Seoul'), b: 'seoul' })
    const la = seeded({ tz: 'America/Los_Angeles', today: '2026-10-05', now: toInstant('2026-10-05', 900, 'America/Los_Angeles'), b: 'la' })
    expect(liveToday(ctxOf(seoul, now, 'seoul'))).toEqual({ today: '2026-10-06', nowMin: 750 })
    expect(liveToday(ctxOf(la, now, 'la'))).toEqual({ today: '2026-10-05', nowMin: 1230 })
    const p = nightly(seoul, now, 'seoul')
    const created = p.units.filter((u) => u.kind === 'session').map((u) => u.writes[0])
    expect(created.length).toBeGreaterThan(0)
    for (const w of created) {
      const d = (w as { data: Data }).data
      expect(minutesOf(d.startAt as Date, 'Asia/Seoul')).toBe(d.startMin)
      expect(String(d.dateKey) > '2026-10-06').toBe(true)
    }
    // Los Angeles at 8:30 PM: clocked in, a few logs already written.
    for (let m = 600; m <= 1230; m += 15) tick(la, toInstant('2026-10-05', m, 'America/Los_Angeles'), 'la')
    const shifts = docs(la, 'clockShifts', 'la').filter((x) => x.dateKey === '2026-10-05')
    expect(shifts.length).toBeGreaterThan(0)
    for (const x of shifts) expect(minutesOf(x.clockInAt as Date, 'America/Los_Angeles')).toBe(x.inMin)
  })

  it('keeps wall-clock times across a daylight saving change', () => {
    // New York leaves daylight time on Sunday 11/1: the planner books 10/23 to 11/2 on the night of 10/12.
    const s = seeded({ today: '2026-10-01', now: at('2026-10-01', '15:00') })
    nightly(s, at('2026-10-12', '01:15'))
    const around = docs(s, 'sessions').filter((x) => x.id.startsWith('demo-live-s-') && ['2026-10-31', '2026-11-02'].includes(String(x.dateKey)))
    expect(new Set(around.map((x) => x.dateKey)).size).toBe(2)
    for (const x of around) expect(minutesOf(x.startAt as Date, 'America/New_York')).toBe(x.startMin)
    const shift = docs(s, 'clockShifts').find((x) => x.id.startsWith('demo-live-shift-'))!
    expect(minutesOf(shift.clockInAt as Date, 'America/New_York')).toBe(shift.inMin)
  })
})

describe('the seed for a live demo', () => {
  it('can leave the test tutor’s last days without logs, consistently', () => {
    const opts = { branchId: B, timezone: 'America/New_York', today: '2026-10-08', createdBy: 'owner@example.com', now: at('2026-10-08', '20:00'), maxStudentsPerTutor: 3 }
    const plain = buildDemoData(opts)
    const open = buildDemoData({ ...opts, openLogs: { staffId: MAYA, days: 3 } })
    const sessions = (list: typeof plain) => list.filter((d) => d.path.includes('/sessions/'))
    const recent = sessions(open).filter((d) => d.data.tutorId === MAYA && String(d.data.dateKey) >= '2026-10-05' && toInstant(String(d.data.dateKey), Number(d.data.endMin), 'America/New_York') < at('2026-10-08', '20:00'))
    expect(recent.length).toBeGreaterThan(0)
    for (const d of recent) {
      if (d.data.status === 'canceled') continue
      expect(d.data).toMatchObject({ status: 'confirmed', logStatus: 'none', logSubmittedAt: null })
      expect(open.some((x) => x.path.endsWith(`/sessionLogs/${d.path.split('/').pop()}`))).toBe(false)
    }
    // Everyone else's sessions are exactly the same.
    const others = (list: typeof plain) => JSON.stringify(sessions(list).filter((d) => d.data.tutorId !== MAYA))
    expect(others(open)).toBe(others(plain))
    // Student hours count only what was logged.
    const hours = new Map<string, number>()
    for (const d of open.filter((x) => x.path.includes('/sessionLogs/'))) hours.set(String(d.data.studentId), (hours.get(String(d.data.studentId)) ?? 0) + Number(d.data.usedHours))
    const plainTotal = (id: string) => Number(plain.find((x) => x.path.endsWith(`/students/${id}`))!.data.totalSessionHours)
    const openTotal = (id: string) => Number(open.find((x) => x.path.endsWith(`/students/${id}`))!.data.totalSessionHours)
    const affected = new Set(recent.map((d) => String(d.data.studentId)))
    for (const id of affected) expect(openTotal(id)).toBeLessThanOrEqual(plainTotal(id))
  })
})

describe('live demo: batching', () => {
  it('never splits a unit across batches', () => {
    const unit = (n: number): LiveUnit => ({ key: String(n), kind: 'session', writes: Array.from({ length: n }, (_, i) => ({ op: 'delete', path: `x/${i}` })) })
    const batches = batchUnits([unit(200), unit(200), unit(100), unit(3)], 450)
    expect(batches.map((b) => b.map((u) => u.key))).toEqual([['200', '200'], ['100', '3']])
  })
})

function put(s: Store, path: string, data: Data) {
  s.set(path, { data, v: 1 })
}
