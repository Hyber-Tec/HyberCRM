import { APP_DOMAIN, SENDER_EMAIL } from '@shared/brand'
import { newBranchData, newMemberData, publicProfileFor } from '@shared/branchFactory'
import { DEMO_BUSINESS_RULES, DEMO_KIOSK_PINS, type SeedDoc, buildDemoData } from '@shared/demo/seed'
import { COL, DOC, ROOT } from '@shared/paths'
import { DEFAULT_SETTINGS, type WeekHours } from '@shared/settings/defaults'
import { type DateKey, formatMinutes, minutesOf, toInstant, todayKey, weekdayOf } from '@shared/time'
import { seed } from './fake/firestore'
import { DEMO_BRANCH_ID, type DemoRole } from './protocol'

export { DEMO_BRANCH_ID }

/**
 * The demo center shown on the landing page: "Hyber CRM", run by a fictional
 * owner, filled with the shared sample data (names and numbers are made up).
 */
export const DEMO_BRANCH_NAME = 'Hyber CRM'
export const DEMO_OWNER = { uid: 'demo-owner', email: 'alex.morgan@example.com', displayName: 'Alex Morgan' }

/** Who the visitor is for each demo role (the tutor, parent and student are people in the sample data). */
export const DEMO_PEOPLE: Record<DemoRole, { uid: string; email: string; displayName: string }> = {
  owner: DEMO_OWNER,
  tutor: { uid: 'demo-tutor', email: 'maya.thompson@example.com', displayName: 'Maya Thompson' },
  parent: { uid: 'demo-parent', email: '', displayName: '' },
  student: { uid: 'demo-student', email: 'ava.patel@example.com', displayName: 'Ava Patel' },
}
const AVA = 'demo-student-ava-patel'
export const DEMO_LOGO = '/brand/hybercrm-logo.svg'

/** Open every day, so there is always a day in progress to show. */
export const DEMO_WEEK: WeekHours = { ...DEFAULT_SETTINGS.schedule.defaultWeek, sunday: { isOpen: true, openMin: 720, closeMin: 1080 } }

/** Kiosk PINs of the sample staff (staff ID → PIN), for the demo kiosk. */
export const demoPins = new Map(Object.entries(DEMO_KIOSK_PINS))

// Whole-hour zones around the world, the US first (picked when it's their afternoon).
const ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Pacific/Pago_Pago',
  'America/Halifax',
  'America/Sao_Paulo',
  'America/Noronha',
  'Atlantic/Azores',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Athens',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Seoul',
  'Australia/Brisbane',
  'Pacific/Noumea',
  'Pacific/Auckland',
  'Pacific/Tongatapu',
  'Pacific/Kiritimati',
]

/** How far `zone`'s clock is from the middle of its busy hours (null: not busy now). */
function busyScore(zone: string, now: Date): number | null {
  try {
    const hours = DEMO_WEEK[weekdayOf(todayKey(zone, now))]
    const min = minutesOf(now, zone)
    const lo = hours.openMin + 120
    const hi = hours.closeMin - 120
    return hours.isOpen && min >= lo && min <= hi ? Math.abs(min - (lo + hi) / 2) : null
  } catch {
    return null
  }
}

/**
 * The demo center's time zone: the visitor's own when the center would be busy
 * there now, otherwise a zone where it's mid-afternoon, so the schedule, the
 * time clock and Home always show a day in progress.
 */
export function demoTimeZone(now = new Date()): string {
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  if (busyScore(own, now) !== null) return own
  let best: { zone: string; score: number } | null = null
  for (const zone of ZONES) {
    const score = busyScore(zone, now)
    if (score !== null && (!best || score < best.score)) best = { zone, score }
  }
  return best?.zone ?? own
}

