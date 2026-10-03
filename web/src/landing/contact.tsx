import { useEffect, useRef, useState } from 'react'
import { LuArrowRight, LuCheck, LuChevronDown, LuCircleCheck, LuLoader } from 'react-icons/lu'
import { SENDER_EMAIL } from '@shared/brand'
import { INQUIRY_LOCATIONS, INQUIRY_STUDENTS, type InquiryInput, inquiryError } from '@shared/inquiry'
import { cn } from '@/lib/utils'
import { Reveal, Words } from './reveal'

const INCLUDED = [
  'Your center set up with you: hours, subjects, staff and branding',
  'Every portal: admins, tutors, parents and students',
  'Kiosk time clock, payroll, session logs and progress reports',
  'Help from the team that builds Hyber CRM',
]

const field =
  'h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white placeholder:text-white/30 transition outline-none focus:border-white/30 focus:bg-white/[0.06]'
const label = 'mb-1.5 block text-sm font-medium text-white/80'

/** Pricing (there's no price list: it depends on the center) and the "talk to us" form. */
export function Pricing() {
  return (
    <section id="pricing" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 mx-auto h-96 max-w-4xl rounded-full bg-[radial-gradient(closest-side,rgb(56_189_248/0.12),transparent)] blur-3xl"
      />
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div>
          <Reveal as="p" className="text-sm font-medium tracking-wide text-sky-300 uppercase">
            Pricing
          </Reveal>
          <h2 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-white sm:text-6xl">
            <Words text="Priced for" accent="your center" />
          </h2>
          <Reveal as="p" delay={120} className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-white/60">
            Every center is different, so there’s no one-size price list. Your price depends on how many students and tutors you have and how many locations you run. Tell us about
            your center and we’ll send you a quote.
          </Reveal>
          <Reveal delay={200}>
            <ul className="mt-10 space-y-4">
              {INCLUDED.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-white/80">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/30">
                    <LuCheck className="size-3 text-emerald-300" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
        <Reveal delay={100} id="contact" className="scroll-mt-24">
          <ContactForm />
        </Reveal>
      </div>
    </section>
  )
}

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; name: string; email: string } | { kind: 'error'; message: string }

function ContactForm() {
  // When the form appeared (bots send it at once).
  const opened = useRef(0)
  useEffect(() => {
    opened.current = Date.now()
  }, [])
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const value = (k: string) => String(f.get(k) ?? '').trim()
    const input: InquiryInput = {
      name: value('name'),
      email: value('email'),
      center: value('center'),
      phone: value('phone'),
      students: value('students') as InquiryInput['students'],
      locations: value('locations') as InquiryInput['locations'],
      message: value('message'),
    }
    const problem = inquiryError(input)
    if (problem) return setState({ kind: 'error', message: problem })
    setState({ kind: 'sending' })
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `website` is a field people never see (bots fill it in); `ms` is how long the form was open.
        body: JSON.stringify({ ...input, website: value('website'), ms: Date.now() - opened.current }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error || 'send failed')
      setState({ kind: 'sent', name: input.name.split(/\s+/)[0], email: input.email })
    } catch (err) {
      const msg = (err as Error).message
      setState({ kind: 'error', message: msg && msg !== 'send failed' && !msg.startsWith('Failed') ? msg : `We couldn’t send that just now. Please email us at ${SENDER_EMAIL}.` })
    }
  }

  if (state.kind === 'sent') {
    return (
      <div className="flex h-full min-h-[34rem] flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur">
        <span className="flex size-14 animate-rise items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/30">
          <LuCircleCheck className="size-7 text-emerald-300" />
        </span>
        <h3 className="mt-6 text-2xl font-semibold text-white">Thanks, {state.name}!</h3>
        <p className="mt-3 max-w-sm text-white/60">
          We got your message and will write to <span className="text-white">{state.email}</span> soon. In the meantime, the live demo is all yours.
        </p>
      </div>
    )
  }

  const sending = state.kind === 'sending'
  return (
    <form onSubmit={submit} noValidate className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur sm:p-8" aria-label="Contact us">
      <h3 className="text-xl font-semibold text-white">Talk to us</h3>
      <p className="mt-1 text-sm text-white/55">A few details about your center, and we’ll get back to you with a quote.</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className={label}>
            Your name
          </label>
          <input id="c-name" name="name" autoComplete="name" required maxLength={100} className={field} placeholder="Jordan Lee" />
        </div>
        <div>
          <label htmlFor="c-email" className={label}>
            Email
          </label>
          <input id="c-email" name="email" type="email" autoComplete="email" required maxLength={200} className={field} placeholder="you@yourcenter.com" />
        </div>
        <div>
          <label htmlFor="c-center" className={label}>
            Center name
          </label>
          <input id="c-center" name="center" autoComplete="organization" maxLength={120} className={field} placeholder="Your tutoring center" />
        </div>
        <div>
          <label htmlFor="c-phone" className={label}>
            Phone <span className="font-normal text-white/40">(optional)</span>
          </label>
          <input id="c-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} className={field} placeholder="(555) 123-4567" />
        </div>
        <div>
          <label htmlFor="c-students" className={label}>
            Students
          </label>
          <Select id="c-students" name="students" options={INQUIRY_STUDENTS} />
        </div>
        <div>
          <label htmlFor="c-locations" className={label}>
            Locations
          </label>
          <Select id="c-locations" name="locations" options={INQUIRY_LOCATIONS} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="c-message" className={label}>
            Anything we should know? <span className="font-normal text-white/40">(optional)</span>
          </label>
          <textarea
            id="c-message"
            name="message"
            rows={4}
            maxLength={2000}
            className={cn(field, 'h-auto resize-none py-3')}
            placeholder="What you use today, what you’d like to fix…"
          />
        </div>
        {/* For bots only. */}
        <div className="absolute -left-[9999px]" aria-hidden>
          <label htmlFor="c-website">Website</label>
          <input id="c-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </div>
      {state.kind === 'error' ? (
        <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={sending}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-black transition hover:bg-white/90 disabled:opacity-70"
      >
        {sending ? <LuLoader className="size-4 animate-spin" /> : null}
        {sending ? 'Sending…' : 'Get a quote'}
        {sending ? null : <LuArrowRight className="size-4" />}
      </button>
      <p className="mt-4 text-center text-xs text-white/40">
        Or email{' '}
        <a href={`mailto:${SENDER_EMAIL}`} className="underline underline-offset-2 hover:text-white/70">
          {SENDER_EMAIL}
        </a>
      </p>
    </form>
  )
}

/** A dropdown that looks like the other fields: placeholder-gray until something is chosen. */
function Select({ id, name, options }: { id: string; name: string; options: readonly string[] }) {
  const [value, setValue] = useState('')
  return (
    <div className="relative">
      <select id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} className={cn(field, 'appearance-none pr-10', !value && 'text-white/30')}>
        <option value="" disabled>
          How many?
        </option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-neutral-900 text-white">
            {o}
          </option>
        ))}
      </select>
      <LuChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-white/40" />
    </div>
  )
}
