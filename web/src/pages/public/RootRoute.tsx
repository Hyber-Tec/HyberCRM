import { useEffect } from 'react'
import { FullPageSpinner } from '@/components/app/FullPage'
import { Landing } from './Landing'

// Where the app was opened, before any navigation inside it.
const openedAt = window.location.pathname

/**
 * `/` is the website's own page (index.html, the landing page), not part of the
 * app. The app only lands here by navigating inside itself (signing out, "Go
 * home"), so it loads that page. Opened at `/` itself (offline, from the
 * installed app's cache) it shows the short sign-in page instead.
 */
export function RootRoute() {
  const inApp = openedAt !== '/'
  useEffect(() => {
    if (inApp) window.location.assign('/')
  }, [inApp])
  return inApp ? <FullPageSpinner /> : <Landing />
}
