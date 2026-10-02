import type { Page } from 'playwright-core'
import { commit } from '../../scripts/lib/firestore-rest'
import { conflictFixture, soonSession } from './fixtures'
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
  await page.goto(`${base}/${E2E_BRANCH}/admin/schedule/day/${dateKey}`, { waitUntil: 'load' })
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

/** Fills in every step of the session log form (from whichever step is open). */
async function fillLog(page: Page, note: string) {
  const tab = (name: string) => page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name })
  await tab('Session Info').click()
  await page.getByRole('radiogroup', { name: 'Session type' }).getByRole('radio', { name: 'School Help', exact: true }).click()
  await page.getByPlaceholder('e.g., Linear equations, Comma usage').fill('Quadratic equations')
  await page.getByRole('radiogroup', { name: 'Homework status' }).getByRole('radio', { name: 'Completed', exact: true }).click()
  await tab('Materials').click()
  const mat = page.getByPlaceholder('Type a resource name or paste a link, then press Enter…')
  await mat.fill('Workbook chapter 5')
  await mat.press('Enter')
  await page.getByLabel('Questions attempted').fill('12')
  await page.getByLabel('Questions wrong').fill('3')
  await tab('Notes').click()
  for (const label of ['Lesson activity', 'Learning insight', 'Next focus', 'Homework given']) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(`${label}: ${note}.\nSecond line kept.`)
  }
  await tab('Evaluation').click()
  for (const d of ['Effort', 'Motivation', 'Behavior', 'Focus', 'Confidence']) await page.getByRole('button', { name: `${d} 4 out of 5` }).click()
  await page.getByRole('radiogroup', { name: 'Student flag' }).getByRole('radio', { name: 'On Track' }).click()
  await tab('Review & Submit').click()
}

/** Tutor fills in and submits a session log through the six steps, then reads it. */
const sessionLog: Step = async (page, base) => {
  const step = (n: string) => process.env.E2E_VERBOSE && console.log(`     · ${n}`)
  await page.goto(`${base}/${E2E_BRANCH}/session-log/e2e-log-session`, { waitUntil: 'load' })
  await expectText(page, 'Session preparation', 15000)
  await expectText(page, 'From last session')
  await fillLog(page, 'worked through factoring')
  await expectText(page, 'Draft saved', 10000)
  step('filled')
  if (await page.getByTestId('review-missing').count()) throw new Error('Review still lists missing fields')
  await page.getByRole('button', { name: 'Submit log' }).click()
  await expectText(page, 'Session log submitted', 30000)
  const record = page.getByTestId('log-record')
  await record.waitFor({ timeout: 15000 })
  await record.getByText('Submitted', { exact: true }).first().waitFor()
  await expectText(page, 'AI overview', 10000)
  // Line breaks survive.
  await page.getByText('Second line kept.').first().waitFor()
  if (await page.getByText('Entered by admin').count()) throw new Error('A tutor’s own log shows “Entered by admin”')
  step('submitted')
}

/** An admin opens the tutor's submitted log, edits it, and the credit stays with the tutor. */
const adminEditsLog: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/session-log/e2e-log-session`, { waitUntil: 'load' })
  await page.getByTestId('log-record').waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Edit log' }).click()
  await expectText(page, 'submitted log. Submitting again updates it')
  await page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name: 'Notes' }).click()
  await page.getByRole('textbox', { name: 'Lesson activity', exact: true }).fill('Edited by the admin: worked through factoring and graphing.')
  await page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name: 'Evaluation' }).click()
  await page.getByRole('button', { name: 'Effort 5 out of 5' }).click()
  await page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name: 'Review & Submit' }).click()
  await page.getByRole('button', { name: 'Update log' }).click()
  await expectText(page, 'Session log updated', 30000)
  const record = page.getByTestId('log-record')
  await record.getByText('Last edited').waitFor({ timeout: 15000 })
  if (await record.getByText('Entered by admin').count()) throw new Error('An admin’s edit relabeled the log as admin-entered')
  await page.getByText('Edited by the admin: worked through factoring').first().waitFor()
  const history = page.getByTestId('log-history')
  await history.getByText('Lesson activity').first().waitFor({ timeout: 10000 })
  await history.getByText(/Effort.*4.*5/).first().waitFor()
}

/** An admin writes a log for another tutor's session: the form says so, and the log records it. */
const adminLogsOnBehalf: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/session-log/e2e-admin-log-session`, { waitUntil: 'load' })
  await expectText(page, 'Adding this log on behalf of', 15000)
  await expectText(page, 'Daniel Kim')
  await fillLog(page, 'reviewed triangle proofs')
  await page.getByRole('button', { name: 'Submit log' }).click()
  await expectText(page, 'Session log submitted', 30000)
  await page.getByTestId('log-record').getByText('Entered by admin').waitFor({ timeout: 15000 })
}

