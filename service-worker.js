/* Service Worker — Apps CTV Campo
   Estratégia: app shell em cache. Navegação = network-first (pega
   atualização quando há rede) com fallback para o cache (offline).
   Demais assets = cache-first. Troque CACHE_VERSION ao publicar
   mudanças para forçar atualização nos aparelhos. */
const CACHE_VERSION = 'ctv-campo-v10';

/* Caminhos relativos ao escopo do SW (funciona sob /vt-ctv/ no GitHub Pages) */
const APP_SHELL = [
  './',
  './index.html',
  './registo_horarios_ctv.html',
  './rdo_ctv.html',
  './visita_tecnica_suzano_offline.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll falha tudo se um item faltar; usamos add individual tolerante
      .then(cache => Promise.all(APP_SHELL.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // network-first para HTML, cai no cache quando offline
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // cache-first para os demais assets
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
      return resp;
    }).catch(() => cached))
  );
});
