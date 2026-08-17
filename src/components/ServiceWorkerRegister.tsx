'use client'
import { useEffect } from 'react'

/**
 * Composant invisible — enregistre le service worker /sw.js au chargement.
 * Active le mode hors-ligne (cache app shell) et prépare les push notifications.
 * À placer une seule fois, dans un layout (portail).
 *
 * nnnn1 — mise à jour automatique (bug « ancienne version » type PITKANITSOS) :
 * une PWA installée ne re-télécharge presque jamais sw.js d'elle-même, donc les
 * parents restaient sur l'ancienne version tant qu'ils ne fermaient pas
 * complètement le navigateur. Désormais :
 *  1. on force une vérification de mise à jour au chargement, à chaque retour
 *     au premier plan, et toutes les 30 minutes ;
 *  2. le sw.js fait déjà skipWaiting() + clients.claim() : le nouveau SW prend
 *     la main immédiatement ;
 *  3. au changement de contrôleur, on recharge la page UNE fois pour servir la
 *     nouvelle version (garde anti-boucle + pas de reload à la 1re installation).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    let interval: ReturnType<typeof setInterval> | null = null
    let onVisible: (() => void) | null = null

    // Enregistrement différé pour ne pas bloquer le premier rendu
    const t = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
        const check = () => { reg.update().catch(() => {}) }
        check()
        interval = setInterval(check, 30 * 60 * 1000)
        onVisible = () => { if (document.visibilityState === 'visible') check() }
        document.addEventListener('visibilitychange', onVisible)
      }).catch(() => {
        // échec silencieux — l'app fonctionne sans SW
      })
    }, 1200)

    // Reload unique quand un NOUVEAU service worker prend le contrôle.
    // hadController=false = première installation (page pas encore contrôlée) : pas de reload.
    let hadController = !!navigator.serviceWorker.controller
    let reloaded = false
    const onControllerChange = () => {
      if (!hadController) { hadController = true; return }
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      clearTimeout(t)
      if (interval) clearInterval(interval)
      if (onVisible) document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])
  return null
}
