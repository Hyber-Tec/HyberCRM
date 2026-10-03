/**
 * Runs first in the demo: the demo shares the site's origin, so the app's saved
 * preferences (theme, schedule zoom, sidebar, tab icon, "view as") go to memory
 * instead of the visitor's real browser storage and cookies, where they'd leak
 * into the real app.
 */
class MemoryStorage implements Storage {
  private items = new Map<string, string>()

  get length() {
    return this.items.size
  }

  clear() {
    this.items.clear()
  }

  getItem(key: string) {
    return this.items.get(key) ?? null
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.items.delete(key)
  }

  setItem(key: string, value: string) {
    this.items.set(key, String(value))
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  try {
    Object.defineProperty(window, name, { configurable: true, value: new MemoryStorage() })
  } catch {
    /* the app falls back to its defaults */
  }
}

const cookies = new Map<string, string>()
try {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (value: string) => {
      const [pair] = String(value).split(';')
      const at = pair.indexOf('=')
      if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
    },
  })
} catch {
  /* the sidebar remembers its state for this browser */
}