/** A tutor opens another tutor's log (tutors may read every log by default): it renders from the log, read-only. */
const tutorReadsOthersLog: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/session-log/e2e-admin-log-session/view`, { waitUntil: 'load' })
  await page.getByTestId('log-record').waitFor({ timeout: 15000 })
  await page.getByTestId('log-student').getByText('Noah Nguyen').waitFor()
  if (await page.getByRole('button', { name: 'Edit log' }).count()) throw new Error('Another tutor’s log offers Edit')
  if (await page.getByText('History').count()) throw new Error('A tutor sees the log’s history')
}

/** A log for a session that hasn't started saves as a draft but can't be submitted yet. */
const futureLogBlocked: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/session-log/e2e-future-log-session`, { waitUntil: 'load' })
  await expectText(page, 'This session starts at', 15000)
  await fillLog(page, 'planned ahead')
  await expectText(page, 'Draft saved', 10000)
  await page.getByRole('button', { name: 'Submit log' }).click()
  await expectText(page, 'You can submit this log once the session starts at')
  if (await page.getByTestId('log-record').count()) throw new Error('A log was submitted before its session started')
}

/** Home → Needs you → automatic clock-outs → fix Daniel's. */
const homeClockFix: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/admin/home`, { waitUntil: 'load' })
  const card = page.getByTestId('home-needs-you')
  const group = card.getByRole('button', { name: /automatic clock-out/ })
  await group.waitFor({ timeout: 15000 })
  await group.click()
  await card.locator('li li', { hasText: 'Daniel Kim' }).getByRole('button', { name: 'Fix time' }).first().click()
  await expectText(page, 'Correct clock-out time')
  await page.getByRole('button', { name: 'Save' }).click()
  await expectText(page, 'Clock-out time updated')
}

/** Admin publishes an announcement with comments allowed. */
const announcementPublish: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/admin/announcements/new`, { waitUntil: 'load' })
  await page.getByLabel('Title').fill('E2E announcement')
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Hello tutors, this is a test.')
  await page.getByRole('button', { name: 'Next' }).click()
  await expectText(page, 'Audience & settings')
  await page.getByRole('switch', { name: 'Allow comments' }).click()
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByRole('button', { name: 'Yes, publish' }).click()
  await expectText(page, 'Announcement published.')
  await expectText(page, 'E2E announcement')
}

