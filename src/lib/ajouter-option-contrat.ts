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
import { chargerImputations, imputer } from './comptabilite'
import { lisserEcheancierFamille } from './echeance'

export interface AjouterOptionResult {
  ok: boolean
  error?: string
  posteAjoute?: { tarif_id: string; nom: string; montant: number }
  factureModifiee?: boolean
  factureNumero?: string
  factureId?: string
  /** true si le refus est du a une capacite atteinte (places_max) — permet de proposer la liste d'attente */
  complet?: boolean
  /**
   * Operation principale reussie MAIS une ecriture secondaire (echeancier) a
   * echoue. Champ optionnel : les appelants existants qui l'ignorent restent
   * compatibles, ok reste true.
   */
  avertissement?: string
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
    .select('id, postes, sous_total')
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

  // 5bis. Helper d'echec APRES la mise a jour du contrat.
  // FIX audit RLS 29/07/2026 : une policy qui refuse une ecriture ne leve pas
  // d'exception (Supabase renvoie { data: null, error }). Toute ecriture est
  // desormais verifiee ; si l'une echoue on remet les postes d'origine pour ne
  // pas laisser contrat et facture desynchronises, et on retourne ok:false.
  const postesOrigine = (ce as any).postes
  const sousTotalOrigine = (ce as any).sous_total
  const echec = async (message: string): Promise<AjouterOptionResult> => {
    const { error: rbErr } = await sb.from('contrat_enfants')
      .update({ postes: postesOrigine, sous_total: sousTotalOrigine })
      .eq('id', ce.id)
    if (rbErr) console.error('[ajouterOptionAuContrat] rollback contrat_enfants failed:', rbErr.message)
    return {
      ok: false,
      factureModifiee: false,
      error: message + (rbErr
        ? ` (ATTENTION : annulation de la modification du contrat impossible — ${rbErr.message}. Verifier le contrat ET la facture manuellement.)`
        : ' — la modification du contrat a ete annulee, rien n\'a ete enregistre.'),
    }
  }

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

  // 8. Determiner les anciennes lignes de facture a retirer pour cet enfant :
  //    celles des tarifs evinces (meme groupe exclusif) + celles du tarif
  //    nouvellement ajoute (au cas ou on re-cocherait). Identification par nom
  //    du poste (approche simple).
  //
  //    FIX audit RLS 29/07/2026 : la sequence delete -> insert etait aveugle. Un
  //    delete qui passe suivi d'inserts refuses amputait la facture de l'enfant
  //    tout en repondant « ok ». Desormais :
  //      1. on CALCULE toutes les nouvelles lignes en memoire,
  //      2. on prend un SNAPSHOT complet des lignes qu'on va supprimer,
  //      3. on supprime (erreur verifiee),
  //      4. on insere en UN SEUL insert (erreur verifiee),
  //      5. si l'insert echoue on RESTAURE le snapshot puis on remonte l'echec.
  const nomsAEvincer = new Set<string>()
  const { data: tarifsAEvincer, error: tarifsEvErr } = await sb.from('tarifs_secteur').select('nom_poste').in('id', Array.from(idsAEvincer))
  if (tarifsEvErr) return await echec('Lecture des tarifs a evincer impossible : ' + tarifsEvErr.message)
  ;(tarifsAEvincer || []).forEach((t: any) => nomsAEvincer.add(String(t.nom_poste || '').toLowerCase()))

  // Snapshot COMPLET (select *) : indispensable pour pouvoir restaurer les lignes
  // supprimees si l'insert des nouvelles lignes est refuse.
  const { data: lignesActuelles, error: lignesErr } = await sb.from('facture_lignes').select('*').eq('facture_id', facture.id)
  if (lignesErr) return await echec('Lecture des lignes de facture impossible : ' + lignesErr.message)
  const toutesLignes: any[] = (lignesActuelles || []) as any[]

