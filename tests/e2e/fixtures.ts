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

/** A weekday a few days out where Maya has a booked session but no availability: a conflict. */
export function conflictFixture() {
  const d = new Date(Date.now() + 4 * 86_400_000)
  while ([0, 6].includes(new Date(`${dateKeyOf(d, TZ)}T12:00:00Z`).getUTCDay())) d.setTime(d.getTime() + 86_400_000)
  const day = dateKeyOf(d, TZ)
  const now = new Date()
  const [s, e] = [15 * 60, 16 * 60]
  return {
    dateKey: day,
    writes: [
      {
        path: 'sessions/e2e-conflict-session',
        data: {
          tutorId: 'demo-maya-thompson', tutorName: 'Maya Thompson', studentId: 'demo-student-noah-nguyen', studentName: 'Noah Nguyen', studentGrade: '9',
          subjectId: null, subject: 'E2E Conflict Check', note: '', status: 'pending', dateKey: day, weekday: weekdayOf(day), startMin: s, endMin: e,
          startAt: toInstant(day, s, TZ), endAt: toInstant(day, e, TZ), dayEndAt: dayEndInstant(day, TZ), visualOrder: 0,
          logStatus: 'none', logSubmittedAt: null, noShowAppliedHours: null, confirmedAt: null, confirmedBy: null, source: 'seed', isDeleted: false,
          deletedAt: null, deletedBy: null, createdAt: now, createdBy: 'e2e', updatedAt: now, updatedBy: 'e2e',
        },
      },
      {
        path: `availability/demo-maya-thompson_${day}`,
        data: {
          staffId: 'demo-maya-thompson', dateKey: day, weekday: weekdayOf(day), ranges: [], unavailable: true, hidden: false,
          dayStartAt: toInstant(day, 0, TZ), updatedVia: 'tutor', updatedAt: now, updatedBy: 'e2e',
        },
      },
    ],
  }
}
