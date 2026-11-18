// Service Worker - Cache game assets
const CACHE_NAME = 'cotyphu-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/phaser.js',
  '/src/main.js',
  '/src/config.js',
  '/assets/icon.png',
  '/assets/nen_sanh.png'
];

// Install - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching files');
        return cache.addAll(urlsToCache).catch(err => {
          console.warn('[SW] Cache failed for some files:', err);
          // Don't fail install if some files can't be cached
        });
      })
  );
  self.skipWaiting(); // Activate immediately
});

// Activate - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip socket.io, API, and external requests
  if (url.pathname.startsWith('/socket.io/') ||
      url.pathname.startsWith('/api/') ||
      url.origin !== location.origin ||
      url.hostname.includes('cloudflare')) {
    return; // Let browser handle it normally
  }

  // Network-first for code/HTML so updates apply immediately
  if (event.request.method === 'GET' &&
      (url.pathname.endsWith('.js') || url.pathname.endsWith('.html') || url.pathname === '/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'error') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          console.log('[SW] Serving from cache:', event.request.url);
          return response;
        }

        console.log('[SW] Fetching from network:', event.request.url);
        return fetch(event.request).then((response) => {
          // Don't cache if not successful
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clone response to cache it
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        }).catch((error) => {
          console.error('[SW] Fetch failed:', error);
          // Return a custom offline page if available
          return caches.match('/index.html');
        });
      })
  );
});
