/**
 * Tests des helpers d'affichage de statuts.
 * Garantit que les codes BDD bruts sont toujours convertis en libelles francais.
 */
import { describe, it, expect } from 'vitest'
import {
  labelStatutFacture,
  labelStatutContrat,
  labelStatutDDR,
  labelModePaiement,
  labelSituationMaritale,
  labelStatutScolarite,
  couleurStatutFacture,
} from './statuts'

describe('labelStatutFacture', () => {
  it('convertit paye en Payée', () => {
    expect(labelStatutFacture('paye')).toBe('Payée')
    expect(labelStatutFacture('payee')).toBe('Payée')
  })
  it('convertit partiel en libelle long', () => {
    expect(labelStatutFacture('partiel')).toBe('Partiellement réglée')
  })
  it('convertit annule en Annulée', () => {
    expect(labelStatutFacture('annule')).toBe('Annulée')
  })
  it('gere les valeurs nulles', () => {
    expect(labelStatutFacture(null)).toBe('—')
    expect(labelStatutFacture(undefined)).toBe('—')
    expect(labelStatutFacture('')).toBe('—')
  })
  it('met la premiere lettre en majuscule pour les valeurs inconnues', () => {
    expect(labelStatutFacture('inconnu')).toBe('Inconnu')
  })
  it('est insensible a la casse', () => {
    expect(labelStatutFacture('PAYE')).toBe('Payée')
    expect(labelStatutFacture('Paye')).toBe('Payée')
  })
})

describe('labelStatutContrat', () => {
  it('convertit valide en Validé', () => {
    expect(labelStatutContrat('valide')).toBe('Validé')
    expect(labelStatutContrat('validee')).toBe('Validé')
  })
  it('convertit annule en Annulé', () => {
    expect(labelStatutContrat('annule')).toBe('Annulé')
  })
})

describe('labelStatutDDR', () => {
  it('convertit accordee en Accordée', () => {
    expect(labelStatutDDR('accordee')).toBe('Accordée')
  })
  it('convertit a_revoir en À revoir', () => {
    expect(labelStatutDDR('a_revoir')).toBe('À revoir')
  })
})

describe('labelModePaiement', () => {
  it('convertit cheque en Chèque', () => {
    expect(labelModePaiement('cheque')).toBe('Chèque')
  })
  it('convertit sepa en Prélèvement SEPA', () => {
    expect(labelModePaiement('sepa')).toBe('Prélèvement SEPA')
    expect(labelModePaiement('prelevement')).toBe('Prélèvement SEPA')
  })
  it('convertit especes en Espèces avec accent', () => {
    expect(labelModePaiement('especes')).toBe('Espèces')
  })
  it('convertit cb en Carte bancaire', () => {
    expect(labelModePaiement('cb')).toBe('Carte bancaire')
    expect(labelModePaiement('carte')).toBe('Carte bancaire')
  })
})

describe('labelSituationMaritale', () => {
  it('convertit marie en Marié(e)', () => {
    expect(labelSituationMaritale('marie')).toBe('Marié(e)')
    expect(labelSituationMaritale('mariee')).toBe('Marié(e)')
  })
  it('convertit divorce en Divorcé(e)', () => {
    expect(labelSituationMaritale('divorce')).toBe('Divorcé(e)')
    expect(labelSituationMaritale('divorcee')).toBe('Divorcé(e)')
  })
  it('convertit veuf en Veuf(ve)', () => {
    expect(labelSituationMaritale('veuf')).toBe('Veuf(ve)')
    expect(labelSituationMaritale('veuve')).toBe('Veuf(ve)')
  })
})

describe('labelStatutScolarite', () => {
  it('convertit sorti en Sorti', () => {
    expect(labelStatutScolarite('sorti')).toBe('Sorti')
  })
  it('convertit inscrit en Inscrit', () => {
    expect(labelStatutScolarite('inscrit')).toBe('Inscrit')
  })
})

describe('couleurStatutFacture', () => {
  it('renvoie vert pour paye', () => {
    expect(couleurStatutFacture('paye').fg).toBe('#065F46')
  })
  it('renvoie gris pour annule (pas rouge)', () => {
    // Important : une facture annulee ne doit pas etre alarmante
    expect(couleurStatutFacture('annule').fg).toBe('#64748B')
  })
  it('renvoie orange pour partiel', () => {
    expect(couleurStatutFacture('partiel').fg).toBe('#92400E')
  })
})

describe('robustesse generale', () => {
  it('jamais ne crash sur null ou undefined', () => {
    const helpers = [labelStatutFacture, labelStatutContrat, labelStatutDDR, labelModePaiement, labelSituationMaritale, labelStatutScolarite]
    helpers.forEach(h => {
      expect(() => h(null)).not.toThrow()
      expect(() => h(undefined)).not.toThrow()
      expect(() => h('')).not.toThrow()
    })
  })
})
