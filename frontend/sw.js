// ============================================================================
// sw.js — Service Worker: cache do app shell (cache-first), para abrir o app
// mesmo sem conexão. Os dados em si vêm da API (com fallback para a fila
// offline em IndexedDB, tratado em js/db.js e js/sync.js).
// ============================================================================
// Ao mudar qualquer arquivo do app shell, SUBIR esta versão: é a mudança do
// conteúdo deste arquivo que faz o navegador instalar o Service Worker novo
// e recachear tudo. Sem isso, o cache-first abaixo continua servindo a
// versão antiga do app indefinidamente, mesmo depois do deploy.
const CACHE = 'gp2t-v2';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './assets/icon.svg',
  './js/main.js', './js/config.js', './js/format.js', './js/ui.js', './js/api.js',
  './js/auth.js', './js/db.js', './js/sync.js',
  './js/views/login.js', './js/views/lancamentos.js', './js/views/operadores.js',
  './js/views/equipamentos.js', './js/views/usuarios.js', './js/views/resumos.js',
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
  // Nunca cacheia chamada de backend — só o app shell estático. A checagem é
  // por origem (e não por um pedaço da URL como "/api/") porque o backend
  // mora em outro domínio e já mudou de endereço uma vez: com Apps Script as
  // leituras são GET em script.google.com, que a regra antiga (baseada em
  // "/api/") deixaria passar direto pro cache-first.
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