/** The tutor sees it as unread, opens it, comments, and finds it in notifications. */
const announcementTutor: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/tutor/announcements`, { waitUntil: 'load' })
  const card = page.getByTestId('announcement-card').filter({ hasText: 'E2E announcement' })
  await card.waitFor({ timeout: 15000 })
  await card.locator('[aria-label="Unread"]').waitFor({ timeout: 8000 })
  await card.getByRole('link', { name: 'E2E announcement' }).click()
  await expectText(page, 'Hello tutors, this is a test.')
  await page.getByLabel('Write a comment').fill('Thanks from e2e')
  await page.getByRole('button', { name: 'Post comment' }).click()
  await page.getByTestId('announcement-comments').getByText('Thanks from e2e').waitFor({ timeout: 8000 })
  await page.getByRole('button', { name: /^Notifications/ }).click()
  await expectText(page, 'New announcement', 15000)
}

/** A confirmed session about to start is canceled: the tutor gets both inbox items. */
const sessionNotifications: Step = async (page, base) => {
  const s = soonSession('canceled')
  await commit([{ path: `branches/${E2E_BRANCH}/${s.path}`, data: s.data }])
  await page.goto(`${base}/${E2E_BRANCH}/tutor/schedule`, { waitUntil: 'load' })
  await page.getByRole('button', { name: /^Notifications/ }).click()
  await expectText(page, 'Session Confirmed', 15000)
  await expectText(page, 'Cancellation Alert', 15000)
  await page.getByText('Cancellation Alert').first().click()
  await page.waitForURL(/\/tutor\/schedule\?date=/, { timeout: 8000 })
}

/** The Super Admin previews the tutor portal as Maya, then stops the preview. */
const viewAs: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/admin/home`, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'View the app as' }).click()
  await page.getByRole('menuitem', { name: /A tutor/ }).click()
  await page.getByRole('option', { name: /Maya Thompson/ }).first().click()
  await page.waitForURL(/\/tutor\//, { timeout: 8000 })
  await expectText(page, 'Tutor Portal')
  // No bar announces the preview or the Super Admin; the eye menu is the only control.
  if (await page.getByText(/Previewing as|Super Admin · viewing/).count()) throw new Error('A Super Admin or preview bar is still shown')
  await page.getByRole('button', { name: 'View the app as' }).click()
  await page.getByRole('menuitem', { name: /Yourself/ }).click()
  await page.waitForURL(/\/admin\//, { timeout: 8000 })
  await expectText(page, 'Admin Portal')
}

/** The owner adds a tutor: the invite email goes out (emulator outbox) and the status says so. */
const inviteNewPerson: Step = async (page, base) => {
  await page.goto(`${base}/${E2E_BRANCH}/admin/account`, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Add person' }).click()
  await page.locator('#m-email').fill('e2e.invitee@hyber-e2e.org')
  await page.locator('#m-first').fill('Ivy')
  await page.locator('#m-last').fill('Invitee')
  await page.getByRole('dialog').getByText('Tutor', { exact: true }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add person' }).click()
  await expectText(page, 'a link to sign in')
  const row = page.getByRole('row').filter({ hasText: 'e2e.invitee@hyber-e2e.org' })
  await row.getByText(/Invited/).last().waitFor({ state: 'visible', timeout: 15000 })
}

/** Deep links opened in a fresh tab never flash an error or "paused" screen while access is checked. */
const noWrongScreenWhileLoading: Step = async (page, base) => {
  const WRONG = ['Your access is paused', 'No access to', 'not found', 'Not your session', 'Platform access only', 'couldn’t be loaded']
  await page.addInitScript((wrong) => {
    const seen: string[] = []
    ;(window as unknown as { __wrongSeen: string[] }).__wrongSeen = seen
    new MutationObserver(() => {
      const text = document.body?.innerText ?? ''
      for (const w of wrong) if (text.includes(w) && !seen.includes(w)) seen.push(w)
    }).observe(document, { subtree: true, childList: true, characterData: true })
  }, WRONG)
  for (const path of [
    `/${E2E_BRANCH}/session-log/e2e-log-session`,
    `/${E2E_BRANCH}/admin/sessions/progress-reports`,
    `/${E2E_BRANCH}/admin/employees/payroll`,
    `/${E2E_BRANCH}/admin/home`,
  ]) {
    await page.goto(`${base}${path}`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    const seen = await page.evaluate(() => (window as unknown as { __wrongSeen: string[] }).__wrongSeen)
    if (seen.length) throw new Error(`${path} showed "${seen.join('", "')}" while loading`)
  }
}

/** Inside a branch the tab shows the branch's icon (from the first paint on later visits); elsewhere Hyber's. */
const branchTabIcon: Step = async (page, base) => {
  const iconHref = () => page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href') ?? '')
  await page.goto(`${base}/${E2E_BRANCH}/admin/home`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href.startsWith('data:image/png'), null, { timeout: 10000 })
  await page.goto(`${base}/app`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href.includes('/favicon.svg'), null, { timeout: 10000 })
  // A later visit shows the saved icon before the app has started.
  await page.goto(`${base}/${E2E_BRANCH}/admin/home`, { waitUntil: 'domcontentloaded' })
  if (!(await iconHref()).startsWith('data:image/png')) throw new Error('The saved branch icon was not shown at first paint')
}

/** A session whose tutor became unavailable: the tutor sees it waiting for the admin. */
const conflictTutorView: Step = async (page, base) => {
  const f = conflictFixture()
  await commit(f.writes.map((w) => ({ path: `branches/${E2E_BRANCH}/${w.path}`, data: w.data })))
  await page.goto(`${base}/${E2E_BRANCH}/tutor/schedule?date=${f.dateKey}`, { waitUntil: 'load' })
  await page.getByTestId('tutor-conflicts').waitFor({ timeout: 15000 })
  await page.getByTestId('session-card').filter({ hasText: 'E2E Conflict Check' }).getByTestId('session-conflict').waitFor({ timeout: 8000 })
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/conflict-tutor.png` })
}

/** The admin sees the conflict on Home and the schedule, and resolves it from the card's menu. */
const conflictAdminResolve: Step = async (page, base) => {
  const f = conflictFixture()
  await commit(f.writes.map((w) => ({ path: `branches/${E2E_BRANCH}/${w.path}`, data: w.data })))
  await page.goto(`${base}/${E2E_BRANCH}/admin/home`, { waitUntil: 'load' })
  const needs = page.getByTestId('home-needs-you')
  await needs.getByRole('button', { name: /in conflict/ }).click({ timeout: 15000 })
  await needs.getByText('E2E Conflict Check').first().waitFor({ timeout: 15000 })
  await page.goto(`${base}/${E2E_BRANCH}/admin/schedule/day/${f.dateKey}`, { waitUntil: 'load' })
  const card = page.getByTestId('session-card').filter({ hasText: 'E2E Conflict Check' })
  await card.getByTestId('session-conflict').waitFor({ timeout: 15000 })
  await page.getByTestId('row-conflicts').filter({ hasText: /to move|in conflict/ }).first().waitFor({ timeout: 8000 })
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/conflict-admin.png` })
  await card.click({ button: 'right' })
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/conflict-admin-menu.png` })
  await page.getByRole('menuitem', { name: /Make Maya available/ }).click()
  await expectText(page, 'is now available')
  await card.getByTestId('session-conflict').waitFor({ state: 'detached', timeout: 10000 })
}

export const ACTIONS: { name: string; email: string; run: Step }[] = [
  { name: 'schedule create/status/delete', email: 'goochoi913@gmail.com', run: scheduleCrud },
  { name: 'kiosk clock in/out', email: 'goochoi913@gmail.com', run: kiosk },
  { name: 'tutor submits a session log', email: 'tutor@e2e.test', run: sessionLog },
  { name: 'admin edits the tutor’s session log', email: 'owner@e2e.test', run: adminEditsLog },
  { name: 'admin writes a session log on behalf of a tutor', email: 'owner@e2e.test', run: adminLogsOnBehalf },
  { name: 'tutor reads another tutor’s session log', email: 'tutor@e2e.test', run: tutorReadsOthersLog },
  { name: 'tutor can’t submit a log before the session starts', email: 'tutor@e2e.test', run: futureLogBlocked },
  { name: 'home fixes an automatic clock-out', email: 'goochoi913@gmail.com', run: homeClockFix },
  { name: 'admin publishes an announcement', email: 'goochoi913@gmail.com', run: announcementPublish },
  { name: 'tutor reads and comments on it', email: 'tutor@e2e.test', run: announcementTutor },
  { name: 'session changes reach the tutor', email: 'tutor@e2e.test', run: sessionNotifications },
  { name: 'super admin views the app as a tutor', email: 'goochoi913@gmail.com', run: viewAs },
  { name: 'super admin deep links load without a wrong screen', email: 'goochoi913@gmail.com', run: noWrongScreenWhileLoading },
  { name: 'branch pages use the branch tab icon', email: 'owner@e2e.test', run: branchTabIcon },
  { name: 'tutor sees a session in conflict', email: 'tutor@e2e.test', run: conflictTutorView },
  { name: 'admin resolves a session in conflict', email: 'owner@e2e.test', run: conflictAdminResolve },
  { name: 'owner adds a person and the invite goes out', email: 'owner@e2e.test', run: inviteNewPerson },
]
