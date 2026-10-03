import { motion, useScroll, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuArrowRight,
  LuBriefcase,
  LuCheck,
  LuChevronDown,
  LuClock,
  LuDelete,
  LuGraduationCap,
  LuHeart,
  LuLaptop,
  LuMapPin,
  LuShieldCheck,
  LuSmartphone,
  LuTablet,
  LuUserRound,
} from 'react-icons/lu'
import { COMPANY_NAME, SENDER_EMAIL } from '@shared/brand'
import { HyberLogo } from '@/components/app/HyberMark'
import { cn } from '@/lib/utils'
import type { DemoRole } from '@/demo/protocol'
import { FAQ, NAV } from './content'
import { useDemo } from './demo'
import { useClock } from './browser'
import { Reveal, Words, spotlight, useSeen } from './reveal'

// ----------------------------------------------------------------- portals

function Phone({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={cn(
        'relative aspect-[390/844] w-[15.5rem] rounded-[2.6rem] bg-[#0b0b0d] p-2 shadow-[0_40px_90px_-20px_rgb(0_0_0/0.9)] ring-1 ring-white/15 sm:w-[17rem]',
        className,
      )}
    >
      <div className="relative size-full overflow-hidden rounded-[2.1rem] bg-white">
        <img src={src} alt={alt} width={390} height={844} loading="lazy" decoding="async" className="size-full object-cover object-top" />
        <span className="absolute top-2 left-1/2 h-[1.35rem] w-[5.2rem] -translate-x-1/2 rounded-full bg-black" aria-hidden />
      </div>
    </div>
  )
}

const ROLES: { as: DemoRole; icon: IconType; title: string; text: string; points: string[] }[] = [
  {
    as: 'owner',
    icon: LuBriefcase,
    title: 'Owners & admins',
    text: 'The whole center: schedule, people, pay, reports and settings.',
    points: ['Access you control page by page', 'Every change recorded'],
  },
  {
    as: 'tutor',
    icon: LuUserRound,
    title: 'Tutors',
    text: 'Their own schedule, availability, session logs and pay.',
    points: ['Notified when sessions change', 'Logs in a few taps'],
  },
  {
    as: 'parent',
    icon: LuHeart,
    title: 'Parents',
    text: 'Upcoming sessions and progress reports for each of their children.',
    points: ['One sign-in for all children', 'Reports they can save as PDF'],
  },
  { as: 'student', icon: LuGraduationCap, title: 'Students', text: 'Their calendar and profile, on their own phone.', points: ['Never miss a session', 'Their own account'] },
]

