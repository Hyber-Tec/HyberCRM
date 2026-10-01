import { dayStartInstant } from '../availability'
import { STAFF_COLORS } from '../colors'
import { COL, DOC, availabilityDocId } from '../paths'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { businessRoundedHours } from '../schedule/hours'
import { localLogAi, type LogContent } from '../sessions/logs'
import { ACT_TOPICS, SAT_PSAT_TOPICS } from '../sessions/topics'
import { addDays, dayEndInstant, toInstant, weekdayOf } from '../time'
import type { StaffRole, StudentStatus } from '../types'

/**
 * Sample data for a demo branch (Demo Academy). Everything is fictional; emails use
 * example.com. IDs are deterministic, so running the seed again overwrites instead
 * of duplicating. Writers (web client or the REST script) convert `Date` values to
 * Firestore Timestamps.
 */

export interface SeedDoc {
  /** Full document path, e.g. `branches/demo-academy/staff/demo-maya-thompson`. */
  path: string
  data: Record<string, unknown>
}

export interface SeedOptions {
  branchId: string
  timezone: string
  /** Today's date in the branch zone (YYYY-MM-DD). */
  today: string
  createdBy: string
  now?: Date
}

/** Small deterministic PRNG so the sample data is stable between runs. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const DEMO_SUBJECTS: Record<string, string[]> = {
  'Test Prep': ['SAT Math', 'SAT Reading & Writing', 'PSAT', 'ACT Math', 'ACT English', 'ACT Science'],
  Math: ['Pre-Algebra', 'Algebra 1', 'Geometry', 'Algebra 2', 'Pre-Calculus', 'AP Calculus AB', 'AP Statistics'],
  English: ['Reading Comprehension', 'Essay Writing', 'Grammar'],
  Science: ['Biology', 'Chemistry', 'Physics'],
  Other: ['Homework Help', 'Study Skills'],
}


interface DemoStaff {
  first: string
  last: string
  roles: StaffRole[]
  subjects: string[]
  teaching: number
  admin: number
}

const DEMO_STAFF: DemoStaff[] = [
  { first: 'Maya', last: 'Thompson', roles: ['tutor'], subjects: ['SAT Math', 'PSAT', 'Algebra 2', 'Pre-Calculus', 'AP Calculus AB'], teaching: 38, admin: 20 },
  { first: 'Daniel', last: 'Kim', roles: ['tutor'], subjects: ['SAT Reading & Writing', 'ACT English', 'Essay Writing', 'Reading Comprehension'], teaching: 36, admin: 20 },
  { first: 'Priya', last: 'Raman', roles: ['tutor'], subjects: ['Biology', 'Chemistry', 'ACT Science', 'Homework Help'], teaching: 35, admin: 19 },
  { first: 'Lucas', last: 'Ortega', roles: ['tutor'], subjects: ['Algebra 1', 'Geometry', 'Pre-Algebra', 'ACT Math', 'Physics'], teaching: 32, admin: 18 },
  { first: 'Hannah', last: 'Becker', roles: ['tutor'], subjects: ['SAT Math', 'SAT Reading & Writing', 'PSAT', 'Study Skills'], teaching: 34, admin: 19 },
  { first: 'Ethan', last: 'Brooks', roles: ['tutor'], subjects: ['AP Statistics', 'Algebra 2', 'Geometry', 'Homework Help'], teaching: 30, admin: 18 },
  { first: 'Sofia', last: 'Alvarez', roles: ['tutor'], subjects: ['Grammar', 'Essay Writing', 'Reading Comprehension', 'Study Skills'], teaching: 31, admin: 18 },
  { first: 'Grace', last: 'Liu', roles: ['admin'], subjects: [], teaching: 24, admin: 24 },
]

const STUDENT_FIRST = [
  'Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Owen', 'Chloe', 'Leo', 'Ella', 'Mason', 'Aria', 'Caleb', 'Nora', 'Isaac',
  'Lily', 'Henry', 'Ruby', 'Jack', 'Stella', 'Wyatt', 'Hazel', 'Julian', 'Ivy', 'Miles', 'Layla', 'Eli', 'Clara', 'Theo',
]
const STUDENT_LAST = [
  'Patel', 'Nguyen', 'Garcia', 'Johnson', 'Lee', 'Martinez', 'Chen', 'Wilson', 'Davis', 'Lopez', 'Park', 'Clark',
  'Lewis', 'Walker', 'Young', 'Hall', 'Allen', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill',
  'Rivera', 'Campbell', 'Mitchell', 'Roberts',
]
const SCHOOLS = ['Northfield High School', 'Lakeside Middle School', 'Riverside Academy', 'Westbrook High School', 'Oak Hill Prep']
const PARENT_FIRST = ['Jennifer', 'Michael', 'Sarah', 'David', 'Laura', 'James', 'Emily', 'Robert', 'Anna', 'Kevin']

/** Demo kiosk PINs for the fictional staff (staff ID → PIN). */
export const DEMO_KIOSK_PINS: Record<string, string> = Object.fromEntries(DEMO_STAFF.map((st, i) => [demoStaffId(st.first, st.last), String(i + 1).repeat(4)]))

