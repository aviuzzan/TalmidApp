'use client'
/**
 * Compta analytique — ventilation du chiffre d'affaires.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * REFONTE ssss2-B — POURQUOI
 * ──────────────────────────────────────────────────────────────────────────
 * Cette page agrégeait sur `facture_lignes.centre_cout`, un champ TEXTE que
 * la facturation n'a jamais écrit. Résultat : `l.centre_cout || 'autre'`
 * renvoyait toujours 'autre', donc 100 % du CA tombait dans une seule barre
 * et les six autres libellés déclarés (scolarité, cantine, transport…)
 * n'apparaissaient jamais. La page était morte depuis sa création, sans que
 * rien ne le signale — c'est le pire des cas : un écran qui affiche un
 * chiffre faux avec l'aplomb d'un chiffre juste.
 *
 * Depuis ssss2, `facture_lignes` porte de vraies dimensions renseignées à la
 * facturation : `compte_id`, `activite_id`, `tarif_id`. On ventile donc sur
 * celles-ci, au choix de l'utilisateur :
 *   - par COMPTE comptable   (`comptes_comptables`)
 *   - par ACTIVITÉ           (`sections_analytiques`, dimension 'activite')
 *   - par POSTE tarifaire    (`tarifs_secteur.nom_poste` via `tarif_id`)
 *
 * Les lignes anciennes ont ces colonnes à NULL. Elles ne sont PAS diluées
 * dans un « Autre » silencieux : elles sont regroupées dans une entrée
 * « Non imputé » explicite, avec le nombre de lignes concernées, pour que
 * l'utilisateur voie exactement quelle part du CA n'est pas ventilable.
 *
 * L'encaissé reste une ESTIMATION AU PRORATA du facturé (les règlements ne
 * sont pas affectés ligne à ligne en base) : c'est écrit à l'écran, alors
 * qu'auparavant le chiffre était présenté comme une mesure.
 */
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive } from '@/lib/exercice-context'
import { chargerParLots, chargerParTranchesEtLots } from '@/lib/pagination'

type Vue = 'compte' | 'activite' | 'poste'

const VUES: { cle: Vue; label: string; sousTitre: string }[] = [
  { cle: 'compte', label: 'Par compte comptable', sousTitre: 'comptes de produit du plan comptable' },
  { cle: 'activite', label: 'Par activité', sousTitre: 'sections analytiques de dimension « activité »' },
  { cle: 'poste', label: 'Par poste tarifaire', sousTitre: 'postes des tarifs paramétrés' },
]

/** Clé réservée au regroupement des lignes sans imputation. */
const CLE_NON_IMPUTE = '__non_impute__'

type LigneAnalytique = {
  facture_id: string
  montant: number
  compte_id: string | null
  activite_id: string | null
  tarif_id: string | null
}

type Repartition = {
  cle: string
  label: string
  total_facture: number
  total_encaisse: number
  nb_lignes: number
  non_impute: boolean
}

/**
 * Palette stable par index : les dimensions sont dynamiques (comptes et
 * activités varient d'une école à l'autre), une table de couleurs codée en
 * dur par libellé — comme l'ancienne — ne peut pas les couvrir.
 */
const PALETTE = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#DB2777', '#65A30D', '#4338CA', '#EA580C']
const COULEUR_NON_IMPUTE = '#B45309'

function couleurDe(cle: string, index: number): string {
  return cle === CLE_NON_IMPUTE ? COULEUR_NON_IMPUTE : PALETTE[index % PALETTE.length]
}

