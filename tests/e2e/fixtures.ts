import { dateKeyOf, dayEndInstant, minutesOf, toInstant, weekdayOf } from '../../shared/src/time'

const TZ = 'America/New_York'
// Computed once per run, so the seed and later updates describe the same session.
const start = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 300_000) * 300_000)
const dateKey = dateKeyOf(start, TZ)
const startMin = Math.min(minutesOf(start, TZ), 1380)
const endMin = Math.min(startMin + 50, 1435)

/** A confirmed session for Maya about two hours from now (inside the 24-hour notification window). */
export function soonSession(status: 'confirmed' | 'canceled') {
  const now = new Date()
  return {
    path: 'sessions/e2e-soon-session',
    data: {
      tutorId: 'demo-maya-thompson', tutorName: 'Maya Thompson', studentId: 'demo-student-noah-nguyen', studentName: 'Noah Nguyen', studentGrade: '9',
      subjectId: null, subject: 'Geometry', note: '', status, dateKey, weekday: weekdayOf(dateKey), startMin, endMin,
      startAt: toInstant(dateKey, startMin, TZ), endAt: toInstant(dateKey, endMin, TZ), dayEndAt: dayEndInstant(dateKey, TZ), visualOrder: 0,
      logStatus: 'none', logSubmittedAt: null, noShowAppliedHours: null, confirmedAt: null, confirmedBy: null, source: 'seed', isDeleted: false,
      deletedAt: null, deletedBy: null, createdAt: now, createdBy: 'e2e', updatedAt: now, updatedBy: 'e2e',
    },
  }
}