/** "A portal for everyone": three phones fan out as the section scrolls in. */
export function Portals() {
  const { open } = useDemo()
  const stage = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: stage, offset: ['start end', 'center center'] })
  const spread = useTransform(scrollYProgress, [0.1, 1], [0, 1])
  const leftX = useTransform(spread, [0, 1], ['18%', '-58%'])
  const rightX = useTransform(spread, [0, 1], ['-18%', '58%'])
  const leftR = useTransform(spread, [0, 1], [0, -9])
  const rightR = useTransform(spread, [0, 1], [0, 9])
  const sideY = useTransform(spread, [0, 1], [60, 36])
  const midY = useTransform(spread, [0, 1], [40, 0])
  const midS = useTransform(spread, [0, 1], [0.92, 1])

  return (
    <section id="portals" className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal as="p" className="text-sm font-medium tracking-wide text-emerald-300 uppercase">
          Portals
        </Reveal>
        <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-white sm:text-6xl">
          <Words text="A portal for" accent="everyone in your center" />
        </h2>
        <Reveal as="p" delay={150} className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-white/60">
          Owners and admins run the center. Tutors, parents and students each get their own simple view, on any phone. Everyone signs in with Google and sees only what their role
          allows.
        </Reveal>
      </div>

      <div ref={stage} className="relative mx-auto mt-16 hidden h-[42rem] max-w-5xl items-start justify-center md:flex">
        <motion.div style={{ x: leftX, rotate: leftR, y: sideY }} className="absolute">
          <Phone src="/landing/phone-tutor.webp" alt="A tutor’s schedule on a phone" />
        </motion.div>
        <motion.div style={{ x: rightX, rotate: rightR, y: sideY }} className="absolute">
          <Phone src="/landing/phone-student.webp" alt="A student’s calendar on a phone" />
        </motion.div>
        <motion.div style={{ y: midY, scale: midS }} className="absolute z-10">
          <Phone src="/landing/phone-parent.webp" alt="A parent’s home page on a phone, with upcoming sessions and progress reports" />
        </motion.div>
      </div>
      <div className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-[calc(50vw-7.75rem)] pb-6 md:hidden">
        {[
          ['/landing/phone-tutor.webp', 'A tutor’s schedule on a phone'],
          ['/landing/phone-parent.webp', 'A parent’s home page on a phone'],
          ['/landing/phone-student.webp', 'A student’s calendar on a phone'],
        ].map(([src, alt]) => (
          <div key={src} className="shrink-0 snap-center">
            <Phone src={src} alt={alt} />
          </div>
        ))}
      </div>

      <div className="mx-auto mt-10 grid max-w-7xl grid-cols-1 gap-4 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {ROLES.map((r, i) => (
          <Reveal key={r.title} delay={i * 80}>
            <div onPointerMove={spotlight} className="spotlight group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
                <r.icon className="size-5 text-white" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-white">{r.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-white/60">{r.text}</p>
              <ul className="mt-4 space-y-1.5">
                {r.points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm text-white/70">
                    <LuCheck className="size-3.5 text-emerald-400" /> {p}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => open(null, r.as)} className="mt-6 flex items-center gap-1.5 self-start text-sm font-semibold text-white">
                See their view <LuArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ------------------------------------------------------------ bento cards

/** A front-desk PIN pad that clocks Maya in, over and over while it's on screen. */
function KioskLoop() {
  const [ref, seen] = useSeen<HTMLDivElement>('0px')
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!seen) return
    const id = window.setInterval(() => setStep((s) => (s + 1) % 9), 650)
    return () => window.clearInterval(id)
  }, [seen])
  const digits = Math.min(step, 4)
  const done = step >= 5
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[17rem] rounded-[1.6rem] bg-white p-5 text-neutral-900 shadow-2xl">
      <div className="text-center text-xs font-medium text-neutral-500">Hyber CRM · Time clock</div>
      <div className={cn('mt-3 flex h-16 flex-col items-center justify-center rounded-xl transition-colors duration-300', done ? 'bg-emerald-50' : 'bg-neutral-50')}>
        {done ? (
          <>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
              <LuCheck className="size-4" /> Maya Thompson
            </div>
            <div className="text-xs text-emerald-700">Clocked in at 3:52 PM</div>
          </>
        ) : (
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn('size-3 rounded-full transition-all duration-200', i < digits ? 'scale-110 bg-neutral-900' : 'bg-neutral-300')} />
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => (
          <span
            key={i}
            className={cn(
              'flex h-10 items-center justify-center rounded-xl text-base font-medium transition-colors duration-150',
              k ? 'bg-neutral-100' : '',
              k === '1' && step >= 1 && step <= 4 ? 'bg-neutral-900 text-white' : '',
            )}
          >
            {k === 'del' ? <LuDelete className="size-4 text-neutral-500" /> : k}
          </span>
        ))}
      </div>
    </div>
  )
}

const AUDIT = [
  ['Moved Ava Patel’s session to 4:30 PM', 'Schedule'],
  ['Submitted the session log for Noah Nguyen', 'Sessions'],
  ['Changed Daniel Kim’s availability', 'Availability'],
  ['Maya Thompson clocked in at 3:52 PM', 'Time clock'],
  ['Shared Mia Garcia’s progress report', 'Reports'],
  ['Updated pay rates for Lucas Ortega', 'Pay'],
  ['Added Hazel Baker as a student', 'People'],
  ['Changed Saturday’s hours', 'Settings'],
]

