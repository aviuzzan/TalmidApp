'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
// AUDIT P1 (06/08/2026) — sur-encaissement : l'échéancier ignorait les règlements
// déjà saisis, et « Encaisser » ne créait AUCUN règlement (statut seulement).
// Les encaissements passent désormais par la brique partagée lib/encaissement
// (même circuit que l'onglet Échéances des inscriptions), et l'écran affiche
// le reste dû réel de la famille face au total de l'échéancier actif.
import { encaisserEcheance, soldesParFamille, calculerDepassement, bilanEncaissements, type SoldeFamille } from '@/lib/encaissement'
import { appAlert, appConfirm, appPrompt } from '@/components/ui/ConfirmDialog'
// nnnn5 (03/09/2026) — VERROUILLAGE des échéances déjà engagées (cas MORALI) :
// une échéance soumise à GoCardless / CB en cours / impayé avec nouvelle tentative
// programmée / encaissée / exportée SEPA est VERROUILLÉE : exclue de « Générer /
// régénérer » et de « Recalculer », Edit/Suppr/Encaisser grisés. Les verrous
// viennent de la base (RPC cheques_prevus_verrous) et un trigger
// (trg_cheques_prevus_garde_verrou) refuse de toute façon suppression et
// changement de montant/date/mode, quel que soit l'écran.

type Statut = 'attente_reception' | 'prevu' | 'encaisse' | 'rejete' | 'restitue' | 'annule' | 'exporte'

type Cheque = {
  id: string
  numero_cheque: string
  montant: number
  date_echeance: string | null
  statut: Statut
  encaisse_le: string | null
  note: string | null
  facture_id: string | null
  mode_paiement: string | null
  created_at: string
}

const STATUTS: { value: Statut; label: string; bg: string; fg: string }[] = [
  { value: 'attente_reception', label: 'A recevoir', bg: '#FFFBEB', fg: '#92400E' },
  { value: 'prevu', label: 'Prevu', bg: '#F1F5F9', fg: '#475569' },
  { value: 'encaisse', label: 'Encaisse', bg: '#ECFDF5', fg: '#065F46' },
  { value: 'rejete', label: 'Rejete', bg: '#FEF2F2', fg: '#991B1B' },
  { value: 'restitue', label: 'Restitue', bg: '#EFF6FF', fg: '#1E40AF' },
  { value: 'annule', label: 'Annule', bg: '#F8FAFC', fg: '#94A3B8' },
  { value: 'exporte', label: 'Exporte SEPA', bg: '#EEF2FF', fg: '#3730A3' },
]

const MODES = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'cheque_caution', label: 'Cheque de caution' },
  { value: 'prelevement', label: 'Prelevement' },
  { value: 'virement', label: 'Virement' },
  { value: 'autre', label: 'Autre' },
]

const TODAY = new Date().toISOString().split('T')[0]

