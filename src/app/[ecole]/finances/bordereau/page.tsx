'use client'
import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'
import { chargerParLots } from '@/lib/pagination'
// AUDIT P1 (06/08/2026) — sur-encaissement : le bordereau ignorait les règlements
// déjà saisis (une famille ayant déjà payé par CB/virement restait proposée au dépôt
// sans le moindre signal) et « Marquer déposé(s) » ne créait AUCUN règlement, donc
// l'argent déposé en banque restait invisible des factures → relances à tort puis
// double encaissement. Corrigé : reste dû affiché par chèque + dépôt via la brique
// partagée lib/encaissement (règlement idempotent + statut).
import { encaisserEcheance, soldesParFamille, calculerDepassement, bilanEncaissements, type SoldeFamille } from '@/lib/encaissement'
import { appAlert, appConfirm } from '@/components/ui/ConfirmDialog'

type Cheque = {
  id: string
  numero_cheque: string
  montant: number
  date_echeance: string | null
  statut: string
  facture_id: string | null
  mode_paiement: string | null
  note: string | null
  famille_id: string
  familles: { nom: string; numero: string; parent1_nom: string | null; parent1_prenom: string | null } | null
  // kkkk5 : photo + contrôle du chèque avant remise
  photo_recto_path?: string | null
  photo_verso_path?: string | null
  controle?: any
  controle_le?: string | null
}

// kkkk5 (01/09/2026, demande d'Avi) — contrôle INDICATIF du chèque au moment de
// la remise : rien de bloquant, juste des repères ; photo recto/verso prise
// avec le téléphone (preuve de ce qui part à la banque) ; anomalie libre.
const CHECKS_CHEQUE: { k: string; label: string }[] = [
  { k: 'ordre', label: 'À l\'ordre de l\'association (libellé exact)' },
  { k: 'montant_chiffres', label: 'Montant en chiffres = montant attendu' },
  { k: 'montant_lettres', label: 'Montant en lettres cohérent' },
  { k: 'date', label: 'Date présente et de moins d\'un an' },
  { k: 'signature', label: 'Signature présente' },
  { k: 'sans_rature', label: 'Aucune rature / surcharge' },
  { k: 'endosse', label: 'Endossé au dos (signature + n° de compte)' },
]

const PRINT_CSS = `
@page { size: A4 portrait; margin: 1.5cm; }
@media print {
  body { background: #fff !important; }
  .no-print { display: none !important; }
  .print-card { box-shadow: none !important; border: 1px solid #000 !important; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
}
`

