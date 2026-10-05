import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import type { LogContent } from './logs'
import { cleanLogContent, logSubmitWrites } from './submit'

const NOW = 'now'
const content: LogContent = {
  sessionType: 'SAT',
  topics: ['Math > Algebra > Linear functions'],
  topicCovered: 'ignored for SAT',
  homeworkStatus: 'Completed',
  homeworkComments: '',
  materials: [
    { label: ' Bluebook test 3 ', url: '', type: 'text' },
    { label: '  ', url: '', type: 'text' },
  ],
  questionsAttempted: 20,
  questionsWrong: 5,
  lessonActivity: 'Timed set',
  learningInsight: 'Rushes',
  nextFocus: 'Word problems',
  homeworkGiven: 'Set 4',
  ratings: { effort: 5, motivation: 4, behavior: 5, focus: 4, confidence: 4 },
  studentFlag: 'on_track',
}
const session = {
  tutorId: 'maya',
  tutorName: 'Maya Thompson',
  studentId: 'ava',
  studentName: 'Ava Patel',
  subject: 'SAT Math',
  subjectId: 'sat-math',
  note: '',
  dateKey: '2026-10-05',
  startMin: 960,
  endMin: 1070,
  startAt: 's',
  endAt: 'e',
}
const tutor = { email: 'maya@example.com', name: 'Maya Thompson', asAdmin: false }
const actor = { uid: 'u1', email: 'maya@example.com', name: 'Maya Thompson', role: 'tutor' }
const input = (extra: Partial<Parameters<typeof logSubmitWrites<string>>[0]> = {}) =>
  logSubmitWrites<string>({
    sessionId: 's1',
    session,
    content: cleanLogContent(content),
    ai: { sessionSummary: '', homeworkAssigned: '', nextSessionPlan: '', riskAlert: '', provider: 'local_fallback' },
    prev: null,
    student: { status: 'signed_up', statusSource: 'auto', firstSessionDate: null, lastSessionDate: '2026-10-01' },
    settings: DEFAULT_SETTINGS,
    author: tutor,
    auditActor: actor,
    now: NOW,
    ...extra,
  })

describe('submitting a session log', () => {
  it('cleans the content as the server stores it', () => {
    const c = cleanLogContent(content)
    expect(c.topicCovered).toBe('Math > Algebra > Linear functions')
    expect(c.materials).toEqual([{ label: 'Bluebook test 3', url: '', type: 'text' }])
  })

  it('first submit: credits the tutor, bills the hours, marks Present and enrolls the student', () => {
    const w = input()
    expect(w.usedHours).toBe(2)
    expect(w.log).toMatchObject({ status: 'submitted', submittedAt: NOW, accuracyPercent: 75, usedHours: 2, enteredByAdmin: null, editCount: 0, createdAt: NOW, createdBy: 'maya@example.com', lastEditedBy: null })
    expect(w.log.enteredBy).toEqual({ role: 'tutor', email: 'maya@example.com', name: 'Maya Thompson', at: NOW })
    expect(w.sessionPatch).toEqual({ status: 'present', logStatus: 'submitted', logSubmittedAt: NOW, attendanceMarkedBy: 'session_log', updatedAt: NOW, updatedBy: 'maya@example.com' })
    expect(w.hoursDelta).toBe(2)
    expect(w.studentPatch).toEqual({ updatedAt: NOW, lastSessionDate: '2026-10-05', firstSessionDate: '2026-10-05', status: 'enrolled', statusSource: 'auto' })
    expect(w.audit).toMatchObject({ action: 'sessionLog.submit', summary: 'Submitted the session log for Ava Patel', actorUid: 'u1', actorRole: 'tutor', at: NOW, changes: [] })
  })

  it('a planned submit time is used for the log, not for the stamps', () => {
    const w = input({ submittedAt: 'earlier' })
    expect(w.log).toMatchObject({ submittedAt: 'earlier', createdAt: NOW, updatedAt: NOW })
    expect((w.log.enteredBy as { at: string }).at).toBe('earlier')
    expect(w.sessionPatch.logSubmittedAt).toBe('earlier')
    expect(w.audit.at).toBe(NOW)
  })

  it('an edit keeps the first author and submit time, records changes and bills the difference', () => {
    const prev = { status: 'submitted', usedHours: 1.5, submittedAt: 'first', enteredBy: { role: 'tutor', email: 'maya@example.com' }, enteredByAdmin: null, editCount: 2, ...cleanLogContent(content), lessonActivity: 'Old' }
    const w = input({ prev, author: { email: 'grace@example.com', name: 'Grace Liu', asAdmin: true }, auditActor: { ...actor, role: 'admin' } })
    expect(w.log).toMatchObject({ submittedAt: 'first', enteredBy: prev.enteredBy, enteredByAdmin: null, editCount: 3, updatedBy: 'grace@example.com' })
    expect(w.log).not.toHaveProperty('createdAt')
    expect(w.log.lastEditedBy).toEqual({ email: 'grace@example.com', name: 'Grace Liu', at: NOW })
    expect(w.hoursDelta).toBe(0.5)
    expect(w.audit).toMatchObject({ action: 'sessionLog.edit', summary: 'Updated the session log for Ava Patel' })
    expect(w.audit.changes).toEqual([{ field: 'lessonActivity', label: 'Lesson activity', from: null, to: 'edited' }])
  })

  it('an admin’s first submit is entered on behalf of the tutor', () => {
    const w = input({ author: { email: 'grace@example.com', name: 'Grace Liu', asAdmin: true } })
    expect(w.log.enteredByAdmin).toEqual({ email: 'grace@example.com', name: 'Grace Liu' })
    expect((w.log.enteredBy as { role: string }).role).toBe('admin')
    expect(w.audit.summary).toBe('Submitted the session log for Ava Patel on behalf of Maya Thompson')
  })

  it('leaves a hand-set status and a missing student alone', () => {
    expect(input({ student: { status: 'paused', statusSource: 'manual', lastSessionDate: '2026-10-09', firstSessionDate: '2026-01-01' } }).studentPatch).toEqual({ updatedAt: NOW })
    const none = input({ student: null })
    expect(none.studentPatch).toBeNull()
    expect(none.hoursDelta).toBe(0)
  })
})