function AuditFeed() {
  return (
    <div className="relative h-56 overflow-hidden [mask-image:linear-gradient(transparent,#000_18%,#000_82%,transparent)]">
      <ul className="flex animate-[marquee-y_22s_linear_infinite] flex-col gap-2 pb-2">
        {[...AUDIT, ...AUDIT].map(([text, tag], i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white/80">
            <span className="truncate">{text}</span>
            <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/55">{tag}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const BRANDS = [
  { name: 'Maple Learning Center', color: '#2563eb', initial: 'M' },
  { name: 'Northstar Tutoring', color: '#059669', initial: 'N' },
  { name: 'Hyber CRM', color: '#111111', initial: 'H' },
]

function BrandSwap() {
  const [ref, seen] = useSeen<HTMLDivElement>('0px')
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!seen) return
    const id = window.setInterval(() => setI((x) => (x + 1) % BRANDS.length), 2200)
    return () => window.clearInterval(id)
  }, [seen])
  const b = BRANDS[i]
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-white text-neutral-900 shadow-2xl">
      <div className="h-1.5 transition-colors duration-700" style={{ background: b.color }} />
      <div className="flex items-center gap-3 p-4">
        <span className="flex size-10 items-center justify-center rounded-xl text-base font-semibold text-white transition-colors duration-700" style={{ background: b.color }}>
          {b.initial}
        </span>
        <div className="min-w-0">
          <div key={b.name} className="animate-rise truncate font-semibold">
            {b.name}
          </div>
          <div className="text-xs text-neutral-500">October progress report · Ava P.</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        {['Sessions 8', 'Hours 12', 'Attendance 100%'].map((t) => (
          <div key={t} className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[11px] text-neutral-600">
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}

const ZONES = [
  { place: 'Brooklyn', zone: 'America/New_York' },
  { place: 'Austin', zone: 'America/Chicago' },
  { place: 'San Diego', zone: 'America/Los_Angeles' },
]

function Clocks() {
  const now = useClock()
  return (
    <div className="grid grid-cols-3 gap-2">
      {ZONES.map((z) => (
        <div key={z.place} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-1 text-xs text-white/50">
            <LuMapPin className="size-3" /> {z.place}
          </div>
          <div className="mt-1 text-base font-semibold whitespace-nowrap text-white tabular-nums sm:text-lg lg:text-base xl:text-lg">
            {now === null ? '—' : new Intl.DateTimeFormat('en-US', { timeZone: z.zone, hour: 'numeric', minute: '2-digit' }).format(now)}
          </div>
        </div>
      ))}
    </div>
  )
}

function Rules() {
  const rows = [
    ['Pay', 'Teaching and admin rates'],
    ['Students per tutor', 'Up to 3 at once'],
    ['Parent conferences', 'Every 25 hours'],
  ]
  return (
    <div className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm">
          <span className="text-white/55">{k}</span>
          <span className="font-medium text-white">{v}</span>
        </div>
      ))}
    </div>
  )
}

function Devices() {
  return (
    <div className="flex items-end justify-center gap-4 text-white/80">
      <LuLaptop className="size-16" strokeWidth={1.2} />
      <LuTablet className="size-12" strokeWidth={1.2} />
      <LuSmartphone className="size-9" strokeWidth={1.2} />
    </div>
  )
}

function Card({ className, title, text, children }: { className?: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <Reveal className={className}>
      <div
        onPointerMove={spotlight}
        className="spotlight flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20 sm:p-7"
      >
        <div className="flex flex-1 items-center justify-center py-4">{children}</div>
        <h3 className="mt-6 text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-pretty text-white/60">{text}</p>
      </div>
    </Reveal>
  )
}

/** "Made for how centers run": the details that make it fit a real center. */
export function Bento() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal as="p" className="text-sm font-medium tracking-wide text-amber-300 uppercase">
          Made for real centers
        </Reveal>
        <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-white sm:text-6xl">
          <Words text="Set up around" accent="how you work" />
        </h2>
        <Reveal as="p" delay={150} className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-white/60">
          Your hours, your rules, your brand. Each location runs on its own clock with its own team, and everything that changes is on record.
        </Reveal>
      </div>
      <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className="lg:row-span-2"
          title="A time clock at the front desk"
          text="Put a tablet in kiosk mode. Tutors tap their PIN to clock in and out, and the hours go straight to payroll."
        >
          <KioskLoop />
        </Card>
        <Card title="Your brand on everything" text="Your logo and colors on every portal and on the reports families get.">
          <BrandSwap />
        </Card>
        <Card title="Your rules, built in" text="How tutors are paid, how many students they take at once, when parent conferences come due.">
          <div className="w-full">
            <Rules />
          </div>
        </Card>
        <Card title="Every change on record" text="Schedules, pay, people and settings: who changed what, and when. Each role reaches only its own pages.">
          <div className="w-full">
            <AuditFeed />
          </div>
        </Card>
        <Card title="Every location on its own clock" text="Each location keeps its own hours, time zone, staff and branding. Owners move between them in a click.">
          <div className="w-full">
            <Clocks />
          </div>
        </Card>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="On every device" text="Phones, tablets and computers. Install it on a home screen like an app, with nothing to download.">
          <Devices />
        </Card>
        <Card title="Sign in with Google" text="No new passwords. People sign in with the Google account their center invited.">
          <LuShieldCheck className="size-14 text-white/80" strokeWidth={1.2} />
        </Card>
        <Card title="Live on every screen" text="A change on the schedule shows on every screen right away, for everyone it concerns. No refreshing.">
          <LuClock className="size-14 text-white/80" strokeWidth={1.2} />
        </Card>
      </div>
    </section>
  )
}

