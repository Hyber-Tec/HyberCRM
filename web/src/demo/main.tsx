import './shim'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Navigate, RouterProvider, createMemoryRouter } from 'react-router'
import { branchRoute } from '@/app/branchRoutes'
import { AuthProvider } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { ThemeProvider } from '@/components/app/theme'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'
import './callables'
import { DemoBadge } from './DemoBadge'
import { DEMO_PEOPLE, seedDemo } from './data'
import { signInDemoUser } from './fake/auth'
import { DEMO_MESSAGE, LANDING_MESSAGE, ROLE_HOME, demoPath, isDemoPath, isDemoRole } from './protocol'

/**
 * The live demo (`/demo`, and the window on the landing page): the real admin
 * portal running on the in-memory database, signed in as the demo center's
 * owner. Everything works in the tab and is forgotten on reload.
 */
const params = new URLSearchParams(window.location.search)
const as = params.get('as')
const role = isDemoRole(as) ? as : 'owner'
seedDemo()
// The tutor, parent and student are found in the seeded data, so after it.
const person = DEMO_PEOPLE[role]
signInDemoUser({ ...person, uid: person.uid })

const embedded = window.parent !== window
const home = ROLE_HOME[role]
const router = createMemoryRouter(
  [
    {
      hydrateFallbackElement: <FullPageSpinner />,
      children: [{ path: '/', element: <Navigate to={home} replace /> }, branchRoute, { path: '*', element: <Navigate to={home} replace /> }],
    },
  ],
  { initialEntries: [demoPath(params.get('page')) ?? home] },
)

// The landing page is on the same origin (in development it runs on its own port).
const LANDING_ORIGIN = import.meta.env.DEV ? 'http://localhost:5173' : window.location.origin
const tell = (message: Record<string, unknown>) => embedded && window.parent.postMessage({ source: DEMO_MESSAGE, ...message }, LANDING_ORIGIN)
let ready = false
router.subscribe((state) => {
  if (state.navigation.state !== 'idle') return
  tell({ type: 'route', path: state.location.pathname })
  if (!ready && state.initialized) {
    ready = true
    // After the page has painted.
    requestAnimationFrame(() => setTimeout(() => tell({ type: 'ready' }), 50))
  }
})

window.addEventListener('message', (e) => {
  if (e.origin !== LANDING_ORIGIN || e.data?.source !== LANDING_MESSAGE) return
  if (e.data.type === 'navigate' && isDemoPath(e.data.path)) void router.navigate(e.data.path)
})

// "Open in new tab" and links to other app pages stay in the demo.
const openWindow = window.open.bind(window)
window.open = (url?: string | URL, target?: string, features?: string) => {
  const u = new URL(String(url ?? ''), window.location.href)
  if (u.origin === window.location.origin && isDemoPath(u.pathname)) {
    void router.navigate(u.pathname + u.search)
    return null
  }
  return openWindow(url, target, features)
}
window.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a || e.defaultPrevented) return
  const u = new URL(a.href, window.location.href)
  if (u.origin !== window.location.origin || !isDemoPath(u.pathname)) return
  e.preventDefault()
  void router.navigate(u.pathname + u.search)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
          <Toaster richColors position="top-center" />
          {embedded || params.has('clean') ? null : <DemoBadge />}
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
