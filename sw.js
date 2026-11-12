// App-shell service worker. Bump VERSION on every deploy.
const VERSION = 'lalewe-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/tokens.css', 'css/app.css',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/fonts/figtree.woff2', 'vendor/fonts/icons.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'img/moto.png', 'img/tricycle.png', 'img/fourgon.png', 'img/camion.png', 'img/colis.png',
  'js/app.js', 'js/file-check.js', 'js/config.js', 'js/i18n.js', 'js/map.js', 'js/router.js', 'js/ui.js',
  'js/domain/geo.js', 'js/domain/pricing.js', 'js/domain/orders.js',
  'js/data/index.js', 'js/data/mock.js', 'js/data/firebase.js',
  'js/views/shared.js', 'js/views/home.js', 'js/views/courier.js', 'js/views/activity.js',
  'js/views/order-detail.js', 'js/views/wallet.js', 'js/views/driver.js',
  'js/views/login.js', 'js/views/account.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Same-origin GET only: stale-while-revalidate. Map tiles and Firebase
// traffic go straight to the network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached || cache.match('index.html'));
      return cached || network;
    }),
  );
});