function fmt(n: number): string {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export default function AnalytiquePage() {
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string>('')
  const [vue, setVue] = useState<Vue>('compte')

  const [lignes, setLignes] = useState<LigneAnalytique[]>([])
  const [facMap, setFacMap] = useState<Record<string, { tf: number; te: number }>>({})
  const [libComptes, setLibComptes] = useState<Record<string, string>>({})
  const [libActivites, setLibActivites] = useState<Record<string, string>>({})
  const [libPostes, setLibPostes] = useState<Record<string, string>>({})
  const [totalFacture, setTotalFacture] = useState(0)
  const [totalEncaisse, setTotalEncaisse] = useState(0)

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id, annee])

  async function load() {
    setLoading(true)
    setErreur('')
    const s = createClient()

    // ── Factures de l'exercice ─────────────────────────────────────────
    // Pagination obligatoire : PostgREST plafonne SILENCIEUSEMENT à 1000
    // lignes. Sans `.range()`, une école de plus de 1000 factures voyait son
    // CA figé, sans erreur. Tri déterministe terminé par `id` (clé unique),
    // sinon deux lots peuvent se recouvrir ou sauter des factures.
    const resFactures = await chargerParLots<any>((debut, fin) => s
      .from('factures_solde')
      .select('id, total_facture, total_regle, annee_scolaire, famille_id, statut, familles!inner(ecole_id)')
      .eq('annee_scolaire', annee)
      .eq('familles.ecole_id', ecole.id)
      .neq('statut', 'annule')
      .order('id', { ascending: true })
      .range(debut, fin))

    if (resFactures.error) {
      setErreur('Lecture des factures impossible : ' + resFactures.error)
      setLignes([]); setFacMap({}); setTotalFacture(0); setTotalEncaisse(0); setLoading(false); return
    }
    if (resFactures.tronque) {
      setErreur('Volume de factures supérieur au garde-fou de pagination : chiffres non fiables, restreindre l\'exercice.')
      setLignes([]); setFacMap({}); setTotalFacture(0); setTotalEncaisse(0); setLoading(false); return
    }

    const factures = resFactures.rows
    const facIds = factures.map((f: any) => String(f.id))
    if (facIds.length === 0) {
      setLignes([]); setFacMap({}); setTotalFacture(0); setTotalEncaisse(0); setLoading(false); return
    }

    const map: Record<string, { tf: number; te: number }> = {}
    let tf = 0, te = 0
    for (const f of factures as any[]) {
      const e = { tf: Number(f.total_facture || 0), te: Number(f.total_regle || 0) }
      map[String(f.id)] = e
      tf += e.tf
      te += e.te
    }

    // ── Lignes de facture + référentiels d'imputation ──────────────────
    // `.in('facture_id', facIds)` avec des milliers d'UUID produit une URL
    // énorme (HTTP 414) : on passe par `chargerParTranchesEtLots`, qui
    // découpe la liste ET pagine chaque tranche.
    //
    // Les référentiels sont lus à part, sans jointure imbriquée : le nom des
    // contraintes FK de `facture_lignes` n'est pas garanti sur tous les
    // environnements, et une jointure ratée ferait tout retomber en « non
    // imputé » — exactement le bug qu'on corrige.
    const [resLignes, resComptes, resSections, resTarifs] = await Promise.all([
      chargerParTranchesEtLots<any, string>(facIds, (tranche, debut, fin) => s
        .from('facture_lignes')
        .select('id, facture_id, montant, compte_id, activite_id, tarif_id')
        .in('facture_id', tranche)
        .order('id', { ascending: true })
        .range(debut, fin)),
      chargerParLots<any>((debut, fin) => s
        .from('comptes_comptables')
        .select('id, code, libelle')
        .eq('ecole_id', ecole.id)
        .order('id', { ascending: true })
        .range(debut, fin)),
      // `select('*')` volontaire : le libellé de `sections_analytiques` n'est
      // pas garanti sous un nom unique (`nom`, `libelle`…). On prend ce qui
      // existe plutôt que de faire échouer la requête sur une colonne absente.
      chargerParLots<any>((debut, fin) => s
        .from('sections_analytiques')
        .select('*')
        .eq('ecole_id', ecole.id)
        .order('id', { ascending: true })
        .range(debut, fin)),
      chargerParLots<any>((debut, fin) => s
        .from('tarifs_secteur')
        .select('id, nom_poste, secteur_id')
        .eq('ecole_id', ecole.id)
        .order('id', { ascending: true })
        .range(debut, fin)),
    ])
    // AUDIT P2 (06/08/2026) — « postes homonymes » : libellés des secteurs pour
    // distinguer les postes tarifaires qui portent le même nom (voir plus bas).
    const { data: secteursData } = await s.from('secteurs').select('id, nom').eq('ecole_id', ecole.id)

    // Une erreur RLS ne lève pas d'exception sur ce projet : on teste
    // `error` explicitement, sinon la page afficherait 0 € en silence.
    const echecs: string[] = []
    if (resLignes.error) echecs.push('lignes de facture (' + resLignes.error + ')')
    if (resComptes.error) echecs.push('comptes comptables (' + resComptes.error + ')')
    if (resSections.error) echecs.push('sections analytiques (' + resSections.error + ')')
    if (resTarifs.error) echecs.push('tarifs (' + resTarifs.error + ')')
    if (echecs.length > 0) {
      setErreur('Lecture impossible : ' + echecs.join(', '))
      setLignes([]); setFacMap({}); setTotalFacture(0); setTotalEncaisse(0); setLoading(false); return
    }
    if (resLignes.tronque) {
      setErreur('Volume de lignes de facture supérieur au garde-fou de pagination : ventilation incomplète, chiffres non fiables.')
      setLignes([]); setFacMap({}); setTotalFacture(0); setTotalEncaisse(0); setLoading(false); return
    }

    const comptes: Record<string, string> = {}
    for (const c of resComptes.rows as any[]) {
      if (!c?.id) continue
      comptes[String(c.id)] = [c.code, c.libelle].filter(Boolean).join(' — ') || String(c.id)
    }

    const activites: Record<string, string> = {}
    for (const sec of resSections.rows as any[]) {
      if (!sec?.id) continue
      // On ne garde que la dimension « activite » : les centres de coût sont
      // une autre dimension, les mélanger fausserait le total.
      const dim = sec.dimension === undefined || sec.dimension === null ? 'activite' : String(sec.dimension)
      if (dim !== 'activite') continue
      const label = sec.nom || sec.libelle || sec.intitule || sec.code || String(sec.id)
      activites[String(sec.id)] = String(label)
    }

    // AUDIT P2 (06/08/2026) — « postes homonymes » : la vue « par poste » agrège
    // par tarif_id mais n'affichait que nom_poste. Or plusieurs tarifs portent
    // légitimement le même nom (un « Frais de scolarité » par secteur : Maternelle,
    // Primaire, Collège…) → l'écran alignait des lignes strictement identiques,
    // impossibles à distinguer. Quand un nom de poste est porté par plusieurs
    // tarifs, on suffixe le secteur : « Frais de scolarité — Primaire ».
    const secteurNoms: Record<string, string> = {}
    for (const sec of secteursData ?? []) secteurNoms[String(sec.id)] = String(sec.nom || '')
    const occurrencesNom: Record<string, number> = {}
    for (const t of resTarifs.rows as any[]) {
      if (!t?.id) continue
      const nom = String(t.nom_poste || t.id)
      occurrencesNom[nom] = (occurrencesNom[nom] || 0) + 1
    }
    const postes: Record<string, string> = {}
    for (const t of resTarifs.rows as any[]) {
      if (!t?.id) continue
      const nom = String(t.nom_poste || t.id)
      const secteur = t.secteur_id ? secteurNoms[String(t.secteur_id)] : ''
      postes[String(t.id)] = occurrencesNom[nom] > 1 && secteur ? `${nom} — ${secteur}` : nom
    }

    setLignes((resLignes.rows as any[]).map(l => ({
      facture_id: String(l.facture_id),
      montant: Number(l.montant || 0),
      compte_id: l.compte_id ? String(l.compte_id) : null,
      activite_id: l.activite_id ? String(l.activite_id) : null,
      tarif_id: l.tarif_id ? String(l.tarif_id) : null,
    })))
    setFacMap(map)
    setLibComptes(comptes)
    setLibActivites(activites)
    setLibPostes(postes)
    setTotalFacture(tf)
    setTotalEncaisse(te)
    setLoading(false)
  }

  /**
   * Agrégation selon la vue choisie. Une ligne dont la dimension est NULL —
   * ou pointe vers une référence introuvable (compte supprimé, section
   * d'une autre dimension) — va dans « Non imputé », jamais dans un fourre-tout
   * anonyme.
   */
  const repartition = useMemo<Repartition[]>(() => {
    const libelles = vue === 'compte' ? libComptes : vue === 'activite' ? libActivites : libPostes
    const agg: Record<string, Repartition> = {}

    for (const l of lignes) {
      const ref = vue === 'compte' ? l.compte_id : vue === 'activite' ? l.activite_id : l.tarif_id
      const label = ref ? libelles[ref] : undefined

      // ────────────────────────────────────────────────────────────────────
      // Repli sur le compte pour la vue « par poste ».
      //
      // Toutes les lignes de facture ne viennent pas d'un poste tarifaire, et
      // ce n'est pas une anomalie :
      //   - une scolarité au TARIF ACCORDÉ vient d'un dossier de réduction,
      //     son montant est fixé au cas par cas et ne sort d'aucune grille ;
      //   - les FRAIS D'INSCRIPTION viennent de frais_inscription_config,
      //     une table distincte des tarifs.
      // Ces lignes sont parfaitement imputées comptablement (70611, 70616) :
      // les jeter dans un « Non imputé » orange laissait croire à un défaut de
      // paramétrage inexistant, et sortait 21 % du chiffre d'affaires de la
      // ventilation. On les regroupe donc sous le libellé de leur compte.
      // ────────────────────────────────────────────────────────────────────
      let cle: string
      let libelle: string
      if (ref && label) {
        cle = ref
        libelle = String(label)
      } else if (vue === 'poste' && l.compte_id && libComptes[l.compte_id]) {
        cle = `compte:${l.compte_id}`
        libelle = `${libComptes[l.compte_id]} (hors grille tarifaire)`
      } else {
        cle = CLE_NON_IMPUTE
        libelle = 'Non imputé'
      }

      if (!agg[cle]) {
        agg[cle] = {
          cle,
          label: libelle,
          total_facture: 0,
          total_encaisse: 0,
          nb_lignes: 0,
          non_impute: cle === CLE_NON_IMPUTE,
        }
      }
      agg[cle].total_facture += l.montant
      agg[cle].nb_lignes += 1

      // Estimation au prorata (cf. bandeau à l'écran) : les règlements ne
      // sont pas affectés poste par poste en base, on répartit donc
      // l'encaissé d'une facture au prorata du poids de chaque ligne.
      const fac = facMap[l.facture_id]
      if (fac && fac.tf > 0) agg[cle].total_encaisse += (l.montant / fac.tf) * fac.te
    }

    // Le « Non imputé » reste en fin de liste : c'est un indicateur de dette
    // de données, pas un poste de gestion.
    return Object.values(agg).sort((a, b) => {
      if (a.non_impute !== b.non_impute) return a.non_impute ? 1 : -1
      return b.total_facture - a.total_facture
    })
  }, [lignes, facMap, vue, libComptes, libActivites, libPostes])

  const nonImpute = repartition.find(r => r.non_impute)
  const totalLignesVentilees = repartition.reduce((s, r) => s + r.total_facture, 0)
  const vueCourante = VUES.find(v => v.cle === vue)!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Compta analytique</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Ventilation des recettes — {vueCourante.sousTitre} · exercice {annee}
        </p>
      </div>

      {/* Sélecteur de dimension */}
      <div style={{ display: 'flex', gap: 6, background: '#F1F5F9', padding: 4, borderRadius: 9, alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        {VUES.map(v => (
          <button
            key={v.cle}
            onClick={() => setVue(v.cle)}
            style={{
              background: v.cle === vue ? '#fff' : 'transparent',
              border: 'none',
              borderRadius: 7,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: v.cle === vue ? 700 : 600,
              color: v.cle === vue ? '#1E293B' : '#64748B',
              cursor: 'pointer',
              boxShadow: v.cle === vue ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {erreur ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 10, padding: 16, fontSize: 13 }}>
          {erreur}
        </div>
      ) : loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
      ) : repartition.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12 }}>
          Aucune ligne de facture sur cet exercice.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ background: 'linear-gradient(135deg,#1E40AF,#2563EB)', color: '#fff', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase' }}>CA facturé</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{fmt(totalFacture)}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
                dont {fmt(totalLignesVentilees)} portés par des lignes de facture
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase' }}>CA encaissé</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: '#10B981' }}>{fmt(totalEncaisse)}</div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                {totalFacture > 0 ? Math.round((totalEncaisse / totalFacture) * 100) : 0}% du facturé
              </div>
            </div>
          </div>

          {/* Honnêteté du chiffre : l'encaissé par poste n'est PAS mesuré. */}
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
            <strong>Encaissé par ligne = estimation au prorata.</strong> Les règlements sont enregistrés au niveau
            de la facture, pas du poste : l&apos;encaissé de chaque ligne du tableau est reconstitué en répartissant
            le règlement de la facture au prorata du montant de ses lignes. Seul le total « CA encaissé » ci-dessus
            est une donnée mesurée.
          </div>

          {/* Dette de données rendue visible, jamais diluée dans un « Autre ». */}
          {nonImpute && (
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#9A3412', lineHeight: 1.5 }}>
              <strong>{nonImpute.nb_lignes} ligne{nonImpute.nb_lignes > 1 ? 's' : ''} sans imputation</strong> sur cette
              dimension, soit {fmt(nonImpute.total_facture)}
              {totalLignesVentilees > 0 ? ` (${((nonImpute.total_facture / totalLignesVentilees) * 100).toFixed(1)} % du facturé ventilé)` : ''}.
              Ces lignes n&apos;ont ni compte comptable ni {vue === 'activite' ? 'activité' : 'poste'} renseigné :
              il s&apos;agit soit de lignes créées avant la mise en place du plan comptable, soit d&apos;un poste
              tarifaire dont l&apos;imputation reste à définir dans Paramètres &gt; Tarifs. Ce montant n&apos;est pas
              réparti sur les autres entrées.
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Répartition du chiffre d&apos;affaires</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {repartition.map((r, i) => {
                const couleur = couleurDe(r.cle, i)
                const pct = totalLignesVentilees > 0 ? (r.total_facture / totalLignesVentilees) * 100 : 0
                return (
                  <div key={r.cle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4, gap: 12 }}>
                      <span style={{ fontWeight: 600, color: couleur }}>
                        {r.label}{r.non_impute ? ' ⚠' : ''}
                      </span>
                      <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#1E293B' }}>{fmt(r.total_facture)}</strong> · {pct.toFixed(1)}% · {r.nb_lignes} ligne{r.nb_lignes > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ background: '#F1F5F9', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                      <div style={{ background: couleur, height: '100%', width: Math.max(0, pct) + '%', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    {vue === 'compte' ? 'Compte' : vue === 'activite' ? 'Activité' : 'Poste'}
                  </th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Facturé</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Encaissé (est.)</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>% enc. (est.)</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Lignes</th>
                </tr>
              </thead>
              <tbody>
                {repartition.map((r, i) => {
                  const couleur = couleurDe(r.cle, i)
                  const pctEnc = r.total_facture > 0 ? (r.total_encaisse / r.total_facture) * 100 : 0
                  return (
                    <tr key={r.cle} style={{ borderBottom: i < repartition.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: r.non_impute ? '#FFEDD5' : '#F1F5F9', color: couleur, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                          {r.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#1E293B' }}>{fmt(r.total_facture)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#10B981', fontWeight: 600 }}>{fmt(r.total_encaisse)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748B' }}>{pctEnc.toFixed(0)}%</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748B' }}>{r.nb_lignes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
