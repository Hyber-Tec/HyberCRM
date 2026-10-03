/**
 * `npm run dev`: the site (landing page and app) on http://localhost:5173 and
 * the live demo, which the landing page shows in a window, on :5176.
 */
import { spawn } from 'node:child_process'

const run = (args) => spawn('npx', ['vite', ...args], { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname })
const children = [run([]), run(['-c', 'vite.demo.config.ts', '--port', '5176', '--strictPort'])]
const stop = () => {
  for (const c of children) c.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const c of children) c.on('exit', (code) => code && stop())
