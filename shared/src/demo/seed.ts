import { STAFF_COLORS } from '../colors'
import { COL, DOC } from '../paths'
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
        hasKioskPin: false,
        notificationPrefs: { announcements: true, sessionCreated: true, sessionChanged: true, sessionCanceled: true },
        profileNote: '',
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
  STUDENT_FIRST.forEach((first, i) => {
    const last = STUDENT_LAST[i % STUDENT_LAST.length]
    const id = `demo-student-${slug(`${first} ${last}`)}`
    const name = `${first} ${last}`
    const grade = String(6 + Math.floor(rand() * 7))
    const status: StudentStatus = i < 22 ? 'enrolled' : i < 25 ? 'signed_up' : 'paused'
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
        signUpDate: '2026-0' + String(1 + (i % 8)) + '-1' + String(i % 9),
        firstSessionDate: null,
        lastSessionDate: null,
        nextSessionDate: null,
        totalSessionHours: 0,
        conference: { lastCompletedAt: null, lastCompletedHours: 0, lastNoteAt: null },
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

  return docs
}