// --------------------------------------------------------------------- FAQ

export function Faq() {
  return (
    <section id="faq" className="relative mx-auto grid max-w-7xl grid-cols-1 gap-12 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <Reveal as="p" className="text-sm font-medium tracking-wide text-pink-300 uppercase">
          FAQ
        </Reveal>
        <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-white sm:text-5xl">
          <Words text="Questions, answered" />
        </h2>
        <Reveal as="p" delay={120} className="mt-5 max-w-sm text-lg text-white/60">
          Anything else? Write to us at{' '}
          <a href={`mailto:${SENDER_EMAIL}`} className="font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {SENDER_EMAIL}
          </a>
          .
        </Reveal>
      </div>
      <div className="divide-y divide-white/10 border-y border-white/10">
        {FAQ.map((f, i) => (
          <Reveal key={f.q} delay={i * 40} y={12}>
            <details className="group py-1">
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-5 text-left text-lg font-medium text-white">
                {f.q}
                <LuChevronDown className="size-5 shrink-0 text-white/50 transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="pb-6 text-[15px] leading-relaxed text-pretty text-white/60">{f.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// -------------------------------------------------------------- final CTA

export function FinalCta() {
  const { open } = useDemo()
  return (
    <section className="relative mx-auto max-w-7xl px-5 pb-24 sm:px-8 sm:pb-32">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 px-6 py-20 text-center sm:px-12 sm:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_50%_0%,rgb(124_58_237/0.45),transparent_60%),radial-gradient(60%_80%_at_80%_100%,rgb(14_165_233/0.3),transparent_60%),radial-gradient(50%_80%_at_10%_100%,rgb(236_72_153/0.25),transparent_60%)]"
          />
          <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay" />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-white sm:text-6xl">
              <Words text="See your center in" accent="Hyber CRM" />
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-pretty text-white/70">Click around the live demo, then tell us about your center. We’ll set it up with you.</p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => open(null)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-semibold text-black transition hover:bg-white/90 sm:w-auto"
              >
                Open the live demo <LuArrowRight className="size-4" />
              </button>
              <a
                href="#contact"
                className="flex h-12 w-full items-center justify-center rounded-full border border-white/25 px-8 text-base font-medium text-white transition hover:bg-white/10 sm:w-auto"
              >
                Talk to us
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

// ----------------------------------------------------------------- footer

const YEAR = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 py-14 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-white text-black">
              <HyberLogo className="size-5" />
            </span>
            <span className="font-semibold text-white">Hyber CRM</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/50">The CRM for tutoring centers. A product of {COMPANY_NAME}.</p>
        </div>
        <nav className="grid grid-cols-2 gap-x-16 gap-y-3 text-sm sm:grid-cols-3" aria-label="Footer">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-white/60 transition hover:text-white">
              {n.label}
            </a>
          ))}
          <a href="#contact" className="text-white/60 transition hover:text-white">
            Contact
          </a>
          <a href="/login" className="text-white/60 transition hover:text-white">
            Sign in
          </a>
          <a href={`mailto:${SENDER_EMAIL}`} className="text-white/60 transition hover:text-white">
            Email us
          </a>
        </nav>
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 border-t border-white/5 px-5 py-6 text-xs text-white/40 sm:px-8">
        <span suppressHydrationWarning>
          © {YEAR} {COMPANY_NAME}. All rights reserved.
        </span>
        <span>hybercrm.com</span>
      </div>
    </footer>
  )
}
