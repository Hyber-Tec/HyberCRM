import type { Page } from 'playwright-core'
import { E2E_BRANCH } from './scenarios'

type Step = (page: Page, base: string) => Promise<void>

async function expectText(page: Page, text: string, timeout = 8000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
}

/** Creates, re-statuses and deletes a session on the admin schedule. */
const scheduleCrud: Step = async (page, base) => {
  const step = (n: string) => process.env.E2E_VERBOSE && console.log(`     · ${n}`)
  page.on('dialog', (d) => void d.accept())
  // A weekday ~10 days out (outside any lock), in Day view.
  const d = new Date(Date.now() + 10 * 86_400_000)
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1)
  const dateKey = d.toISOString().slice(0, 10)
  await page.goto(`${base}/${E2E_BRANCH}/admin/scheduling/schedule/day/${dateKey}`, { waitUntil: 'load' })
  const band = page.locator('[data-avail]').first()
  await band.waitFor({ timeout: 10000 })
  const box = (await band.boundingBox())!
  await page.mouse.dblclick(box.x + 6, box.y + 8)
  await expectText(page, 'Create session')
  step('dialog open')
  await page.getByRole('combobox').filter({ hasText: 'Search student…' }).click({ timeout: 5000 })
  step('student picker clicked')
  await page.keyboard.type('Theo Roberts')
  await page.getByRole('option', { name: /Theo Roberts/ }).first().click()
  step('student picked')
  await page.getByRole('combobox').filter({ hasText: 'Choose or type a subject' }).click()
  await page.keyboard.type('Geometry')
  await page.getByRole('option', { name: 'Geometry', exact: true }).first().click()
  step('subject picked')
  await page.getByRole('button', { name: 'Create session' }).click()
  await expectText(page, 'Session created')
  step('created')
  const card = page.getByText('Theo Roberts', { exact: false }).first()
  await card.waitFor({ timeout: 8000 })
  await card.click({ button: 'right' })
  await page.getByRole('menuitemradio', { name: 'Confirmed' }).click()
  await expectText(page, 'Status changed to Confirmed')
  step('status changed')
  await card.click()
  await page.keyboard.press('Delete')
  await expectText(page, 'Session moved to Trash')
}

/** Clocks Maya in and out at the demo kiosk with her demo PIN (1111). */
const kiosk: Step = async (page, base) => {
  const step = (n: string) => process.env.E2E_VERBOSE && console.log(`     · ${n}`)
  await page.goto(`${base}/${E2E_BRANCH}/kiosk`, { waitUntil: 'load' })
  const enterPin = async () => {
    await page.getByText('Tap anywhere to begin').click()
    for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click()
  }
  await enterPin()
  await expectText(page, 'Welcome, Maya', 15000)
  step('identified')
  await page.getByRole('button', { name: 'CLOCK IN' }).click()
  await expectText(page, 'clocked in at', 15000)
  step('clocked in')
  await page.getByText('Tap anywhere to begin').waitFor({ timeout: 10000 })
  await enterPin()
  await expectText(page, 'Clocked in at', 15000)
  await page.getByRole('button', { name: 'CLOCK OUT' }).click()
  await expectText(page, 'clocked out at', 15000)
  step('clocked out')
}

/** Tutor fills in and submits a session log through the six steps. */
const sessionLog: Step = async (page, base) => {
  const step = (n: string) => process.env.E2E_VERBOSE && console.log(`     · ${n}`)
  await page.goto(`${base}/${E2E_BRANCH}/session-log/e2e-log-session`, { waitUntil: 'load' })
  await expectText(page, 'From last session', 15000)
  await page.getByRole('button', { name: 'Session Info' }).click()
  await page.getByRole('combobox').filter({ hasText: 'Select type…' }).click()
  await page.getByRole('option', { name: 'School Help' }).click()
  await page.getByPlaceholder('e.g. Linear equations, comma usage').fill('Quadratic equations')
  await page.getByRole('combobox').filter({ hasText: 'Select…' }).click()
  await page.getByRole('option', { name: 'Completed' }).click()
  step('session info')
  await page.getByRole('button', { name: 'Materials' }).click()
  const mat = page.getByPlaceholder('Type a resource name or paste a link, then press Enter…')
  await mat.fill('Workbook chapter 5')
  await mat.press('Enter')
  const nums = page.locator('input[inputmode="numeric"]')
  await nums.nth(0).fill('12')
  await nums.nth(1).fill('3')
  step('materials')
  await page.getByRole('button', { name: 'Notes' }).click()
  const areas = page.locator('textarea')
  for (let i = 0; i < 4; i++) await areas.nth(i).fill(`Note ${i + 1} about the session`)
  step('notes')
  await page.getByRole('button', { name: 'Evaluation' }).click()
  const fours = page.getByRole('button', { name: '4 stars' })
  for (let i = 0; i < (await fours.count()); i++) await fours.nth(i).click()
  await page.getByRole('button', { name: 'On Track' }).click()
  step('evaluation')
  await page.getByRole('button', { name: 'Review & Submit' }).click()
  await page.getByRole('button', { name: 'Submit log' }).click()
  await expectText(page, 'Submitted', 30000)
  await expectText(page, 'AI overview', 10000)
  step('submitted')
}

/** Home → Missing & Needs Attention → fix an automatic clock-out. */
const homeClockFix: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/admin/home`, { waitUntil: 'load' })
  const card = page.getByTestId('home-attention')
  const row = card.getByRole('button').filter({ hasText: 'Daniel Kim' }).first()
  await row.waitFor({ timeout: 15000 })
  await row.click()
  await expectText(page, 'Correct clock-out time')
  await page.getByRole('button', { name: 'Save' }).click()
  await expectText(page, 'Clock-out time updated')
}

export const ACTIONS: { name: string; email: string; run: Step }[] = [
  { name: 'schedule create/status/delete', email: 'goochoi913@gmail.com', run: scheduleCrud },
  { name: 'kiosk clock in/out', email: 'goochoi913@gmail.com', run: kiosk },
  { name: 'tutor submits a session log', email: 'tutor@e2e.test', run: sessionLog },
  { name: 'home fixes an automatic clock-out', email: 'goochoi913@gmail.com', run: homeClockFix },
]
