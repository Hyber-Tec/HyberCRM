import { APP_DOMAIN, SENDER_EMAIL } from '@shared/brand'
import { buildDemoData } from '@shared/demo/seed'
import type { ProgressReportDoc } from '@shared/reports/types'
import { todayKey } from '@shared/time'

/** A Firestore-like timestamp for dates in the sample (the report reads `.toDate()`). */
const stamp = (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0, toDate: () => d, toMillis: () => d.getTime() })

function withStamps(v: unknown): unknown {
  if (v instanceof Date) return stamp(v)
  if (Array.isArray(v)) return v.map(withStamps)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withStamps(x)]))
  return v
}

/**
 * The sample center's latest progress report (Ava Patel, last month), made by
 * the same code as the demo, dated from the visitor's today.
 */
export function sampleReport(): { report: ProgressReportDoc; timezone: string } {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  const docs = buildDemoData({
    branchId: 'hyber',
    timezone,
    today: todayKey(timezone),
    createdBy: 'alex.morgan@example.com',
    branchName: 'Hyber CRM',
    contact: { phone: '', email: SENDER_EMAIL, website: APP_DOMAIN, address: '' },
  })
  const doc = docs.find((d) => d.path.endsWith('/progressReports/demo-r-ava-patel'))!
  return { report: withStamps(doc.data) as ProgressReportDoc, timezone }
}
