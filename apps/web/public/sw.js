/* SS OPS HUB — conservative PWA service worker.
 *
 * Purpose: satisfy installability and keep icons/static shell available.
 * Does not cache HTML documents, auth responses, or API data.
 */
const CACHE_NAME = "ss-ops-hub-pwa-v11";
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

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { body: event.data ? event.data.text() : "" };
    } catch {
      data = {};
    }
  }

  const title = data.title || "SS Ops Hub";
  const url = data.url || "/m/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: {
        url,
        notificationId: data.notificationId || null,
      },
      tag: data.tag || data.notificationId || "ss-ops-hub",
      renotify: true,
      requireInteraction: data.severity === "critical",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/m/";
  event.waitUntil(openNotificationUrl(target));
});

async function openNotificationUrl(target) {
  const url = new URL(target, self.location.origin).href;
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if (client.url.startsWith(self.location.origin) && "focus" in client) {
      await client.focus();
      if ("navigate" in client) {
        try {
          await client.navigate(url);
        } catch {
          // Older clients may reject navigate; the focused app is still useful.
        }
      }
      return;
    }
  }
  await self.clients.openWindow(url);
}
