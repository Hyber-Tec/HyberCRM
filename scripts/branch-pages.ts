/**
 * Adds a page per branch to the built site (web/dist) so a shared branch link
 * shows the branch's name and logo in link previews (Messages, Slack, KakaoTalk,
 * email apps) and its icon in the tab from the first visit: `/{branch}` and
 * `/{branch}/signup`. The pages are the normal app with a different title, icons
 * and preview tags, so they reflect each branch as of the last deploy; the app
 * itself always shows live data. The logo is drawn to PNGs in Google Chrome
 * (previews can't show SVGs). `npm run deploy:hosting` runs this after the
 * build; without a gcloud login it skips the pages.
 *
 *   npx tsx scripts/branch-pages.ts
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { type Browser, chromium } from 'playwright-core'
import { APP_URL } from '../shared/src/brand'
import { listDocuments } from './lib/firestore-rest'

const DIST = new URL('../web/dist/', import.meta.url).pathname
const START = '<!-- meta -->'
const END = '<!-- /meta -->'
const template = readFileSync(`${DIST}index.html`, 'utf8')
if (!template.includes(START) || !template.includes(END)) throw new Error('web/dist/index.html has no <!-- meta --> block')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The logo trimmed and centered on a square: transparent for the tab, on white for previews and home screens. */
async function drawLogo(browser: Browser, logoUrl: string) {
  const res = await fetch(logoUrl)
  if (!res.ok) throw new Error(`logo request failed (${res.status})`)
  const src = `data:${res.headers.get('content-type') ?? 'image/png'};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  const page = await browser.newPage()
  try {
    // tsx names functions with a `__name` helper that the browser page doesn't have.
    await page.evaluate('window.__name = (f) => f')
    // Same drawing as web/src/lib/tabIcon.ts.
    return await page.evaluate(async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const nw = img.naturalWidth || 512
      const nh = img.naturalHeight || 512
      const k = 512 / Math.max(nw, nh)
      const raster = document.createElement('canvas')
      raster.width = Math.max(1, Math.round(nw * k))
      raster.height = Math.max(1, Math.round(nh * k))
      const rctx = raster.getContext('2d')!
      rctx.drawImage(img, 0, 0, raster.width, raster.height)
      const { width: w, height: h } = raster
      const data = rctx.getImageData(0, 0, w, h).data
      let [x0, y0, x1, y1] = [w, h, -1, -1]
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          if (data[i + 3] > 16 && !(data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242)) {
            x0 = Math.min(x0, x)
            x1 = Math.max(x1, x)
            y0 = Math.min(y0, y)
            y1 = Math.max(y1, y)
          }
        }
      const box = x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
      const draw = (size: number, pad: number, background: string | null) => {
        const c = document.createElement('canvas')
        c.width = c.height = size
        const ctx = c.getContext('2d')!
        ctx.imageSmoothingQuality = 'high'
        if (background) {
          ctx.fillStyle = background
          ctx.fillRect(0, 0, size, size)
        }
        const inner = size * (1 - 2 * pad)
        const s = Math.min(inner / box.w, inner / box.h)
        ctx.drawImage(raster, box.x, box.y, box.w, box.h, (size - box.w * s) / 2, (size - box.h * s) / 2, box.w * s, box.h * s)
        return c.toDataURL('image/png').split(',')[1]
      }
      return { icon: draw(64, 0.02, null), card: draw(600, 0.14, '#ffffff') }
    }, src)
  } finally {
    await page.close()
  }
}

function pageFor(p: { title: string; description: string; siteName: string; path: string; image: string; icons: { icon: string; touch: string } | null }) {
  const tags = [
    START,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(p.siteName)}" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${esc(APP_URL + p.path)}" />`,
    `<meta property="og:image" content="${esc(p.image)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    END,
  ].join('\n    ')
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
    .replace(new RegExp(`${START}[\\s\\S]*?${END}`), tags)
  if (p.icons) {
    html = html
      .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/png" href="${esc(p.icons.icon)}" />`)
      .replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${esc(p.icons.touch)}" />`)
      .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*"/, `$1${esc(p.siteName)}"`)
  }
  return html
}

let branches: Awaited<ReturnType<typeof listDocuments>>
try {
  branches = await listDocuments('branches')
} catch (e) {
  console.warn(`Branch pages skipped (could not read branches): ${(e as Error).message.split('\n')[0]}`)
  process.exit(0)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true }).catch((e) => {
  console.warn(`Branch logos not drawn (Google Chrome is needed): ${(e as Error).message.split('\n')[0]}`)
  return null
})
mkdirSync(`${DIST}brand/branches`, { recursive: true })

let written = 0
for (const { id, data } of branches) {
  const b = data as { name?: string; shortName?: string; status?: string; branding?: { logoUrl?: string | null } }
  if (!b.name || b.status === 'archived') continue
  const logoUrl = b.branding?.logoUrl ?? null
  let image = `${APP_URL}/icons/icon-512.png?v=2`
  let icons: { icon: string; touch: string } | null = null
  if (logoUrl && browser) {
    try {
      const drawn = await drawLogo(browser, logoUrl)
      // A new logo gets new file names, so previews and browsers don't keep the old one.
      const v = createHash('sha1').update(logoUrl).digest('hex').slice(0, 8)
      writeFileSync(`${DIST}brand/branches/${id}-${v}-icon.png`, Buffer.from(drawn.icon, 'base64'))
      writeFileSync(`${DIST}brand/branches/${id}-${v}.png`, Buffer.from(drawn.card, 'base64'))
      image = `${APP_URL}/brand/branches/${id}-${v}.png`
      icons = { icon: `/brand/branches/${id}-${v}-icon.png`, touch: `/brand/branches/${id}-${v}.png` }
    } catch (e) {
      console.warn(`${id}: logo not drawn (${(e as Error).message.split('\n')[0]})`)
    }
  }
  // Served at /{id} and /{id}/signup (firebase.json: cleanUrls).
  writeFileSync(`${DIST}${id}.html`, pageFor({ title: b.name, description: `Sign in to ${b.name}.`, siteName: b.name, path: `/${id}`, image, icons }))
  mkdirSync(`${DIST}${id}`, { recursive: true })
  writeFileSync(
    `${DIST}${id}/signup.html`,
    pageFor({
      title: `Join ${b.name}`,
      description: `Tutors, parents and students: sign in with Google to ask ${b.name} for access.`,
      siteName: b.name,
      path: `/${id}/signup`,
      image,
      icons,
    }),
  )
  written++
}
await browser?.close()
console.log(`Branch pages: ${written} branch(es)`)
