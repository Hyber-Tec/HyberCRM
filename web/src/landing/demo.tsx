import { type ReactNode, createContext, use, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuArrowRight, LuExpand, LuLock, LuMousePointerClick, LuPlay, LuX } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { DEMO_MESSAGE, type DemoPage, type DemoRole, LANDING_MESSAGE, demoPath } from '@/demo/protocol'
import { DESKTOP, useMedia } from './browser'

/** The demo page (a separate build; in development it runs on its own server). */
const DEMO_URL = import.meta.env.DEV ? 'http://localhost:5176/demo.html' : '/demo'
const demoOrigin = () => new URL(DEMO_URL, window.location.href).origin
function demoSrc(target: DemoTarget) {
  const q = new URLSearchParams()
  if (target.page) q.set('page', target.page)
  if (target.as && target.as !== 'owner') q.set('as', target.as)
  return q.size ? `${DEMO_URL}?${q}` : DEMO_URL
}

/** Which page the full-screen demo opens on, and as whom. */
interface DemoTarget {
  page?: DemoPage | null
  as?: DemoRole
}

/** The app's size inside the window: it's drawn at this size and scaled to fit, like a screenshot of a laptop. */
const APP_W = 1280
const APP_H = 800

const DemoContext = createContext<{ open: (page?: DemoPage | null, as?: DemoRole) => void } | null>(null)

/** Opens the demo full screen (from any section's "Open in the demo" button). */
export function useDemo() {
  const ctx = use(DemoContext)
  if (!ctx) throw new Error('useDemo must be used inside <DemoProvider>')
  return ctx
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DemoTarget | null>(null)
  const open = useCallback((page?: DemoPage | null, as?: DemoRole) => setTarget({ page, as }), [])
  const close = useCallback(() => setTarget(null), [])
  return (
    <DemoContext value={{ open }}>
      {children}
      {target ? <DemoModal target={target} onClose={close} /> : null}
    </DemoContext>
  )
}

/** Messages from a demo frame: `ready`, and `route` with the page's path. */
function useDemoMessages(frame: React.RefObject<HTMLIFrameElement | null>, on: { ready?: () => void; route?: (path: string) => void }) {
  const handlers = useRef(on)
  useEffect(() => {
    handlers.current = on
  })
  useEffect(() => {
    const origin = demoOrigin()
    const listen = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow || e.data?.source !== DEMO_MESSAGE) return
      if (e.data.type === 'ready') handlers.current.ready?.()
      if (e.data.type === 'route' && typeof e.data.path === 'string') handlers.current.route?.(e.data.path)
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [frame])
}

const JUMPS: { page: DemoPage; label: string }[] = [
  { page: 'schedule', label: 'Schedule' },
  { page: 'student', label: 'A student' },
  { page: 'payroll', label: 'Payroll' },
  { page: 'session-log', label: 'Session logs' },
  { page: 'progress-reports', label: 'Progress reports' },
  { page: 'kiosk', label: 'Kiosk' },
]

/**
 * The hero's laptop window. On computers it runs the live demo (loaded once the
 * page is idle); a click anywhere wakes it up and goes through to the app. On
 * phones and tablets it's a picture that opens the demo full screen.
 */
