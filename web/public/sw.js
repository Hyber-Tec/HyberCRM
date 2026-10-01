// Hyber CRM service worker: makes the app installable and shows the last app
// shell when the network is down. Data always comes live from Firestore, and
// hashed assets are left to the HTTP cache (they are immutable).
const CACHE = 'hyber-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['/index.html', '/manifest.webmanifest', '/favicon.svg']))
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
  // Firebase Auth's sign-in helper pages must always come from the network.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          void caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
        }
        return res
      })
      .catch(() => caches.match('/index.html').then((hit) => hit || Response.error())),
  )
})