/** Tutors who are in today: clocked in a little before their first session, out after their last. */
function todayShifts(docs: SeedDoc[], base: string, today: DateKey, tz: string, now: Date): SeedDoc[] {
  const nowMin = minutesOf(now, tz)
  const byTutor = new Map<string, { name: string; first: number; last: number }>()
  for (const d of docs) {
    if (!d.path.startsWith(`${base}/${COL.sessions}/`) || d.data.dateKey !== today || d.data.status === 'canceled') continue
    const t = byTutor.get(d.data.tutorId as string) ?? { name: d.data.tutorName as string, first: 1440, last: 0 }
    t.first = Math.min(t.first, d.data.startMin as number)
    t.last = Math.max(t.last, d.data.endMin as number)
    byTutor.set(d.data.tutorId as string, t)
  }
  const out: SeedDoc[] = []
  let i = 0
  for (const [staffId, t] of byTutor) {
    const inMin = t.first - 10 - (i++ % 3) * 5
    if (inMin > nowMin) continue
    const outMin = t.last + 10
    const closed = outMin <= nowMin
    const id = `demo-shift-${today}-${staffId.replace('demo-', '')}`
    out.push({
      path: `${base}/${COL.clockShifts}/${id}`,
      data: {
        staffId,
        staffName: t.name,
        dateKey: today,
        inMin,
        clockInAt: toInstant(today, inMin, tz),
        clockOutAt: closed ? toInstant(today, outMin, tz) : null,
        outDateKey: closed ? today : null,
        outMin: closed ? outMin : null,
        status: closed ? 'closed' : 'open',
        source: 'kiosk',
        autoClosed: false,
        autoCorrected: false,
        forcedType: null,
        note: '',
        createdAt: now,
        createdBy: 'kiosk',
        updatedAt: now,
        updatedBy: 'kiosk',
      },
    })
    if (!closed) out.push({ path: `${base}/${COL.openShifts}/${staffId}`, data: { shiftId: id, clockInAt: toInstant(today, inMin, tz) } })
  }
  return out
}

/** Fills the in-memory database with the demo center. Returns its time zone and today's date. */
export function seedDemo(now = new Date()) {
  const tz = demoTimeZone(now)
  const today = todayKey(tz, now)
  const base = `${ROOT.branches}/${DEMO_BRANCH_ID}`
  const opened = new Date(Date.parse('2025-08-01T15:00:00Z'))
  const branch = {
    ...newBranchData({ name: DEMO_BRANCH_NAME, timezone: tz, createdBy: DEMO_OWNER.email, businessRules: DEMO_BUSINESS_RULES }),
    branding: { logoUrl: DEMO_LOGO, logoPath: null, accentColor: null, sidebarTitle: null },
    contact: { email: SENDER_EMAIL, phone: '', address: '', website: APP_DOMAIN },
    settings: { schedule: { defaultWeek: { sunday: DEMO_WEEK.sunday } } },
    createdAt: opened,
    updatedAt: opened,
  }
  const docs: SeedDoc[] = [
    { path: base, data: branch },
    { path: `${base}/${COL.public}/${DOC.publicProfile}`, data: { ...publicProfileFor(branch) } },
    {
      path: `${base}/${COL.members}/${DEMO_OWNER.email}`,
      data: {
        ...newMemberData({ email: DEMO_OWNER.email, displayName: DEMO_OWNER.displayName, role: 'owner', createdBy: 'system' }),
        uid: DEMO_OWNER.uid,
        firstLoginAt: opened,
        lastLoginAt: now,
        createdAt: opened,
        updatedAt: opened,
      },
    },
    {
      path: `${base}/${COL.auditLog}/branch-created`,
      data: {
        at: opened,
        actorUid: 'system',
        actorEmail: DEMO_OWNER.email,
        actorName: DEMO_OWNER.displayName,
        actorRole: 'owner',
        action: 'branch.create',
        category: 'settings',
        entityType: 'branch',
        entityId: DEMO_BRANCH_ID,
        summary: `Created the branch ${DEMO_BRANCH_NAME}`,
        context: '',
        dateKey: null,
        studentId: null,
        studentName: null,
        tutorId: null,
        tutorName: null,
        changes: [],
        via: 'function',
      },
    },
  ]
  const sample = buildDemoData({
    branchId: DEMO_BRANCH_ID,
    timezone: tz,
    today,
    createdBy: DEMO_OWNER.email,
    now,
    maxStudentsPerTutor: DEMO_BUSINESS_RULES.maxStudentsPerTutor,
    branchName: DEMO_BRANCH_NAME,
    contact: { phone: '', email: SENDER_EMAIL, website: APP_DOMAIN, address: '' },
    week: DEMO_WEEK,
  })
  // Everyone clocks in at the kiosk with a PIN.
  for (const d of sample) if (/\/staff\/[^/]+$/.test(d.path)) d.data.hasKioskPin = true
  const shifts = todayShifts(sample, base, today, tz, now)
  docs.push(...sample, ...shifts, ...teamMembers(sample, base, now), ...announcementReads(sample, base), ...auditHistory([...sample, ...shifts], base, tz, now))
  seed(docs)
  return { timezone: tz, today }
}

/**
 * Sign-in accounts for the sample people: every employee, every enrolled
 * student's parent and a few students (Access Control lists them; the demo's
 * tutor, parent and student views sign in as three of them).
 */
