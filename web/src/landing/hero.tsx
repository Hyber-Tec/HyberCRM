import { AnimatePresence, motion, useScroll } from 'motion/react'
import { useEffect, useState } from 'react'
import { LuArrowDown, LuArrowRight, LuMenu, LuMonitorSmartphone, LuPalette, LuSparkles, LuX, LuZap } from 'react-icons/lu'
import { HyberLogo } from '@/components/app/HyberMark'
import { cn } from '@/lib/utils'
import { DESKTOP, useSignedIn } from './browser'
import { NAV } from './content'
import { LiveDemoWindow, useDemo } from './demo'

function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2.5" aria-label="Hyber CRM home">
      <span className="flex size-9 items-center justify-center rounded-full bg-white text-black">
        <HyberLogo className="size-6" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">Hyber CRM</span>
    </a>
  )
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const { scrollYProgress } = useScroll()
  // Someone signed in on this device gets "Open the app" instead of "Sign in".
  const signedIn = useSignedIn()
  const account = signedIn ? { href: '/app', label: 'Open the app' } : { href: '/login', label: 'Sign in' }

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  useEffect(() => {
    document.documentElement.style.overflow = menu ? 'hidden' : ''
  }, [menu])

  // The menu sits outside the header: the header's blur would trap a fixed child inside it.
  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-300',
          scrolled ? 'border-b border-white/10 bg-[#050507]/85 backdrop-blur-xl' : 'border-b border-transparent',
        )}
      >
        {/* How far down the page you are. */}
        <motion.div
          aria-hidden
          style={{ scaleX: scrollYProgress }}
          className={cn(
            'absolute inset-x-0 -bottom-px h-px origin-left bg-gradient-to-r from-sky-400 via-violet-400 to-pink-400 transition-opacity',
            scrolled ? 'opacity-100' : 'opacity-0',
          )}
        />
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8" aria-label="Main">
          <Logo />
          <div className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-sm text-white/65 transition hover:text-white">
                {n.label}
              </a>
            ))}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <a href={account.href} className="rounded-full px-4 py-2 text-sm font-medium text-white/80 transition hover:text-white">
              {account.label}
            </a>
            <a href="#contact" className="flex h-10 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90">
              Talk to us <LuArrowRight className="size-4" />
            </a>
          </div>
          <button type="button" className="flex size-10 items-center justify-center rounded-full text-white md:hidden" onClick={() => setMenu(true)} aria-label="Open the menu">
            <LuMenu className="size-6" />
          </button>
        </nav>
      </header>
      <AnimatePresence>
        {menu ? (
          <motion.div
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="fixed inset-0 z-[60] flex flex-col bg-[#050507]/97 p-5 backdrop-blur-xl md:hidden"
          >
            <div className="flex h-6 items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setMenu(false)} className="flex size-10 items-center justify-center rounded-full text-white" aria-label="Close the menu">
                <LuX className="size-6" />
              </button>
            </div>
            <div className="mt-10 flex flex-col">
              {NAV.map((n, i) => (
                <motion.a
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenu(false)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.05 }}
                  className="flex items-center justify-between border-b border-white/10 py-4 text-xl font-medium text-white"
                >
                  {n.label}
                  <LuArrowRight className="size-5 text-white/40" />
                </motion.a>
              ))}
            </div>
            <div className="mt-auto flex flex-col gap-3 pb-4">
              <a href={account.href} className="flex h-12 items-center justify-center rounded-full border border-white/15 text-base font-medium text-white">
                {account.label}
              </a>
              <a href="#contact" onClick={() => setMenu(false)} className="flex h-12 items-center justify-center rounded-full bg-white text-base font-semibold text-black">
                Talk to us
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

/** The glow in the hero's top-right corner (from the Hero 2 design). */
function Glow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[60rem] overflow-hidden">
      <div className="absolute -top-10 -right-60 flex flex-col items-end blur-xl">
        <div className="h-[10rem] w-[60rem] rounded-full bg-gradient-to-b from-purple-600 to-sky-600 blur-[6rem]" />
        <div className="h-[10rem] w-[90rem] rounded-full bg-gradient-to-b from-pink-900 to-yellow-400 blur-[6rem]" />
        <div className="h-[10rem] w-[60rem] rounded-full bg-gradient-to-b from-yellow-600 to-sky-500 blur-[6rem]" />
      </div>
      <div className="grain absolute inset-0 opacity-30 mix-blend-overlay" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-[#050507]" />
    </div>
  )
}

const PROMISES = [
  { icon: LuZap, text: 'Nothing to install' },
  { icon: LuMonitorSmartphone, text: 'Phones, tablets and computers' },
  { icon: LuPalette, text: 'Your center’s logo and colors' },
]

export function Hero() {
  const { open } = useDemo()
  const tryDemo = (e: React.MouseEvent) => {
    // Phones and tablets get the demo full screen; computers scroll to the window.
    if (!window.matchMedia(DESKTOP).matches) {
      e.preventDefault()
      open(null)
    }
  }
  return (
    <section id="top" className="relative overflow-hidden pt-28 sm:pt-36">
      <Glow />
      <div className="relative mx-auto max-w-7xl px-5 text-center sm:px-8">
        <a
          href="#demo"
          onClick={tryDemo}
          className="mx-auto flex w-fit animate-rise items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 backdrop-blur-sm transition hover:bg-white/15"
        >
          <LuSparkles className="size-4 text-amber-300" />
          Try the real app below. No sign-up.
          <LuArrowDown className="size-4" />
        </a>
        <h1 className="mx-auto mt-8 max-w-5xl animate-rise text-5xl leading-[1.04] font-semibold tracking-[-0.045em] text-balance text-white [animation-delay:80ms] sm:text-6xl lg:text-[5.5rem]">
          The CRM built for <span className="text-shine">tutoring centers</span>
        </h1>
        <p className="mx-auto mt-7 max-w-2xl animate-rise text-lg leading-relaxed text-pretty text-white/65 [animation-delay:160ms] sm:text-xl">
          Schedule every tutor and student, clock hours and run payroll, log every session and send progress reports parents actually read. One app for your whole center.
        </p>
        <div className="mt-10 flex animate-rise flex-col items-center justify-center gap-3 [animation-delay:240ms] sm:flex-row">
          <a
            href="#demo"
            onClick={tryDemo}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-semibold text-black transition hover:bg-white/90 sm:w-auto"
          >
            Explore the live demo <LuArrowRight className="size-4" />
          </a>
          <a
            href="#contact"
            className="flex h-12 w-full items-center justify-center rounded-full border border-white/20 px-8 text-base font-medium text-white transition hover:bg-white/10 sm:w-auto"
          >
            Talk to us
          </a>
        </div>
        <ul className="mt-8 flex animate-rise flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/50 [animation-delay:320ms]">
          {PROMISES.map((p) => (
            <li key={p.text} className="flex items-center gap-2">
              <p.icon className="size-4 text-white/40" /> {p.text}
            </li>
          ))}
        </ul>
        <div id="demo" className="mt-16 animate-tilt-in scroll-mt-24 [animation-delay:420ms] sm:mt-20">
          <LiveDemoWindow />
        </div>
      </div>
    </section>
  )
}