export function demoStaffId(first: string, last: string) {
  return `demo-${slug(`${first} ${last}`)}`
}

export function buildDemoData(opts: SeedOptions): SeedDoc[] {
  const { branchId, createdBy } = opts
  const now = opts.now ?? new Date()
  const rand = rng(20260930)
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]
  const base = `branches/${branchId}`
  const stamp = { createdAt: now, createdBy, updatedAt: now, updatedBy: createdBy }
  const docs: SeedDoc[] = []

  // Subjects -------------------------------------------------------------
  const subjectIdByName = new Map<string, string>()
  Object.entries(DEMO_SUBJECTS).forEach(([category, names], ci) => {
    const categoryId = `demo-${slug(category)}`
    docs.push({ path: `${base}/${COL.subjectCategories}/${categoryId}`, data: { name: category, order: ci } })
    names.forEach((name, si) => {
      const id = `demo-${slug(name)}`
      subjectIdByName.set(name, id)
      docs.push({
        path: `${base}/${COL.subjects}/${id}`,
        data: { name, categoryId, order: si, ...stamp },
      })
    })
  })

  // Staff ----------------------------------------------------------------
  DEMO_STAFF.forEach((s, i) => {
    const id = demoStaffId(s.first, s.last)
    const name = `${s.first} ${s.last}`
    docs.push({
      path: `${base}/${COL.staff}/${id}`,
      data: {
        firstName: s.first,
        lastName: s.last,
        name,
        nameLower: name.toLowerCase(),
        email: `${slug(s.first)}.${slug(s.last)}@example.com`,
        phone: `(555) 01${String(10 + i).padStart(2, '0')}-${String(1000 + i * 37).slice(0, 4)}`,
        roles: s.roles,
        status: 'active',
        subjectIds: s.subjects.map((n) => subjectIdByName.get(n)).filter(Boolean),
        color: STAFF_COLORS[i % STAFF_COLORS.length],
        startDate: '2025-08-15',
        endDate: null,
        dob: null,
        address: '',
        hasKioskPin: false,
        notificationPrefs: { announcements: true, sessionCreated: true, sessionChanged: true, sessionCanceled: true },
        ...stamp,
      },
    })
    docs.push({
      path: `${base}/${COL.staff}/${id}/private/${DOC.compensation}`,
      data: {
        rates: { teaching: s.teaching, admin: s.admin },
        payModel: 'branch_default',
        history: [
          { effectiveFrom: '2025-08-15', rates: { teaching: s.teaching, admin: s.admin }, setAt: now.toISOString(), setBy: createdBy },
        ],
        updatedAt: now,
        updatedBy: createdBy,
      },
    })
  })

  // Students -------------------------------------------------------------
  const subjectNames = [...subjectIdByName.keys()]
  // Hours from before the generated two weeks, so a few students are due a conference.
  const priorHours = new Map<string, number>()
  STUDENT_FIRST.forEach((first, i) => {
    const last = STUDENT_LAST[i % STUDENT_LAST.length]
    const id = `demo-student-${slug(`${first} ${last}`)}`
    const name = `${first} ${last}`
    const grade = String(6 + Math.floor(rand() * 7))
    const status: StudentStatus = i < 22 ? 'enrolled' : i < 25 ? 'signed_up' : 'paused'
    if (status === 'enrolled' && i % 5 === 1) priorHours.set(id, 22 + (i % 3) * 2)
    const subjects = [pick(subjectNames), pick(subjectNames)].filter((v, idx, arr) => arr.indexOf(v) === idx)
    const parentFirst = pick(PARENT_FIRST)
    docs.push({
      path: `${base}/${COL.students}/${id}`,
      data: {
        firstName: first,
        lastName: last,
        name,
        nameLower: name.toLowerCase(),
        grade,
        school: pick(SCHOOLS),
        status,
        statusSource: 'auto',
        subjectIds: subjects.map((n) => subjectIdByName.get(n)),
        learningNote: '',
        // The last few sign-ups are recent and not yet followed up (Home card).
        signUpDate: status === 'signed_up' ? addDays(opts.today, -(i - 21)) : '2026-0' + String(1 + (i % 8)) + '-1' + String(i % 9),
        firstSessionDate: null,
        lastSessionDate: null,
        nextSessionDate: null,
        totalSessionHours: 0,
        conference: { baselineHours: 0, lastNoteDate: null, lastResetAt: null },
        schoolRecord: { courses: {}, gradeSnapshots: [], plan: '' },
        followUpReviewedAt: status === 'signed_up' ? null : now,
        ...stamp,
      },
    })
    docs.push({
      path: `${base}/${COL.students}/${id}/private/${DOC.privateProfile}`,
      data: {
        email: '',
        phone: '',
        dob: null,
        address: '',
        parents: [
          {
            name: `${parentFirst} ${last}`,
            email: `${slug(parentFirst)}.${slug(last)}@example.com`,
            phone: `(555) 02${String(10 + (i % 80)).padStart(2, '0')}-${String(2000 + i * 53).slice(0, 4)}`,
            relation: rand() < 0.5 ? 'Mother' : 'Father',
          },
        ],
        schoolLogin: '',
        adminNote: '',
        customFields: {},
      },
    })
  })

  // Availability: 2 weeks back to 6 weeks ahead, on open days ---------------
  const week = DEFAULT_SETTINGS.schedule.defaultWeek
  const patterns: { startMin: number; endMin: number }[][] = [
    [{ startMin: 840, endMin: 1260 }],
    [{ startMin: 900, endMin: 1200 }],
    [{ startMin: 840, endMin: 1080 }],
    [{ startMin: 960, endMin: 1260 }],
    [
      { startMin: 840, endMin: 990 },
      { startMin: 1080, endMin: 1260 },
    ],
  ]
  DEMO_STAFF.forEach((st, i) => {
    if (!st.roles.includes('tutor')) return
    const staffId = demoStaffId(st.first, st.last)
    const dayRand = rng(1000 + i)
    for (let offset = -14; offset <= 42; offset++) {
      const dateKey = addDays(opts.today, offset)
      const wd = weekdayOf(dateKey)
      const hours = week[wd]
      if (!hours.isOpen) continue
      const r = dayRand()
      if (r < 0.18) continue // day off
      const ranges =
        wd === 'saturday'
          ? r < 0.6
            ? []
            : [{ startMin: hours.openMin, endMin: hours.closeMin }]
          : patterns[Math.floor(dayRand() * patterns.length)]
      if (!ranges.length) continue
      docs.push({
        path: `${base}/${COL.availability}/${availabilityDocId(staffId, dateKey)}`,
        data: {
          staffId,
          dateKey,
          weekday: wd,
          ranges,
          unavailable: false,
          hidden: false,
          dayStartAt: dayStartInstant(dateKey, opts.timezone),
          updatedVia: 'admin',
          updatedAt: now,
          updatedBy: createdBy,
        },
      })
    }
  })

  // Sessions: 2 weeks back to 3 weeks ahead, inside each tutor's availability --
  const studentList = STUDENT_FIRST.map((first, i) => {
    const last = STUDENT_LAST[i % STUDENT_LAST.length]
    const doc = docs.find((d) => d.path === `${base}/${COL.students}/demo-student-${slug(`${first} ${last}`)}`)!
    return { id: doc.path.split('/').pop()!, name: `${first} ${last}`, grade: String(doc.data.grade), status: String(doc.data.status) }
  }).filter((st) => st.status === 'enrolled')
  const subjectByIdName = new Map([...subjectIdByName.entries()].map(([n, id]) => [id, n]))
  const stats = new Map<string, { hours: number; first: string | null; last: string | null; next: string | null }>()
  const sessRand = rng(4242)
  const availDocs = docs.filter((d) => d.path.includes(`/${COL.availability}/`))
  const lengths = [110, 110, 110, 80, 50]
  for (const a of availDocs) {
    const staffId = a.data.staffId as string
    const dateKey = a.data.dateKey as string
    const offset = Math.round((Date.parse(dateKey) - Date.parse(opts.today)) / 86_400_000)
    if (offset > 21) continue
    const st = DEMO_STAFF.find((x) => demoStaffId(x.first, x.last) === staffId)!
    const ranges = a.data.ranges as { startMin: number; endMin: number }[]
    const count = Math.floor(sessRand() * 4)
    const laneEnds = [0, 0, 0]
    for (let n = 0; n < count; n++) {
      const r = ranges[Math.floor(sessRand() * ranges.length)]
      const len = lengths[Math.floor(sessRand() * lengths.length)]
      const latest = r.endMin - len
      if (latest < r.startMin) continue
      const startMin = r.startMin + Math.floor((sessRand() * (latest - r.startMin)) / 30) * 30
      const endMin = startMin + len
      const lane = laneEnds.findIndex((e) => e <= startMin)
      if (lane === -1) continue
      laneEnds[lane] = endMin
      const student = studentList[Math.floor(sessRand() * studentList.length)]
      const subjectName = st.subjects[Math.floor(sessRand() * st.subjects.length)] ?? 'Homework Help'
      const roll = sessRand()
      let status: string
      let logStatus = 'none'
      if (offset < 0) {
        status = roll < 0.08 ? 'no_show' : roll < 0.12 ? 'canceled' : 'present'
        if (status === 'present') logStatus = roll < 0.85 ? 'submitted' : 'none'
        if (status === 'present' && logStatus === 'none') status = 'confirmed'
      } else if (offset <= 1) status = roll < 0.06 ? 'canceled' : 'confirmed'
      else status = roll < 0.05 ? 'canceled' : 'pending'
      const id = `demo-s-${dateKey}-${staffId.replace('demo-', '')}-${n}`
      docs.push({
        path: `${base}/${COL.sessions}/${id}`,
        data: {
          tutorId: staffId,
          tutorName: `${st.first} ${st.last}`,
          studentId: student.id,
          studentName: student.name,
          studentGrade: student.grade,
          subjectId: subjectIdByName.get(subjectName) ?? null,
          subject: subjectName,
          note: sessRand() < 0.12 ? 'Bring last week’s practice test' : '',
          status,
          dateKey,
          weekday: weekdayOf(dateKey),
          startMin,
          endMin,
          startAt: toInstant(dateKey, startMin, opts.timezone),
          endAt: toInstant(dateKey, endMin, opts.timezone),
          dayEndAt: dayEndInstant(dateKey, opts.timezone),
          visualOrder: 0,
          logStatus,
          logSubmittedAt: logStatus === 'submitted' ? toInstant(dateKey, endMin + 15, opts.timezone) : null,
          noShowAppliedHours: status === 'no_show' ? businessRoundedHours(len) : null,
          confirmedAt: null,
          confirmedBy: null,
          source: 'seed',
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          createdAt: now,
          createdBy,
          updatedAt: now,
          updatedBy: createdBy,
        },
      })
      const stat = stats.get(student.id) ?? { hours: 0, first: null, last: null, next: null }
      if (offset < 0 && (status === 'present' || status === 'no_show' || logStatus === 'submitted')) {
        stat.hours += businessRoundedHours(len)
        stat.first = !stat.first || dateKey < stat.first ? dateKey : stat.first
        stat.last = !stat.last || dateKey > stat.last ? dateKey : stat.last
      }
      if (offset >= 0 && status !== 'canceled') stat.next = !stat.next || dateKey < stat.next ? dateKey : stat.next
      stats.set(student.id, stat)
      void subjectByIdName
    }
  }
  for (const d of docs) {
    if (!d.path.includes(`/${COL.students}/`) || d.path.includes('/private/')) continue
    const id = d.path.split('/').pop()!
    const prior = priorHours.get(id) ?? 0
    const stat = stats.get(id)
    if (!stat) {
      d.data.totalSessionHours = prior
      continue
    }
    d.data.totalSessionHours = Math.round((stat.hours + prior) * 100) / 100
    d.data.firstSessionDate = stat.first
    d.data.lastSessionDate = stat.last
    d.data.nextSessionDate = stat.next
  }

  // Session logs for the sessions whose log was submitted ------------------
  const logRand = rng(9090)
  const lp = <T,>(arr: readonly T[]) => arr[Math.floor(logRand() * arr.length)]
  const activities = [
    'Reviewed last week’s homework, then worked through a timed practice set',
    'Introduced the new unit with worked examples and guided practice',
    'Focused on error analysis from the practice test and redid missed questions',
    'Built fluency with mixed review problems and short quizzes',
  ]
  const insights = [
    'Understands the core concepts but rushes on multi-step problems',
    'Strong on fundamentals; needs more practice applying them to word problems',
    'Confidence is growing; still hesitant to show full work',
    'Made clear progress since last session and asked good questions',
  ]
  const focusNext = ['Timed practice on the weakest topic', 'Review mistakes and start the next unit', 'Mixed review before the upcoming test', 'Word problems and showing full work']
  const homeworkGiven = ['Practice set 3 (20 questions)', 'Finish the worksheet and review the notes', 'Two timed sections and an error log', 'Textbook problems 1–25 (odd)']
  for (const d of [...docs]) {
    if (!d.path.includes(`/${COL.sessions}/`) || d.data.logStatus !== 'submitted') continue
    const sd = d.data
    const subj = String(sd.subject)
    const sessionType = /PSAT/.test(subj) ? 'PSAT' : /SAT/.test(subj) ? 'SAT' : /ACT/.test(subj) ? 'ACT' : lp(['School Help', 'Skill Building', 'Homework Support'])
    let topics: string[] = []
    if (sessionType === 'SAT' || sessionType === 'PSAT') {
      const section = /Reading|Writing/.test(subj) ? 'Reading & Writing' : 'Math'
      const domain = lp(Object.keys(SAT_PSAT_TOPICS[section]))
      topics = [`${section} > ${domain} > ${lp(SAT_PSAT_TOPICS[section][domain])}`]
    } else if (sessionType === 'ACT') {
      const sub = /English/.test(subj) ? 'English' : /Science/.test(subj) ? 'Science' : 'Math'
      topics = [`${sub} > ${lp(ACT_TOPICS[sub])}`]
    }
    const attempted = 10 + Math.floor(logRand() * 21)
    const wrong = Math.floor(logRand() * Math.min(10, attempted))
    const score = 3 + Math.floor(logRand() * 3)
    const ratings = { effort: Math.min(5, score + (logRand() < 0.3 ? 1 : 0)), motivation: score, behavior: Math.min(5, score + 1), focus: Math.max(2, score - (logRand() < 0.3 ? 1 : 0)), confidence: score }
    const avg = Object.values(ratings).reduce((a, b) => a + b, 0) / 5
    const content: LogContent = {
      sessionType,
      topics,
      topicCovered: topics.length ? topics.join('; ') : `${subj} review`,
      homeworkStatus: lp(['Completed', 'Completed', 'Completed', 'Partially Done', 'Not Done', 'Not Assigned']),
      homeworkComments: '',
      materials: [{ label: lp(['Official practice test', 'Workbook chapter review', 'Class notes', 'Khan Academy unit quiz']), url: '', type: 'text' }],
      questionsAttempted: attempted,
      questionsWrong: wrong,
      lessonActivity: lp(activities),
      learningInsight: lp(insights),
      nextFocus: lp(focusNext),
      homeworkGiven: lp(homeworkGiven),
      ratings,
      studentFlag: avg >= 3.8 ? 'on_track' : avg >= 3 ? 'needs_attention' : 'at_risk',
    }
    const id = d.path.split('/').pop()!
    docs.push({
      path: `${base}/${COL.sessionLogs}/${id}`,
      data: {
        sessionId: id,
        ...content,
        accuracyPercent: Math.round(((attempted - wrong) / attempted) * 100),
        status: 'submitted',
        submittedAt: sd.logSubmittedAt,
        tutorId: sd.tutorId,
        tutorName: sd.tutorName,
        studentId: sd.studentId,
        studentName: sd.studentName,
        subject: subj,
        dateKey: sd.dateKey,
        startMin: sd.startMin,
        endMin: sd.endMin,
        startAt: sd.startAt,
        endAt: sd.endAt,
        usedHours: businessRoundedHours((sd.endMin as number) - (sd.startMin as number)),
        ai: localLogAi(content, subj),
        enteredByAdmin: null,
        createdAt: now,
        createdBy: 'seed',
        updatedAt: now,
        updatedBy: 'seed',
      },
    })
  }

  // Clock shifts for past days: clocked in a bit before the first session and
  // out a bit after the last one (admin time around teaching time).
  const shiftRand = rng(777)
  const byTutorDay = new Map<string, { startMin: number; endMin: number; tutorName: string }[]>()
  for (const d of docs) {
    if (!d.path.includes(`/${COL.sessions}/`)) continue
    const data = d.data
    if (data.status === 'canceled' || (data.dateKey as string) >= opts.today) continue
    const key = `${data.tutorId}|${data.dateKey}`
    byTutorDay.set(key, [...(byTutorDay.get(key) ?? []), { startMin: data.startMin as number, endMin: data.endMin as number, tutorName: data.tutorName as string }])
  }
  for (const [key, list] of byTutorDay) {
    const [staffId, dateKey] = key.split('|')
    const inMin = Math.min(...list.map((x) => x.startMin)) - 10 - Math.floor(shiftRand() * 4) * 5
    const outMin = Math.max(...list.map((x) => x.endMin)) + 5 + Math.floor(shiftRand() * 6) * 5
    const clockInAt = toInstant(dateKey, inMin, opts.timezone)
    const clockOutAt = toInstant(dateKey, outMin, opts.timezone)
    docs.push({
      path: `${base}/${COL.clockShifts}/demo-shift-${dateKey}-${staffId.replace('demo-', '')}`,
      data: {
        staffId,
        staffName: list[0].tutorName,
        dateKey,
        inMin,
        clockInAt,
        clockOutAt,
        outDateKey: dateKey,
        outMin,
        status: 'closed',
        source: 'kiosk',
        autoClosed: false,
        autoCorrected: false,
        forcedType: null,
        note: '',
        createdAt: now,
        createdBy: 'seed',
        updatedAt: now,
        updatedBy: 'seed',
      },
    })
  }

  // One shift yesterday was closed by the automatic clock-out (Home "needs attention").
  const yesterday = addDays(opts.today, -1)
  const autoShift = docs.find((d) => d.path.includes(`/${COL.clockShifts}/demo-shift-${yesterday}-`))
  if (autoShift) {
    autoShift.data.outDateKey = opts.today
    autoShift.data.outMin = 0
    autoShift.data.clockOutAt = toInstant(opts.today, 0, opts.timezone)
    autoShift.data.autoClosed = true
    autoShift.data.note = 'Closed automatically at 12:00 AM'
  }

  // Announcements ----------------------------------------------------------
  const daysAgo = (n: number, minutes = 600) => toInstant(addDays(opts.today, -n), minutes, opts.timezone)
  const post = (id: string, n: number, data: Record<string, unknown>) =>
    docs.push({
      path: `${base}/${COL.announcements}/${id}`,
      data: {
        category: 'General',
        audienceType: 'all',
        audienceKeys: [],
        commentsEnabled: false,
        pinned: false,
        pinnedAt: null,
        archived: false,
        notifyRequestedAt: null,
        attachments: [],
        authorKey: 'grace.liu@example.com',
        authorName: 'Grace Liu',
        readCount: 0,
        commentCount: 0,
        createdAt: daysAgo(n),
        createdBy,
        updatedAt: daysAgo(n),
        updatedBy: createdBy,
        ...data,
      },
    })
  post('demo-a-welcome', 12, {
    title: 'Welcome to the new Demo Academy portal',
    contentHtml:
      '<p>Hi everyone! This is where schedule changes, policies and news will be posted from now on.</p><ul><li>Check <strong>Schedule</strong> for your sessions.</li><li>Keep your <strong>Availability</strong> up to date at least two weeks ahead.</li><li>Submit each <strong>session log</strong> on the day of the session.</li></ul><p>Questions? Leave a comment below.</p>',
    contentText:
      'Hi everyone! This is where schedule changes, policies and news will be posted from now on. Check Schedule for your sessions. Keep your Availability up to date at least two weeks ahead. Submit each session log on the day of the session. Questions? Leave a comment below.',
    pinned: true,
    pinnedAt: daysAgo(12),
    commentsEnabled: true,
    commentCount: 1,
  })
  docs.push({
    path: `${base}/${COL.announcements}/demo-a-welcome/comments/demo-c-1`,
    data: { authorKey: 'maya.thompson@example.com', authorName: 'Maya Thompson', authorRole: 'tutor', text: 'Looks great — thank you!', createdAt: daysAgo(11, 900) },
  })
  post('demo-a-sat', 5, {
    title: 'New SAT practice sets are ready',
    category: 'Updates',
    contentHtml: '<p>Four new full-length SAT practice sets are in the shared folder. Please use <em>Set 3</em> with students who test next month.</p>',
    contentText: 'Four new full-length SAT practice sets are in the shared folder. Please use Set 3 with students who test next month.',
  })
  post('demo-a-closure', 1, {
    title: 'Closed next Saturday for building maintenance',
    contentHtml: '<p>The center is closed next Saturday. Sessions on that day have been moved; check your schedule for the new times.</p>',
    contentText: 'The center is closed next Saturday. Sessions on that day have been moved; check your schedule for the new times.',
  })

  // Events ---------------------------------------------------------------
  const evt = (id: string, data: Record<string, unknown>) =>
    docs.push({ path: `${base}/${COL.events}/${id}`, data: { notes: '', googleSync: null, createdAt: now, createdBy, updatedAt: now, updatedBy: createdBy, ...data } })
  const nextWeekday = (w: string, from: number) => {
    for (let o = from; o < from + 7; o++) if (weekdayOf(addDays(opts.today, o)) === w) return addDays(opts.today, o)
    return opts.today
  }
  evt('demo-e-staff-meeting', {
    title: 'Staff Meeting',
    dateKey: nextWeekday('monday', -14),
    startMin: 840,
    endMin: 870,
    notes: 'Weekly check-in for all tutors.',
    isRecurring: true,
    recurrence: { frequency: 'weekly', interval: 1, weekdays: ['monday'], monthDay: null, ends: { type: 'never', endDate: null, occurrences: null } },
  })
  evt('demo-e-consult-1', { title: 'Consultation - Mia (12)', dateKey: nextWeekday('wednesday', 0), startMin: 900, endMin: 960, isRecurring: false, recurrence: null })
  evt('demo-e-consult-2', { title: 'Parent Meeting - Leo (9)', dateKey: nextWeekday('thursday', 0), startMin: 1080, endMin: 1110, isRecurring: false, recurrence: null })
  evt('demo-e-followup', { title: 'Follow-up - Isaac (10)', dateKey: nextWeekday('tuesday', 0), startMin: 960, endMin: 990, isRecurring: false, recurrence: null })
  evt('demo-e-payments', {
    title: 'Payment Reminder',
    dateKey: addDays(opts.today, -Number(opts.today.slice(8)) + 1),
    startMin: 840,
    endMin: 900,
    isRecurring: true,
    recurrence: { frequency: 'monthly', interval: 1, weekdays: [], monthDay: 1, ends: { type: 'never', endDate: null, occurrences: null } },
  })

  return docs
}
