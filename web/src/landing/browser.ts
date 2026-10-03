import { useSyncExternalStore } from 'react'

/**
 * Values only the browser knows (the pre-rendered page can't): the server and
 * the first render get a neutral answer, then React swaps in the real one.
 */

/** A media query, e.g. reduced motion or a mouse. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** A mouse and a screen wide enough for the live demo window. */
export const DESKTOP = '(pointer: fine) and (min-width: 768px)'

/** Signed in on this device (the app keeps `hyber:signedIn`). */
export function useSignedIn(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('storage', onChange)
      return () => window.removeEventListener('storage', onChange)
    },
    () => {
      try {
        return localStorage.getItem('hyber:signedIn') === '1'
      } catch {
        return false
      }
    },
    () => false,
  )
}

const TICK = 15_000
/** The time, updated every 15 seconds (null before the page is live). */
export function useClock(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const id = window.setInterval(onChange, TICK)
      return () => window.clearInterval(id)
    },
    () => Math.floor(Date.now() / TICK) * TICK,
    () => null,
  )
}
