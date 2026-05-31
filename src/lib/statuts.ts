/**
 * Helpers d'affichage des statuts.
 *
 * Les codes BDD sont en minuscules sans accent (paye, valide, annule, cheque, marie...)
 * pour éviter les pénibilités de comparaison/index. Mais l'affichage doit être propre
 * en français : « Payée », « Validé(e) », « Annulée », « Chèque », « Marié(e) ».
 *
 * Utilisation :
 *   import { labelStatutFacture } from '@/lib/statuts'
 *   <span>{labelStatutFacture(facture.statut)}</span>
 */

// ── FACTURES ──
export function labelStatutFacture(code: string | null | undefined): string {
  if (!code) return '—'
  const c = String(code).toLowerCase()
  switch (c) {
    case 'paye':
    case 'payee':
    case 'payée':
      return 'Payée'
    case 'partiel':
    case 'partielle':
      return 'Partiellement réglée'
    case 'en_attente':
    case 'attente':
      return 'En attente'
    case 'annule':
    case 'annulee':
    case 'annulée':
      return 'Annulée'
    case 'brouillon':
      return 'Brouillon'
    case 'verrouillee':
    case 'verrouillée':
      return 'Verrouillée'
    case 'avoir':
      return 'Avoir'
    default:
      return code.charAt(0).toUpperCase() + code.slice(1)
  }
}

export function couleurStatutFacture(code: string | null | undefined): { bg: string; fg: string } {
  const c = String(code || '').toLowerCase()
  if (c === 'paye' || c === 'payee') return { bg: '#ECFDF5', fg: '#065F46' }
  if (c === 'partiel' || c === 'partielle') return { bg: '#FEF3C7', fg: '#92400E' }
  if (c === 'annule' || c === 'annulee') return { bg: '#F1F5F9', fg: '#64748B' }
  if (c === 'brouillon') return { bg: '#F1F5F9', fg: '#475569' }
  if (c === 'verrouillee') return { bg: '#EEF2FF', fg: '#4338CA' }
  return { bg: '#FEF2F2', fg: '#991B1B' } // en_attente / inconnu
}

// ── CONTRATS DE SCOLARISATION ──
export function labelStatutContrat(code: string | null | undefined): string {
  if (!code) return '—'
  const c = String(code).toLowerCase()
  switch (c) {
    case 'valide':
    case 'validé':
    case 'validee':
    case 'validée':
      return 'Validé'
    case 'soumis':
      return 'Soumis'
    case 'brouillon':
      return 'Brouillon'
    case 'annule':
    case 'annulee':
      return 'Annulé'
    case 'refuse':
    case 'refusee':
      return 'Refusé'
    default:
      return code.charAt(0).toUpperCase() + code.slice(1)
  }
}

// ── DEMANDES DE RÉDUCTION ──
export function labelStatutDDR(code: string | null | undefined): string {
  if (!code) return '—'
  const c = String(code).toLowerCase()
  switch (c) {
    case 'accordee':
    case 'accordée':
      return 'Accordée'
    case 'refusee':
    case 'refusée':
      return 'Refusée'
    case 'soumise':
      return 'Soumise'
    case 'brouillon':
      return 'Brouillon'
    case 'a_revoir':
      return 'À revoir'
    default:
      return code.charAt(0).toUpperCase() + code.slice(1)
  }
}

// ── MODES DE PAIEMENT / RÈGLEMENT ──
export function labelModePaiement(code: string | null | undefined): string {
  if (!code) return '—'
  const c = String(code).toLowerCase().trim()
  switch (c) {
    case 'cheque':
    case 'chèque':
      return 'Chèque'
    case 'virement':
      return 'Virement'
    case 'cb':
    case 'carte':
    case 'carte_bancaire':
      return 'Carte bancaire'
    case 'especes':
    case 'espèces':
      return 'Espèces'
    case 'prelevement':
    case 'prélèvement':
    case 'sepa':
      return 'Prélèvement SEPA'
    case 'paypal':
      return 'PayPal'
    case 'stripe':
      return 'Stripe'
    case 'gocardless':
      return 'GoCardless'
    default:
      return code.charAt(0).toUpperCase() + code.slice(1)
  }
}

// ── SITUATION MARITALE / FAMILIALE ──
export function labelSituationMaritale(code: string | null | undefined): string {
  if (!code) return '—'
  const c = String(code).toLowerCase().trim()
  switch (c) {
    case 'marie':
    case 'mariee':
    case 'marié':
    case 'mariée':
    case 'marie(e)':
      return 'Marié(e)'
    case 'celibataire':
    case 'célibataire':
      return 'Célibataire'
    case 'divorce':
    case 'divorcee':
    case 'divorcé':
    case 'divorcée':
    case 'divorce(e)':
      return 'Divorcé(e)'
    case 'separe':
    case 'sépare':
    case 'séparé':
    case 'séparée':
    case 'separe(e)':
      return 'Séparé(e)'
    case 'veuf':
    case 'veuve':
    case 'veuf(ve)':
      return 'Veuf(ve)'
    case 'pacs':
    case 'pacse':
    case 'pacsé':
      return 'Pacsé(e)'
    case 'concubinage':
    case 'union_libre':
      return 'En concubinage'
    default:
      return code.charAt(0).toUpperCase() + code.slice(1)
  }
}

// ── STATUT SCOLARITE / ÉLÈVE ──
export function labelStatutScolarite(code: string | null | undefined): string {
  if (!code) return '—'
  const c = String(code).toLowerCase()
  switch (c) {
    case 'inscrit':
    case 'inscrite':
      return 'Inscrit'
    case 'sorti':
    case 'sortie':
      return 'Sorti'
    case 'en_attente':
      return 'En attente'
    case 'preinscrit':
    case 'préinscrit':
      return 'Pré-inscrit'
    default:
      return code.charAt(0).toUpperCase() + code.slice(1)
  }
}
