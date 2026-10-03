import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig } from 'vite'

/**
 * The site has two pages: the landing page (index.html, at `/`) and the app
 * (app.html, every other address), as Firebase Hosting serves them. The dev
 * server does the same. The live demo is a third page with its own config
 * (vite.demo.config.ts).
 */
function appPages(): Plugin {
  return {
    name: 'hyber-app-pages',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? '/').split('?')
        const page = req.method === 'GET' && req.headers.accept?.includes('text/html') && !pathname.includes('.')
        if (page && pathname !== '/') req.url = `/app.html${query ? `?${query}` : ''}`
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appPages()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, '../shared/src'),
    },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: { index: path.resolve(import.meta.dirname, 'index.html'), app: path.resolve(import.meta.dirname, 'app.html') },
    },
  },
})
