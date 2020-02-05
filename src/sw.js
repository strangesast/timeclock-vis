const PRECACHE = 'precache-v0.01';
const RUNTIME = 'runtime-v0.01';
const PRECACHE_URLS = [
  'index.js',
  'vendor.js',
  'icons/icon-72x72.png',
  'icons/icon-96x96.png',
  'icons/icon-128x128.png',
  'icons/icon-144x144.png',
  'icons/icon-152x152.png',
  'icons/icon-192x192.png',
  'icons/icon-384x384.png',
  'icons/icon-512x512.png',
];

self.addEventListener('install', event => {
  console.log('sw install!');
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(self.skipWaiting())
  )
});

self.addEventListener('activate', event => {
  const cacheNames = [PRECACHE, RUNTIME];
  event.waitUntil(caches.keys()
    // filter current caches
    .then(cacheNames => cacheNames.filter(cacheName => !cacheNames.includes(cacheName)))
    // remove old caches
    .then(oldCaches => Promise.all(oldCaches.map(cacheName => caches.delete(cacheName))))
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // try to respond with cached response
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      // check caches for request
      caches.match(event.request).then(cachedResponse =>
        // respond with previous reponse
        cachedResponse ||
        // open cache and make new request
        caches.open(RUNTIME).then(cache =>
          fetch(event.request).then(response =>
            cache.put(event.request, response.clone())
              .then(() => response)
          )
        )
      )
    );
  }
});
