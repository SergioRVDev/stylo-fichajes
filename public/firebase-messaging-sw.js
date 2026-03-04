/* eslint-disable no-undef */
// firebase-messaging-sw.js
// This Service Worker handles Firebase Cloud Messaging background push notifications.

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Firebase config is injected at registration time via query string
// to avoid hard-coding keys in the service worker.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    firebase.initializeApp(event.data.config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const notificationTitle = payload.notification?.title || 'Nueva Solicitud';
      const notificationOptions = {
        body: payload.notification?.body || 'Un empleado ha solicitado una corrección de fichaje.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: payload.data?.url || '/usuarios?tab=solicitudes' },
      };
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  }
});

// Fallback: init from meta tag if the message hasn't been received yet
// (handles the case where the SW was already installed from a previous session)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/usuarios?tab=solicitudes';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
