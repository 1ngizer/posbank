// Service worker mínimo de PosBank: cachea el "app shell" para carga rápida y
// un modo offline básico. La estrategia es network-first para navegación
// (para no servir HTML viejo) y cache-first para assets estáticos.
const CACHE = 'posbank-v1';
const SHELL = ['/', '/manifest.webmanifest', '/brand/posbank-symbol.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // No cachear llamadas a la API ni a Supabase.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() => hit)),
  );
});
