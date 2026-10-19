// What The Find's service worker (live phase 6): phone alerts only. No offline cache and no fetch handler, so it
// never changes how the site loads. An alert: { title, body, url, tag } from the server (runPushes).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = {} }
  event.waitUntil(self.registration.showNotification(d.title || 'What The Find', {
    body: d.body || '', tag: d.tag || undefined, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' },
  }))
})

// Tapping it opens the room (only ever a page of this site), or brings an open tab of it forward.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  let url = new URL('/', self.location.origin).href
  try { const u = new URL(event.notification.data && event.notification.data.url || '/', self.location.origin); if (u.origin === self.location.origin) url = u.href } catch { /* the home page */ }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url === url && 'focus' in c) return c.focus()
    return self.clients.openWindow(url)
  }))
})