export function LiveDemoWindow() {
  const { open } = useDemo()
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const live = useMedia(DESKTOP)
  const [load, setLoad] = useState(false)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(false)
  const [path, setPath] = useState('/hyber/admin/home')
  const [scale, setScale] = useState(1)

  // Computers load the demo once the page itself is done.
  useEffect(() => {
    if (!live) return
    const start = () => {
      // Safari has no requestIdleCallback.
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => setLoad(true), { timeout: 2500 })
      else window.setTimeout(() => setLoad(true), 400)
    }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => window.removeEventListener('load', start)
  }, [live])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / APP_W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Scrolled away: the next scroll over it moves the page again.
  useEffect(() => {
    const el = box.current
    if (!el || !active) return
    const io = new IntersectionObserver(([entry]) => entry.intersectionRatio < 0.2 && setActive(false), { threshold: [0, 0.2] })
    io.observe(el)
    return () => io.disconnect()
  }, [active])

  useDemoMessages(frame, { ready: () => setReady(true), route: setPath })

  const wake = (e: React.MouseEvent) => {
    setActive(true)
    const f = frame.current
    if (!f) return
    try {
      // Same origin: the click that woke the demo also lands where it was aimed.
      const r = f.getBoundingClientRect()
      const target = f.contentDocument?.elementFromPoint((e.clientX - r.left) / scale, (e.clientY - r.top) / scale) as HTMLElement | null
      f.contentWindow?.focus()
      target?.click()
    } catch {
      /* development: the demo runs on another port */
    }
  }

  const jump = (page: DemoPage) => {
    if (!live || !ready) return open(page)
    frame.current?.contentWindow?.postMessage({ source: LANDING_MESSAGE, type: 'navigate', path: demoPath(page) }, demoOrigin())
    setActive(true)
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-16 bottom-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_30%,rgb(139_92_246/0.35),transparent_70%)] blur-2xl"
      />
      <div className="relative rounded-[18px] border border-white/15 bg-white/[0.07] p-1.5 shadow-[0_60px_140px_-40px_rgb(0_0_0/0.95),0_0_0_1px_rgb(255_255_255/0.04)_inset] backdrop-blur-md sm:p-2">
        <div className="overflow-hidden rounded-[12px] bg-white">
          <div className="flex h-9 items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-3 sm:h-10">
            <div className="hidden gap-1.5 sm:flex" aria-hidden>
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="mx-auto flex h-6 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md bg-white px-3 text-[11px] text-neutral-500 ring-1 ring-neutral-200 sm:max-w-md sm:text-xs">
              <LuLock className="size-3 shrink-0" />
              <span className="truncate">hybercrm.com{path}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 sm:flex">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live demo
              </span>
              <button
                type="button"
                onClick={() => open(null)}
                className="hidden size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900 sm:flex"
                aria-label="Open the demo full screen"
                title="Full screen"
              >
                <LuExpand className="size-3.5" />
              </button>
            </div>
          </div>
          <div ref={box} className="relative aspect-[16/10] w-full overflow-hidden bg-white">
            <img
              src="/landing/demo-home.webp"
              alt="Hyber CRM's Home page: today's sessions, what needs the admin, and who is in the building"
              width={APP_W}
              height={APP_H}
              fetchPriority="high"
              className={cn('absolute inset-0 size-full object-cover object-top transition-opacity duration-700', ready && 'opacity-0')}
            />
            {load ? (
              <iframe
                ref={frame}
                src={DEMO_URL}
                title="Hyber CRM live demo"
                className={cn('absolute top-0 left-0 origin-top-left border-0 transition-opacity duration-700', ready ? 'opacity-100' : 'opacity-0')}
                style={{ width: APP_W, height: APP_H, transform: `scale(${scale})` }}
              />
            ) : null}
            {live ? (
              !active ? (
                <button type="button" onClick={wake} aria-label="Explore the live demo" className="group absolute inset-0 flex cursor-pointer items-end justify-center pb-6">
                  <span
                    className={cn(
                      'flex items-center gap-2 rounded-full bg-neutral-950/85 px-4 py-2 text-sm font-medium text-white shadow-xl ring-1 ring-white/10 backdrop-blur transition-all duration-300',
                      'translate-y-1 opacity-90 group-hover:translate-y-0 group-hover:opacity-100',
                    )}
                  >
                    <LuMousePointerClick className="size-4" />
                    {ready ? 'Click anywhere to try it' : 'Loading the live demo…'}
                  </span>
                </button>
              ) : null
            ) : (
              // Phones and tablets (computers load the demo in place).
              <button
                type="button"
                onClick={() => open(null)}
                className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-black/5 to-transparent md:pointer-fine:hidden"
              >
                <span className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-neutral-950 shadow-2xl">
                  <LuPlay className="size-4 fill-current" /> Open the live demo
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="mr-1 text-white/50">Jump to</span>
        {JUMPS.map((j) => (
          <button
            key={j.page}
            type="button"
            onClick={() => jump(j.page)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-white/80 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
          >
            {j.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-white/40">The real Hyber CRM with sample data. Everything works, and nothing you do here is saved.</p>
    </div>
  )
}

/** The demo full screen, over the landing page (Escape or ✕ closes it). */
function DemoModal({ target, onClose }: { target: DemoTarget; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  useDemoMessages(frame, { ready: () => setReady(true) })

  useEffect(() => {
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => {
      html.style.overflow = before
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hyber CRM live demo"
      className="fixed inset-0 z-[100] flex animate-[rise_.35s_cubic-bezier(.2,.7,.2,1)_both] flex-col bg-black/85 backdrop-blur-md sm:p-5"
    >
      <div className="flex h-12 shrink-0 items-center gap-3 px-4 text-white sm:px-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Live demo
        </span>
        <span className="hidden truncate text-sm text-white/50 sm:block">The real app with sample data. Nothing is saved.</span>
        <a
          href="#contact"
          onClick={onClose}
          className="ml-auto hidden items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-950 hover:bg-white/90 sm:flex"
        >
          Talk to us <LuArrowRight className="size-3.5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the demo"
          className="ml-auto flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:ml-0"
        >
          <LuX className="size-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-white sm:rounded-xl">
        <iframe ref={frame} src={demoSrc(target)} title="Hyber CRM live demo" className="size-full border-0" />
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white text-sm text-neutral-500">
            <span className="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
