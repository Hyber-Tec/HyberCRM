/**
 * Rebuilds the favicon, app icons and email logo from HyberTec's Hyber CRM
 * logo (web/public/brand/hybercrm-logo.svg), and the phone app's icons and
 * launch-screen marks (mobile/assets/images, used by mobile/app.config.ts).
 * Run it after replacing the logo:
 *   npx tsx scripts/brand-icons.ts
 * Requires Google Chrome.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PUBLIC = new URL('../web/public/', import.meta.url).pathname
const PHONE = new URL('../mobile/assets/images/', import.meta.url).pathname
const logo = readFileSync(`${PUBLIC}brand/hybercrm-logo.svg`, 'utf8')
const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logo)
const path = /<path d="([^"]+)"/.exec(logo)
if (!box || !path) throw new Error('Expected a single-path SVG with a viewBox')
const [W, H, d] = [Number(box[1]), Number(box[2]), path[1]]

// Browser tab: the bare mark, black, or white when the browser is dark.
const side = Math.max(W, H)
writeFileSync(
  `${PUBLIC}favicon.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(W - side) / 2} ${(H - side) / 2} ${side} ${side}">
<style>path{fill:#000}@media (prefers-color-scheme:dark){path{fill:#fff}}</style>
<path d="${d}"/>
</svg>
`,
)

interface Tile {
  /** `none`: transparent (Android's adaptive layers, the launch-screen marks). */
  background: string
  /** Corner radius, as a share of the size. */
  radius: number
  /** Logo width, as a share of the size. */
  scale: number
  /** The mark's color (black by default). */
  fill?: string
}

function tile(size: number, { background, radius, scale, fill = '#000' }: Tile) {
  const w = size * scale
  const h = (w * H) / W
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${size * radius}" fill="${background}"/>
<svg x="${(size - w) / 2}" y="${(size - h) / 2}" width="${w}" height="${h}" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="${fill}"/></svg>
</svg>`
}

const JOBS: [file: string, size: number, tile: Tile][] = [
  // Installed app and home screen: the black mark on white.
  ['icons/icon-192.png', 192, { background: '#fff', radius: 0.22, scale: 0.72 }],
  ['icons/icon-512.png', 512, { background: '#fff', radius: 0.22, scale: 0.72 }],
  ['icons/maskable-512.png', 512, { background: '#fff', radius: 0, scale: 0.58 }],
  ['icons/apple-touch-icon.png', 180, { background: '#fff', radius: 0, scale: 0.7 }],
  // Emails show it at 36px on their gray backdrop (#f4f4f5), so it reads as the bare
  // mark; mail apps that darken the email still show it, on a light tile.
  ['brand/hybercrm-email.png', 144, { background: '#f4f4f5', radius: 0, scale: 0.8 }],
  // The phone app. iPhone rounds the icon itself and the App Store refuses transparency: a full white square.
  [`${PHONE}icon.png`, 1024, { background: '#fff', radius: 0, scale: 0.6 }],
  // Android's adaptive icon shows the middle two thirds of this and masks it to the phone's shape, on the white
  // of app.config.ts; themed icons are drawn from the one-colour version's alpha.
  [`${PHONE}android-icon-foreground.png`, 1024, { background: 'none', radius: 0, scale: 0.48 }],
  [`${PHONE}android-icon-monochrome.png`, 1024, { background: 'none', radius: 0, scale: 0.48, fill: '#fff' }],
  // The launch screen's mark: black on the light background, white on the dark one.
  [`${PHONE}splash-icon.png`, 512, { background: 'none', radius: 0, scale: 1 }],
  [`${PHONE}splash-icon-dark.png`, 512, { background: 'none', radius: 0, scale: 1, fill: '#fff' }],
]

mkdirSync(PHONE, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const [file, size, t] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<body style="margin:0">${tile(size, t)}</body>`)
  await page.locator('svg').first().screenshot({ path: file.startsWith('/') ? file : `${PUBLIC}${file}`, omitBackground: true })
  await page.close()
}
await browser.close()
console.log(`Wrote favicon.svg and ${JOBS.length} PNGs in web/public and mobile/assets/images`)
