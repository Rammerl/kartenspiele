'use strict';
/* Offline-Speicher: alle Dateien werden bei der Installation abgelegt.
   Für ein Update die Versionsnummer erhöhen – das Tablet holt sich die
   neue Fassung beim nächsten Start mit Internet. */
const CACHE = 'kartenspiele-v2';
const FILES = [
  './', 'index.html', 'style.css', 'games.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
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
