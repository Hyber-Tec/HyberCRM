import { type MotionValue, motion, useScroll, useSpring, useTransform } from 'motion/react'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import { LuBatteryFull, LuChartNoAxesColumnIncreasing, LuFileDown, LuNotebookPen, LuSparkles, LuWifi } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { useMedia } from './browser'
import { Reveal, Words } from './reveal'

/**
 * The report is drawn at a paper width and scaled down to the iPad's screen,
 * like a PDF. Phones draw it narrower (its phone layout) so the text stays readable.
 */
const PAPER = 720
const PAPER_PHONE = 430

/** The report and its sample data load only when the section comes near. */
const SampleReport = lazy(() => import('./ReportScreen'))

const CALLOUTS: { icon: IconType; title: string; text: string; at: number; side: 'left' | 'right' }[] = [
  {
    icon: LuNotebookPen,
    title: 'Built from real session logs',
    text: 'Attendance, homework and practice accuracy are counted from the logs tutors already write.',
    at: 0.04,
    side: 'left',
  },
  {
    icon: LuChartNoAxesColumnIncreasing,
    title: 'Charts families get at a glance',
    text: 'Hours, attendance and accuracy, compared with the last report.',
    at: 0.22,
    side: 'right',
  },
  { icon: LuSparkles, title: 'Written for you', text: 'The summary, strengths and next steps are drafted from the logs. You review, edit and share.', at: 0.45, side: 'left' },
  { icon: LuFileDown, title: 'Share it or print it', text: 'Families open it in their portal, or you hand them a clean PDF.', at: 0.68, side: 'right' },
]

