import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The live demo (`/demo`): the same app, with the Firebase SDK swapped for the
 * in-browser stand-ins in `src/demo/fake`, so it runs on sample data and never
 * talks to the real project. Built into `dist` next to the site.
 */
const fake = (name: string) => ({ find: new RegExp(`^firebase/${name}$`), replacement: path.resolve(import.meta.dirname, `./src/demo/fake/${name}.ts`) })

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      fake('app'),
      fake('auth'),
      fake('firestore'),
      fake('functions'),
      fake('storage'),
      { find: '@shared', replacement: path.resolve(import.meta.dirname, '../shared/src') },
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
    ],
  },
  server: { port: 5176 },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: { input: { demo: path.resolve(import.meta.dirname, 'demo.html') } },
  },
})
