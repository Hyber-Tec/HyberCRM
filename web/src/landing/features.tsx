import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuArrowRight,
  LuBell,
  LuBookOpenCheck,
  LuCalendarClock,
  LuCalendarDays,
  LuChartLine,
  LuCheck,
  LuClock,
  LuFingerprint,
  LuGlobe,
  LuGraduationCap,
  LuHandshake,
  LuHistory,
  LuLayers,
  LuMegaphone,
  LuMousePointer2,
  LuNotebookPen,
  LuPalette,
  LuShieldCheck,
  LuSmartphone,
  LuStar,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import type { DemoPage } from '@/demo/protocol'
import { useDemo } from './demo'
import { Reveal, Words } from './reveal'

// ---------------------------------------------------------------- marquee

const ROW_A: { icon: IconType; label: string; tint: string }[] = [
  { icon: LuCalendarClock, label: 'Drag-and-drop schedule', tint: 'text-sky-300' },
  { icon: LuUsers, label: 'Tutor availability', tint: 'text-violet-300' },
  { icon: LuFingerprint, label: 'Kiosk clock-in with PIN', tint: 'text-emerald-300' },
  { icon: LuWallet, label: 'Payroll by pay period', tint: 'text-amber-300' },
  { icon: LuNotebookPen, label: 'Session logs', tint: 'text-pink-300' },
  { icon: LuChartLine, label: 'Progress reports', tint: 'text-sky-300' },
  { icon: LuShieldCheck, label: 'Conflict detection', tint: 'text-red-300' },
  { icon: LuMegaphone, label: 'Announcements', tint: 'text-violet-300' },
]
const ROW_B: { icon: IconType; label: string; tint: string }[] = [
  { icon: LuGraduationCap, label: 'Student profiles', tint: 'text-emerald-300' },
  { icon: LuHandshake, label: 'Parent conferences', tint: 'text-amber-300' },
  { icon: LuSmartphone, label: 'Parent & student portals', tint: 'text-sky-300' },
  { icon: LuLayers, label: 'Subjects catalog', tint: 'text-pink-300' },
  { icon: LuHistory, label: 'Audit log', tint: 'text-violet-300' },
  { icon: LuPalette, label: 'Your branding', tint: 'text-emerald-300' },
  { icon: LuGlobe, label: 'Any time zone', tint: 'text-sky-300' },
  { icon: LuBell, label: 'Notifications', tint: 'text-amber-300' },
]

