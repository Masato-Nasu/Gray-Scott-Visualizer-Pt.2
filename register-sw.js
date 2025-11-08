
// PWA register script (v202511081446)
(() => {
  if (!('serviceWorker' in navigator)) return;
  const swUrl = new URL('./sw.js', location.href);
  // cache-bust to ensure latest SW picked up when you update
  swUrl.searchParams.set('v', '202511081446');
  navigator.serviceWorker.register(swUrl.toString()).then(reg => {
    // Immediately activate updated SW
    if (reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Optional: prompt user or auto-reload
          console.log('[PWA] Updated; reloading to activate.');
          location.reload();
        }
      });
    });
  }).catch(err => console.error('[PWA] SW register failed:', err));
})();