  const idsLignesAEvincer: string[] = toutesLignes
    .filter((l: any) => l.enfant_id === enfantId && nomsAEvincer.size > 0)
    .filter((l: any) => Array.from(nomsAEvincer).some(n => (l.description || '').toLowerCase().startsWith(n + ' ')))
    .map((l: any) => l.id)

  // 9. Recalculer / ajouter les lignes pour cet enfant (en memoire uniquement)
  //
  // Le resolveur comptable est charge ICI, dans la phase de calcul, avant toute
  // ecriture destructive : une lecture qui echoue ne doit jamais laisser la
  // facture a moitie reconstruite. chargerImputations ne leve pas et renvoie au
  // pire un resolveur vide, auquel cas les lignes partent avec des colonnes
  // comptables a NULL — une facture sans compte se rattrape, une facture non
  // ecrite bloque la famille.
  const resolveur = await chargerImputations(sb, ecoleId)
  const inclusDansReduction = tarif.inclus_dans_reduction !== false
  const montant = parseFloat(tarif.montant as any) || 0

  const nouvellesLignes: any[] = []
  let idsASupprimer: string[] = idsLignesAEvincer

  if (ddr?.tarif_accorde && inclusDansReduction) {
    // Cas DDR + option incluse : il faut recalculer la ligne Scolarite de cet enfant
    // (car la part accordee est deja consommee par les postes inclus existants).
    // Approche pragmatique : on regenere UNIQUEMENT les lignes de cet enfant en repartant
    // des postes actuels + tarif accorde / nb enfants du contrat.
    const { data: allCE, error: allCEErr } = await sb.from('contrat_enfants').select('enfant_id').eq('contrat_id', contrat.id)
    if (allCEErr) return await echec('Lecture des enfants du contrat impossible : ' + allCEErr.message)
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

    // On regenere TOUTES les lignes de cet enfant : elles sont donc toutes a supprimer
    idsASupprimer = toutesLignes.filter((l: any) => l.enfant_id === enfantId).map((l: any) => l.id)

    // Ligne Scolarite : elle vient du poste scolarite du contrat, seul son
    // montant est recalcule. On l'impute donc sur le compte de ce poste et pas
    // sur le compte de repli.
    const posteScolarite = nouveauxPostes.find((p: any) => /scolarit/i.test(p.nom || ''))
    if (scolEnfant > 0) {
      nouvellesLignes.push(imputer({
        facture_id: facture.id, enfant_id: enfantId,
        tarif_id: posteScolarite?.tarif_id ?? null,
        description: `Scolarité ${anneeScolaire} — ${enfantLabel} (tarif accordé)`.trim(),
        montant: scolEnfant, deductible: true,
      }, posteScolarite?.tarif_id ? resolveur.parTarif(posteScolarite.tarif_id) : resolveur.parCle('poste_defaut')))
    }
    // Lignes postes inclus hors scolarite
    let excedent = Math.max(0, totalInclusHorsScol - partParEnfant)
    for (const p of postesInclusHorsScol) {
      const m = parseFloat(p.montant) || 0
      const reduc = Math.min(excedent, m)
      excedent -= reduc
      const final = Math.round((m - reduc) * 100) / 100
      if (final > 0) {
        nouvellesLignes.push(imputer({
          facture_id: facture.id, enfant_id: enfantId,
          tarif_id: p.tarif_id ?? null,
          description: `${p.nom || 'Poste'} ${anneeScolaire} — ${enfantLabel}`.trim(),
          montant: final, deductible: true,
        }, resolveur.parTarif(p.tarif_id)))
      }
    }
    // Lignes postes non inclus
    const postesNonInclus = nouveauxPostes.filter((p: any) => tarifMap[p.tarif_id] === false)
    for (const p of postesNonInclus) {
      const m = parseFloat(p.montant) || 0
      if (m > 0) {
        nouvellesLignes.push(imputer({
          facture_id: facture.id, enfant_id: enfantId,
          tarif_id: p.tarif_id ?? null,
          description: `${p.nom || 'Poste'} ${anneeScolaire} — ${enfantLabel}`.trim(),
          montant: m, deductible: false,
        }, resolveur.parTarif(p.tarif_id)))
      }
    }
  } else if (ddr?.tarif_accorde && !inclusDansReduction) {
    // DDR + option non incluse : juste ajouter la ligne au plein tarif
    nouvellesLignes.push(imputer({
      facture_id: facture.id, enfant_id: enfantId,
      tarif_id: tarifId,
      description: `${tarif.nom_poste} ${anneeScolaire} — ${enfantLabel}`.trim(),
      montant, deductible: false,
    }, resolveur.parTarif(tarifId)))
  } else {
    // Pas de DDR : juste ajouter la ligne au plein tarif
    nouvellesLignes.push(imputer({
      facture_id: facture.id, enfant_id: enfantId,
      tarif_id: tarifId,
      description: `${tarif.nom_poste} ${anneeScolaire} — ${enfantLabel}`.trim(),
      montant, deductible: inclusDansReduction,
    }, resolveur.parTarif(tarifId)))
  }

