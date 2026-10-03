import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './app'
import { pinHash } from './pins'
import { deliverSessionNotices, snapshotOf } from './sessionNotify'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { dayHours } from '@shared/availability'
import { COL, ROOT, availabilityDocId } from '@shared/paths'
import { type ConflictSession, sessionConflicts, staffTutorState } from '@shared/schedule/conflicts'
import { resolveBusinessRules } from '@shared/settings/businessRules'
import { sessionCreatedNotices } from '@shared/schedule/notify'
import { resolveSettings } from '@shared/settings/resolve'
import type { BranchSettings } from '@shared/settings/defaults'
import { addDays, dateKeyOf, formatMinutes, minutesOf, parseHHMM, toInstant, todayKey } from '@shared/time'
import type { Availability, Branch, DayConfig, Member, Session, StaffStatus, StudentStatus } from '@shared/types'


// ------------------------------------------------------------------ helpers

interface Caller {
  uid: string
  email: string
  name: string
  superAdmin: boolean
}

async function requireAdmin(branchId: string, auth: { uid: string; token: Record<string, unknown> } | undefined): Promise<Caller> {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const email = (auth.token.email as string).toLowerCase()
  const [platform, member] = await Promise.all([
    db.doc(`${ROOT.platformAdmins}/${email}`).get(),
    db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get(),
  ])
  const m = member.data()
  const isAdmin = !!m && m.status === 'active' && (m.role === 'owner' || m.role === 'admin')
  if (!platform.exists && !isAdmin) throw new HttpsError('permission-denied', 'Only branch admins can do this.')
  return { uid: auth.uid, email, name: (m?.displayName as string) || (auth.token.name as string) || email, superAdmin: platform.exists }
}

async function loadBranch(branchId: string): Promise<{ branch: Branch; settings: BranchSettings }> {
  const snap = await db.doc(`${ROOT.branches}/${branchId}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Branch not found.')
  const branch = snap.data() as Branch
  return { branch, settings: resolveSettings(branch.settings) }
}

function audit(branchId: string, entry: Record<string, unknown>) {
  return db.collection(`${ROOT.branches}/${branchId}/${COL.auditLog}`).add({
    at: FieldValue.serverTimestamp(),
    actorUid: 'system',
    actorEmail: 'system',
    actorName: 'System',
    actorRole: 'system',
    context: '',
    dateKey: null,
    studentId: null,
    studentName: null,
    tutorId: null,
    tutorName: null,
    changes: [],
    via: 'function',
    ...entry,
  })
}

// ------------------------------------------------------------------- kiosk

/** Admin sets (or clears) an employee's kiosk PIN. PINs are unique per branch. */
export const setKioskPin = onCall(async (req) => {
  const { branchId, staffId, pin } = (req.data ?? {}) as { branchId?: string; staffId?: string; pin?: string | null }
  if (!branchId || !staffId) throw new HttpsError('invalid-argument', 'Missing branch or employee.')
  const caller = await requireAdmin(branchId, req.auth)
  const { settings } = await loadBranch(branchId)
  const staffRef = db.doc(`${ROOT.branches}/${branchId}/${COL.staff}/${staffId}`)
  const ownerRef = db.doc(`${ROOT.branches}/${branchId}/kioskPinOwners/${staffId}`)
  const len = settings.timeClock.kiosk.pinLength
  if (pin != null && !new RegExp(`^\\d{${len}}$`).test(pin)) throw new HttpsError('invalid-argument', `The PIN must be ${len} digits.`)
  await db.runTransaction(async (tx) => {
    const [staff, owner] = await Promise.all([tx.get(staffRef), tx.get(ownerRef)])
    if (!staff.exists) throw new HttpsError('not-found', 'Employee not found.')
    const oldHash = owner.data()?.pinHash as string | undefined
    if (pin != null) {
      const hash = pinHash(branchId, pin)
      const existing = await tx.get(db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${hash}`))
      if (existing.exists && existing.data()?.staffId !== staffId) throw new HttpsError('already-exists', 'That PIN is already in use. Choose a different one.')
      if (oldHash && oldHash !== hash) tx.delete(db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${oldHash}`))
      tx.set(db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${hash}`), { staffId, updatedAt: FieldValue.serverTimestamp() })
      tx.set(ownerRef, { pinHash: hash, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.email })
      tx.update(staffRef, { hasKioskPin: true, updatedAt: FieldValue.serverTimestamp() })
    } else {
      if (oldHash) tx.delete(db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${oldHash}`))
      tx.delete(ownerRef)
      tx.update(staffRef, { hasKioskPin: false, updatedAt: FieldValue.serverTimestamp() })
    }
  })
  await audit(branchId, {
    actorUid: caller.uid,
    actorEmail: caller.email,
    actorName: caller.name,
    actorRole: caller.superAdmin ? 'super_admin' : 'admin',
    via: 'web',
    action: pin != null ? 'kiosk.pin_set' : 'kiosk.pin_clear',
    category: 'pay',
    entityType: 'staff',
    entityId: staffId,
    tutorId: staffId,
    summary: pin != null ? 'Set a kiosk PIN' : 'Removed a kiosk PIN',
  })
  return { ok: true }
})

async function staffForPin(branchId: string, pin: string) {
  if (!/^\d{3,8}$/.test(pin ?? '')) throw new HttpsError('invalid-argument', 'Enter your PIN.')
  const pinDoc = await db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${pinHash(branchId, pin)}`).get()
  if (!pinDoc.exists) throw new HttpsError('not-found', 'PIN not found. Try again.')
  const staffId = pinDoc.data()!.staffId as string
  const staff = await db.doc(`${ROOT.branches}/${branchId}/${COL.staff}/${staffId}`).get()
  if (!staff.exists || staff.data()!.status === 'finished') throw new HttpsError('failed-precondition', 'This employee can’t clock in. Please see an admin.')
  return { staffId, name: staff.data()!.name as string }
}

