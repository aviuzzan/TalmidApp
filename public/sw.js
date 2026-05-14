/**
 * Service Worker TalmidApp
 * - Cache de l'app shell (offline-first sur les assets statiques)
 * - Stratégie network-first pour les pages (avec fallback cache puis page offline)
 * - Réception push notifications
 * - Click notification → ouvre l'URL associée
 */

const CACHE_VERSION = 'talmidapp-v2'
const APP_SHELL = [
  '/',
  '/portail',
  '/offline',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// ── Installation : pré-cache de l'app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      cache.addAll(APP_SHELL).catch(() => {
        // si une ressource échoue, on continue quand même
      })
    )
  )
  self.skipWaiting()
})

// ── Activation : nettoyage des anciens caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch : network-first pour les navigations, cache-first pour les assets ──
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Ne pas intercepter les appels API / Supabase / externes
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Navigations (pages HTML) : network-first → cache → page offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          // met en cache la version fraîche
          const copy = res.clone()
          caches.open(CACHE_VERSION).then(cache => cache.put(req, copy))
          return res
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('/offline'))
        )
    )
    return
  }

  // Assets statiques (js, css, images, fonts) : cache-first
  if (/\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached
        return fetch(req).then(res => {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then(cache => cache.put(req, copy))
          return res
        }).catch(() => cached)
      })
    )
    return
  }
})

// ── Push notifications ──
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
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
