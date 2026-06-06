const SHELL_CACHE = 'taskflow-shell-v2';
const STATIC_CACHE = 'taskflow-static-v2';

const SHELL_URLS = ['/login', '/register', '/dashboard'];

const PRECACHE_STATIC = [
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',
  '/api.js',
  '/auth-oauth.js',
  '/avatar-utils.js',
  '/pwa-install.js',
  '/viewport-breakpoints.js',
  '/portrait-orientation.css',
  '/mobile-orientation.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_STATIC)),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('taskflow-') && key !== SHELL_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isSameOriginNavigation(request, url) {
  return request.mode === 'navigate' && url.origin === self.location.origin;
}

function isSameOriginStatic(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  return (
    PRECACHE_STATIC.includes(path) ||
    path.startsWith('/icons/') ||
    path.startsWith('/avatars/') ||
    path.endsWith('.js') ||
    path.endsWith('.svg') ||
    path.endsWith('.png') ||
    path.endsWith('.webmanifest')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isSameOriginNavigation(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/login'))
        )
    );
    return;
  }

  if (isSameOriginStatic(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }
});
