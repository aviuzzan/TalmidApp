'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useExercice } from '@/lib/exercice-context'
import { useI18n } from '@/lib/i18n'
import { getSecteurScope, getSecteurNom } from '@/lib/secteur-scope'
import { downloadCSV, formatDateCSV } from '@/lib/csv-export'
import { COLONNES_ELEVES, type ColonneExport } from '@/lib/export-colonnes'

// EXPORT DEPUIS LA PAGE ÉLÈVES (demande client 29/07/2026 : « j'aurais aimé
// pouvoir les sortir depuis la page élève »).
// Jeu de colonnes fixe : on réutilise les libellés de COLONNES_ELEVES
// (src/lib/export-colonnes.ts) pour que les en-têtes soient identiques à ceux
// de la page Exports, + 2 colonnes propres à cette page (Contrat, Année).
// La modale de choix des colonnes de la page Exports n'est pas un composant
// réutilisable (JSX inline), on ne la duplique donc pas ici.
const CLES_EXPORT_ELEVES = [
  'prenom', 'nom', 'date_naissance', 'famille_numero', 'famille_nom',
  'classe', 'statut', 'parent1_telephone', 'parent1_email',
]

const COLONNES_EXPORT: ColonneExport[] = CLES_EXPORT_ELEVES
  .map(k => COLONNES_ELEVES.find(c => c.key === k))
  .filter((c): c is ColonneExport => !!c)

const LIBELLE_CONTRAT: Record<string, string> = {
  valide: 'Signé', soumis: 'Soumis', brouillon: 'Brouillon', annule: 'Annulé',
}

