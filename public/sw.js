/**
 * wasm-a11y Service Worker
 * Pre-caches web assets and Pyodide wheels for complete offline,
 * air-gapped document remediation with zero network egress.
 */

const CACHE_NAME = "wasm-a11y-cache-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./css/theme.css",
  "./css/base.css",
  "./css/layout.css",
  "./css/modules.css",
  "./css/state.css",
  "./js/app.js",
  "./js/worker.js",
  "./wheels/engine_a11y-0.4.0-py3-none-any.whl",
  "./wheels/docx_a11y-0.5.0-py3-none-any.whl",
  "./wheels/pptx_a11y-0.5.0-py3-none-any.whl",
  "./wheels/xlsx_a11y-0.1.0-py3-none-any.whl"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[ServiceWorker] Pre-caching static assets & Pyodide wheels");
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn("[ServiceWorker] Cache addAll warning:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("[ServiceWorker] Clearing old cache:", name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache Pyodide CDN assets as they are fetched
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (event.request.url.includes("jsdelivr.net") || event.request.url.includes("/wheels/"))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
