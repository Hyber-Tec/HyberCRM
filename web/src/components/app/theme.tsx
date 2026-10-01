import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeSetting = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: ThemeSetting
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemeSetting | string) => void
}

const STORAGE_KEY = 'hyber:theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(fallback: ThemeSetting): ThemeSetting {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : fallback
  } catch {
    return fallback
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

/** Light/dark/system theme on <html class="dark">, remembered per device. */
export function ThemeProvider({ children, defaultTheme = 'light' }: { children: ReactNode; defaultTheme?: ThemeSetting }) {
  const [theme, setThemeState] = useState<ThemeSetting>(() => readStored(defaultTheme))
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = useCallback((t: ThemeSetting | string) => {
    const next: ThemeSetting = t === 'dark' || t === 'system' ? t : 'light'
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])
  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