function Callout({ c, progress }: { c: (typeof CALLOUTS)[number]; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [c.at, c.at + 0.08], [0, 1])
  const x = useTransform(progress, [c.at, c.at + 0.08], [c.side === 'left' ? -24 : 24, 0])
  return (
    <motion.div style={{ opacity, x }} className="w-64 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
      <div className="flex size-9 items-center justify-center rounded-xl bg-white/[0.07] ring-1 ring-white/10">
        <c.icon className="size-[18px] text-white" />
      </div>
      <div className="mt-3 font-semibold text-white">{c.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-white/55">{c.text}</p>
    </motion.div>
  )
}

/** iPadOS status bar. */
function StatusBar() {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between bg-[#efeee9] px-5 text-[11px] font-semibold text-neutral-900" aria-hidden>
      <span>9:41</span>
      <span className="flex items-center gap-1.5">
        <LuWifi className="size-3.5" />
        <LuBatteryFull className="size-4" />
      </span>
    </div>
  )
}

/**
 * "Reports parents actually read": a portrait iPad (the Container Scroll design,
 * turned upright) tilts flat as it comes in, then stays while scrolling the page
 * scrolls the real report inside it.
 */
export function ReportShowcase() {
  // Visitors who ask for less motion get a still iPad they scroll themselves.
  const still = useMedia('(prefers-reduced-motion: reduce)')
  const track = useRef<HTMLDivElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [size, setSize] = useState({ screenW: 0, screenH: 0, paperH: 0, paper: PAPER })

  // Start loading a screen or two before the section.
  useEffect(() => {
    const el = track.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '150% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const s = screen.current
    const p = paperRef.current
    if (!s || !p) return
    // The report's own layout follows the window's width, so phones get its narrow layout.
    const measure = () => setSize({ screenW: s.clientWidth, screenH: s.clientHeight, paperH: p.offsetHeight, paper: window.innerWidth < 640 ? PAPER_PHONE : PAPER })
    const ro = new ResizeObserver(measure)
    ro.observe(s)
    ro.observe(p)
    return () => ro.disconnect()
  }, [])

  const scale = size.screenW ? size.screenW / size.paper : 0.7
  const travel = Math.max(0, size.paperH * scale - size.screenH)

  // Coming in: from a 24° tilt to flat (the Container Scroll animation).
  const enter = useScroll({ target: track, offset: ['start end', 'start start'] }).scrollYProgress
  const rotateX = useTransform(enter, [0, 1], [24, 0])
  const lift = useTransform(enter, [0, 1], [0.9, 1])
  // Pinned: the page's scroll moves the report.
  const pinned = useScroll({ target: track, offset: ['start start', 'end end'] }).scrollYProgress
  const smooth = useSpring(pinned, { stiffness: 140, damping: 30, mass: 0.4 })
  const y = useTransform(smooth, [0.02, 0.96], [0, -travel])

  return (
    <section id="reports" className="relative">
      <div className="mx-auto max-w-3xl px-5 pt-24 text-center sm:px-8 sm:pt-32">
        <Reveal as="p" className="text-sm font-medium tracking-wide text-violet-300 uppercase">
          Progress reports
        </Reveal>
        <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-white sm:text-6xl">
          <Words text="Reports parents" accent="actually read" />
        </h2>
        <Reveal as="p" delay={150} className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-white/60">
          A month of session logs becomes a clear, good-looking report in one click: what was covered, how it went and what comes next. Scroll through a real one.
        </Reveal>
      </div>

      <div ref={track} className="relative" style={still ? undefined : { height: `calc(100svh + ${Math.round(Math.max(travel, 1200) * 1.1)}px)` }}>
        <div className={cn('flex items-center justify-center overflow-hidden', still ? 'py-16' : 'sticky top-0 h-svh')} style={{ perspective: 1200 }}>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="h-[70%] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.28),transparent)] blur-3xl" />
          </div>
          <div className="relative flex items-center gap-10 xl:gap-14">
            <div className="hidden flex-col gap-40 xl:flex">
              {CALLOUTS.filter((c) => c.side === 'left').map((c) => (
                <Callout key={c.title} c={c} progress={pinned} />
              ))}
            </div>
            <motion.div
              style={still ? undefined : { rotateX, scale: lift }}
              className="relative aspect-[0.74] w-[min(calc(100vw-2rem),62svh,43rem)] rounded-[2.6rem] border-4 border-[#6c6c6c] bg-[#222] p-2.5 shadow-[0_0_#0000004d,0_9px_20px_#0000004a,0_37px_37px_#00000042,0_84px_50px_#00000026,0_149px_60px_#0000000a,0_233px_65px_#00000003] sm:p-4"
            >
              <span className="absolute top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-[#3a3a3c] sm:top-1.5" aria-hidden />
              <div className="flex size-full flex-col overflow-hidden rounded-[1.9rem] bg-[#efeee9]">
                <StatusBar />
                <div ref={screen} className={cn('relative min-h-0 flex-1', still ? 'overflow-y-auto' : 'overflow-hidden')}>
                  <motion.div style={still ? undefined : { y }} className="will-change-transform">
                    <div style={{ height: size.paperH ? size.paperH * scale : undefined }}>
                      <div ref={paperRef} className="report-canvas origin-top-left pt-3 pb-10" style={{ width: size.paper, transform: `scale(${scale})` }}>
                        {near ? (
                          <Suspense fallback={<ReportSkeleton />}>
                            <SampleReport />
                          </Suspense>
                        ) : (
                          <ReportSkeleton />
                        )}
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
            <div className="hidden flex-col gap-40 xl:flex">
              {CALLOUTS.filter((c) => c.side === 'right').map((c) => (
                <Callout key={c.title} c={c} progress={pinned} />
              ))}
            </div>
          </div>
          {!still ? (
            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 text-xs text-white/40 xl:hidden" aria-hidden>
              <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full origin-left rounded-full bg-white/60" style={{ scaleX: pinned }} />
              </div>
              Keep scrolling
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/** Paper-shaped placeholder while the report loads. */
function ReportSkeleton() {
  return (
    <div className="report-page h-[1100px] animate-pulse p-12">
      <div className="h-10 w-1/2 rounded bg-neutral-100" />
      <div className="mt-8 grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-neutral-100" />
        ))}
      </div>
      <div className="mt-8 h-48 rounded-lg bg-neutral-100" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 rounded bg-neutral-100" style={{ width: `${90 - i * 9}%` }} />
        ))}
      </div>
    </div>
  )
}