// « Kita 7 » → « kita-7 », « Élémentaire A » → « elementaire-a » (nom de fichier)
const ACCENTS = /[\u0300-\u036f]/g
const slugifier = (v: string): string =>
  v.normalize('NFD').replace(ACCENTS, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// ────────────────────────────────────────────────────────────────────────────
// PAGINATION (fix 29/07/2026)
// Supabase/PostgREST plafonne SILENCIEUSEMENT chaque requête à 1000 lignes.
// Au-delà, la liste — et donc l'export CSV qui en découle — serait tronquée
// sans le moindre message. On charge donc par lots de 1000 jusqu'à ce qu'un
// lot revienne incomplet. Le tri doit être déterministe (`id`) : le tri
// « lisible » (nom, prénom) est fait côté client juste après.
// (Même helper que src/app/[ecole]/exports/page.tsx — volontairement dupliqué,
// à factoriser dans src/lib/ le jour où un 3e appelant apparaîtra.)
// ────────────────────────────────────────────────────────────────────────────
const TAILLE_LOT = 1000
const MAX_LOTS = 200

const chargerParLots = async (
  requeteLot: (debut: number, fin: number) => PromiseLike<any>,
): Promise<any[]> => {
  const rows: any[] = []
  for (let i = 0; i < MAX_LOTS; i++) {
    const debut = i * TAILLE_LOT
    const res = (await requeteLot(debut, debut + TAILLE_LOT - 1)) as { data: any[] | null }
    const lot = res.data ?? []
    rows.push(...lot)
    if (lot.length < TAILLE_LOT) break
  }
  return rows
}

export default function EnfantsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const ecole = useEcole()
  const { exerciceSelectionne } = useExercice()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtreClasse, setFiltreClasse] = useState('')
  const [filtreContrat, setFiltreContrat] = useState('') // '' | 'signe' | 'soumis' | 'brouillon' | 'aucun'
  const [classes, setClasses] = useState<any[]>([])
  const [showSortis, setShowSortis] = useState(false)
  const [contratMap, setContratMap] = useState<Record<string, string>>({}) // enfant_id → statut
  // SECTEUR (llll2) : si le compte est restreint à un secteur, on affiche un badge et on filtre la liste
  const [secteurScope, setSecteurScope] = useState<{ id: string; nom: string | null } | null>(null)

  useEffect(() => {
    if (ecole?.id && exerciceSelectionne?.id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id, exerciceSelectionne?.id])

  async function load() {
    if (!ecole?.id || !exerciceSelectionne?.id) return
    setLoading(true)
    const s = createClient()

    // SECTEUR (llll2) : charger le scope du compte connecté avant la liste
    const { data: { session } } = await s.auth.getSession()
    const scope = session ? await getSecteurScope(s, session.user.id) : { secteurId: null }
    if (scope.secteurId) {
      const nom = await getSecteurNom(s, scope.secteurId)
      setSecteurScope({ id: scope.secteurId, nom })
    } else {
      setSecteurScope(null)
    }

    // SECTEUR (llll2) : si scope actif, jointure inner sur classes + filtre secteur
    // (les élèves sans classe sortent alors de la vue, c'est voulu — ils n'appartiennent à aucun secteur)
    // `familles.numero` sert à la colonne « N° famille » de l'export CSV.
    const exerciceId = exerciceSelectionne.id
    const exerciceCode = exerciceSelectionne.code
    const secteurId = scope.secteurId
    const [sco, { data: cls }, contrats] = await Promise.all([
      chargerParLots((debut, fin) => {
        let q = s.from('scolarites')
          .select(secteurId
            ? 'id, enfant_id, classe_id, statut_inscription, date_sortie, enfants(id, prenom, nom, date_naissance, famille_id, familles(numero, nom, parent1_email, parent1_telephone)), classes!inner(nom, secteur_id)'
            : 'id, enfant_id, classe_id, statut_inscription, date_sortie, enfants(id, prenom, nom, date_naissance, famille_id, familles(numero, nom, parent1_email, parent1_telephone)), classes(nom)')
          .eq('ecole_id', ecole.id)
          .eq('exercice_id', exerciceId)
        if (secteurId) q = q.eq('classes.secteur_id', secteurId)
        return q.order('id').range(debut, fin)
      }),
      s.from('classes').select('id, nom').eq('ecole_id', ecole.id).order('nom'),
      chargerParLots((debut, fin) => s.from('contrats_scolarisation')
        .select('id, statut, annee_scolaire, contrat_enfants(enfant_id)')
        .eq('ecole_id', ecole.id)
        .eq('annee_scolaire', exerciceCode)
        .order('id')
        .range(debut, fin)),
    ])
    const list = sco.slice().sort((a: any, b: any) =>
      (a.enfants?.nom || '').localeCompare(b.enfants?.nom || '') ||
      (a.enfants?.prenom || '').localeCompare(b.enfants?.prenom || ''))

    // Construire enfant_id → statut contrat (priorité : valide > soumis > brouillon > annule)
    const priorite: Record<string, number> = { valide: 4, soumis: 3, brouillon: 2, annule: 1 }
    const map: Record<string, string> = {}
    for (const c of contrats || []) {
      for (const ce of (c as any).contrat_enfants || []) {
        const eid = ce.enfant_id
        if (!eid) continue
        const cur = map[eid]
        if (!cur || (priorite[c.statut] || 0) > (priorite[cur] || 0)) {
          map[eid] = c.statut
        }
      }
    }
    setContratMap(map)
    setRows(list)
    setClasses(cls ?? [])
    setLoading(false)
  }

  function contratBadge(enfantId: string) {
    const st = contratMap[enfantId]
    if (st === 'valide') return { label: '✓ Signé', color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' }
    if (st === 'soumis') return { label: '⏳ Soumis', color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' }
    if (st === 'brouillon') return { label: '📝 Brouillon', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' }
    if (st === 'annule') return { label: '✕ Annulé', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' }
    return { label: '— Aucun', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' }
  }

  const filtered = rows.filter(r => {
    const e = r.enfants
    const q = search.toLowerCase()
    const matchSearch = !q ||
      e?.prenom?.toLowerCase().includes(q) ||
      e?.nom?.toLowerCase().includes(q) ||
      e?.familles?.nom?.toLowerCase().includes(q)
    const matchClasse = !filtreClasse || r.classe_id === filtreClasse
    const matchStatut = showSortis || r.statut_inscription !== 'sorti'
    const stContrat = contratMap[r.enfant_id]
    const matchContrat = !filtreContrat
      || (filtreContrat === 'signe' && stContrat === 'valide')
      || (filtreContrat === 'soumis' && stContrat === 'soumis')
      || (filtreContrat === 'brouillon' && stContrat === 'brouillon')
      || (filtreContrat === 'aucun' && (!stContrat || stContrat === 'annule'))
    return matchSearch && matchClasse && matchStatut && matchContrat
  })

  const nbSortis = rows.filter(r => r.statut_inscription === 'sorti').length

  // Compteurs contrats pour résumé
  const cntContrats = {
    total: rows.length,
    signe: rows.filter(r => contratMap[r.enfant_id] === 'valide').length,
    soumis: rows.filter(r => contratMap[r.enfant_id] === 'soumis').length,
    brouillon: rows.filter(r => contratMap[r.enfant_id] === 'brouillon').length,
    aucun: rows.filter(r => !contratMap[r.enfant_id] || contratMap[r.enfant_id] === 'annule').length,
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EXPORT CSV DE LA LISTE AFFICHÉE (demande client 29/07/2026)
  // On exporte `filtered`, c'est-à-dire EXACTEMENT ce que l'utilisateur a sous
  // les yeux : recherche, filtre de classe, filtre de contrat et inclusion (ou
  // non) des élèves sortis. Filtrer sur « Kita 7 » puis exporter donne le
  // fichier de Kita 7.
  // Source des données : `scolarites` de l'exercice sélectionné → la classe et
  // le statut sont ceux de l'ANNÉE affichée (règle métier du 28/07 :
  // `scolarites` fait foi, pas `enfants.classe_id` / `enfants.annee_scolaire`).
  // Format : identique à la page Exports (CSV UTF-8 BOM, séparateur « ; »).
  // ──────────────────────────────────────────────────────────────────────────
  const exporterCSV = () => {
    if (filtered.length === 0) return
    const annee = exerciceSelectionne?.code || ''
    const classeFiltree = filtreClasse ? classes.find(c => c.id === filtreClasse) : null
    const lignes = filtered.map(r => {
      const e = r.enfants || {}
      const f = e.familles || {}
      const valeurs: Record<string, string> = {
        prenom: e.prenom || '',
        nom: e.nom || '',
        date_naissance: formatDateCSV(e.date_naissance),
        famille_numero: f.numero || '',
        famille_nom: f.nom || '',
        classe: r.classes?.nom || '',
        statut: r.statut_inscription || '',
        parent1_telephone: f.parent1_telephone || '',
        parent1_email: f.parent1_email || '',
      }
      return [
        ...COLONNES_EXPORT.map(c => valeurs[c.key] ?? ''),
        LIBELLE_CONTRAT[contratMap[r.enfant_id]] || 'Aucun',
        annee,
      ]
    })
    const suffixe = classeFiltree?.nom ? `-${slugifier(classeFiltree.nom)}` : ''
    downloadCSV(
      `eleves-${annee || 'annee'}${suffixe}.csv`,
      [...COLONNES_EXPORT.map(c => c.label), 'Contrat', 'Année'],
      lignes,
    )
  }

  const inp = {
    background: '#fff', border: '1px solid #E2E8F0', borderRadius: 9,
    padding: '9px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('pages.enfants.title')}</h1>
            {/* SECTEUR (llll2) : badge discret indiquant que la vue est restreinte au secteur de l'agent */}
            {secteurScope && (
              <span title="Votre compte est restreint à ce secteur : seuls ses élèves sont affichés."
                style={{ fontSize: 11, fontWeight: 600, color: '#3730A3', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 6, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                Secteur : {secteurScope.nom || '…'}
              </span>
            )}
          </div>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
            {filtered.length} élève(s) ·{' '}
            <span style={{ fontWeight: 600, color: '#2563EB' }}>Année {exerciceSelectionne?.code || '…'}</span>
            {' · '}
            <span style={{ color: '#065F46' }}>✓ {cntContrats.signe} signé(s)</span>{' '}
            <span style={{ color: '#1E40AF' }}>⏳ {cntContrats.soumis} soumis</span>{' '}
            <span style={{ color: '#92400E' }}>📝 {cntContrats.brouillon} brouillon</span>{' '}
            <span style={{ color: '#94A3B8' }}>— {cntContrats.aucun} sans contrat</span>
          </p>
        </div>
        {/* Export CSV de la liste affichée, filtres compris (demande client 29/07/2026) */}
        <button
          onClick={exporterCSV}
          disabled={loading || filtered.length === 0}
          title="Télécharge la liste telle que vous la voyez : recherche, classe, contrat et élèves sortis compris."
          style={{
            background: '#2563EB', color: '#fff', border: 'none', borderRadius: 9,
            padding: '10px 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            cursor: loading || filtered.length === 0 ? 'not-allowed' : 'pointer',
            opacity: loading || filtered.length === 0 ? 0.5 : 1,
          }}
        >
          ⬇ Exporter CSV ({filtered.length})
        </button>
      </div>

      {exerciceSelectionne?.statut === 'cloture' ? (
        <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, padding: '9px 14px' }}>
          🔒 L’année <strong>{exerciceSelectionne?.code}</strong> est <strong>clôturée</strong> : consultation uniquement. Les inscriptions, classes et factures de cette année ne peuvent plus être modifiées.
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#64748B', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '9px 14px' }}>
          Cette liste correspond à l’année <strong>{exerciceSelectionne?.code || '…'}</strong>. Changez d’année avec le sélecteur en haut de page pour voir les inscriptions d’une autre année scolaire.
        </div>
      )}

      {/* Barre de recherche */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 15 }}>🔍</span>
          <input
            style={{ ...inp, width: '100%', paddingLeft: 36 }}
            placeholder="Rechercher par nom, prénom, famille..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          style={{ ...inp, width: 180 }}
          value={filtreClasse}
          onChange={e => setFiltreClasse(e.target.value)}
        >
          <option value="">Toutes les classes</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
        <select
          style={{ ...inp, width: 200 }}
          value={filtreContrat}
          onChange={e => setFiltreContrat(e.target.value)}
          title="Filtrer par état du contrat"
        >
          <option value="">Tous les contrats ({cntContrats.total})</option>
          <option value="signe">✓ Contrat signé ({cntContrats.signe})</option>
          <option value="soumis">⏳ Soumis ({cntContrats.soumis})</option>
          <option value="brouillon">📝 Brouillon ({cntContrats.brouillon})</option>
          <option value="aucun">— Aucun contrat ({cntContrats.aucun})</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', cursor: 'pointer', padding: '0 4px' }}>
          <input type="checkbox" checked={showSortis} onChange={e => setShowSortis(e.target.checked)} />
          Inclure les élèves sortis{nbSortis > 0 ? ` (${nbSortis})` : ''}
        </label>
      </div>

      {/* Tableau */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎓</div>
            <div style={{ color: '#94A3B8', fontSize: 14 }}>
              {search ? `Aucun résultat pour « ${search} »` : `Aucun élève inscrit pour ${exerciceSelectionne?.code || 'cette année'}`}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Élève', 'Famille', 'Classe', 'Contrat', 'Contact', ''].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const e = r.enfants || {}
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F8FAFC' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onClick={() => router.push(`/${ecole.slug}/enfants/${r.enfant_id}`)}
                    onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                    onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, color: '#fff',
                        }}>
                          {e.prenom?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {e.prenom} {e.nom}
                            {r.statut_inscription === 'sorti' && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 5, padding: '1px 6px' }}>SORTI</span>
                            )}
                            {r.statut_inscription === 'en_attente' && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '1px 6px' }}>EN ATTENTE</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>
                            {e.date_naissance
                              ? `Né(e) le ${new Date(e.date_naissance).toLocaleDateString('fr-FR')}`
                              : '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <button
                        onClick={ev => { ev.stopPropagation(); router.push(`/${ecole.slug}/familles/${e.famille_id}`) }}
                        style={{ fontSize: 13, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0, textDecoration: 'underline' }}>
                        {e.familles?.nom || '—'}
                      </button>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {r.classes?.nom
                        ? <span style={{ fontSize: 12, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', fontWeight: 500 }}>{r.classes.nom}</span>
                        : <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {(() => {
                        const b = contratBadge(r.enfant_id)
                        return (
                          <span style={{ fontSize: 12, fontWeight: 600, background: b.bg, color: b.color, border: `1px solid ${b.border}`, borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                            {b.label}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B' }}>
                      {e.familles?.parent1_telephone || e.familles?.parent1_email || '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>→</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