export default function BordereauPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [cheques, setCheques] = useState<Cheque[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'prevu' | 'tous'>('prevu')
  const [loading, setLoading] = useState(true)
  const [banque, setBanque] = useState('')
  const [ribDestinataire, setRibDestinataire] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [erreurChargement, setErreurChargement] = useState('')
  const [soldes, setSoldes] = useState<Map<string, SoldeFamille>>(new Map())
  const [deposeEnCours, setDeposeEnCours] = useState(false)
  // kkkk5
  const [infosEcole, setInfosEcole] = useState<{ ordre_cheque: string | null; iban_ecole: string | null; bic_ecole: string | null } | null>(null)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [photos, setPhotos] = useState<{ recto: string | null; verso: string | null }>({ recto: null, verso: null })
  const [coches, setCoches] = useState<Record<string, boolean>>({})
  const [anomalie, setAnomalie] = useState('')
  const [ctrlBusy, setCtrlBusy] = useState(false)
  const [ctrlMsg, setCtrlMsg] = useState('')

  useEffect(() => {
    if (!ecole?.id) return
    createClient().from('ecoles').select('ordre_cheque, iban_ecole, bic_ecole').eq('id', ecole.id).single()
      .then(({ data }) => setInfosEcole(data || null))
  }, [ecole?.id])

  async function bearerKkkk5() {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token || ''
  }

  async function ouvrirControle(c: Cheque) {
    if (ouvert === c.id) { setOuvert(null); return }
    setOuvert(c.id)
    setCoches(c.controle?.coches || {})
    setAnomalie(c.controle?.anomalie || '')
    setCtrlMsg('')
    setPhotos({ recto: null, verso: null })
    if (c.photo_recto_path || c.photo_verso_path) {
      const res = await fetch('/api/cheques/photo?chequeId=' + c.id, { headers: { Authorization: 'Bearer ' + await bearerKkkk5() } })
      const json = await res.json()
      if (res.ok) setPhotos(json.photos)
    }
  }

  async function envoyerPhotoCheque(chequeId: string, face: 'recto' | 'verso', file: File | null) {
    if (!file) return
    setCtrlBusy(true); setCtrlMsg('')
    const form = new FormData()
    form.append('chequeId', chequeId); form.append('face', face); form.append('fichier', file)
    try {
      const res = await fetch('/api/cheques/photo', { method: 'POST', headers: { Authorization: 'Bearer ' + await bearerKkkk5() }, body: form })
      const json = await res.json()
      if (!res.ok) setCtrlMsg('⚠️ ' + (json.error || 'Envoi échoué'))
      else {
        setPhotos(json.photos)
        setCtrlMsg('✅ Photo ' + face + ' enregistrée')
        setCheques(cs => cs.map(x => x.id === chequeId ? { ...x, [`photo_${face}_path`]: 'ok' } : x))
      }
    } catch { setCtrlMsg('⚠️ Erreur réseau pendant l\'envoi de la photo') }
    setCtrlBusy(false)
  }

  async function enregistrerControleCheque(chequeId: string) {
    setCtrlBusy(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const controle = { coches, anomalie: anomalie.trim() || null, nb_coches: Object.values(coches).filter(Boolean).length, total: CHECKS_CHEQUE.length }
    const { error } = await s.from('cheques_prevus')
      .update({ controle, controle_le: new Date().toISOString(), controle_par: session?.user?.id || null })
      .eq('id', chequeId)
    setCtrlBusy(false)
    if (error) { setCtrlMsg('⚠️ ' + error.message); return }
    setCheques(cs => cs.map(x => x.id === chequeId ? { ...x, controle, controle_le: new Date().toISOString() } : x))
    setCtrlMsg('✅ Contrôle enregistré')
    setOuvert(null)
  }
  // Exercice piloté par le sélecteur global (même source que /finances).
  const annee = useAnneeScolaireActive()
  const { loading: exerciceLoading } = useExercice()

  useEffect(() => { if (ecole?.id && !exerciceLoading) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id, filter, dateFrom, dateTo, annee, exerciceLoading])

  // FIX audit 29/07/2026 :
  //  - AUCUN filtre d'année : le bordereau cumulait les chèques de tous les exercices
  //    depuis la création de l'école → bordereau pollué remis à la banque.
  //  - AUCUNE pagination : `cheques_prevus` dépasse déjà 1000 lignes chez l'école
  //    pilote, la liste était donc AUSSI silencieusement tronquée (bordereau incomplet).
  //
  // `cheques_prevus` ne porte pas d'année : elle vient du contrat
  // (`contrats_scolarisation.annee_scolaire`, cf. inscriptions/page.tsx). Un `!inner`
  // seul écarterait DÉFINITIVEMENT les chèques saisis à la main depuis la fiche famille
  // (/familles/[id]/cheques n'écrit pas de `contrat_id`) — or ce sont de vrais chèques
  // physiques en caisse, les omettre du bordereau serait une régression comptable.
  // On charge donc deux jeux : les chèques du contrat de l'exercice sélectionné, PLUS
  // les chèques sans contrat (sans année, donc toujours proposés).
  const load = async () => {
    setLoading(true)
    setErreurChargement('')
    const s = createClient()
    // Bordereau de remise = uniquement de vrais chèques physiques à apporter à la banque.
    // La table cheques_prevus stocke aussi virements / prélèvements / espèces / carte
    // depuis le chantier "hhh" : on filtre durement par mode_paiement = cheque (ou cheque_caution).
    const requete = (avecContrat: boolean) => (debut: number, fin: number) => {
      let q = s.from('cheques_prevus')
        .select(avecContrat
          ? '*, familles(nom, numero, parent1_nom, parent1_prenom), contrats_scolarisation!inner(annee_scolaire)'
          : '*, familles(nom, numero, parent1_nom, parent1_prenom)')
        .eq('ecole_id', ecole.id)
        .in('mode_paiement', ['cheque', 'cheque_caution'])
      if (avecContrat) q = q.eq('contrats_scolarisation.annee_scolaire', annee)
      else q = q.is('contrat_id', null)
      if (filter === 'prevu') q = q.eq('statut', 'prevu')
      if (dateFrom) q = q.gte('date_echeance', dateFrom)
      if (dateTo) q = q.lte('date_echeance', dateTo)
      // Tri déterministe : chaque lot est une NOUVELLE requête, `id` départage.
      return q.order('date_echeance', { ascending: true }).order('id').range(debut, fin)
    }
    const [surContrat, horsContrat] = await Promise.all([
      chargerParLots(requete(true)),
      chargerParLots(requete(false)),
    ])
    const erreur = surContrat.error || horsContrat.error
    if (erreur) setErreurChargement('Liste des chèques incomplète : ' + erreur)
    // Re-tri global après fusion des deux jeux (l'ordre métier reste l'échéance croissante).
    const lignes = ([...surContrat.rows, ...horsContrat.rows] as any[]).sort((a: any, b: any) =>
      String(a.date_echeance ?? '').localeCompare(String(b.date_echeance ?? '')))
    setCheques(lignes as any)
    // AUDIT P1 : reste dû réel des familles listées (règlements + avoirs déduits)
    // pour signaler les chèques d'une famille déjà soldée AVANT le dépôt.
    const { soldes: sMap } = await soldesParFamille(s, lignes.map((c: any) => c.famille_id).filter(Boolean))
    setSoldes(sMap)
    setLoading(false)
  }

  function toggle(id: string) {
    const newS = new Set(selected)
    if (newS.has(id)) newS.delete(id); else newS.add(id)
    setSelected(newS)
  }
  function toggleAll() {
    if (selected.size === cheques.length) setSelected(new Set())
    else setSelected(new Set(cheques.map(c => c.id)))
  }

  const selectedCheques = cheques.filter(c => selected.has(c.id))
  const total = selectedCheques.reduce((s, c) => s + Number(c.montant), 0)
  const fmt = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  const marquerDepose = async () => {
    if (selectedCheques.length === 0 || deposeEnCours) return
    // AUDIT P1 : avertissement chiffré si le dépôt percevrait plus que le reste dû
    // (règlements déjà saisis ignorés jusqu'ici = mécanisme du sur-encaissement).
    const { total: depassement, familles: fDep } = calculerDepassement(selectedCheques, soldes)
    const avert = depassement > 0
      ? `\n\n⚠️ ATTENTION SUR-ENCAISSEMENT : ${fDep.length} famille(s) ont déjà des règlements saisis — ce dépôt percevrait ${fmt(depassement)} AU-DELÀ du reste dû. Vérifiez les lignes marquées en rouge avant de continuer.`
      : ''
    if (!await appConfirm(`Marquer ${selectedCheques.length} chèque(s) comme déposé(s) ? Un règlement sera enregistré sur la facture de chaque chèque.${avert}`)) return
    // FIX audit 29/07/2026 (conservé) : chaque étape est vérifiée et remontée — jamais
    // d'écran qui laisse croire au dépôt réussi sur un échec silencieux.
    // AUDIT P1 : le dépôt passe par la brique partagée : règlement créé (idempotent
    // par référence, un re-clic ne double jamais) PUIS statut encaissé.
    setDeposeEnCours(true)
    const s = createClient()
    const resultats = []
    for (const c of selectedCheques) resultats.push(await encaisserEcheance(s, c as any))
    setDeposeEnCours(false)
    const echecs = resultats.filter(r => !r.ok)
    setErreurChargement(echecs.length ? `Dépôt partiel — ${echecs.length} échec(s) : ${echecs[0].erreur}` : '')
    await appAlert(bilanEncaissements(resultats))
    setSelected(new Set())
    await load()
  }

  function printNow() {
    window.print()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* kkkk5 — rappel d'endossement, toujours visible à l'écran, jamais imprimé */}
      <div className="no-print" style={{ background: 'linear-gradient(135deg,#1E3A8A,#5B21B6)', color: '#fff', borderRadius: 12, padding: '12px 16px', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .85 }}>Avant la remise en banque</div>
        <div><b>À l&apos;ordre de :</b> {infosEcole?.ordre_cheque || ecole.nom} · <b>Au dos de chaque chèque :</b> signature + n° de compte à créditer :{' '}
          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{infosEcole?.iban_ecole || 'IBAN à renseigner dans Paramètres école'}</span>
          {infosEcole?.bic_ecole ? <span style={{ opacity: .85 }}> · BIC {infosEcole.bic_ecole}</span> : null}
        </div>
        <div style={{ opacity: .85, fontSize: 12 }}>Bouton « Contrôler » sur chaque ligne : photo recto/verso avec le téléphone + vérifications indicatives (rien de bloquant).</div>
      </div>

      {/* CONTROLS - hidden when printing */}
      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/${ecole.slug}/finances`)}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Retour</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Bordereau de remise de chèques</h1>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              Exercice {annee} · les chèques saisis hors contrat (sans année) restent proposés.
            </div>
          </div>
          <button onClick={printNow}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🖨 Imprimer
          </button>
          {selectedCheques.length > 0 && (
            <button onClick={marquerDepose} disabled={deposeEnCours}
              style={{ background: deposeEnCours ? '#94A3B8' : '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', cursor: deposeEnCours ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
              {deposeEnCours ? '⏳ Dépôt…' : '✓ Marquer déposé(s)'}
            </button>
          )}
        </div>

        {erreurChargement && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
            ❌ {erreurChargement}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Filtre</label>
            <select value={filter} onChange={e => setFilter(e.target.value as any)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff' }}>
              <option value="prevu">À déposer (prévus)</option>
              <option value="tous">Tous</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Échéance du</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Échéance au</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Banque de dépôt</label>
            <input value={banque} onChange={e => setBanque(e.target.value)} placeholder="Ex: Crédit Agricole — Agence Paris 19e"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>N° compte / RIB école</label>
            <input value={ribDestinataire} onChange={e => setRibDestinataire(e.target.value)} placeholder="FR76 ... (optionnel)"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#64748B' }}>
          ✅ <strong>{selected.size}</strong> chèque(s) sélectionné(s) sur {cheques.length} · Total : <strong style={{ color: '#1E293B' }}>{fmt(total)}</strong>
          <button onClick={toggleAll} style={{ marginLeft: 12, background: 'transparent', color: '#2563EB', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
            {selected.size === cheques.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>
      </div>

      {/* SELECTION TABLE - hidden when printing if there's a print preview */}
      <div className="no-print" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
        {cheques.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Aucun chèque {filter === 'prevu' ? 'prévu à déposer' : 'enregistré'}.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                <th style={{ padding: '10px 12px', width: 40 }}>
                  <input type="checkbox" checked={selected.size === cheques.length && cheques.length > 0} onChange={toggleAll} />
                </th>
                {['N° chèque', 'Émetteur (Famille)', 'Montant', 'Reste dû famille', 'Échéance', 'Statut', 'Note', 'Contrôle'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cheques.map(c => {
                const tireur = c.familles?.parent1_nom
                  ? `${c.familles.parent1_prenom || ''} ${c.familles.parent1_nom}`.trim()
                  : (c.familles?.nom ? `Famille ${c.familles.nom}` : '—')
                return (
                  <Fragment key={c.id}>
                  <tr style={{ borderTop: '1px solid #F1F5F9', cursor: 'pointer' }}
                      onClick={() => toggle(c.id)}>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{c.numero_cheque}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13 }}>
                      <div>{tireur}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>{c.familles?.numero || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>{fmt(c.montant)}</td>
                    {/* AUDIT P1 : le reste dû réel de la famille face au chèque — rouge si
                        la famille est déjà soldée ou si le chèque dépasse ce qu'elle doit. */}
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>
                      {(() => {
                        const sf = soldes.get(c.famille_id)
                        if (!sf) return <span style={{ color: '#94A3B8' }}>—</span>
                        const resteDu = Math.max(0, sf.soldeRestant)
                        if (resteDu <= 0.009) return <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: 'rgba(239,68,68,0.1)', padding: '3px 8px', borderRadius: 10 }}>⚠ Famille soldée</span>
                        if (Number(c.montant) > resteDu + 0.009) return <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>{fmt(resteDu)} ⚠ chèque supérieur</span>
                        return <span style={{ color: '#475569' }}>{fmt(resteDu)}</span>
                      })()}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{c.date_echeance ? new Date(c.date_echeance).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.statut === 'prevu' ? '#475569' : '#065F46', background: c.statut === 'prevu' ? '#F1F5F9' : '#ECFDF5', padding: '3px 8px', borderRadius: 10 }}>
                        {/* AUDIT P2 : plus de statut brut « Attente_reception » — libellés humains partout. */}
                        {({ prevu: 'À encaisser', encaisse: 'Encaissé', rejete: 'Rejeté', attente_reception: 'À recevoir', restitue: 'Restitué', annule: 'Annulé' } as Record<string, string>)[c.statut] || c.statut}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748B', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.note || ''}>{c.note || '—'}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => ouvrirControle(c)}
                        style={{ background: ouvert === c.id ? '#2563EB' : '#EEF2FF', color: ouvert === c.id ? '#fff' : '#4338CA', border: '1px solid #C7D2FE', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {c.photo_recto_path ? '📷 ' : ''}{c.controle_le ? '✓ ' : ''}{c.controle?.anomalie ? '⚠️ ' : ''}Contrôler
                      </button>
                    </td>
                  </tr>
                  {ouvert === c.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: '12px 16px 16px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {(['recto', 'verso'] as const).map(face => (
                            <label key={face} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EEF2FF', color: '#4338CA', border: '1px dashed #A5B4FC', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              📷 {photos[face] ? `Refaire le ${face}` : `Photo ${face}`}
                              <input type="file" accept="image/*" capture="environment" disabled={ctrlBusy} style={{ display: 'none' }}
                                onChange={e => { envoyerPhotoCheque(c.id, face, e.target.files?.[0] || null); e.target.value = '' }} />
                            </label>
                          ))}
                          {photos.recto && <a href={photos.recto} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photos.recto} alt="Recto" style={{ height: 72, borderRadius: 8, border: '1px solid #E2E8F0' }} /></a>}
                          {photos.verso && <a href={photos.verso} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photos.verso} alt="Verso" style={{ height: 72, borderRadius: 8, border: '1px solid #E2E8F0' }} /></a>}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '4px 16px', marginTop: 12 }}>
                          {CHECKS_CHEQUE.map(ch => (
                            <label key={ch.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E293B', padding: '5px 0', cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!coches[ch.k]} onChange={e => setCoches({ ...coches, [ch.k]: e.target.checked })} style={{ width: 18, height: 18 }} />
                              {ch.label}
                            </label>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                          <input value={anomalie} onChange={e => setAnomalie(e.target.value)} placeholder="Anomalie / remarque (facultatif) : non signé, ordre incorrect…"
                            style={{ flex: 1, minWidth: 240, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 16 }} />
                          <button disabled={ctrlBusy} onClick={() => enregistrerControleCheque(c.id)}
                            style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: ctrlBusy ? .6 : 1 }}>
                            Enregistrer le contrôle
                          </button>
                          {ctrlMsg && <span style={{ fontSize: 12.5, color: ctrlMsg.startsWith('✅') ? '#047857' : '#B45309' }}>{ctrlMsg}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* PRINTABLE BORDEREAU */}
      <div className="print-card" style={{ background: '#fff', border: '2px solid #1E293B', borderRadius: 12, padding: 30, fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, borderBottom: '2px solid #1E293B', paddingBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: 0, letterSpacing: '-0.02em' }}>{ecole.nom}</h2>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Bordereau de remise de chèques</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#475569' }}>
            <div><strong>N° bordereau :</strong> {new Date().toISOString().slice(0, 10).replace(/-/g, '')}-{String(selectedCheques.length).padStart(3, '0')}</div>
            <div><strong>Date :</strong> {new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Remis à</div>
            <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{banque || '________________________'}</div>
            {ribDestinataire && <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontFamily: 'monospace' }}>{ribDestinataire}</div>}
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Récap</div>
            <div style={{ fontSize: 13, color: '#1E293B' }}>
              <strong>{selectedCheques.length}</strong> chèque(s) — <strong>{fmt(total)}</strong>
            </div>
          </div>
        </div>

        {selectedCheques.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: 40 }}>
            Sélectionnez les chèques ci-dessus pour les inclure dans ce bordereau.
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #1E293B', background: '#F1F5F9' }}>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>N° chèque</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Émetteur</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Famille</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {selectedCheques.map((c, i) => {
                  const tireur = c.familles?.parent1_nom
                    ? `${c.familles.parent1_prenom || ''} ${c.familles.parent1_nom}`.trim()
                    : '—'
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #E2E8F0', background: i % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                      <td style={{ padding: '7px 6px', fontFamily: 'monospace', fontWeight: 600 }}>{c.numero_cheque}</td>
                      <td style={{ padding: '7px 6px' }}>{tireur}</td>
                      <td style={{ padding: '7px 6px', color: '#64748B' }}>{c.familles?.nom || '—'} <span style={{ fontFamily: 'monospace', fontSize: 10 }}>({c.familles?.numero || '—'})</span></td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700 }}>{fmt(c.montant)}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '2px solid #1E293B', background: '#1E293B' }}>
                  <td colSpan={3} style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#fff', fontSize: 13 }}>
                    TOTAL ({selectedCheques.length} chèque{selectedCheques.length > 1 ? 's' : ''})
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#fff', fontSize: 14 }}>{fmt(total)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>Cachet & signature école</div>
                <div style={{ height: 90, border: '1px dashed #94A3B8', borderRadius: 8 }}></div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>Visa banque</div>
                <div style={{ height: 90, border: '1px dashed #94A3B8', borderRadius: 8 }}></div>
              </div>
            </div>

            <div style={{ marginTop: 20, fontSize: 10, color: '#94A3B8', textAlign: 'center', borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
              Document généré par TalmidApp le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
            </div>
          </>
        )}
      </div>
    </>
  )
}
