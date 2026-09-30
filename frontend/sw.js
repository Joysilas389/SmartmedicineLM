/*
 * Offline support. Network first, always: online you get the newest version of every file
 * (so an update is never hidden behind a stale cache); offline, the last copy is served, so
 * flashcards, the notebook and saved lessons keep working. AI requests (/api/) are never cached.
 */
const CACHE = 'smartmedicinelm-v1';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return; // live only
  if (!['http:', 'https:'].includes(url.protocol)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error()))
  );
});
