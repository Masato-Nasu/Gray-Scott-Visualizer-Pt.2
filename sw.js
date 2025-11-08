
// Simple offline-first Service Worker (v202511081446)
const CACHE = 'rd-pwa-cache-202511081446';
const CORE = [
  './',
  './index.html?v=202511081446',
  './manifest.json?v=202511081446',
  './icon-192.png?v=202511081446',
  './icon-512.png?v=202511081446',
  './register-sw.js?v=202511081446',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Stale-while-revalidate for same-origin requests
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // don't cache cross-origin by default
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then(networkRes => {
      // clone and store successful GETs
      if (req.method === 'GET' && networkRes && networkRes.status === 200) {
        cache.put(req, networkRes.clone());
      }
      return networkRes;
    }).catch(_ => cached);
    return cached || fetchPromise;
  })());
});
