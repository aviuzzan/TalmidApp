/**
 * Helpers pour le marquage UI de la rétention des messages.
 * Les threads sont supprimés automatiquement N jours après leur dernier message
 * (cf. /api/cron/messages-cleanup). N est configurable par école.
 */

export interface InfoRetention {
  joursRestants: number
  dateExpiration: Date
  /** 'expire' si déjà passé, 'critique' si <= 2j, 'attention' si <= 5j, 'ok' sinon */
  niveau: 'expire' | 'critique' | 'attention' | 'ok'
  labelCourt: string  // "5 j" ou "Demain" ou "Expire bientôt"
  labelComplet: string // "Sera supprimé le 03/07 (dans 5 jours)"
}

export function calcRetention(lastMessageAt: string | Date, dureeJours: number): InfoRetention {
  const last = typeof lastMessageAt === 'string' ? new Date(lastMessageAt) : lastMessageAt
  const expiration = new Date(last.getTime() + dureeJours * 86400 * 1000)
  const now = Date.now()
  const msRestants = expiration.getTime() - now
  const joursRestants = Math.ceil(msRestants / 86400000)

  let niveau: InfoRetention['niveau'] = 'ok'
  if (joursRestants <= 0) niveau = 'expire'
  else if (joursRestants <= 2) niveau = 'critique'
  else if (joursRestants <= 5) niveau = 'attention'

  const dateStr = expiration.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  let labelCourt = ''
  if (joursRestants <= 0) labelCourt = 'Expiré'
  else if (joursRestants === 1) labelCourt = 'Expire demain'
  else labelCourt = `${joursRestants} j`

  const labelComplet = joursRestants <= 0
    ? `Sera supprimé sous peu (dernier message ${dateStr})`
    : `Sera supprimé le ${dateStr} (dans ${joursRestants} jour${joursRestants > 1 ? 's' : ''})`

  return { joursRestants, dateExpiration: expiration, niveau, labelCourt, labelComplet }
}

export function couleurRetention(niveau: InfoRetention['niveau']): { bg: string; fg: string } {
  switch (niveau) {
    case 'expire':    return { bg: '#FEE2E2', fg: '#991B1B' }
    case 'critique':  return { bg: '#FED7AA', fg: '#9A3412' }
    case 'attention': return { bg: '#FEF3C7', fg: '#92400E' }
    case 'ok':        return { bg: '#F1F5F9', fg: '#64748B' }
  }
}
