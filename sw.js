'use strict';
/* Offline-Speicher: alle Dateien werden bei der Installation abgelegt.
   Für ein Update die Versionsnummer erhöhen – das Tablet holt sich die
   neue Fassung beim nächsten Start mit Internet. */
const CACHE = 'kartenspiele-v4';
const FILES = [
  './', 'index.html', 'style.css', 'games.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // 'reload' umgeht den Browser-Zwischenspeicher, sonst landen alte Dateien im neuen Cache
  const requests = FILES.map(f => new Request(f, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request))
  );
});
