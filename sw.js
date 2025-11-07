const CACHE = 'imperfect-turing-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './main.js',
  './manifest.json',
  './shaders/pass.vert',
  './shaders/sim.frag',
  './shaders/vis.frag',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k=>{ if(k!==CACHE) return caches.delete(k); }));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e)=>{
  e.respondWith((async()=>{
    const r = await caches.match(e.request);
    if(r) return r;
    const net = await fetch(e.request);
    return net;
  })());
});