function MarqueeRow({ items, reverse }: { items: typeof ROW_A; reverse?: boolean }) {
  return (
    <div className="fade-x flex overflow-hidden">
      <ul className={cn('flex shrink-0 gap-3 pr-3', reverse ? 'animate-marquee-reverse' : 'animate-marquee')} aria-hidden={reverse}>
        {[...items, ...items].map((it, i) => (
          <li key={i} className="flex shrink-0 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.035] py-2 pr-4 pl-2 text-sm whitespace-nowrap text-white/80">
            <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.06]">
              <it.icon className={cn('size-4', it.tint)} />
            </span>
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Marquee() {
  return (
    <section className="relative py-16 sm:py-24" aria-label="What’s inside">
      <Reveal as="p" className="mb-8 text-center text-sm font-medium tracking-wide text-white/50 uppercase">
        Everything a tutoring center runs on, in one place
      </Reveal>
      <div className="flex flex-col gap-3">
        <MarqueeRow items={ROW_A} />
        <MarqueeRow items={ROW_B} reverse />
      </div>
    </section>
  )
}

// --------------------------------------------------------------- features

interface Feature {
  id: string
  icon: IconType
  eyebrow: string
  title: string
  body: string
  points: string[]
  shot: string
  alt: string
  page: DemoPage
  card: ReactNode
}

/** Small cards that float over the screenshot, drawn like the app's own UI. */
function SessionChip() {
  return (
    <div className="relative">
      <div className="w-56 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-left shadow-2xl shadow-sky-950/20">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-sky-950">
          Ava Patel <span className="rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-700">10</span>
        </div>
        <div className="text-xs text-sky-800">SAT Math</div>
        <div className="mt-0.5 text-xs text-sky-700/80">4:00 – 5:30 PM · Maya Thompson</div>
      </div>
      <LuMousePointer2 className="absolute -right-3 -bottom-4 size-7 fill-white text-neutral-900 drop-shadow-lg" />
    </div>
  )
}

function AccuracyChip() {
  return (
    <div className="w-60 rounded-xl border border-neutral-200 bg-white p-3.5 text-left shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        Practice accuracy <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">↗ 68% → 82%</span>
      </div>
      <svg viewBox="0 0 200 56" className="mt-2 h-14 w-full" aria-hidden>
        <defs>
          <linearGradient id="acc" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 44 L25 41 L50 40 L75 35 L100 32 L125 27 L150 25 L175 20 L200 21 L200 56 L0 56 Z" fill="url(#acc)" />
        <path d="M0 44 L25 41 L50 40 L75 35 L100 32 L125 27 L150 25 L175 20 L200 21" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function PayChip() {
  return (
    <div className="w-64 rounded-xl border border-neutral-200 bg-white p-3.5 text-left shadow-2xl shadow-black/30">
      <div className="text-xs text-neutral-500">This pay period · Maya Thompson</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-50 px-2.5 py-2">
          <div className="text-[11px] text-emerald-700">Teaching</div>
          <div className="text-sm font-semibold text-emerald-950">31.5 h</div>
        </div>
        <div className="rounded-lg bg-amber-50 px-2.5 py-2">
          <div className="text-[11px] text-amber-700">Admin</div>
          <div className="text-sm font-semibold text-amber-950">6.0 h</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-500">
        <LuClock className="size-3" /> Clocked in at the kiosk, 3:48 PM
      </div>
    </div>
  )
}

function LogChip() {
  return (
    <div className="w-60 rounded-xl border border-neutral-200 bg-white p-3.5 text-left shadow-2xl shadow-black/30">
      <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white">
          <LuCheck className="size-3.5" />
        </span>
        Session log submitted
      </div>
      <div className="mt-2.5 space-y-1.5 text-xs text-neutral-600">
        {['Effort', 'Focus', 'Confidence'].map((k, i) => (
          <div key={k} className="flex items-center justify-between">
            {k}
            <span className="flex gap-0.5 text-amber-400">
              {Array.from({ length: 5 }, (_, j) => (
                <LuStar key={j} className={cn('size-3', j < 5 - (i === 1 ? 1 : 0) ? 'fill-current' : 'text-neutral-200')} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReadChip() {
  const people = ['MT', 'DK', 'PR', 'LO', 'HB']
  const colors = ['bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-pink-100 text-pink-700', 'bg-orange-100 text-orange-700', 'bg-emerald-100 text-emerald-700']
  return (
    <div className="w-60 rounded-xl border border-neutral-200 bg-white p-3.5 text-left shadow-2xl shadow-black/30">
      <div className="text-sm font-semibold text-neutral-900">New SAT practice sets</div>
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {people.map((p, i) => (
            <span key={p} className={cn('flex size-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-white', colors[i])}>
              {p}
            </span>
          ))}
        </div>
        <span className="text-xs text-neutral-500">Read by 5 of 7</span>
      </div>
    </div>
  )
}

const FEATURES: Feature[] = [
  {
    id: 'schedule',
    icon: LuCalendarDays,
    eyebrow: 'Schedule',
    title: 'Every tutor, every session, one live board',
    body: 'Drag a session to another time or tutor, stretch it longer, copy a whole day. Each tutor has a lane for every student they can take at once, and clock-ins show right on the board.',
    points: [
      'Conflicts caught before they happen: double-booked students, tutors outside their availability, too many students at once',
      'Day, week and month views, with events and closed days',
      'Tutors see their own schedule and get notified of changes',
    ],
    shot: '/landing/shot-schedule.webp',
    alt: 'The schedule: tutors as rows, sessions as cards across the day, with a side rail of tutors and today’s numbers',
    page: 'schedule',
    card: <SessionChip />,
  },
  {
    id: 'students',
    icon: LuGraduationCap,
    eyebrow: 'Students',
    title: 'Each student’s whole story on one page',
    body: 'Sessions, attendance, homework, practice accuracy, family contacts, school grades and conference notes, with a calendar to book the next session.',
    points: ['Status keeps itself current: signed up, enrolled, paused', 'Parent conferences come due by hours tutored', 'Find any student or family in a second'],
    shot: '/landing/shot-student.webp',
    alt: 'A student’s profile: hours, attendance, homework and practice accuracy, with a chart and recent session logs',
    page: 'student',
    card: <AccuracyChip />,
  },
  {
    id: 'payroll',
    icon: LuWallet,
    eyebrow: 'Time clock & payroll',
    title: 'Clock in at the front desk. Payroll adds itself up.',
    body: 'Tutors clock in on a kiosk tablet with their PIN. Every shift is priced with each person’s rates, and teaching and admin time can pay differently, pay period by pay period.',
    points: [
      'Missed clock-outs closed for you and flagged',
      'Time entries admins can correct, with every change on record',
      'Pay rates keep their history, so past periods stay right',
    ],
    shot: '/landing/shot-payroll.webp',
    alt: 'Payroll for a pay period: hours and pay per employee, split into teaching and admin time',
    page: 'payroll',
    card: <PayChip />,
  },
  {
    id: 'logs',
    icon: LuBookOpenCheck,
    eyebrow: 'Session logs',
    title: 'Session logs tutors finish in minutes',
    body: 'A guided log after every session: topics, homework, practice questions, ratings and notes. Missing logs are flagged, and every student’s history stays in order.',
    points: ['Past logs right there while writing the next one', 'AI can turn quick notes into clear sentences', 'Logs add up into progress reports on their own'],
    shot: '/landing/shot-logs.webp',
    alt: 'The session log list: each session with its student, tutor, topics and status',
    page: 'session-log',
    card: <LogChip />,
  },
  {
    id: 'announcements',
    icon: LuMegaphone,
    eyebrow: 'Announcements',
    title: 'Tell the whole team once',
    body: 'Post updates with images and files, pin what matters, choose who sees each post and see who has read it.',
    points: ['Comments for questions', 'Categories and an archive', 'Everyone is notified in the app'],
    shot: '/landing/shot-announcements.webp',
    alt: 'Announcements: pinned and recent posts with categories, audience and read counts',
    page: 'announcements',
    card: <ReadChip />,
  },
]

function Shot({ src, alt, className, eager }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-white/15 bg-white/[0.06] p-1 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)]', className)}>
      <div className="overflow-hidden rounded-[9px] bg-white">
        <div className="flex h-6 items-center gap-1 border-b border-neutral-200 bg-neutral-50 px-2.5" aria-hidden>
          <span className="size-2 rounded-full bg-neutral-300" />
          <span className="size-2 rounded-full bg-neutral-300" />
          <span className="size-2 rounded-full bg-neutral-300" />
        </div>
        <img src={src} alt={alt} width={1280} height={800} loading={eager ? 'eager' : 'lazy'} decoding="async" className="block aspect-[16/10] w-full object-cover object-top" />
      </div>
    </div>
  )
}

function FeatureText({ f, n, active }: { f: Feature; n: number; active: boolean }) {
  const { open } = useDemo()
  return (
    <div className={cn('transition-opacity duration-500', active ? 'opacity-100' : 'lg:opacity-35')}>
      <div className="flex items-center gap-3 text-sm font-medium text-white/60">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
          <f.icon className="size-[18px] text-white" />
        </span>
        <span className="tabular-nums">0{n}</span>
        <span className="h-px w-8 bg-white/20" />
        {f.eyebrow}
      </div>
      <h3 className="mt-5 text-3xl leading-tight font-semibold tracking-[-0.03em] text-balance text-white sm:text-4xl">{f.title}</h3>
      <p className="mt-4 text-lg leading-relaxed text-pretty text-white/60">{f.body}</p>
      <ul className="mt-6 space-y-3">
        {f.points.map((p) => (
          <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-white/75">
            <LuCheck className="mt-1 size-4 shrink-0 text-emerald-400" />
            {p}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => open(f.page)} className="group mt-7 flex items-center gap-2 text-sm font-semibold text-white">
        Open it in the live demo
        <LuArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  )
}

/**
 * Five chapters, one screen: on computers the screenshot stays put while the
 * text scrolls past it and changes with the chapter in the middle of the view.
 */
export function Features() {
  const section = useRef<HTMLElement>(null)
  const steps = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: section, offset: ['start 60%', 'end 60%'] })
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step))
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const el of steps.current) if (el) io.observe(el)
    return () => io.disconnect()
  }, [])

  const f = FEATURES[active]
  return (
    <section id="features" ref={section} className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal as="p" className="text-sm font-medium tracking-wide text-sky-300 uppercase">
          Built around the schedule
        </Reveal>
        <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-white sm:text-6xl">
          <Words text="One app for the way" accent="your center runs" />
        </h2>
        <Reveal as="p" delay={150} className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-white/60">
          Tutoring center software that connects the schedule to the time clock, payroll, session logs and the reports families get, so nothing is typed twice.
        </Reveal>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-16 lg:mt-28 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div className="relative">
          <div className="absolute top-0 bottom-0 -left-6 hidden w-px bg-white/10 lg:block" aria-hidden>
            <motion.div className="h-full w-full origin-top bg-gradient-to-b from-sky-400 via-violet-400 to-pink-400" style={{ scaleY: progress }} />
          </div>
          {FEATURES.map((ft, i) => (
            <div
              key={ft.id}
              ref={(el) => {
                steps.current[i] = el
              }}
              data-step={i}
              className="flex flex-col justify-center py-10 lg:min-h-[78vh] lg:py-0"
            >
              <Reveal>
                <FeatureText f={ft} n={i + 1} active={i === active} />
              </Reveal>
              <Reveal className="mt-10 lg:hidden">
                <Shot src={ft.shot} alt={ft.alt} />
              </Reveal>
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-[calc(50vh-17rem)]">
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-[radial-gradient(50%_50%_at_50%_50%,rgb(56_189_248/0.18),transparent_70%)] blur-2xl"
              />
              <div className="relative aspect-[16/10.6]">
                {FEATURES.map((ft, i) => (
                  <div
                    key={ft.id}
                    className={cn(
                      'absolute inset-0 transition-all duration-700 ease-[cubic-bezier(.2,.7,.2,1)]',
                      i === active ? 'translate-y-0 scale-100 opacity-100' : i < active ? '-translate-y-6 scale-[0.97] opacity-0' : 'translate-y-6 scale-[0.97] opacity-0',
                    )}
                    aria-hidden={i !== active}
                  >
                    <Shot src={ft.shot} alt={ft.alt} eager={i === 0} />
                  </div>
                ))}
              </div>
              <div className="pointer-events-none absolute -bottom-10 -left-12 z-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, y: 24, scale: 0.92, rotate: -3 }}
                    animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, y: -12, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  >
                    <div className="animate-float">{f.card}</div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