/** Kiosk step 1: who is this, and are they clocked in? */
export const kioskIdentify = onCall(async (req) => {
  const { branchId, pin } = (req.data ?? {}) as { branchId?: string; pin?: string }
  if (!branchId) throw new HttpsError('invalid-argument', 'Missing branch.')
  await requireAdmin(branchId, req.auth)
  const { staffId, name } = await staffForPin(branchId, pin ?? '')
  const open = await db.doc(`${ROOT.branches}/${branchId}/${COL.openShifts}/${staffId}`).get()
  return { staffId, name, openSince: open.exists ? (open.data()!.clockInAt as Timestamp).toMillis() : null }
})

/** Kiosk step 2: clock in, or clock out of the open shift. Server time only. */
export const kioskPunch = onCall(async (req) => {
  const { branchId, pin } = (req.data ?? {}) as { branchId?: string; pin?: string }
  if (!branchId) throw new HttpsError('invalid-argument', 'Missing branch.')
  const caller = await requireAdmin(branchId, req.auth)
  const { branch } = await loadBranch(branchId)
  const tz = branch.timezone
  const { staffId, name } = await staffForPin(branchId, pin ?? '')
  const openRef = db.doc(`${ROOT.branches}/${branchId}/${COL.openShifts}/${staffId}`)
  const now = Timestamp.now()
  const result = await db.runTransaction(async (tx) => {
    const open = await tx.get(openRef)
    if (open.exists) {
      const shiftId = open.data()!.shiftId as string
      const shiftRef = db.doc(`${ROOT.branches}/${branchId}/${COL.clockShifts}/${shiftId}`)
      const shift = await tx.get(shiftRef)
      const clockInAt = shift.data()?.clockInAt as Timestamp | undefined
      tx.update(shiftRef, {
        clockOutAt: now,
        outDateKey: dateKeyOf(now.toDate(), tz),
        outMin: minutesOf(now.toDate(), tz),
        status: 'closed',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: `kiosk:${caller.email}`,
      })
      tx.delete(openRef)
      return { action: 'out' as const, clockInAt: clockInAt?.toMillis() ?? null, clockOutAt: now.toMillis(), shiftId }
    }
    const shiftRef = db.collection(`${ROOT.branches}/${branchId}/${COL.clockShifts}`).doc()
    tx.set(shiftRef, {
      staffId,
      staffName: name,
      dateKey: dateKeyOf(now.toDate(), tz),
      inMin: minutesOf(now.toDate(), tz),
      clockInAt: now,
      clockOutAt: null,
      outDateKey: null,
      outMin: null,
      status: 'open',
      source: 'kiosk',
      autoClosed: false,
      autoCorrected: false,
      forcedType: null,
      note: '',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: `kiosk:${caller.email}`,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: `kiosk:${caller.email}`,
    })
    tx.set(openRef, { shiftId: shiftRef.id, clockInAt: now })
    return { action: 'in' as const, clockInAt: now.toMillis(), clockOutAt: null, shiftId: shiftRef.id }
  })
  await audit(branchId, {
    action: result.action === 'in' ? 'shift.clock_in' : 'shift.clock_out',
    category: 'pay',
    entityType: 'shift',
    entityId: result.shiftId,
    tutorId: staffId,
    tutorName: name,
    dateKey: dateKeyOf(now.toDate(), tz),
    via: 'kiosk',
    summary: `${name} clocked ${result.action} at ${formatMinutes(minutesOf(now.toDate(), tz))}`,
  })
  return { ...result, name }
})

