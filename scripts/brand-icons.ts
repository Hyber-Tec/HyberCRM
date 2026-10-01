/**
 * Rebuilds the favicon, app icons and email logo from HyberTec's Hyber CRM
 * logo (web/public/brand/hybercrm-logo.svg). Run it after replacing the logo:
 *   npx tsx scripts/brand-icons.ts
 * Requires Google Chrome.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PUBLIC = new URL('../web/public/', import.meta.url).pathname
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
  background: string
  /** Corner radius, as a share of the size. */
  radius: number
  /** Logo width, as a share of the size. */
  scale: number
}

function tile(size: number, { background, radius, scale }: Tile) {
  const w = size * scale
  const h = (w * H) / W
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${size * radius}" fill="${background}"/>
<svg x="${(size - w) / 2}" y="${(size - h) / 2}" width="${w}" height="${h}" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="#000"/></svg>
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
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const [file, size, t] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<body style="margin:0">${tile(size, t)}</body>`)
  await page.locator('svg').first().screenshot({ path: `${PUBLIC}${file}`, omitBackground: true })
  await page.close()
}
await browser.close()
console.log(`Wrote favicon.svg and ${JOBS.length} PNGs in web/public`)