function teamMembers(sample: SeedDoc[], base: string, now: Date): SeedDoc[] {
  const out: SeedDoc[] = []
  const member = (
    email: string,
    displayName: string,
    role: 'admin' | 'tutor' | 'parent' | 'student',
    ids: { staffId?: string; studentId?: string; studentIds?: string[] },
    daysAgo: number,
  ) => {
    const seen = new Date(now.getTime() - daysAgo * 86_400_000)
    out.push({
      path: `${base}/${COL.members}/${email}`,
      data: {
        ...newMemberData({ email, displayName, role, createdBy: DEMO_OWNER.email, ...ids }),
        uid: `demo-${email}`,
        firstLoginAt: new Date(Date.parse('2025-08-20T15:00:00Z')),
        lastLoginAt: seen,
        createdAt: new Date(Date.parse('2025-08-18T15:00:00Z')),
        updatedAt: seen,
      },
    })
  }
  let n = 0
  for (const d of sample) {
    if (/\/staff\/[^/]+$/.test(d.path)) {
      member(String(d.data.email), String(d.data.name), d.data.role === 'admin' ? 'admin' : 'tutor', { staffId: d.path.split('/').pop() }, n++ % 4)
    }
  }
  const students = new Map(sample.filter((d) => /\/students\/[^/]+$/.test(d.path)).map((d) => [d.path.split('/').pop()!, d.data]))
  for (const d of sample) {
    const m = d.path.match(/\/students\/([^/]+)\/private\/profile$/)
    const student = m ? students.get(m[1]) : null
    if (!m || !student || student.status !== 'enrolled') continue
    const parent = (d.data.parents as { name: string; email: string }[])[0]
    member(parent.email, parent.name, 'parent', { studentIds: [m[1]] }, n++ % 9)
    if (m[1] === AVA) {
      DEMO_PEOPLE.parent = { uid: `demo-${parent.email}`, email: parent.email, displayName: parent.name }
      member(DEMO_PEOPLE.student.email, String(student.name), 'student', { studentId: AVA }, 1)
    }
  }
  return out
}

/** Most tutors have read the posts (older posts by more of them). */
function announcementReads(sample: SeedDoc[], base: string): SeedDoc[] {
  const tutors = sample.filter((d) => /\/staff\/[^/]+$/.test(d.path) && d.data.role === 'tutor')
  const out: SeedDoc[] = []
  for (const post of sample) {
    const m = post.path.match(/\/announcements\/([^/]+)$/)
    if (!m) continue
    const at = post.data.createdAt as Date
    const ageDays = (Date.now() - at.getTime()) / 86_400_000
    const readers = tutors.slice(0, Math.min(tutors.length, Math.max(2, Math.round(ageDays * 1.2))))
    readers.forEach((t, i) => {
      const email = String(t.data.email)
      out.push({
        path: `${base}/${COL.announcements}/${m[1]}/reads/${email}`,
        data: { email, name: String(t.data.name), branchId: DEMO_BRANCH_ID, announcementId: m[1], readAt: new Date(at.getTime() + (i + 1) * 47 * 60_000) },
      })
    })
    post.data.readCount = readers.length
  }
  return out
}

/**
 * The last couple of weeks in the audit log, made from the sample data itself:
 * logs tutors submitted, clock-ins at the kiosk, posts, shared reports, new
 * students, and a few edits by the admins.
 */