export default function ChequesFamillePage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const familleId = params.id as string

  const [loading, setLoading] = useState(true)
  const [cheques, setCheques] = useState<Cheque[]>([])
  const [familleNom, setFamilleNom] = useState('')
  const [factures, setFactures] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    numero_cheque: '', montant: '', date_echeance: '',
    statut: 'prevu' as Statut, encaisse_le: '', note: '',
    facture_id: '', mode_paiement: 'cheque',
  })

  const [showGen, setShowGen] = useState(false)
  const [gen, setGen] = useState({
    montant_total: '', nb_echeances: '10', date_premiere: '',
    mode_paiement: 'cheque', facture_id: '', statut: 'attente_reception' as Statut,
  })
  // Solde réel de la famille (factures non annulées, règlements + avoirs déduits).
  const [solde, setSolde] = useState<SoldeFamille | null>(null)
  // nnnn5 : échéance id -> motif de verrou (absent = libre).
  const [verrous, setVerrous] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    const s = createClient()
    const [{ data: f }, { data: chk }, { data: fact }, { soldes }, { data: vr }] = await Promise.all([
      s.from('familles').select('nom').eq('id', familleId).single(),
      s.from('cheques_prevus').select('*').eq('famille_id', familleId).order('date_echeance', { ascending: true }),
      s.from('factures').select('id, numero, annee_scolaire').eq('famille_id', familleId).order('date_emission', { ascending: false }),
      soldesParFamille(createClient(), [familleId]),
      s.rpc('cheques_prevus_verrous', { p_famille_id: familleId }),
    ])
    if (f) setFamilleNom(f.nom || '')
    setCheques(chk || [])
    setFactures(fact || [])
    setSolde(soldes.get(familleId) ?? null)
    setVerrous(new Map(((vr || []) as { echeance_id: string; verrou: string }[]).map(v => [v.echeance_id, v.verrou])))
    setLoading(false)
  }, [familleId])

  // nnnn5 : motif de verrou d'une échéance ('' = libre).
  const verrou = (c: Cheque) => verrous.get(c.id) || ''
  const estActive = (c: Cheque) => c.statut === 'prevu' || c.statut === 'attente_reception'
  // Échéances verrouillées dont le montant reste À PERCEVOIR (prélèvement en cours,
  // impayé en nouvelle tentative, export SEPA) : elles sont déjà comptées dans le
  // reste dû mais ne doivent pas être ré-échelonnées.
  const verrouilleesEnCours = cheques.filter(c => verrou(c) && c.statut !== 'encaisse')
  const montantVerrouEnCours = Math.round(verrouilleesEnCours.reduce((t, c) => t + Number(c.montant), 0) * 100) / 100
  // Reste à échelonner = reste dû réel − ce qui est déjà en route.
  const resteAEchelonner = solde ? Math.max(0, Math.round((Math.max(0, solde.soldeRestant) - montantVerrouEnCours) * 100) / 100) : 0

  useEffect(() => { load() }, [load])

  function resetForm() {
    setForm({ numero_cheque: '', montant: '', date_echeance: '', statut: 'prevu', encaisse_le: '', note: '', facture_id: '', mode_paiement: 'cheque' })
    setEditId(null)
    setShowForm(false)
  }

  function openEdit(c: Cheque) {
    if (verrou(c)) { appAlert('Échéance verrouillée : ' + verrou(c) + '.\n\nSon montant, sa date et son mode ne sont plus modifiables.'); return }
    setForm({
      numero_cheque: c.numero_cheque || '',
      montant: String(c.montant || ''),
      date_echeance: c.date_echeance || '',
      statut: c.statut || 'prevu',
      encaisse_le: c.encaisse_le || '',
      note: c.note || '',
      facture_id: c.facture_id || '',
      mode_paiement: c.mode_paiement || 'cheque',
    })
    setEditId(c.id)
    setShowForm(true)
    setShowGen(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.numero_cheque.trim() || !form.montant) return await appAlert('Nchq et montant obligatoires')
    const s = createClient()
    const payload: any = {
      famille_id: familleId,
      ecole_id: ecole.id,
      numero_cheque: form.numero_cheque.trim(),
      montant: parseFloat(form.montant),
      date_echeance: form.date_echeance || null,
      statut: form.statut,
      encaisse_le: form.encaisse_le || null,
      note: form.note || null,
      facture_id: form.facture_id || null,
      mode_paiement: form.mode_paiement,
    }
    if (editId) {
      const v = verrous.get(editId)
      if (v) return await appAlert('Échéance verrouillée : ' + v + '. Modification refusée.')
      const { error } = await s.from('cheques_prevus').update(payload).eq('id', editId)
      if (error) return await appAlert('Erreur : ' + error.message)
    } else {
      const { error } = await s.from('cheques_prevus').insert(payload)
      if (error) return await appAlert('Erreur : ' + error.message)
    }
    resetForm()
    await load()
  }

  async function remove(id: string) {
    const v = verrous.get(id)
    if (v) { await appAlert('Échéance verrouillée : ' + v + '. Suppression impossible.'); return }
    if (!await appConfirm('Supprimer cette echeance ?')) return
    const { error } = await createClient().from('cheques_prevus').delete().eq('id', id)
    if (error) await appAlert('Suppression refusée : ' + error.message)
    await load()
  }

  // Texte d'alerte sur-encaissement pour un jeu d'échéances à encaisser (ou '' si RAS).
  function avertissementDepassement(sel: Cheque[]): string {
    if (!solde) return ''
    const { total } = calculerDepassement(sel.map(c => ({ famille_id: familleId, montant: c.montant })), new Map([[familleId, solde]]))
    if (total <= 0) return ''
    return '\n\n⚠️ ATTENTION SUR-ENCAISSEMENT : la famille ne doit plus que ' + fmt(Math.max(0, solde.soldeRestant)) +
      ' (règlements déjà saisis déduits). Cet encaissement percevrait ' + fmt(total) + ' AU-DELÀ du dû.'
  }

  async function quickUpdateStatut(id: string, statut: Statut) {
    // AUDIT P1 : « Encaisser » = créer le règlement (idempotent) + marquer encaissé,
    // via la brique partagée — plus jamais un simple flip de statut invisible de la facture.
    if (statut === 'encaisse') {
      const c = cheques.find(x => x.id === id)
      if (!c) return
      if (verrou(c)) { await appAlert('Échéance verrouillée : ' + verrou(c) + '.\n\nElle sera encaissée automatiquement par le prélèvement en cours — ne pas la saisir à la main (doublon).'); return }
      const avert = avertissementDepassement([c])
      if (avert && !await appConfirm('Encaisser cette échéance de ' + fmt(c.montant) + ' ?' + avert)) return
      setBusy(true)
      const r = await encaisserEcheance(createClient(), { ...c, famille_id: familleId })
      setBusy(false)
      if (!r.ok) { await appAlert('Encaissement impossible : ' + r.erreur); return }
      if (r.sansFacture) await appAlert('Échéance encaissée, mais AUCUNE facture liée : aucun règlement créé. Saisissez le règlement à la main sur la bonne facture.')
      await load()
      return
    }
    const patch: any = { statut }
    await createClient().from('cheques_prevus').update(patch).eq('id', id)
    await load()
  }

  async function bulkUpdate(fromStatuts: Statut[], toStatut: Statut, libelle: string) {
    const sel = cheques.filter(c => fromStatuts.includes(c.statut) && !verrou(c))
    if (sel.length === 0) { await appAlert('Aucune echeance concernee' + (verrouilleesEnCours.length > 0 ? ' (les échéances verrouillées — prélèvement en cours — sont ignorées).' : '.')); return }
    // AUDIT P1 : « Tout encaisser » passe par la brique partagée (règlements créés,
    // idempotence par référence) avec avertissement explicite en cas de dépassement du dû.
    if (toStatut === 'encaisse') {
      const avert = avertissementDepassement(sel)
      if (!await appConfirm(libelle + ' : ' + sel.length + ' echeance(s) ?' + avert)) return
      setBusy(true)
      const s = createClient()
      const resultats = []
      for (const c of sel) resultats.push(await encaisserEcheance(s, { ...c, famille_id: familleId }))
      setBusy(false)
      await appAlert(bilanEncaissements(resultats))
      await load()
      return
    }
    if (!await appConfirm(libelle + ' : ' + sel.length + ' echeance(s) ?')) return
    setBusy(true)
    const { error } = await createClient().from('cheques_prevus').update({ statut: toStatut }).in('id', sel.map(c => c.id))
    setBusy(false)
    if (error) { await appAlert('Erreur : ' + error.message); return }
    await load()
  }

  // mmmm1 : lissage — répartit le reste dû réel sur les échéances ACTIVES existantes
  // (même nombre, mêmes dates, mêmes modes), la dernière absorbant l'arrondi.
  // Règle validée par Avi : on ne supprime pas d'échéances, on recalcule les montants.
  async function recalculerSurSolde() {
    if (!solde) return
    // nnnn5 : les échéances verrouillées (prélèvement déjà parti...) gardent leur
    // montant ; on lisse le reste dû DIMINUÉ de ce qui est déjà en route.
    const actives = cheques
      .filter(c => estActive(c) && !verrou(c))
      .sort((a, b) => (a.date_echeance || '').localeCompare(b.date_echeance || ''))
    if (actives.length === 0) { await appAlert('Aucune échéance active modifiable à recalculer' + (verrouilleesEnCours.length > 0 ? ' : toutes sont verrouillées (prélèvement en cours).' : '.')); return }
    const resteDu = resteAEchelonner
    if (resteDu <= 0) { await appAlert('Le reste dû est nul' + (montantVerrouEnCours > 0 ? ' une fois les ' + fmt(montantVerrouEnCours) + ' déjà en cours de prélèvement déduits' : '') + ' : annulez plutôt les échéances restantes.'); return }
    const n = actives.length
    const unit = Math.round((resteDu / n) * 100) / 100
    const dernier = Math.round((resteDu - unit * (n - 1)) * 100) / 100
    const totalActuel = actives.reduce((t, c) => t + Number(c.montant), 0)
    if (!await appConfirm(
      'Recalculer l\'échéancier sur le reste dû réel ?\n\n' +
      n + ' échéance(s) active(s) : ' + fmt(totalActuel) + ' actuellement → ' + fmt(resteDu) + ' après recalcul.\n' +
      (verrouilleesEnCours.length > 0 ? verrouilleesEnCours.length + ' échéance(s) verrouillée(s) (' + fmt(montantVerrouEnCours) + ', prélèvement déjà en cours) conservée(s) telle(s) quelle(s).\n' : '') +
      'Nouvelle mensualité : ' + fmt(unit) + (Math.abs(dernier - unit) > 0.004 ? ' (dernière : ' + fmt(dernier) + ')' : '') + '.\n\n' +
      'Le nombre d\'échéances, les dates et les modes de paiement sont conservés.'
    )) return
    setBusy(true)
    const s = createClient()
    let erreurs = 0
    for (let i = 0; i < n; i++) {
      const montant = i === n - 1 ? dernier : unit
      const { error } = await s.from('cheques_prevus').update({ montant }).eq('id', actives[i].id)
      if (error) erreurs++
    }
    setBusy(false)
    if (erreurs > 0) await appAlert(erreurs + ' échéance(s) n\'ont pas pu être mises à jour — réessayez.')
    await load()
  }

  async function genererEcheancier(e: React.FormEvent) {
    e.preventDefault()
    const total = parseFloat(gen.montant_total)
    const n = parseInt(gen.nb_echeances)
    if (!total || total <= 0 || !n || n <= 0 || !gen.date_premiere) {
      await appAlert('Montant total, nombre d echeances et date de la 1ere echeance sont obligatoires.')
      return
    }
    // nnnn5 : les échéances verrouillées ne sont JAMAIS remplacées.
    const aRemplacer = cheques.filter(c => estActive(c) && !verrou(c))
    const conservees = cheques.filter(c => estActive(c) && verrou(c))
    if (solde && total > resteAEchelonner + 0.009 && conservees.length > 0) {
      if (!await appConfirm('⚠️ Le montant saisi (' + fmt(total) + ') dépasse le reste à échelonner (' + fmt(resteAEchelonner) + ') : ' +
        fmt(montantVerrouEnCours) + ' sont déjà en cours de prélèvement sur ' + conservees.length + ' échéance(s) verrouillée(s). La famille paierait ' +
        fmt(Math.round((total - resteAEchelonner) * 100) / 100) + ' de trop.\n\nContinuer quand même ?')) return
    }
    const msg = (aRemplacer.length > 0
      ? 'Generer ' + n + ' echeance(s) ? Les ' + aRemplacer.length + ' echeance(s) non encaissees existantes seront supprimees et remplacees.'
      : 'Generer ' + n + ' echeance(s) de paiement ?') +
      (conservees.length > 0 ? '\n\n🔒 ' + conservees.length + ' echeance(s) verrouillee(s) (' + fmt(montantVerrouEnCours) + ') sont conservees telles quelles.' : '')
    if (!await appConfirm(msg)) return

    setBusy(true)
    const s = createClient()

    // nnnn1 : contrat_id est obligatoire en base (NOT NULL). L'ancien code ne le
    // renseignait pas -> l'insertion echouait TOUJOURS, apres avoir supprime les
    // echeances existantes (familles TOUBIAN et LEBAR videes). On reprend le
    // contrat des echeances remplacees, sinon le contrat valide le plus recent.
    let contratId: string | null = ([...aRemplacer, ...conservees].find(c => (c as any).contrat_id) as any)?.contrat_id || null
    if (!contratId) {
      const { data: contrats } = await s.from('contrats_scolarisation')
        .select('id, statut, annee_scolaire')
        .eq('famille_id', familleId)
        .neq('statut', 'annule')
        .order('annee_scolaire', { ascending: false })
        .limit(10)
      const valide = (contrats || []).find(c => c.statut === 'valide')
      contratId = valide?.id || (contrats || [])[0]?.id || null
    }
    if (!contratId) {
      setBusy(false)
      await appAlert('Generation impossible : cette famille n\'a aucun contrat de scolarisation. Creez/validez d\'abord le contrat, puis generez l\'echeancier.\n\nAucune echeance existante n\'a ete touchee.')
      return
    }

    const base = new Date(gen.date_premiere + 'T00:00:00')
    const jour = base.getDate()
    const unit = Math.round((total / n) * 100) / 100
    const rows: any[] = []
    for (let i = 0; i < n; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, jour)
      const montant = i === n - 1 ? Math.round((total - unit * (n - 1)) * 100) / 100 : unit
      rows.push({
        famille_id: familleId,
        ecole_id: ecole.id,
        contrat_id: contratId,
        numero_cheque: i + 1,
        montant,
        date_echeance: d.toISOString().split('T')[0],
        statut: gen.statut,
        mode_paiement: gen.mode_paiement,
        facture_id: gen.facture_id || null,
        note: 'Echeance ' + (i + 1) + '/' + n,
      })
    }

    // nnnn1 : ordre inverse — on INSERE d'abord les nouvelles echeances, puis on
    // supprime les anciennes. Si l'insertion echoue, rien n'a ete supprime
    // (avant : suppression d'abord -> echec d'insert = echeancier perdu).
    const { error } = await s.from('cheques_prevus').insert(rows)
    if (error) {
      setBusy(false)
      await appAlert('Erreur : ' + error.message + '\n\nAucune echeance existante n\'a ete supprimee.')
      return
    }
    if (aRemplacer.length > 0) {
      const { error: delErr } = await s.from('cheques_prevus').delete().in('id', aRemplacer.map(c => c.id))
      if (delErr) {
        setBusy(false)
        await appAlert('Les ' + n + ' nouvelles echeances sont creees, mais les ' + aRemplacer.length + ' anciennes n\'ont pas pu etre supprimees (' + delErr.message + '). Supprimez-les manuellement dans la liste.')
        await load()
        return
      }
    }
    setBusy(false)
    setShowGen(false)
    setGen({ montant_total: '', nb_echeances: '10', date_premiere: '', mode_paiement: 'cheque', facture_id: '', statut: 'attente_reception' })
    await load()
  }

  async function remplacerParReglement(c: Cheque) {
    const mode = (await appPrompt('Regler cette echeance par : cb / virement / especes', 'cb') || '').trim().toLowerCase()
    if (!mode) return
    if (!['cb', 'virement', 'especes'].includes(mode)) { await appAlert('Mode invalide. Utilisez cb, virement ou especes.'); return }
    setBusy(true)
    const s = createClient()
    await s.from('cheques_prevus').update({
      statut: 'annule',
      note: ((c.note ? c.note + ' - ' : '') + 'Remplace par reglement ' + mode + ' le ' + new Date().toLocaleDateString('fr-FR')).slice(0, 400),
    }).eq('id', c.id)
    if (c.facture_id) {
      const { error } = await s.from('reglements').insert({
        facture_id: c.facture_id,
        famille_id: familleId,
        montant: Number(c.montant),
        date_reglement: TODAY,
        mode_paiement: mode,
        notes: 'Remplace l echeance ' + (c.mode_paiement || 'cheque') + ' n' + c.numero_cheque,
      })
      if (error) { setBusy(false); await appAlert('Echeance annulee, mais erreur sur le reglement : ' + error.message); await load(); return }
    }
    setBusy(false)
    await load()
  }

  const fmt = (n: number) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' EUR'
  const total_par_statut = STATUTS.map(s => ({
    ...s,
    count: cheques.filter(c => c.statut === s.value).length,
    montant: cheques.filter(c => c.statut === s.value).reduce((sum, c) => sum + Number(c.montant), 0),
  }))

  const enRetard = cheques.filter(c =>
    c.date_echeance && c.date_echeance < TODAY && (c.statut === 'prevu' || c.statut === 'attente_reception')
  )
  const montantRetard = enRetard.reduce((s, c) => s + Number(c.montant), 0)
  const nbARecevoir = cheques.filter(c => c.statut === 'attente_reception').length
  const nbPrevu = cheques.filter(c => c.statut === 'prevu' && !verrou(c)).length

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/' + ecole.slug + '/familles/' + familleId)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>&larr; Retour fiche famille</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Échéancier</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '2px 0 0' }}>Famille {familleNom}</p>
        </div>
        <button onClick={() => {
          // AUDIT P1 : le générateur est pré-rempli avec le RESTE DÛ réel
          // (règlements et avoirs déjà saisis déduits), plus jamais un champ vide
          // qui invitait à ressaisir le montant du contrat déjà partiellement payé.
          setShowGen(v => {
            // nnnn5 : pré-rempli avec le reste À ÉCHELONNER (reste dû − prélèvements en cours).
            if (!v && !gen.montant_total && solde && resteAEchelonner > 0) {
              setGen(g => ({ ...g, montant_total: String(resteAEchelonner) }))
            }
            return !v
          })
          setShowForm(false)
        }}
          style={{ background: showGen ? '#F1F5F9' : '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Generer un echeancier
        </button>
        <button onClick={() => { setShowForm(true); setEditId(null); setShowGen(false) }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Ajouter une echeance
        </button>
      </div>

      {/* AUDIT P1 — l'échéancier face au réel : facturé / déjà réglé / reste dû.
          Alerte rouge si les échéances actives dépassent le reste dû (sur-encaissement). */}
      {solde && (() => {
        const actif = cheques.filter(c => c.statut === 'prevu' || c.statut === 'attente_reception')
          .reduce((s, c) => s + Number(c.montant), 0)
        const resteDu = Math.max(0, solde.soldeRestant)
        const exces = Math.round((actif - resteDu) * 100) / 100
        return (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <div><span style={{ color: '#64748B', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Facturé</span><div style={{ fontWeight: 700 }}>{fmt(solde.totalFacture)}</div></div>
            <div><span style={{ color: '#64748B', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Déjà réglé (règlements + avoirs)</span><div style={{ fontWeight: 700, color: '#065F46' }}>{fmt(solde.totalRegle)}</div></div>
            <div><span style={{ color: '#64748B', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Reste dû</span><div style={{ fontWeight: 700, color: resteDu > 0 ? '#1E293B' : '#065F46' }}>{fmt(resteDu)}</div></div>
            <div><span style={{ color: '#64748B', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Échéancier actif</span><div style={{ fontWeight: 700 }}>{fmt(actif)}</div></div>
            {exces > 0.009 && (
              <div style={{ flex: 1, minWidth: 260, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '8px 12px', color: '#991B1B', fontWeight: 600 }}>
                ⚠️ L&apos;échéancier actif dépasse le reste dû de <strong>{fmt(exces)}</strong> (avoir imputé ou règlement déjà saisi) —
                la famille paierait trop.
                <button onClick={recalculerSurSolde} disabled={busy}
                  style={{ display: 'block', marginTop: 6, background: '#991B1B', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Recalculer l&apos;échéancier sur le reste dû ({fmt(resteDu)})
                </button>
              </div>
            )}
            {exces < -0.009 && (
              <div style={{ flex: 1, minWidth: 260, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '8px 12px', color: '#92400E', fontWeight: 600 }}>
                ⚠️ L&apos;échéancier actif est inférieur au reste dû de <strong>{fmt(Math.abs(exces))}</strong> (ligne ajoutée à la
                facture après génération ?) — la famille paierait moins que son dû.
                <button onClick={recalculerSurSolde} disabled={busy}
                  style={{ display: 'block', marginTop: 6, background: '#B45309', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Recalculer l&apos;échéancier sur le reste dû ({fmt(resteDu)})
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {montantRetard > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#991B1B' }}>
          <span style={{ fontSize: 18 }}>!</span>
          <div><strong>{fmt(montantRetard)}</strong> en retard sur l&apos;echeancier &mdash; {enRetard.length} echeance(s) dont la date est passee et qui ne sont pas encore encaissees.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => bulkUpdate(['attente_reception'], 'prevu', 'Marquer toutes les echeances a recevoir comme recues')}
          disabled={busy || nbARecevoir === 0}
          style={{ background: nbARecevoir === 0 ? '#F8FAFC' : '#FFFBEB', color: nbARecevoir === 0 ? '#CBD5E1' : '#92400E', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: nbARecevoir === 0 ? 'not-allowed' : 'pointer' }}>
          Marquer tout recu {nbARecevoir > 0 ? '(' + nbARecevoir + ')' : ''}
        </button>
        <button onClick={() => bulkUpdate(['prevu'], 'encaisse', 'Marquer toutes les echeances prevu comme encaissees')}
          disabled={busy || nbPrevu === 0}
          style={{ background: nbPrevu === 0 ? '#F8FAFC' : '#ECFDF5', color: nbPrevu === 0 ? '#CBD5E1' : '#065F46', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: nbPrevu === 0 ? 'not-allowed' : 'pointer' }}>
          Tout encaisser {nbPrevu > 0 ? '(' + nbPrevu + ')' : ''}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        {total_par_statut.map(s => (
          <div key={s.value} style={{ background: s.bg, border: '1px solid ' + s.bg, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.fg, marginTop: 4 }}>{s.count}</div>
            <div style={{ fontSize: 11, color: s.fg, opacity: 0.8, marginTop: 2 }}>{fmt(s.montant)}</div>
          </div>
        ))}
      </div>

      {showGen && (
        <form onSubmit={genererEcheancier} style={{ background: '#fff', border: '1px solid #BFDBFE', borderRadius: 14, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>Generer / regenerer l&apos;echeancier</h3>
          <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 14px' }}>
            Cree N echeances mensuelles de montant egal. Les echeances a recevoir et prevu existantes seront remplacees (les encaissees sont conservees).
          </p>
          {verrouilleesEnCours.length > 0 && (
            <div style={{ fontSize: 12, color: '#3730A3', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px', fontWeight: 600 }}>
              🔒 {verrouilleesEnCours.length} échéance(s) verrouillée(s) pour {fmt(montantVerrouEnCours)} (prélèvement déjà parti / en cours) : elles sont conservées.
              Reste à échelonner : <strong>{fmt(resteAEchelonner)}</strong>{solde ? ' (reste dû ' + fmt(Math.max(0, solde.soldeRestant)) + ' − ' + fmt(montantVerrouEnCours) + ')' : ''}.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>Montant total a echelonner *</label>
              <input type="number" step="0.01" style={inp} value={gen.montant_total} onChange={e => setGen({ ...gen, montant_total: e.target.value })} placeholder="3300.00" required />
            </div>
            <div>
              <label style={lbl}>Nombre d&apos;echeances *</label>
              <input type="number" min="1" max="24" style={inp} value={gen.nb_echeances} onChange={e => setGen({ ...gen, nb_echeances: e.target.value })} required />
            </div>
            <div>
              <label style={lbl}>Date de la 1ere echeance *</label>
              <input type="date" style={inp} value={gen.date_premiere} onChange={e => setGen({ ...gen, date_premiere: e.target.value })} required />
            </div>
            <div>
              <label style={lbl}>Mode de paiement</label>
              <select style={inp} value={gen.mode_paiement} onChange={e => setGen({ ...gen, mode_paiement: e.target.value })}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Statut initial</label>
              <select style={inp} value={gen.statut} onChange={e => setGen({ ...gen, statut: e.target.value as Statut })}>
                <option value="attente_reception">A recevoir (cheques pas encore remis)</option>
                <option value="prevu">Prevu (deja en main / prelevement)</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Facture liee (optionnel)</label>
              <select style={inp} value={gen.facture_id} onChange={e => setGen({ ...gen, facture_id: e.target.value })}>
                <option value="">- Aucune -</option>
                {factures.map(f => <option key={f.id} value={f.id}>{f.numero} ({f.annee_scolaire})</option>)}
              </select>
            </div>
          </div>
          {gen.montant_total && gen.nb_echeances && (
            <div style={{ fontSize: 12, color: '#1E40AF', background: '#EFF6FF', borderRadius: 8, padding: '8px 12px', marginTop: 12 }}>
              ~ {fmt((parseFloat(gen.montant_total) || 0) / (parseInt(gen.nb_echeances) || 1))} par echeance &middot; {gen.nb_echeances} echeances mensuelles
            </div>
          )}
          {/* AUDIT P1 : garde-fou visuel — le total saisi dépasse le reste dû réel. */}
          {solde && gen.montant_total && (parseFloat(gen.montant_total) || 0) > resteAEchelonner + 0.009 && (
            <div style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontWeight: 600 }}>
              ⚠️ Ce total dépasse le reste à échelonner ({fmt(resteAEchelonner)}) de {fmt(Math.round(((parseFloat(gen.montant_total) || 0) - resteAEchelonner) * 100) / 100)}.
              {montantVerrouEnCours > 0
                ? ' ' + fmt(montantVerrouEnCours) + ' sont déjà en cours de prélèvement sur des échéances verrouillées : échelonner ce montant ferait payer la famille deux fois.'
                : ' Des règlements ont déjà été saisis sur les factures : échelonner ce montant conduirait à un sur-encaissement.'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" disabled={busy} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Generer l echeancier'}
            </button>
            <button type="button" onClick={() => setShowGen(false)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form onSubmit={save} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>{editId ? 'Modifier l echeance' : 'Nouvelle echeance'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>N cheque / ref *</label>
              <input style={inp} value={form.numero_cheque} onChange={e => setForm({ ...form, numero_cheque: e.target.value })} placeholder="Ex: 1234567" required />
            </div>
            <div>
              <label style={lbl}>Montant *</label>
              <input type="number" step="0.01" style={inp} value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} placeholder="500.00" required />
            </div>
            <div>
              <label style={lbl}>Date d&apos;echeance</label>
              <input type="date" style={inp} value={form.date_echeance} onChange={e => setForm({ ...form, date_echeance: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Statut</label>
              <select style={inp} value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value as Statut })}>
                {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Encaisse le</label>
              <input type="date" style={inp} value={form.encaisse_le} onChange={e => setForm({ ...form, encaisse_le: e.target.value })} disabled={form.statut !== 'encaisse'} />
            </div>
            <div>
              <label style={lbl}>Facture liee (optionnel)</label>
              <select style={inp} value={form.facture_id} onChange={e => setForm({ ...form, facture_id: e.target.value })}>
                <option value="">- Aucune -</option>
                {factures.map(f => <option key={f.id} value={f.id}>{f.numero} ({f.annee_scolaire})</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Mode</label>
              <select style={inp} value={form.mode_paiement} onChange={e => setForm({ ...form, mode_paiement: e.target.value })}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Note (optionnel)</label>
              <textarea style={{ ...inp, minHeight: 50 }} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Caution restitution juin 2027, etc." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {editId ? 'Enregistrer' : 'Ajouter'}
            </button>
            <button type="button" onClick={resetForm} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {cheques.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Aucune echeance enregistree pour cette famille.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                {['N / ref', 'Montant', 'Echeance', 'Mode', 'Statut', 'Encaisse le', 'Facture', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cheques.map(c => {
                const sc = STATUTS.find(s => s.value === c.statut) || STATUTS[1]
                const fact = factures.find(f => f.id === c.facture_id)
                const modeLabel = MODES.find(m => m.value === c.mode_paiement)?.label || c.mode_paiement || '-'
                const retard = !!c.date_echeance && c.date_echeance < TODAY && (c.statut === 'prevu' || c.statut === 'attente_reception')
                const v = verrou(c)
                const btnOff: React.CSSProperties = { background: '#F8FAFC', color: '#CBD5E1', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'not-allowed' }
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #F1F5F9', background: retard && !v ? '#FEF2F2' : v && c.statut !== 'encaisse' ? '#F5F7FF' : undefined }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>
                      {v && <span title={v} style={{ marginRight: 5, cursor: 'help' }}>🔒</span>}{c.numero_cheque}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>{fmt(c.montant)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: retard ? '#991B1B' : '#475569', fontWeight: retard ? 700 : 400 }}>
                      {c.date_echeance ? new Date(c.date_echeance).toLocaleDateString('fr-FR') : '-'}
                      {retard && <span style={{ marginLeft: 6, fontSize: 10 }}>en retard</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{modeLabel}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sc.fg, background: sc.bg, padding: '3px 10px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sc.label}</span>
                      {v && c.statut !== 'encaisse' && <div style={{ fontSize: 10, color: '#3730A3', marginTop: 3, fontWeight: 600 }}>{v}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{c.encaisse_le ? new Date(c.encaisse_le).toLocaleDateString('fr-FR') : '-'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'monospace', color: '#64748B' }}>{fact?.numero || '-'}</td>
                    <td style={{ padding: '8px 14px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.statut === 'attente_reception' && (
                        <button onClick={() => quickUpdateStatut(c.id, 'prevu')} title="Marquer recu"
                          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Recu</button>
                      )}
                      {(c.statut === 'prevu' || c.statut === 'attente_reception') && !v && (
                        <button onClick={() => quickUpdateStatut(c.id, 'encaisse')} title="Marquer encaisse"
                          style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Encaisser</button>
                      )}
                      {(c.statut === 'prevu' || c.statut === 'attente_reception') && !v && (
                        <button onClick={() => remplacerParReglement(c)} title="Regler en CB / virement / especes (annule cette echeance)"
                          style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Regler autrement</button>
                      )}
                      {c.statut === 'prevu' && !v && (
                        <button onClick={() => quickUpdateStatut(c.id, 'restitue')} title="Restituer (caution)"
                          style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Restituer</button>
                      )}
                      {v ? (
                        <>
                          <button disabled title={'Verrouillée : ' + v} style={btnOff}>Edit</button>
                          <button disabled title={'Verrouillée : ' + v} style={btnOff}>Suppr</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEdit(c)} title="Modifier"
                            style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => remove(c.id)} title="Supprimer"
                            style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>Suppr</button>
                        </>
                      )}
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
