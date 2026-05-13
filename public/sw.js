/**
 * Service Worker TalmidApp
 * - Cache minimal (offline shell)
 * - Réception push notifications
 * - Click notification → ouvre l'URL associée
 */

const CACHE_VERSION = 'talmidapp-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch (e) {
    payload = { titre: 'TalmidApp', body: event.data.text() }
  }

  const titre = payload.titre || 'TalmidApp'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'talmidapp',
    renotify: true,
    requireInteraction: false,
    data: { url: payload.url || '/portail' },
  }
  event.waitUntil(self.registration.showNotification(titre, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si déjà ouvert, focus
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      // Sinon ouvre nouvelle fenêtre
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
