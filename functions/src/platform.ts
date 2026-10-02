import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db } from './app'
import { pinHash } from './pins'
import { DEMO_KIOSK_PINS, buildDemoData } from '@shared/demo/seed'
import { type BusinessRules, resolveBusinessRules } from '@shared/settings/businessRules'
import { COL, ROOT } from '@shared/paths'
import { isValidTimeZone, todayKey } from '@shared/time'

/**
 * Super Admin → "Add sample data": writes the Demo Academy data set into a
 * branch with the Admin SDK (it contains submitted logs, counters and
 * comments that clients may not write), plus the demo kiosk PINs.
 */
export const seedDemoData = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const token = req.auth?.token
  if (!token || typeof token.email !== 'string' || token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  const email = token.email.toLowerCase()
  if (!(await db.doc(`${ROOT.platformAdmins}/${email}`).get()).exists) throw new HttpsError('permission-denied', 'Only the Super Admin can add sample data.')

  const branchId = String((req.data as { branchId?: unknown } | undefined)?.branchId ?? '')
  const branch = branchId ? await db.doc(`${ROOT.branches}/${branchId}`).get() : null
  if (!branch?.exists) throw new HttpsError('not-found', 'Branch not found.')
  const tz = String(branch.get('timezone') ?? '')
  const timezone = isValidTimeZone(tz) ? tz : 'America/New_York'

  const now = new Date()
  const rules = resolveBusinessRules(branch.get('businessRules') as Partial<BusinessRules> | undefined)
  const docs = buildDemoData({ branchId, timezone, today: todayKey(timezone), createdBy: email, now, maxStudentsPerTutor: rules.maxStudentsPerTutor })
  const base = `${ROOT.branches}/${branchId}`
  for (const [staffId, pin] of Object.entries(DEMO_KIOSK_PINS)) {
    const hash = pinHash(branchId, pin)
    docs.push({ path: `${base}/${COL.kioskPins}/${hash}`, data: { staffId, updatedAt: now } })
    docs.push({ path: `${base}/kioskPinOwners/${staffId}`, data: { pinHash: hash, updatedAt: now, updatedBy: email } })
    const staff = docs.find((d) => d.path === `${base}/${COL.staff}/${staffId}`)
    if (staff) staff.data.hasKioskPin = true
  }

  // The branch's own subjects (possibly renamed or reordered) stay as they are: only missing ones are added.
  const catalogPaths = new Set(
    (await Promise.all([db.collection(`${base}/${COL.subjects}`).listDocuments(), db.collection(`${base}/${COL.subjectCategories}`).listDocuments()]))
      .flat()
      .map((r) => r.path),
  )
  const writer = db.bulkWriter()
  for (const d of docs) if (!catalogPaths.has(d.path)) void writer.set(db.doc(d.path), d.data)
  await writer.close()
  await db.collection(`${base}/${COL.auditLog}`).add({
    at: FieldValue.serverTimestamp(),
    actorUid: req.auth!.uid,
    actorEmail: email,
    actorName: (token.name as string | undefined) ?? email,
    actorRole: 'super_admin',
    action: 'branch.sample_data',
    category: 'settings',
    entityType: 'branch',
    entityId: branchId,
    summary: `Added sample data (${docs.length} documents)`,
    context: '',
    dateKey: null,
    studentId: null,
    studentName: null,
    tutorId: null,
    tutorName: null,
    changes: [],
    via: 'function',
  })
  return { count: docs.length }
})
