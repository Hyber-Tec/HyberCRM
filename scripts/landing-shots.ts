/**
 * Takes the landing page's pictures from the live demo: the hero's poster, the
 * feature screenshots, the phones and the link preview (og.png). The clock is
 * set to a Tuesday afternoon in New York, so they look the same every time.
 * Run it after the app's look changes:
 *
 *   npx tsx scripts/landing-shots.ts [name…]
 *
 * It starts the demo's dev server itself. Requires Google Chrome.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { type Browser, type Page, chromium } from 'playwright-core'

const WEB = new URL('../web/', import.meta.url).pathname
const OUT = `${WEB}public/landing/`
const PORT = 5179
const BASE = `http://localhost:${PORT}/demo.html`
const TIME = new Date('2026-10-06T16:40:00-04:00')

interface Shot {
  name: string
  query: string
  phone?: boolean
  prepare?: (page: Page) => Promise<void>
}

const SHOTS: Shot[] = [
  { name: 'demo-home', query: '' },
  {
    name: 'shot-schedule',
    query: 'page=schedule',
    // More of the day: the app's menu folds to icons.
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Close sidebar' }).click()
      await page.waitForTimeout(600)
    },
  },
  { name: 'shot-student', query: 'page=student' },
  { name: 'shot-payroll', query: 'page=payroll' },
  { name: 'shot-logs', query: 'page=session-log' },
  { name: 'shot-announcements', query: 'page=announcements' },
  { name: 'phone-tutor', query: 'as=tutor', phone: true },
  { name: 'phone-parent', query: 'as=parent', phone: true },
  { name: 'phone-student', query: 'as=student&page=/hyber/student/calendar', phone: true },
]

const only = process.argv.slice(2)
mkdirSync(OUT, { recursive: true })

function startDemo(): Promise<ChildProcess> {
  const server = spawn('npx', ['vite', '-c', 'vite.demo.config.ts', '--port', String(PORT), '--strictPort'], { cwd: WEB, stdio: ['ignore', 'pipe', 'inherit'] })
  return new Promise((resolve, reject) => {
    server.stdout!.on('data', (b: Buffer) => b.toString().includes('Local:') && resolve(server))
    server.on('exit', (code) => reject(new Error(`The demo server stopped (${code})`)))
  })
}

/** PNG → WebP, encoded by Chrome. */
async function webp(page: Page, png: Buffer, quality = 0.86): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ([data, q]) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d')!.drawImage(img, 0, 0)
      return c.toDataURL('image/webp', q).split(',')[1]
    },
    [png.toString('base64'), quality] as const,
  )
  return Buffer.from(b64, 'base64')
}

/** A demo page as the visitor sees it (PNG). */
async function capture(browser: Browser, s: Shot, dpr = 2) {
  const size = s.phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: dpr, timezoneId: 'America/New_York', locale: 'en-US', isMobile: !!s.phone, hasTouch: !!s.phone })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.warn(`  ${s.name}: ${e.message}`))
  await page.clock.install({ time: TIME })
  await page.goto(`${BASE}?clean=1${s.query ? `&${s.query}` : ''}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await s.prepare?.(page)
  return { page, ctx, png: await page.screenshot() }
}

async function take(browser: Browser, s: Shot) {
  const { page, ctx, png } = await capture(browser, s)
  writeFileSync(`${OUT}${s.name}.webp`, await webp(page, png))
  await ctx.close()
  console.log(`  ${s.name}.webp`)
}

/** The link preview: the headline over the schedule. */
async function og(browser: Browser) {
  const logo = readFileSync(`${WEB}public/brand/hybercrm-logo.svg`, 'utf8').replace(/<svg /, '<svg class="logo" ')
  const shot = await capture(
    browser,
    SHOTS.find((x) => x.name === 'shot-schedule')!,
    1,
  )
  const schedule = shot.png.toString('base64')
  await shot.ctx.close()
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;width:1200px;height:630px;overflow:hidden;background:#050507;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;position:relative}
    .glow{position:absolute;inset:-200px -200px auto auto;width:900px;height:700px;background:radial-gradient(closest-side,rgba(147,51,234,.55),transparent),radial-gradient(closest-side at 70% 60%,rgba(14,165,233,.45),transparent);filter:blur(40px)}
    .brand{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:14px;font-size:30px;font-weight:650;letter-spacing:-.02em}
    .mark{width:52px;height:52px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center}
    .logo{width:34px;height:34px}
    h1{position:absolute;left:64px;top:150px;margin:0;font-size:68px;line-height:1.02;letter-spacing:-.045em;font-weight:700;width:560px}
    h1 span{background:linear-gradient(90deg,#7dd3fc,#a78bfa,#f0abfc);-webkit-background-clip:text;color:transparent}
    p{position:absolute;left:64px;top:400px;margin:0;width:500px;font-size:24px;line-height:1.4;color:rgba(255,255,255,.65)}
    .shot{position:absolute;left:660px;top:110px;width:700px;border-radius:14px;border:6px solid rgba(255,255,255,.12);box-shadow:0 40px 90px rgba(0,0,0,.8)}
    .url{position:absolute;left:64px;bottom:48px;font-size:22px;color:rgba(255,255,255,.5)}
  </style></head><body><div class="glow"></div>
    <div class="brand"><div class="mark">${logo}</div>Hyber CRM</div>
    <h1>The CRM built for <span>tutoring centers</span></h1>
    <p>Scheduling, time clock, payroll, session logs and progress reports.</p>
    <img class="shot" src="data:image/png;base64,${schedule}">
    <div class="url">hybercrm.com</div>
  </body></html>`)
  await page.waitForTimeout(300)
  writeFileSync(`${WEB}public/og.png`, await page.screenshot({ type: 'png' }))
  await page.close()
  console.log('  og.png')
}

const server = await startDemo()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const s of SHOTS) if (!only.length || only.includes(s.name)) await take(browser, s)
  if (!only.length || only.includes('og')) await og(browser)
} finally {
  await browser.close()
  server.kill()
}
