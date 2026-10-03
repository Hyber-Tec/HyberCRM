/**
 * After `vite build`: draws the landing page into dist/index.html (so search
 * engines and first paint get the whole page, not an empty shell), fills in
 * its title, preview tags and structured data, and writes the sitemap.
 *
 *   node scripts/prerender.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

process.env.NODE_ENV = 'production'
const root = fileURLToPath(new URL('..', import.meta.url))
const file = `${root}dist/index.html`

const vite = await createServer({ root, mode: 'production', appType: 'custom', logLevel: 'warn', server: { middlewareMode: true, hmr: false, watch: null } })
try {
  const { render, head } = await vite.ssrLoadModule('/src/landing/server.tsx')
  let html = readFileSync(file, 'utf8')
  if (!html.includes('<div id="root"></div>') || !/<!-- head -->[\s\S]*<!-- \/head -->/.test(html)) throw new Error('dist/index.html is missing its root or head markers')
  html = html.replace(/<!-- head -->[\s\S]*<!-- \/head -->/, head()).replace('<div id="root"></div>', `<div id="root">${render()}</div>`)
  writeFileSync(file, html)
  const today = new Date().toISOString().slice(0, 10)
  writeFileSync(
    `${root}dist/sitemap.xml`,
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://hybercrm.com/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
  )
  console.log(`Prerendered the landing page (${Math.round(html.length / 1024)} KB) and the sitemap`)
} finally {
  await vite.close()
}
