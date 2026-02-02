// Service Worker for Rabbit Favolist5 PWA
// Cache-first for static assets, network-first for everything else

const CACHE_NAME = "rabbit-v1";

// Static assets to cache on install
const STATIC_ASSETS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

// Patterns for cache-first strategy
const CACHE_FIRST_PATTERNS = [
  /\/waiting-short\/.*\.mp3$/,
  /\/icons\//,
  /\/character\//,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-critical — icons may not exist yet
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip WebSocket and non-GET requests
  if (event.request.method !== "GET") return;

  // Check if this matches a cache-first pattern
  const isCacheFirst = CACHE_FIRST_PATTERNS.some((pattern) =>
    pattern.test(url.pathname)
  );

  if (isCacheFirst) {
    // Cache-first: try cache, fall back to network, cache the result
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
  }
  // Network-first for everything else (HTML, JS, API calls)
  // Let the browser handle it normally — no caching needed for an online-only app
});