function auditHistory(docs: SeedDoc[], base: string, tz: string, now: Date): SeedDoc[] {
  const out: SeedDoc[] = []
  const recent = (d: unknown, days: number): d is Date => d instanceof Date && d.getTime() <= now.getTime() && now.getTime() - d.getTime() < days * 86_400_000
  const grace = { email: 'grace.liu@example.com', name: 'Grace Liu', role: 'admin' }
  const owner = { email: DEMO_OWNER.email, name: DEMO_OWNER.displayName, role: 'owner' }
  const add = (at: Date, who: { email: string; name: string; role: string }, e: Record<string, unknown>) =>
    out.push({
      path: `${base}/${COL.auditLog}/demo-audit-${out.length}`,
      data: {
        at,
        actorUid: `demo-${who.email}`,
        actorEmail: who.email,
        actorName: who.name,
        actorRole: who.role,
        context: '',
        dateKey: null,
        studentId: null,
        studentName: null,
        tutorId: null,
        tutorName: null,
        changes: [],
        via: 'web',
        ...e,
      },
    })
  const of = (kind: string) => docs.filter((d) => d.path.startsWith(`${base}/${kind}/`) && d.path.split('/').length === 4)
  const tutorWho = (name: string) => ({ email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`, name, role: 'tutor' })

  for (const d of of(COL.sessionLogs)) {
    const at = d.data.submittedAt
    if (!recent(at, 4)) continue
    add(at, tutorWho(String(d.data.tutorName)), {
      action: 'sessionLog.submit',
      category: 'sessions',
      entityType: 'sessionLog',
      entityId: d.path.split('/').pop(),
      summary: `Submitted the session log for ${d.data.studentName}`,
      dateKey: d.data.dateKey,
      studentId: d.data.studentId,
      studentName: d.data.studentName,
      tutorId: d.data.tutorId,
      tutorName: d.data.tutorName,
      via: 'function',
    })
  }
  for (const d of of(COL.clockShifts)) {
    const name = String(d.data.staffName)
    const shift = { category: 'pay', entityType: 'shift', entityId: d.path.split('/').pop(), dateKey: d.data.dateKey, tutorId: d.data.staffId, tutorName: name, via: 'kiosk' }
    if (recent(d.data.clockInAt, 2))
      add(d.data.clockInAt as Date, tutorWho(name), { ...shift, action: 'shift.clock_in', summary: `${name} clocked in at ${formatMinutes(Number(d.data.inMin))}` })
    if (recent(d.data.clockOutAt, 2) && !d.data.autoClosed)
      add(d.data.clockOutAt as Date, tutorWho(name), { ...shift, action: 'shift.clock_out', summary: `${name} clocked out at ${formatMinutes(Number(d.data.outMin))}` })
  }
  for (const d of of(COL.announcements)) {
    if (recent(d.data.createdAt, 20))
      add(d.data.createdAt as Date, grace, {
        action: 'announcement.publish',
        category: 'announcements',
        entityType: 'announcement',
        entityId: d.path.split('/').pop(),
        summary: `Posted “${d.data.title}”`,
      })
  }
  for (const d of of(COL.progressReports)) {
    if (recent(d.data.sharedAt, 40))
      add(d.data.sharedAt as Date, grace, {
        action: 'report.share',
        category: 'sessions',
        entityType: 'progressReport',
        entityId: d.path.split('/').pop(),
        studentId: d.data.studentId,
        studentName: d.data.studentName,
        summary: `Shared ${d.data.studentName}'s progress report (${(d.data.period as { label: string }).label}) with the family`,
        via: 'function',
      })
  }
  for (const d of of(COL.students)) {
    if (d.data.status !== 'signed_up') continue
    add(toInstant(String(d.data.signUpDate), 990, tz), grace, {
      action: 'student.create',
      category: 'people',
      entityType: 'student',
      entityId: d.path.split('/').pop(),
      studentId: d.path.split('/').pop(),
      studentName: d.data.name,
      summary: `Added ${d.data.name} as a student`,
    })
  }
  // A few edits by hand.
  const upcoming = of(COL.sessions)
    .filter((d) => d.data.status === 'pending')
    .slice(0, 2)
  upcoming.forEach((d, i) => {
    const start = Number(d.data.startMin)
    add(new Date(now.getTime() - (2 + i * 23) * 3_600_000), i ? owner : grace, {
      action: 'session.update',
      category: 'schedule',
      entityType: 'session',
      entityId: d.path.split('/').pop(),
      summary: `Moved ${d.data.studentName}'s session to ${formatMinutes(start)}`,
      dateKey: d.data.dateKey,
      studentId: d.data.studentId,
      studentName: d.data.studentName,
      tutorId: d.data.tutorId,
      tutorName: d.data.tutorName,
      changes: [{ field: 'startMin', label: 'Start', from: formatMinutes(start - 30), to: formatMinutes(start) }],
    })
  })
  add(new Date(now.getTime() - 3 * 86_400_000 - 5 * 3_600_000), tutorWho('Priya Raman'), {
    action: 'availability.update',
    category: 'availability',
    entityType: 'availability',
    entityId: 'demo-priya-raman',
    tutorId: 'demo-priya-raman',
    tutorName: 'Priya Raman',
    summary: 'Changed Priya Raman’s availability for next week',
  })
  add(new Date(now.getTime() - 9 * 86_400_000), owner, {
    action: 'pay.rates',
    category: 'pay',
    entityType: 'staff',
    entityId: 'demo-daniel-kim',
    tutorId: 'demo-daniel-kim',
    tutorName: 'Daniel Kim',
    summary: 'Updated pay rates for Daniel Kim',
    changes: [{ field: 'rates.teaching', label: 'Teaching rate', from: '$34/hr', to: '$36/hr' }],
  })
  add(new Date(now.getTime() - 16 * 86_400_000), owner, {
    action: 'settings.update',
    category: 'settings',
    entityType: 'branch',
    entityId: DEMO_BRANCH_ID,
    summary: 'Changed Sunday’s hours',
    changes: [{ field: 'schedule.defaultWeek.sunday', label: 'Sunday', from: 'Closed', to: '12:00 PM – 6:00 PM' }],
  })
  return out
}
