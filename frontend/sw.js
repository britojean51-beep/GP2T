// ============================================================================
// sw.js — Service Worker: cache do app shell (cache-first), para abrir o app
// mesmo sem conexão. Os dados em si vêm da API (com fallback para a fila
// offline em IndexedDB, tratado em js/db.js e js/sync.js).
// ============================================================================
const CACHE = 'gp2t-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './assets/icon.svg',
  './js/main.js', './js/config.js', './js/format.js', './js/ui.js', './js/api.js',
  './js/auth.js', './js/db.js', './js/sync.js',
  './js/views/login.js', './js/views/lancamentos.js', './js/views/operadores.js',
  './js/views/equipamentos.js', './js/views/usuarios.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Nunca cacheia chamadas de API — só o app shell estático.
  if (req.url.includes('/api/')) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
