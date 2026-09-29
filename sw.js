const SHELL_CACHE = 'sushi-crazy-shell-v1';
const SHELL_URLS = ['/', '/index.html', '/qr-ordering.js', '/icons/app-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE)
    .then((cache) => cache.addAll(SHELL_URLS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith('sushi-crazy-shell-') && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')
    || url.pathname === '/stats') return;

  if (request.mode === 'navigate' && (/^\/t\/|^\/order\/|^\/$/.test(url.pathname))) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(SHELL_CACHE);
      const fallback = await cache.match('/index.html');
      return fallback || Response.error();
    }));
    return;
  }
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(() => caches.match(request)));
  }
});
