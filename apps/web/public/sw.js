/* SS OPS HUB — conservative PWA service worker.
 *
 * Purpose: satisfy installability and keep icons/static shell available.
 * Does not cache HTML documents, auth responses, or API data.
 */
const CACHE_NAME = "ss-ops-hub-pwa-v10";
const PRECACHE = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/logo.svg",
  "/icons/install-qr.svg",
  "/apple-touch-icon.png",
  "/brand/ss-ops-hub-app-icon.webp",
  "/brand/stellar-society-group-logo.webp",
  "/brand/stellar-society-group-favicon.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isDevHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)
  );
}

function shouldCacheRequest(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (request.mode === "navigate") return false;
  if (request.destination === "document") return false;

  const path = url.pathname;
  if (path.startsWith("/api/") || path.startsWith("/auth/")) return false;
  if (path.startsWith("/icons/") || path === "/apple-touch-icon.png") return true;
  if (path.startsWith("/brand/")) return true;
  if (path.startsWith("/_next/static/") && !isDevHost(url.hostname)) return true;
  if (/\.(?:woff2?|ttf|otf)$/i.test(path)) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!shouldCacheRequest(request, url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
