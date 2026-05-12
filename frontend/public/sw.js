// ShipIt Service Worker — handles push notifications and notification clicks.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});

// Web Push handler — for future backend VAPID push support.
self.addEventListener('push', (event) => {
    if (!event.data) return;
    let data = {};
    try { data = event.data.json(); } catch { data = { title: 'ShipIt', body: event.data.text() }; }
    event.waitUntil(
        self.registration.showNotification(data.title || 'ShipIt', {
            body: data.body || '',
            icon: '/favicon-eye.svg',
            badge: '/favicon.ico',
            tag: data.tag || 'shipit',
            renotify: true,
            data
        })
    );
});
