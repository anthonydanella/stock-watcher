// Service worker for Stock Watcher.
//
// Shipped as a static file (served from the root scope) so it needs no build
// step. Two jobs: an offline-capable app shell, and Web Push delivery.
//
// Caching strategy:
//   - /api/* and /healthz: never touched (always live).
//   - navigations: network-first, falling back to the cached shell offline.
//   - other same-origin GETs (hashed /assets/*, icons, fonts): stale-while-
//     revalidate.

const CACHE = "stock-watcher-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/healthz") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/", { ignoreSearch: true }).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (_err) {
      payload = { body: event.data.text() };
    }
  }
  const title = payload.title || "Stock Watcher";
  const options = {
    body: payload.body || "",
    tag: payload.tag || undefined,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if (target !== "/" && "navigate" in client) client.navigate(target);
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// iOS evicts and rotates push subscriptions periodically; transparently
// re-subscribe with the current server key and re-register it, so notifications
// keep working without the user reopening the app.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    fetch("/api/push/public-key")
      .then((response) => response.json())
      .then((info) => {
        if (!info || !info.configured || !info.key) return undefined;
        return self.registration.pushManager
          .subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(info.key) })
          .then((subscription) =>
            fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(subscription)
            })
          );
      })
      .catch(() => undefined)
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