// ---------------------------------------------------------------- schedules

/** Closes shifts still open after each branch's local cut-off (default midnight). */
export const autoClockOut = onSchedule({ schedule: 'every 15 minutes', timeZone: 'UTC' }, async () => {
  const branches = await db.collection(ROOT.branches).where('status', '==', 'active').get()
  const now = Date.now()
  for (const b of branches.docs) {
    const branch = b.data() as Branch
    const settings = resolveSettings(branch.settings)
    if (!settings.timeClock.autoClockOut.enabled) continue
    const cutoffMin = parseHHMM(settings.timeClock.autoClockOut.localTime)
    if (Number.isNaN(cutoffMin)) continue
    const open = await db.collection(`${ROOT.branches}/${b.id}/${COL.openShifts}`).get()
    for (const o of open.docs) {
      const shiftRef = db.doc(`${ROOT.branches}/${b.id}/${COL.clockShifts}/${o.data().shiftId}`)
      const shift = await shiftRef.get()
      if (!shift.exists) {
        await o.ref.delete()
        continue
      }
      const s = shift.data()!
      const cutoffDate = cutoffMin > (s.inMin as number) ? (s.dateKey as string) : addDays(s.dateKey as string, 1)
      const cutoff = toInstant(cutoffDate, cutoffMin, branch.timezone)
      if (now < cutoff.getTime()) continue
      const batch = db.batch()
      batch.update(shiftRef, {
        clockOutAt: Timestamp.fromDate(cutoff),
        outDateKey: cutoffDate,
        outMin: cutoffMin,
        status: 'closed',
        autoClosed: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'system',
      })
      batch.delete(o.ref)
      await batch.commit()
      await audit(b.id, {
        action: 'shift.auto_clock_out',
        category: 'pay',
        entityType: 'shift',
        entityId: shiftRef.id,
        tutorId: s.staffId,
        tutorName: s.staffName,
        dateKey: s.dateKey,
        summary: `${s.staffName} was clocked out automatically at ${formatMinutes(cutoffMin)}`,
      })
    }
  }
})

/**
 * Whether a session may not happen as booked (the same check the schedules show:
 * tutor unavailable or inactive, day closed, outside hours, too many students,
 * student double-booked or inactive).
 */
async function inConflict(branchId: string, id: string, data: FirebaseFirestore.DocumentData, settings: BranchSettings, branch: Branch | undefined) {
  const base = `${ROOT.branches}/${branchId}`
  const [cfg, avail, staff, student, day, members] = await Promise.all([
    db.doc(`${base}/${COL.dayConfigs}/${data.dateKey}`).get(),
    db.doc(`${base}/${COL.availability}/${availabilityDocId(data.tutorId, data.dateKey)}`).get(),
    db.doc(`${base}/${COL.staff}/${data.tutorId}`).get(),
    db.doc(`${base}/${COL.students}/${data.studentId}`).get(),
    db.collection(`${base}/${COL.sessions}`).where('dateKey', '==', data.dateKey).get(),
    db.collection(`${base}/${COL.members}`).where('staffId', '==', data.tutorId).get(),
  ])
  const a = avail.data() as Availability | undefined
  const sessions = day.docs.map((d) => ({ id: d.id, ...(d.data() as Session) })).filter((s) => !s.isDeleted)
  const memberActive = members.empty ? null : members.docs.some((m) => (m.data() as Member).status === 'active')
  const conflicts = sessionConflicts({ id, ...data } as ConflictSession, {
    hours: dayHours(data.dateKey, settings, cfg.exists ? new Map([[data.dateKey as string, cfg.data() as DayConfig]]) : null),
    availability: a ? { ranges: a.ranges, unavailable: a.unavailable } : null,
    tutorState: staffTutorState(staff.exists ? (staff.data()?.status as StaffStatus) : null, memberActive),
    studentStatus: student.exists ? ((student.data()?.status as StudentStatus) ?? null) : null,
    tutorSessions: sessions.filter((s) => s.tutorId === data.tutorId),
    studentSessions: sessions.filter((s) => s.studentId === data.studentId),
    maxPerTutor: resolveBusinessRules(branch?.businessRules).maxStudentsPerTutor,
  })
  return conflicts.length > 0
}

