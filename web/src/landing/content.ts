import { APP_URL, COMPANY_NAME, PRODUCT_NAME, SENDER_EMAIL } from '@shared/brand'

/**
 * The landing page's words in one place: the page renders them and the
 * prerender step turns the same FAQ and description into search-engine data,
 * so the two never disagree.
 */

export const SITE = {
  title: `${PRODUCT_NAME} — CRM and Scheduling Software for Tutoring Centers`,
  description:
    'Hyber CRM is the all-in-one CRM for tutoring centers: drag-and-drop scheduling, tutor time clock and payroll, session logs, progress reports, and portals for tutors, parents and students. Try the live demo.',
  url: `${APP_URL}/`,
  image: `${APP_URL}/og.png`,
  company: COMPANY_NAME,
  email: SENDER_EMAIL,
}

export const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'Live demo', href: '#demo' },
  { label: 'Reports', href: '#reports' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
] as const

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Who is Hyber CRM for?',
    a: 'Tutoring and learning centers of any size: test prep, school subjects, homework help. It runs one location or several, each with its own hours, staff, subjects and branding.',
  },
  {
    q: 'How much does it cost?',
    a: 'It depends on the size of your center: how many students and tutors you have and how many locations you run. Tell us about your center and we’ll send you a quote.',
  },
  {
    q: 'Can I try it first?',
    a: 'Yes. The live demo on this page is the real app with sample data: drag sessions, open student profiles, run payroll, clock in at the kiosk. Nothing you do there is saved. When you’re ready, we set up your own center.',
  },
  {
    q: 'Do parents and students get their own access?',
    a: 'Yes. Owners and admins see everything, tutors get their own schedule, availability, session logs and pay, parents see progress reports and upcoming sessions, and students see their calendar. Everyone signs in with Google or their own email and password, and only sees what their role allows.',
  },
  {
    q: 'How do tutors clock in and get paid?',
    a: 'Put a tablet at the front desk in kiosk mode and tutors clock in and out with a personal PIN. Hyber CRM prices every shift with each tutor’s rates (teaching time and admin time can pay differently) and totals each pay period. Admins can correct entries, and every change is recorded.',
  },
  {
    q: 'Does it work on phones and tablets?',
    a: 'Yes. Hyber CRM runs in any modern browser on phones, tablets and computers, and can be installed on a home screen like an app. There’s nothing to download.',
  },
  {
    q: 'Is our data secure?',
    a: 'Hyber CRM runs on Google Cloud. People sign in with Google or an email and password whose address is confirmed first, each role only reaches its own pages and data, and every change to schedules, pay, people and settings is written to an audit log.',
  },
  {
    q: 'How do we get started?',
    a: 'Send us a note about your center. We’ll talk through how you work today, set up your center (hours, subjects, staff, branding) and help you invite your team.',
  },
]
