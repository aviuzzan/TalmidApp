'use client'
import { useEffect } from 'react'

/**
 * Composant invisible — enregistre le service worker /sw.js au chargement.
 * Active le mode hors-ligne (cache app shell) et prépare les push notifications.
 * À placer une seule fois, dans un layout (portail).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Enregistrement différé pour ne pas bloquer le premier rendu
    const t = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // échec silencieux — l'app fonctionne sans SW
      })
    }, 1200)
    return () => clearTimeout(t)
  }, [])
  return null
}
