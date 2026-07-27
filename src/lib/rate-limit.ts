// FIX secu 27/07 : rate limiting leger en memoire (fenetre glissante par cle).
// Best-effort uniquement : chaque instance serverless a sa propre Map, donc la
// limite n'est pas partagee entre instances ni persistee entre cold starts.
// Suffisant pour freiner l'abus simple sur les routes publiques.
const buckets = new Map<string, number[]>()

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs)
  if (arr.length >= max) { buckets.set(key, arr); return false }
  arr.push(now); buckets.set(key, arr); return true
}
