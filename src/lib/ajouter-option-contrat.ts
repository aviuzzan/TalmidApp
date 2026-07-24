/**
 * Helper serveur : ajoute un poste (option) au contrat existant d'un enfant,
 * met a jour contrat_enfants.postes ET ajoute la ligne correspondante a la
 * facture existante (si non verrouillee).
 *
 * Respecte :
 *  - groupe_exclusif : si le nouveau tarif appartient a un groupe, retire les
 *    autres tarifs du meme groupe (ex: Car remplace Navette et inversement).
 *  - inclus_dans_reduction : si DDR validee, l'option non-incluse est facturee
 *    au plein tarif; l'option incluse est absorbee dans le forfait (ligne
 *    Scolarite recalculee).
 *  - facture verrouillee : renvoie une erreur si tentative de modification.
 *
 * Cette fonction est utilisee cote admin (ajout direct) et par le traitement
 * d'une demande parent acceptee.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AjouterOptionResult {
  ok: boolean
  error?: string
  posteAjoute?: { tarif_id: string; nom: string; montant: number }
  factureModifiee?: boolean
  factureNumero?: string
  factureId?: string
  /** true si le refus est du a une capacite atteinte (places_max) — permet de proposer la liste d'attente */
  complet?: boolean
}

export async function ajouterOptionAuContrat(
  sb: SupabaseClient,
  params: { enfantId: string; tarifId: string; ecoleId: string; anneeScolaire: string },
): Promise<AjouterOptionResult> {
  const { enfantId, tarifId, ecoleId, anneeScolaire } = params

  // 1. Charger le tarif cible
  const { data: tarif } = await sb.from('tarifs_secteur')
    .select('id, nom_poste, montant, inclus_dans_reduction, groupe_exclusif, places_max, annee_scolaire')
    .eq('id', tarifId).maybeSingle()
  if (!tarif) return { ok: false, error: 'Tarif introuvable' }

  // 1bis. Check capacite (places_max) : compter les inscrits actuels via la vue
  // v_options_inscrits, en excluant l'enfant lui-meme (cas re-coche / swap).
  if ((tarif as any).places_max != null) {
    const { data: inscrits } = await sb.from('v_options_inscrits')
      .select('enfant_id')
      .eq('tarif_id', tarifId)
      .eq('annee_scolaire', (tarif as any).annee_scolaire)
    const enfantsUniques = new Set((inscrits || []).map((r: any) => r.enfant_id).filter((id: string) => id !== enfantId))
    if (enfantsUniques.size >= (tarif as any).places_max) {
      return {
        ok: false,
        complet: true,
        error: `Option « ${tarif.nom_poste} » complète (${enfantsUniques.size}/${(tarif as any).places_max} places). Proposer la liste d'attente ou augmenter la capacité dans Paramètres > Tarifs.`,
      }
    }
  }

  // 2. Charger le contrat de la famille pour cette annee
  const { data: enfant } = await sb.from('enfants').select('famille_id').eq('id', enfantId).maybeSingle()
  if (!enfant) return { ok: false, error: 'Enfant introuvable' }

  const { data: contrat } = await sb.from('contrats_scolarisation')
    .select('id, statut')
    .eq('famille_id', enfant.famille_id).eq('annee_scolaire', anneeScolaire)
    .in('statut', ['valide', 'accepte', 'soumis'])
    .maybeSingle()
  if (!contrat) return { ok: false, error: 'Aucun contrat valide pour cette annee' }

  const { data: ce } = await sb.from('contrat_enfants')
    .select('id, postes')
    .eq('contrat_id', contrat.id).eq('enfant_id', enfantId).maybeSingle()
  if (!ce) return { ok: false, error: 'Cet enfant n\'est pas dans le contrat' }

  // 3. Charger tous les tarifs de l'ecole pour resoudre les groupes exclusifs
  const { data: tousTarifs } = await sb.from('tarifs_secteur')
    .select('id, groupe_exclusif').eq('ecole_id', ecoleId)

  // 4. Construire nouveaux postes : retirer les autres du meme groupe + retirer si deja present + ajouter
  const postesActuels: any[] = Array.isArray(ce.postes) ? ce.postes : []
  const idsAEvincer = new Set<string>([tarifId])
  if (tarif.groupe_exclusif) {
    ;(tousTarifs || []).forEach((t: any) => {
      if (t.groupe_exclusif === tarif.groupe_exclusif && t.id !== tarifId) idsAEvincer.add(t.id)
    })
  }
  const postesFiltres = postesActuels.filter((p: any) => !idsAEvincer.has(p.tarif_id))
  const nouveauxPostes = [
    ...postesFiltres,
    { tarif_id: tarifId, nom: tarif.nom_poste, montant: parseFloat(tarif.montant as any) || 0 },
  ]

  // 5. Mettre a jour contrat_enfants.postes + sous_total
  const sousTotal = nouveauxPostes.reduce((s: number, p: any) => s + (parseFloat(p.montant) || 0), 0)
  const { error: upErr } = await sb.from('contrat_enfants').update({ postes: nouveauxPostes, sous_total: sousTotal }).eq('id', ce.id)
  if (upErr) return { ok: false, error: 'Erreur mise a jour contrat : ' + upErr.message }

  // 6. Chercher la facture liee
  const { data: facture } = await sb.from('factures')
    .select('id, numero, statut, verrouillee, exercice_id')
    .eq('famille_id', enfant.famille_id).eq('annee_scolaire', anneeScolaire)
    .neq('statut', 'annule')
    .maybeSingle()

  if (!facture) {
    // Pas de facture : on a juste mis a jour le contrat, c'est bon
    return {
      ok: true,
      posteAjoute: { tarif_id: tarifId, nom: tarif.nom_poste, montant: parseFloat(tarif.montant as any) || 0 },
      factureModifiee: false,
    }
  }

  if (facture.verrouillee) {
    return {
      ok: false,
      error: `La facture ${facture.numero} est verrouillee. Deverrouiller d'abord ou creer un avoir/avenant.`,
    }
  }

  // 7. Recuperer prenom/nom enfant + info DDR
  const { data: enfantInfo } = await sb.from('enfants').select('prenom, nom').eq('id', enfantId).maybeSingle()
  const enfantLabel = enfantInfo ? `${enfantInfo.prenom || ''} ${enfantInfo.nom || ''}`.trim() : ''

  const { data: ddr } = await sb.from('demandes_reduction')
    .select('tarif_accorde, statut')
    .eq('famille_id', enfant.famille_id).eq('annee_scolaire', anneeScolaire)
    .eq('statut', 'accepte').maybeSingle()

  // 8. Retirer les anciennes lignes de facture pour cet enfant qui correspondent aux tarifs evinces (meme groupe)
  //    + retirer les lignes qui correspondent au tarif nouvellement ajoute (au cas ou on re-cocherait)
  //    On identifie par nom du poste (approche simple)
  const nomsAEvincer = new Set<string>()
  const { data: tarifsAEvincer } = await sb.from('tarifs_secteur').select('nom_poste').in('id', Array.from(idsAEvincer))
  ;(tarifsAEvincer || []).forEach((t: any) => nomsAEvincer.add(String(t.nom_poste || '').toLowerCase()))

  const { data: lignesActuelles } = await sb.from('facture_lignes').select('id, description, enfant_id').eq('facture_id', facture.id)
  const idsLignesAEvincer = (lignesActuelles || [])
    .filter((l: any) => l.enfant_id === enfantId && nomsAEvincer.size > 0)
    .filter((l: any) => Array.from(nomsAEvincer).some(n => (l.description || '').toLowerCase().startsWith(n + ' ')))
    .map((l: any) => l.id)
  if (idsLignesAEvincer.length > 0) {
    await sb.from('facture_lignes').delete().in('id', idsLignesAEvincer)
  }

  // 9. Recalculer / ajouter les lignes pour cet enfant
  const inclusDansReduction = tarif.inclus_dans_reduction !== false
  const montant = parseFloat(tarif.montant as any) || 0

  if (ddr?.tarif_accorde && inclusDansReduction) {
    // Cas DDR + option incluse : il faut recalculer la ligne Scolarite de cet enfant
    // (car la part accordee est deja consommee par les postes inclus existants).
    // Approche pragmatique : on regenere UNIQUEMENT les lignes de cet enfant en repartant
    // des postes actuels + tarif accorde / nb enfants du contrat.
    const { data: allCE } = await sb.from('contrat_enfants').select('enfant_id').eq('contrat_id', contrat.id)
    const nbEnfants = (allCE || []).length || 1
    const partParEnfant = Math.round((parseFloat(ddr.tarif_accorde as any) / nbEnfants) * 100) / 100

    // Charger tous les tarifs pour tarifMap (inclus_dans_reduction)
    const tarifMap: Record<string, boolean> = {}
    ;(tousTarifs || []).forEach((t: any) => { tarifMap[t.id] = (t as any).inclus_dans_reduction !== false })

    const postesInclusHorsScol = nouveauxPostes.filter((p: any) => {
      const inclus = tarifMap[p.tarif_id] !== false
      return inclus && !/scolarit/i.test(p.nom || '')
    })
    const totalInclusHorsScol = postesInclusHorsScol.reduce((s: number, p: any) => s + (parseFloat(p.montant) || 0), 0)
    const scolEnfant = Math.max(0, Math.round((partParEnfant - totalInclusHorsScol) * 100) / 100)

    // Supprimer TOUTES les lignes existantes de cet enfant sur cette facture
    await sb.from('facture_lignes').delete().eq('facture_id', facture.id).eq('enfant_id', enfantId)

    // Ligne Scolarite
    if (scolEnfant > 0) {
      await sb.from('facture_lignes').insert({
        facture_id: facture.id, enfant_id: enfantId,
        description: `Scolarité ${anneeScolaire} — ${enfantLabel} (tarif accordé)`.trim(),
        montant: scolEnfant, deductible: true,
      })
    }
    // Lignes postes inclus hors scolarite
    let excedent = Math.max(0, totalInclusHorsScol - partParEnfant)
    for (const p of postesInclusHorsScol) {
      const m = parseFloat(p.montant) || 0
      const reduc = Math.min(excedent, m)
      excedent -= reduc
      const final = Math.round((m - reduc) * 100) / 100
      if (final > 0) {
        await sb.from('facture_lignes').insert({
          facture_id: facture.id, enfant_id: enfantId,
          description: `${p.nom || 'Poste'} ${anneeScolaire} — ${enfantLabel}`.trim(),
          montant: final, deductible: true,
        })
      }
    }
    // Lignes postes non inclus
    const postesNonInclus = nouveauxPostes.filter((p: any) => tarifMap[p.tarif_id] === false)
    for (const p of postesNonInclus) {
      const m = parseFloat(p.montant) || 0
      if (m > 0) {
        await sb.from('facture_lignes').insert({
          facture_id: facture.id, enfant_id: enfantId,
          description: `${p.nom || 'Poste'} ${anneeScolaire} — ${enfantLabel}`.trim(),
          montant: m, deductible: false,
        })
      }
    }
  } else if (ddr?.tarif_accorde && !inclusDansReduction) {
    // DDR + option non incluse : juste ajouter la ligne au plein tarif
    await sb.from('facture_lignes').insert({
      facture_id: facture.id, enfant_id: enfantId,
      description: `${tarif.nom_poste} ${anneeScolaire} — ${enfantLabel}`.trim(),
      montant, deductible: false,
    })
  } else {
    // Pas de DDR : juste ajouter la ligne au plein tarif
    await sb.from('facture_lignes').insert({
      facture_id: facture.id, enfant_id: enfantId,
      description: `${tarif.nom_poste} ${anneeScolaire} — ${enfantLabel}`.trim(),
      montant, deductible: inclusDansReduction,
    })
  }

  // 10. Resynchroniser l'echeancier : si la somme des echeances ne couvre plus
  // le nouveau total de la facture, ajouter une echeance de regularisation.
  // (Sans ca, les prelevements/cheques prevus encaissent moins que le du —
  // constat de l'audit facturation du 24/07/2026.)
  try {
    const [{ data: lignesFinales }, { data: echeances }] = await Promise.all([
      sb.from('facture_lignes').select('montant').eq('facture_id', facture.id),
      sb.from('cheques_prevus').select('id, montant, numero_cheque, date_echeance, mode_paiement, contrat_id, ecole_id').eq('famille_id', enfant.famille_id),
    ])
    const totalFacture = (lignesFinales || []).reduce((s: number, l: any) => s + (parseFloat(l.montant) || 0), 0)
    const totalEch = (echeances || []).reduce((s: number, e: any) => s + (parseFloat(e.montant) || 0), 0)
    const ecartEch = Math.round((totalFacture - totalEch) * 100) / 100
    if ((echeances || []).length > 0 && ecartEch > 1) {
      const maxNum = Math.max(...(echeances || []).map((e: any) => e.numero_cheque || 0))
      const derniereDate = (echeances || []).map((e: any) => e.date_echeance).sort().pop()
      const modeEch = (echeances || [])[0]?.mode_paiement || 'virement'
      await sb.from('cheques_prevus').insert({
        contrat_id: (echeances || [])[0]?.contrat_id || contrat.id,
        famille_id: enfant.famille_id,
        ecole_id: ecoleId,
        numero_cheque: maxNum + 1,
        montant: ecartEch,
        date_echeance: derniereDate,
        statut: modeEch === 'cheque' ? 'attente_reception' : 'prevu',
        mode_paiement: modeEch,
        note: `Régularisation auto : ajout option ${tarif.nom_poste}`,
        facture_id: facture.id,
      })
    }
  } catch { /* best effort : la facture est correcte, l'echeancier sera regularisable a la main */ }

  return {
    ok: true,
    posteAjoute: { tarif_id: tarifId, nom: tarif.nom_poste, montant },
    factureModifiee: true,
    factureNumero: facture.numero,
    factureId: facture.id,
  }
}