async function confirmIfDue(
  branchId: string,
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData,
  settings: BranchSettings,
  branch: Branch | undefined,
) {
  const ac = settings.schedule.autoConfirm
  if (!ac.enabled || data.status !== 'pending' || data.isDeleted) return false
  const start = (data.startAt as Timestamp).toMillis()
  const now = Date.now()
  if (start <= now || start > now + ac.hoursBefore * 3_600_000) return false
  // A session in conflict stays Pending until an admin moves, reassigns or cancels it.
  if (await inConflict(branchId, ref.id, data, settings, branch)) return false
  await ref.update({ status: 'confirmed', confirmedAt: FieldValue.serverTimestamp(), confirmedBy: 'auto', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system' })
  await audit(branchId, {
    action: 'session.status',
    category: 'schedule',
    entityType: 'session',
    entityId: ref.id,
    dateKey: data.dateKey,
    studentId: data.studentId,
    studentName: data.studentName,
    tutorId: data.tutorId,
    tutorName: data.tutorName,
    summary: `Confirmed ${data.studentName}’s session automatically`,
    changes: [{ field: 'status', label: 'Status', from: 'Pending', to: 'Confirmed' }],
  })
  return true
}

/** Pending sessions are confirmed automatically shortly before they start (default 24 h). */
export const autoConfirmSessions = onSchedule({ schedule: 'every 60 minutes', timeZone: 'UTC' }, async () => {
  const now = Timestamp.now()
  const horizon = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 3_600_000)
  const snap = await db.collectionGroup(COL.sessions).where('status', '==', 'pending').where('startAt', '>', now).where('startAt', '<=', horizon).get()
  const cache = new Map<string, { settings: BranchSettings; branch: Branch | undefined }>()
  for (const d of snap.docs) {
    const branchId = d.ref.parent.parent?.id
    if (!branchId) continue
    if (!cache.has(branchId)) {
      const b = await db.doc(`${ROOT.branches}/${branchId}`).get()
      const data = b.data() as Branch | undefined
      cache.set(branchId, { branch: data, settings: resolveSettings(data?.status === 'active' ? data.settings : { schedule: { autoConfirm: { enabled: false } } }) })
    }
    const { settings, branch } = cache.get(branchId)!
    await confirmIfDue(branchId, d.ref, d.data(), settings, branch)
  }
})

/**
 * A session created inside the auto-confirm window is confirmed right away;
 * if it is confirmed and starts inside the notification window, the tutor
 * gets "Session Confirmed" in their inbox.
 */
export const onSessionCreated = onDocumentCreated(`${ROOT.branches}/{branchId}/${COL.sessions}/{sessionId}`, async (event) => {
  const snap = event.data
  if (!snap) return
  const { branchId, sessionId } = event.params
  const { branch, settings } = await loadBranch(branchId)
  const data = snap.data()
  const confirmed = (await confirmIfDue(branchId, snap.ref, data, settings, branch)) || data.status === 'confirmed'
  if (!confirmed || branch.status !== 'active') return
  const notices = sessionCreatedNotices(
    { ...snapshotOf(data), status: 'confirmed' },
    { now: Date.now(), today: todayKey(branch.timezone), windowHours: settings.notifications.sessionChangeWindowHours },
  )
  await deliverSessionNotices(branchId, sessionId, notices, `sess-${sessionId}-created`)
})

export { onLoggedSessionUpdated, onSessionLogWritten, sessionAi, sessionLogContext, submitSessionLog } from './sessions'
export { generateProgressReport, onReportViewed, regenerateReportSection, shareProgressReport } from './reports'
export { onAnnouncementComment, onAnnouncementRead, onAnnouncementWritten } from './announcements'
export { seedDemoData } from './platform'
export { onSessionUpdated } from './sessionNotify'
export { purgeExpired, studentLifecycleDaily } from './jobs'
export { onMemberWritten, resendInvite } from './invites'
export { submitInquiry } from './inquiries'
