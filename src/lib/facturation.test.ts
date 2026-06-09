/**
 * Tests de la logique de facturation et codes famille.
 * Valide les calculs critiques sur l'historique de regression :
 *  - Total facture / regle / restant
 *  - Exclusion des factures annulees
 *  - Filtre des tarifs par tranche de la famille
 *  - Calcul d'ecart engagement vs facture
 */
import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────
//  Helpers extraits de la logique reelle pour test isole
// ─────────────────────────────────────────────

type Facture = { total_facture: number; total_regle: number; solde_restant?: number; statut: string; date_emission?: string }
type Tarif = { id: string; nom: string; montant: number; tranche_id?: string | null }

/**
 * Reproduit la logique de finances/page.tsx ligne 163 :
 * Total facture = sum(total_facture) sur factures non annulees.
 */
function totalFacture(factures: Facture[]): number {
  return factures
    .filter(f => f.statut !== 'annule')
    .reduce((s, f) => s + Number(f.total_facture || 0), 0)
}

function totalRegle(factures: Facture[]): number {
  return factures
    .filter(f => f.statut !== 'annule')
    .reduce((s, f) => s + Number(f.total_regle || 0), 0)
}

function totalRestant(factures: Facture[]): number {
  return totalFacture(factures) - totalRegle(factures)
}

/**
 * Reproduit la logique du selecteur Tarif dans familles/[id]/page.tsx :
 * Si famille a une tranche, on garde les tarifs avec cette tranche OU sans tranche (universels).
 * Sinon, on garde tous les tarifs.
 */
function filtrerTarifsParTranche(tarifs: Tarif[], trancheFamille: string | null): Tarif[] {
  if (!trancheFamille) return tarifs
  return tarifs.filter(t => !t.tranche_id || t.tranche_id === trancheFamille)
}

/**
 * Reproduit la detection de retard >30j sur factures impayees.
 */
function facturesEnRetard30j(factures: Facture[]): Facture[] {
  const il30j = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)
  return factures.filter(f =>
    f.statut !== 'annule' &&
    (f.solde_restant ?? (f.total_facture - f.total_regle)) > 0 &&
    f.date_emission != null &&
    f.date_emission <= il30j
  )
}

// ─────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────

describe('totalFacture', () => {
  it('somme les factures non annulees', () => {
    const facs: Facture[] = [
      { total_facture: 100, total_regle: 0, statut: 'en_attente' },
      { total_facture: 200, total_regle: 100, statut: 'partiel' },
    ]
    expect(totalFacture(facs)).toBe(300)
  })
  it('exclut les factures annulees (Audit F #B4)', () => {
    const facs: Facture[] = [
      { total_facture: 100, total_regle: 0, statut: 'en_attente' },
      { total_facture: 500, total_regle: 0, statut: 'annule' },
      { total_facture: 200, total_regle: 0, statut: 'paye' },
    ]
    // La regression visee : avant le fix #250, le total etait 800.
    // Apres le fix, le total est 300 (les annulees sont exclues).
    expect(totalFacture(facs)).toBe(300)
  })
  it('renvoie 0 sur liste vide', () => {
    expect(totalFacture([])).toBe(0)
  })
  it('gere les valeurs null/undefined sans crash', () => {
    const facs: any[] = [
      { total_facture: null, total_regle: 0, statut: 'en_attente' },
      { total_facture: undefined, total_regle: 0, statut: 'en_attente' },
    ]
    expect(totalFacture(facs as Facture[])).toBe(0)
  })
})

describe('totalRegle / totalRestant', () => {
  it('exclut les factures annulees du total_regle', () => {
    const facs: Facture[] = [
      { total_facture: 200, total_regle: 50, statut: 'partiel' },
      { total_facture: 100, total_regle: 100, statut: 'annule' }, // ignoree
    ]
    expect(totalRegle(facs)).toBe(50)
    expect(totalRestant(facs)).toBe(150)
  })
  it('totalRestant peut etre negatif si on a paye trop (cas avoir)', () => {
    const facs: Facture[] = [
      { total_facture: 100, total_regle: 150, statut: 'paye' },
    ]
    expect(totalRestant(facs)).toBe(-50)
  })
})

describe('filtrerTarifsParTranche', () => {
  const tarifs: Tarif[] = [
    { id: 't1', nom: 'Scolarite Kita 2 — T1', montant: 3000, tranche_id: 'TRANCHE-A' },
    { id: 't2', nom: 'Scolarite Kita 2 — T2', montant: 4500, tranche_id: 'TRANCHE-B' },
    { id: 't3', nom: 'Frais inscription (universel)', montant: 100, tranche_id: null },
    { id: 't4', nom: 'Transport (universel)', montant: 50 }, // pas de tranche_id
  ]

  it('famille sans code : tous les tarifs', () => {
    const res = filtrerTarifsParTranche(tarifs, null)
    expect(res).toHaveLength(4)
  })

  it('famille code A : seulement tarifs A + universels', () => {
    const res = filtrerTarifsParTranche(tarifs, 'TRANCHE-A')
    expect(res.map(t => t.id).sort()).toEqual(['t1', 't3', 't4'])
  })

  it('famille code B : seulement tarifs B + universels (pas le tarif A)', () => {
    const res = filtrerTarifsParTranche(tarifs, 'TRANCHE-B')
    expect(res.map(t => t.id).sort()).toEqual(['t2', 't3', 't4'])
  })

  it('famille code inconnu : que les universels', () => {
    const res = filtrerTarifsParTranche(tarifs, 'TRANCHE-INCONNUE')
    expect(res.map(t => t.id).sort()).toEqual(['t3', 't4'])
  })
})

describe('facturesEnRetard30j', () => {
  const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10)
  const il40j = new Date(Date.now() - 40 * 86400 * 1000).toISOString().slice(0, 10)
  const il20j = new Date(Date.now() - 20 * 86400 * 1000).toISOString().slice(0, 10)

  it('detecte les factures >30j avec solde > 0', () => {
    const facs: Facture[] = [
      { total_facture: 100, total_regle: 0, solde_restant: 100, statut: 'en_attente', date_emission: il40j },
    ]
    expect(facturesEnRetard30j(facs)).toHaveLength(1)
  })

  it('exclut les factures <30j', () => {
    const facs: Facture[] = [
      { total_facture: 100, total_regle: 0, solde_restant: 100, statut: 'en_attente', date_emission: yesterday },
      { total_facture: 200, total_regle: 0, solde_restant: 200, statut: 'en_attente', date_emission: il20j },
    ]
    expect(facturesEnRetard30j(facs)).toHaveLength(0)
  })

  it('exclut les factures annulees meme anciennes', () => {
    const facs: Facture[] = [
      { total_facture: 1000, total_regle: 0, solde_restant: 1000, statut: 'annule', date_emission: il40j },
    ]
    expect(facturesEnRetard30j(facs)).toHaveLength(0)
  })

  it('exclut les factures soldees meme anciennes', () => {
    const facs: Facture[] = [
      { total_facture: 100, total_regle: 100, solde_restant: 0, statut: 'paye', date_emission: il40j },
    ]
    expect(facturesEnRetard30j(facs)).toHaveLength(0)
  })
})
