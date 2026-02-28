const CACHE_NAME = "stylo-fichajes-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = ["/", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
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
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((response) => response)
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (
          !response ||
          response.status !== 200 ||
          response.type !== "basic"
        ) {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});

// Push notification handler
self.addEventListener("push", (event) => {
  const defaultData = {
    title: "Stylo Fichajes",
    body: "Recuerda fichar tu entrada",
    icon: "/icons/icon-192x192.svg",
    badge: "/icons/icon-96x96.svg",
  };

  let data = defaultData;
  if (event.data) {
    try {
      data = { ...defaultData, ...event.data.json() };
    } catch {
      data = { ...defaultData, body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: "fichaje-reminder",
      renotify: true,
      actions: [{ action: "open", title: "Fichar ahora" }],
    })
  );
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existingClient = clients.find(
          (client) => client.url === "/" || client.url.includes(self.location.origin)
        );
        if (existingClient) {
          return existingClient.focus();
        }
        return self.clients.openWindow("/");
      })
  );
});
