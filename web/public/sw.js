// Hyber CRM service worker: makes the app installable and shows the last app
// shell when the network is down. Data always comes live from Firestore, and
// hashed assets are left to the HTTP cache (they are immutable).
//
// Two pages are kept: the website's landing page (`/`) and the app (app.html,
// served at `/app` and at every app address). The live demo and the website's
// own static pages (the privacy policy) are never kept in their place.
const CACHE = 'hyber-shell-v3'
const APP = '/app'
const LANDING = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([APP, LANDING, '/manifest.webmanifest', '/favicon.svg']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || req.mode !== 'navigate') return
  const url = new URL(req.url)
  // Firebase Auth's sign-in helper pages, the demo and static pages always come from the network.
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/__/') ||
    url.pathname.startsWith('/.well-known/') ||
    url.pathname === '/demo' ||
    url.pathname.startsWith('/demo/') ||
    url.pathname === '/privacy' ||
    url.pathname.endsWith('.html')
  )
    return
  const key = url.pathname === LANDING ? LANDING : APP
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone()
          void caches.open(CACHE).then((cache) => cache.put(key, copy))
        }
        return res
      })
      .catch(() =>
        caches
          .match(key)
          .then((hit) => hit || caches.match(APP))
          .then((hit) => hit || Response.error()),
      ),
  )
})
