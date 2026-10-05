import { LuArrowRight, LuBuilding2, LuCalendarClock, LuClock, LuLink, LuMail, LuNotebookPen, LuUsers } from 'react-icons/lu'
import { Link } from 'react-router'
import { COMPANY_NAME, SENDER_EMAIL } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { HyberMark } from '@/components/app/HyberMark'
import { Button } from '@/components/ui/button'
import { GoogleSignInButton } from './GoogleButton'

const FEATURES = [
  { icon: LuCalendarClock, title: 'Scheduling', text: 'Tutor availability and student sessions on one live schedule.' },
  { icon: LuClock, title: 'Time & payroll', text: 'Clock in and out, teaching vs. admin hours, pay periods.' },
  { icon: LuNotebookPen, title: 'Session logs', text: 'Structured logs and progress reports for every student.' },
  { icon: LuUsers, title: 'Every role', text: 'Portals for owners, admins, tutors, parents and students.' },
]

const GETTING_STARTED = [
  {
    icon: LuMail,
    title: 'Invited by your center?',
    text: 'Open the email from your center and sign in with the address it was sent to: with Google, or with a password you create.',
  },
  {
    icon: LuLink,
    title: 'Have a sign-up link?',
    text: 'Open the link your center shared (it ends in /signup), sign in or create an account, and request access. The center approves it.',
  },
  {
    icon: LuBuilding2,
    title: 'Running a center?',
    text: `${COMPANY_NAME} sets up Hyber CRM for your center.`,
    contact: true,
  },
]

export function Landing() {
  const { status } = useAuth()
  const signedIn = status === 'signedIn'
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <HyberMark withName />
          <span className="hidden text-xs text-muted-foreground sm:inline">by {COMPANY_NAME}</span>
        </div>
        {signedIn ? (
          <Button asChild>
            <Link to="/app">
              Open Hyber <LuArrowRight />
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        )}
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-medium text-muted-foreground">The CRM for tutoring centers</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Run your tutoring center from one place.</h1>
          <p className="mt-4 text-lg text-pretty text-muted-foreground">
            Hyber CRM brings scheduling, availability, time clock, payroll and session logs together for every branch, with a portal for each role.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {signedIn ? (
              <Button size="lg" asChild>
                <Link to="/app">
                  Open Hyber <LuArrowRight />
                </Link>
              </Button>
            ) : (
              <GoogleSignInButton />
            )}
          </div>
        </div>

        <section className="mt-16" aria-labelledby="getting-started">
          <h2 id="getting-started" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Getting started
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {GETTING_STARTED.map((g) => (
              <div key={g.title} className="rounded-xl border bg-card p-5">
                <g.icon className="mb-3 size-5 text-muted-foreground" />
                <h3 className="font-medium">{g.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {g.text}
                  {g.contact ? (
                    <>
                      {' '}
                      Write to{' '}
                      <a href={`mailto:${SENDER_EMAIL}`} className="font-medium text-foreground underline underline-offset-2">
                        {SENDER_EMAIL}
                      </a>
                      .
                    </>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12" aria-label="Features">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-5">
                <f.icon className="mb-3 size-5 text-muted-foreground" />
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 border-t px-4 py-6 sm:px-6">
        <CompanyFooter />
        <a href={`mailto:${SENDER_EMAIL}`} className="text-xs text-muted-foreground hover:text-foreground">
          {SENDER_EMAIL}
        </a>
      </footer>
    </div>
  )
}