  // 9bis. Sequence destructive, entierement verifiee.
  const setASupprimer = new Set<string>(idsASupprimer)
  const lignesSupprimees = toutesLignes.filter((l: any) => setASupprimer.has(l.id))

  if (idsASupprimer.length > 0) {
    const { error: delErr } = await sb.from('facture_lignes').delete().in('id', idsASupprimer)
    if (delErr) {
      return await echec('Suppression des anciennes lignes de facture refusee : ' + delErr.message)
    }
  }

  if (nouvellesLignes.length > 0) {
    const { error: insLignesErr } = await sb.from('facture_lignes').insert(nouvellesLignes)
    if (insLignesErr) {
      // Sans restauration, la facture de l'enfant reste amputee (les lignes ont
      // deja ete supprimees). On rejoue le snapshot a l'identique (ids inclus).
      let restaure = true
      if (lignesSupprimees.length > 0) {
        const { error: restErr } = await sb.from('facture_lignes').insert(lignesSupprimees)
        if (restErr) {
          restaure = false
          console.error('[ajouterOptionAuContrat] restauration lignes facture failed:', restErr.message)
        }
      }
      return await echec(
        `Ecriture des lignes de la facture ${facture.numero} refusee : ${insLignesErr.message}.` +
        (restaure
          ? ' Les lignes precedentes ont ete restaurees, la facture est inchangee.'
          : ` ATTENTION : la restauration des ${lignesSupprimees.length} ligne(s) supprimee(s) a EGALEMENT echoue — verifier la facture ${facture.numero} manuellement.`),
      )
    }
  }

  // 10. Resynchroniser l'echeancier — LISSAGE (regle mmmm1 d'Avi, appliquee au
  // serveur le 31/08/2026) : on ne cree plus d'echeance de regularisation ; le
  // reste du reel (reglements et avoirs imputes deduits) est reparti sur les
  // echeances actives existantes — meme nombre, memes dates, memes modes — la
  // derniere absorbant l'arrondi. Best effort : la facture, elle, est correcte ;
  // l'echec n'est pas muet, il est remonte dans `avertissement`.
  let avertissement: string | undefined
  const lissage = await lisserEcheancierFamille(sb, enfant.famille_id)
  if (!lissage.ok) {
    avertissement = `Facture ${facture.numero} mise a jour, mais l'echeancier n'a pas pu etre lisse (${lissage.message}). Utiliser « Recalculer l'echeancier sur le reste du » depuis la page Echeancier de la famille.`
    console.error('[ajouterOptionAuContrat] lissage echeancier failed:', lissage.message)
  }

  return {
    ok: true,
    posteAjoute: { tarif_id: tarifId, nom: tarif.nom_poste, montant },
    factureModifiee: true,
    factureNumero: facture.numero,
    factureId: facture.id,
    avertissement,
  }
}
