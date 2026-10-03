/**
 * "Talk to us" requests from the landing page: what a center tells us, checked
 * the same way in the page and in the function that stores it.
 */

export const INQUIRY_STUDENTS = ['Under 50', '50–150', '150–300', 'Over 300'] as const
export const INQUIRY_LOCATIONS = ['1', '2–3', '4 or more'] as const

export interface InquiryInput {
  name: string
  email: string
  center: string
  phone: string
  students: (typeof INQUIRY_STUDENTS)[number] | ''
  locations: (typeof INQUIRY_LOCATIONS)[number] | ''
  message: string
}

const LIMITS: Record<keyof InquiryInput, number> = { name: 100, email: 200, center: 120, phone: 40, students: 20, locations: 20, message: 2000 }

/** What's wrong with the request, in words for the visitor (null: nothing). */
export function inquiryError(i: InquiryInput): string | null {
  if (!i.name.trim()) return 'Please tell us your name.'
  if (!i.email.trim()) return 'Please enter your email so we can reply.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(i.email.trim())) return 'That email doesn’t look right.'
  for (const [k, max] of Object.entries(LIMITS) as [keyof InquiryInput, number][]) if (i[k].length > max) return 'One of the fields is too long.'
  if (i.students && !INQUIRY_STUDENTS.includes(i.students)) return 'Choose how many students you have.'
  if (i.locations && !INQUIRY_LOCATIONS.includes(i.locations)) return 'Choose how many locations you have.'
  return null
}

/** A request body as sent by the page → a clean input (strings only, trimmed), or what's wrong. */
export function readInquiry(body: unknown): InquiryInput | { error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const s = (k: keyof InquiryInput) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '')
  const input: InquiryInput = {
    name: s('name'),
    email: s('email').toLowerCase(),
    center: s('center'),
    phone: s('phone'),
    students: s('students') as InquiryInput['students'],
    locations: s('locations') as InquiryInput['locations'],
    message: s('message'),
  }
  const error = inquiryError(input)
  return error ? { error } : input
}

/** `inquiries/{id}`: written by the submitInquiry function, handled by the Super Admin. */
export interface Inquiry extends InquiryInput {
  status: 'new' | 'handled'
  createdAt: { toDate(): Date; toMillis(): number } | null
  /** Hash of the sender's address (to spot repeats; never the address itself). */
  from: string
  userAgent: string
  /** The email to HyberTec. */
  notify: { status: 'sent' | 'not_configured' | 'failed'; error: string | null } | null
  handledAt?: { toDate(): Date } | null
  handledBy?: string | null
}
