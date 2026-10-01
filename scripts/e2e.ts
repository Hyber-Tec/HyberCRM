/**
 * End-to-end check against the Firebase emulators (never production):
 * seeds Demo Academy + test members, starts the web app in emulator mode,
 * signs in as each scenario's account and visits its pages.
 *
 *   npm run e2e                 # all scenarios
 *   E2E_SHOTS=/tmp/hyber npm run e2e   # also save screenshots
 *
 * Run through scripts/e2e.sh, which starts the emulators.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { E2E_BRANCH, E2E_MEMBERS, SCENARIOS } from '../tests/e2e/scenarios'
import { seedBranch } from './lib/seedBranch'

const PORT = 5174
const BASE = `http://localhost:${PORT}`
const only = process.env.E2E_ONLY
const shots = process.env.E2E_SHOTS

async function waitForServer(url: string, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Server ${url} did not start`)
}

async function main() {
  await seedBranch({
    branchId: E2E_BRANCH,
    name: 'Demo Academy',
    timezone: 'America/New_York',
    superAdmin: 'goochoi913@gmail.com',
    sample: true,
    members: E2E_MEMBERS.map((m) => ({ ...m, roles: [...m.roles] })),
    log: () => undefined,
  })

  const vite: ChildProcess = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: 'web',
    env: { ...process.env, VITE_USE_EMULATORS: '1' },
    stdio: 'ignore',
  })
  let failures = 0
  try {
    await waitForServer(BASE)
    if (shots) mkdirSync(shots, { recursive: true })
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const s of SCENARIOS.filter((x) => !only || x.name.includes(only))) {
      const context = await browser.newContext({ viewport: { width: Number(process.env.E2E_WIDTH ?? 1366), height: 900 } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      await page.goto(BASE + '/login', { waitUntil: 'load' })
      await page.waitForFunction(() => '__hyberSignIn' in window)
      await page.evaluate((email) => (window as unknown as { __hyberSignIn: (e: string) => Promise<unknown> }).__hyberSignIn(email), s.email)
      console.log(`\n### ${s.name} (${s.email})`)
      for (const p of s.paths) {
        errors.length = 0
        await page.goto(BASE + p, { waitUntil: 'load' })
        await page.waitForTimeout(Number(process.env.E2E_WAIT ?? 2500))
        const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
        const missing = (s.expect?.[p] ?? []).filter((t) => !text.includes(t))
        const ok = missing.length === 0 && errors.length === 0
        if (!ok) failures++
        console.log(`${ok ? 'ok  ' : 'FAIL'} ${p} → ${page.url().replace(BASE, '')}`)
        if (process.env.E2E_VERBOSE || !ok) console.log(`     ${text.slice(0, 300)}`)
        for (const t of missing) console.log(`     missing text: “${t}”`)
        for (const e of errors) console.log(`     console: ${e.slice(0, 300)}`)
        if (shots) await page.screenshot({ path: `${shots}/${s.name.replace(/\W+/g, '-')}${p.replace(/\W+/g, '_')}.png`, fullPage: true })
      }
      await context.close()
    }
    await browser.close()
  } finally {
    vite.kill()
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
