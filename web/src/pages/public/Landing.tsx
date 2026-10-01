import { LuArrowRight, LuCalendarClock, LuClock, LuNotebookPen, LuUsers } from 'react-icons/lu'
import { Link } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { HyberMark } from '@/components/app/HyberMark'
import { Button } from '@/components/ui/button'
import { GoogleSignInButton } from './GoogleButton'

const FEATURES = [
  { icon: LuCalendarClock, title: 'Scheduling', text: 'Tutor availability and student sessions on one live schedule.' },
  { icon: LuClock, title: 'Time & payroll', text: 'Clock in and out, teaching vs. admin hours, pay periods.' },
  { icon: LuNotebookPen, title: 'Session logs', text: 'Structured logs and progress reports for every student.' },
  { icon: LuUsers, title: 'Every role', text: 'Portals for admins, tutors, parents and students.' },
]

export function Landing() {
  const { status } = useAuth()
  const signedIn = status === 'signedIn'
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <HyberMark withName />
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
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Run your tutoring center from one place.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Hyber CRM brings scheduling, availability, time clock, payroll and session logs together for every
            branch, with a portal for each role.
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
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5">
              <f.icon className="mb-3 size-5 text-muted-foreground" />
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} Hyber CRM
      </footer>
    </div>
  )
}
