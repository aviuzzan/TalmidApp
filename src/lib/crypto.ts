/**
 * Helper de chiffrement AES-256-GCM pour les credentials stockés en BDD.
 *
 * Format : "iv:ciphertext:authTag" (3 segments hex séparés par ':')
 *
 * La clé maître `MASTER_ENCRYPTION_KEY` (64 hex chars = 32 bytes) est dans les env vars Vercel.
 * Si elle est perdue ou changée, tous les secrets stockés en BDD deviennent illisibles.
 */

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12  // 96 bits, recommandé pour GCM
const AUTH_TAG_LENGTH = 16

function getMasterKey(): Buffer {
  const hex = process.env.MASTER_ENCRYPTION_KEY
  if (!hex) throw new Error('MASTER_ENCRYPTION_KEY manquant côté serveur')
  if (hex.length !== 64) throw new Error('MASTER_ENCRYPTION_KEY doit faire 64 caractères hex (32 bytes)')
  return Buffer.from(hex, 'hex')
}

/**
 * Chiffre une chaîne en clair. Retourne "iv:cipher:authTag" en hex.
 * Si plain est vide ou null, retourne null.
 */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null
  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${ciphertext.toString('hex')}:${authTag.toString('hex')}`
}

/**
 * Déchiffre "iv:cipher:authTag" et retourne la chaîne en clair.
 * Retourne null si l'entrée est null/vide/invalide.
 */
export function decrypt(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return null
  try {
    const parts = stored.split(':')
    if (parts.length !== 3) return null
    const [ivHex, cipherHex, tagHex] = parts
    const key = getMasterKey()
    const iv = Buffer.from(ivHex, 'hex')
    const ciphertext = Buffer.from(cipherHex, 'hex')
    const authTag = Buffer.from(tagHex, 'hex')
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) return null
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(authTag)
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return plain.toString('utf8')
  } catch (e) {
    // Mauvais tag, mauvaise clé, corruption → on retourne null silencieusement
    return null
  }
}

/**
 * Retourne les 4 derniers caractères d'une valeur sensible (pour affichage UI).
 * Ex : sk_live_a1b2c3d4...XYZ9 → "XYZ9"
 */
export function lastChars(value: string | null | undefined, n = 4): string {
  if (!value) return ''
  return value.length > n ? value.slice(-n) : value
}
