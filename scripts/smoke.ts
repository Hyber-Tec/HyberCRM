/**
 * Visits pages in headless Chrome and reports console errors and visible text.
 *   npx tsx scripts/smoke.ts /login /demo-academy/signup
 * Requires the dev server (npm run dev) and Google Chrome.
 */
import { chromium } from 'playwright-core'

const base = process.env.SMOKE_BASE ?? 'http://localhost:5173'
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/login']

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: Number(process.env.SMOKE_WIDTH ?? 1280), height: 900 } })
let failed = false
for (const p of paths) {
  const errors: string[] = []
  page.removeAllListeners('console')
  page.removeAllListeners('pageerror')
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(base + p, { waitUntil: 'load' })
  await page.waitForTimeout(Number(process.env.SMOKE_WAIT ?? 3000))
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  console.log(`\n== ${p}  →  ${page.url().replace(base, '')}`)
  console.log(text.slice(0, Number(process.env.SMOKE_CHARS ?? 400)))
  if (errors.length) {
    failed = true
    console.log('!! console errors:')
    for (const e of errors) console.log('   ' + e.slice(0, 300))
  }
  if (process.env.SMOKE_SHOT) await page.screenshot({ path: `${process.env.SMOKE_SHOT}${p.replace(/\W+/g, '_')}.png`, fullPage: true })
}
await browser.close()
process.exit(failed ? 1 : 0)
