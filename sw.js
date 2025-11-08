self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const VERSION = 'rd-cpu-v2025-11-08-1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(ASSETS);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // cache-first, then network fallback
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const res = await fetch(event.request);
      if (res && res.status === 200 && event.request.method === 'GET' &&
          (res.headers.get('content-type')||'').includes('text/html') === false) {
        cache.put(event.request, res.clone());
      }
      return res;
    } catch (err) {
      // offline fallback to index for navigations
      if (event.request.mode === 'navigate') {
        return cache.match('./index.html');
      }
      throw err;
    }
  })());
});
