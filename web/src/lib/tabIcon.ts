import { useEffect } from 'react'
import { initials } from '@/components/app/BrandMark'

/**
 * The browser tab icon and a phone's "Add to Home Screen" icon and name. Inside a
 * branch they are the branch's own (its logo, or its initials in its color);
 * everywhere else Hyber CRM's. The last icon per branch is saved on the device so
 * `index.html` can show it before the app starts.
 */
export interface TabIcon {
  /** 64 px PNG data URL for the tab. */
  icon: string
  /** 180 px PNG data URL on an opaque background, for home screens. */
  touch: string
  /** Name under a home-screen icon. */
  title: string
}

interface SavedTabIcon extends TabIcon {
  /** What the icons were drawn from; a change redraws them. */
  key: string
  /** Shown as the page title until the app sets its own. */
  name: string
}

export interface TabBrand {
  id: string
  name: string
  shortName?: string | null
  logoUrl?: string | null
  accentColor?: string | null
}

const HYBER: TabIcon = { icon: '/favicon.svg?v=2', touch: '/icons/apple-touch-icon.png?v=2', title: 'Hyber' }
const storageKey = (branchId: string) => `hyber:tab:${branchId}`

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  if (rel === 'icon') el.type = href.startsWith('data:image/png') ? 'image/png' : 'image/svg+xml'
  el.href = href
}

function applyTabIcon(t: TabIcon) {
  setLink('icon', t.icon)
  setLink('apple-touch-icon', t.touch)
  document.head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', t.title)
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.imageSmoothingQuality = 'high'
  return { c, ctx }
}

async function loadLogo(url: string): Promise<HTMLCanvasElement> {
  // Storage allows this site to read logos (storage.cors.json), so the canvas stays readable.
  const res = await fetch(url, { mode: 'cors', cache: 'no-cache' })
  if (!res.ok) throw new Error(`Logo request failed (${res.status})`)
  const src = URL.createObjectURL(await res.blob())
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    // SVGs without a size report 0: draw them square.
    const nw = img.naturalWidth || 512
    const nh = img.naturalHeight || 512
    const k = 512 / Math.max(nw, nh)
    const { c, ctx } = canvas(Math.max(1, Math.round(nw * k)), Math.max(1, Math.round(nh * k)))
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c
  } finally {
    URL.revokeObjectURL(src)
  }
}

/** The part of the logo that isn't transparent or white, so small icons aren't mostly margin. */
function contentBox(src: HTMLCanvasElement) {
  const { width: w, height: h } = src
  const data = src.getContext('2d')!.getImageData(0, 0, w, h).data
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] > 16 && !(data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242)) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

function drawLogo(src: HTMLCanvasElement, box: ReturnType<typeof contentBox>, size: number, pad: number, background: string | null) {
  const { c, ctx } = canvas(size)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, size, size)
  }
  const inner = size * (1 - 2 * pad)
  const k = Math.min(inner / box.w, inner / box.h)
  const dw = box.w * k
  const dh = box.h * k
  ctx.drawImage(src, box.x, box.y, box.w, box.h, (size - dw) / 2, (size - dh) / 2, dw, dh)
  return c.toDataURL('image/png')
}

async function drawMonogram(name: string, color: string, size: number, radius: number) {
  await document.fonts?.load(`600 ${size}px "Geist Variable"`).catch(() => undefined)
  const { c, ctx } = canvas(size)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, size * radius)
  ctx.fill()
  const text = initials(name)
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 ${Math.round(size * (text.length > 1 ? 0.42 : 0.5))}px "Geist Variable", ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, size / 2 + size * 0.03)
  return c.toDataURL('image/png')
}

/**
 * The branch's icons: its logo (trimmed and centered), or its initials on its
 * color. `fallback`: the logo couldn't be loaded, so these are the initials.
 */
export async function drawTabIcon(b: TabBrand): Promise<TabIcon & { fallback: boolean }> {
  const title = b.shortName || b.name
  if (b.logoUrl) {
    try {
      const logo = await loadLogo(b.logoUrl)
      const box = contentBox(logo)
      return { icon: drawLogo(logo, box, 64, 0.02, null), touch: drawLogo(logo, box, 180, 0.12, '#ffffff'), title, fallback: false }
    } catch (e) {
      console.warn('Could not load the branch logo for the tab icon', e)
    }
  }
  const color = b.accentColor || '#171717'
  return { icon: await drawMonogram(b.name, color, 64, 0.22), touch: await drawMonogram(b.name, color, 180, 0), title, fallback: !!b.logoUrl }
}

function readSaved(branchId: string): SavedTabIcon | null {
  try {
    const raw = localStorage.getItem(storageKey(branchId))
    return raw ? (JSON.parse(raw) as SavedTabIcon) : null
  } catch {
    return null
  }
}

function save(branchId: string, value: SavedTabIcon) {
  try {
    localStorage.setItem(storageKey(branchId), JSON.stringify(value))
  } catch {
    // Storage can be full or blocked; the icon still applies for this visit.
  }
}

/** Shows the branch's icon in the tab while mounted, and Hyber CRM's again afterwards. */
export function useBranchTabIcon(brand: TabBrand | null) {
  const id = brand?.id ?? null
  const name = brand?.name ?? ''
  const shortName = brand?.shortName ?? null
  const logoUrl = brand?.logoUrl ?? null
  const accentColor = brand?.accentColor ?? null

  useEffect(() => {
    if (!id) return
    const key = JSON.stringify([logoUrl, accentColor, name, shortName])
    const saved = readSaved(id)
    if (saved) applyTabIcon(saved)
    let live = true
    if (saved?.key !== key) {
      drawTabIcon({ id, name, shortName, logoUrl, accentColor })
        .then(({ fallback, ...t }) => {
          // Initials standing in for a logo that didn't load are tried again next time.
          if (!fallback) save(id, { ...t, key, name })
          if (live) applyTabIcon(t)
        })
        .catch((e) => console.warn('Could not draw the branch tab icon', e))
    }
    return () => {
      live = false
      applyTabIcon(HYBER)
    }
  }, [id, name, shortName, logoUrl, accentColor])
}
