import { timingSafeEqual } from 'crypto'

/**
 * Authentification des appels serveur -> serveur internes (en-tete x-internal-key).
 *
 * FIX secu cccc4 (M12) : ces routes acceptaient `SUPABASE_SERVICE_ROLE_KEY`
 * comme jeton applicatif. Aucune fuite n'a ete constatee, mais cela couplait
 * deux perimetres : une fuite du secret donnait a la fois l'acces complet a la
 * base ET la capacite de forger des appels « internes ».
 *
 * On introduit `INTERNAL_API_KEY`, dedie. Le repli sur
 * `SUPABASE_SERVICE_ROLE_KEY` est CONSERVE tant que la variable n'est pas
 * definie cote Vercel : sans lui, le deploiement casserait immediatement les
 * notifications et les emails transactionnels. Une fois `INTERNAL_API_KEY`
 * renseignee en production, le repli s'eteint de lui-meme.
 */

/** Cle a envoyer dans l'en-tete `x-internal-key` pour un appel serveur -> serveur. */
export function cleInterne(): string {
  return process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

/** Comparaison a temps constant, tolerante aux longueurs differentes. */
function egaliteConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * `true` si la requete porte une cle interne valide.
 * Fail-closed : si aucune cle n'est configuree cote serveur, l'appel est refuse.
 */
export function estAppelInterne(req: { headers: { get(name: string): string | null } }): boolean {
  const fournie = req.headers.get('x-internal-key')
  if (!fournie) return false

  const dediee = process.env.INTERNAL_API_KEY
  if (dediee) {
    // Une fois la cle dediee posee, elle seule est acceptee.
    return egaliteConstante(fournie, dediee)
  }

  const repli = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!repli) return false
  return egaliteConstante(fournie, repli)
}
