'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { labelStatutContrat, labelModePaiement } from '@/lib/statuts'

type Exercice = { id: string; code: string; libelle: string | null }
type Famille = { id: string; nom: string; numero: string | null; parent1_prenom: string | null; parent1_email: string | null; parent2_prenom: string | null; parent2_email: string | null }
type Contrat = { id: string; montant_total: number | null; assurance_montant_total: number | null; mode_reglement: string | null; nb_echeances: number | null; statut: string }
type FraisCfg = { inscription_par_enfant: number | null; inscription_par_famille: number | null; reinscription_par_enfant: number | null; reinscription_par_famille: number | null }
type Inscription = { id: string; enfant_id: string; forfait_id: string | null; statut: string; enfants: { prenom: string; nom: string } | null; cantine_forfaits?: { nom: string; prix: number | null } | null; transport_forfaits?: { nom: string; prix: number | null } | null }
type FactureSolde = { id: string; numero: string | null; total_facture: number; total_regle: number; solde_restant: number; statut: string }

export default function EngagementFamillePage() {
  const params = useParams()
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const confirm = useConfirm()
  const familleId = params.id as string

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [famille, setFamille] = useState<Famille | null>(null)
  const [exercices, setExercices] = useState<Exercice[]>([])
  const [exerciceId, setExerciceId] = useState('')
  const [nbEnfants, setNbEnfants] = useState(0)
  const [enfantsAvecContrat, setEnfantsAvecContrat] = useState(0)
  const [contrat, setContrat] = useState<Contrat | null>(null)
  const [fraisCfg, setFraisCfg] = useState<FraisCfg | null>(null)
  const [cantine, setCantine] = useState<Inscription[]>([])
  const [transport, setTransport] = useState<Inscription[]>([])
  const [factures, setFactures] = useState<FactureSolde[]>([])

  useEffect(() => {
    if (!ecole?.id) return
    const s = createClient()
    ;(async () => {
      const [{ data: fam }, { data: exs }] = await Promise.all([
        s.from('familles').select('id, nom, numero, parent1_prenom, parent1_email, parent2_prenom, parent2_email').eq('id', familleId).single(),
        s.from('exercices').select('id, code, libelle').eq('ecole_id', ecole.id).order('code', { ascending: false }),
      ])
      setFamille(fam as Famille | null)
      const exList = (exs ?? []) as Exercice[]
      setExercices(exList)
      if (!exerciceId && exList.length > 0) {
        const { data: ecoleRow } = await s.from('ecoles').select('exercice_courant_id').eq('id', ecole.id).maybeSingle()
        const defaultId = (ecoleRow as any)?.exercice_courant_id || exList[0].id
        setExerciceId(defaultId)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id, familleId])

  useEffect(() => {
    if (!ecole?.id || !exerciceId || !famille) return
    loadExercice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id, exerciceId, famille?.id])

  async function loadExercice() {
    setLoading(true)
    const s = createClient()
    const ex = exercices.find(e => e.id === exerciceId)
    if (!ex) { setLoading(false); return }

    // Récupère les enfants de la famille pour calculer frais inscription × nb_enfants + filtrer cantine/transport
    const { data: enfRows } = await s.from('enfants').select('id').eq('famille_id', familleId)
    const enfantIds = (enfRows ?? []).map((e: any) => e.id)
    setNbEnfants(enfantIds.length)

    // Nombre d'enfants ayant déjà été dans une scolarité avant cet exercice → réinscription vs inscription
    const { count: anciensCount } = await s.from('scolarites').select('*', { count: 'exact', head: true })
      .in('enfant_id', enfantIds.length > 0 ? enfantIds : ['00000000-0000-0000-0000-000000000000'])
      .neq('exercice_id', exerciceId)
    setEnfantsAvecContrat(anciensCount ?? 0)

    const [{ data: contratRow }, { data: cfgRow }, { data: cant }, { data: trsp }, { data: facs }] = await Promise.all([
      s.from('contrats_scolarisation')
        .select('id, montant_total, assurance_montant_total, mode_reglement, nb_echeances, statut')
        .eq('famille_id', familleId)
        .eq('exercice_id', exerciceId)
        .maybeSingle(),
      s.from('frais_inscription_config')
        .select('inscription_par_enfant, inscription_par_famille, reinscription_par_enfant, reinscription_par_famille')
        .eq('ecole_id', ecole.id)
        .eq('exercice_id', exerciceId)
        .maybeSingle(),
      enfantIds.length > 0
        ? s.from('cantine_inscriptions').select('id, enfant_id, forfait_id, statut, enfants(prenom, nom), cantine_forfaits(nom, prix)').eq('exercice_id', exerciceId).in('enfant_id', enfantIds)
        : Promise.resolve({ data: [] as any }),
      enfantIds.length > 0
        ? s.from('transport_inscriptions').select('id, enfant_id, forfait_id, statut, enfants(prenom, nom), transport_forfaits(nom, prix)').eq('exercice_id', exerciceId).in('enfant_id', enfantIds)
        : Promise.resolve({ data: [] as any }),
      s.from('factures_solde').select('id, numero, total_facture, total_regle, solde_restant, statut')
        .eq('famille_id', familleId)
        .eq('exercice_id', exerciceId),
    ])

    setContrat(contratRow as Contrat | null)
    setFraisCfg(cfgRow as FraisCfg | null)
    setCantine((cant ?? []) as Inscription[])
    setTransport((trsp ?? []) as Inscription[])
    setFactures((facs ?? []) as FactureSolde[])
    setLoading(false)
  }

  if (!famille) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  const exercice = exercices.find(e => e.id === exerciceId)
  const isReinscription = enfantsAvecContrat > 0

  // ── Calcul du total engagé ──
  const montantContrat = Number(contrat?.montant_total ?? 0)
  const montantAssurance = Number(contrat?.assurance_montant_total ?? 0)
  // Frais d'inscription : par défaut on prend réinscription si l'enfant a une scolarité antérieure, sinon inscription
  const fraisParEnfant = isReinscription
    ? Number(fraisCfg?.reinscription_par_enfant ?? 0)
    : Number(fraisCfg?.inscription_par_enfant ?? 0)
  const fraisFamille = isReinscription
    ? Number(fraisCfg?.reinscription_par_famille ?? 0)
    : Number(fraisCfg?.inscription_par_famille ?? 0)
  const totalFraisInsc = fraisParEnfant * nbEnfants + fraisFamille
  const totalCantine = cantine.reduce((s, c) => s + Number(c.cantine_forfaits?.prix ?? 0), 0)
  const totalTransport = transport.reduce((s, t) => s + Number(t.transport_forfaits?.prix ?? 0), 0)
  const totalEngage = montantContrat + montantAssurance + totalFraisInsc + totalCantine + totalTransport

  // ── Calcul du suivi factures ──
  const facturesActives = factures.filter(f => f.statut !== 'annule')
  const totalFacture = facturesActives.reduce((s, f) => s + Number(f.total_facture), 0)
  const totalRegle = facturesActives.reduce((s, f) => s + Number(f.total_regle), 0)
  const resteARegler = totalFacture - totalRegle
  const ecartEngageFacture = totalEngage - totalFacture

  async function envoyerEmail() {
    if (!famille || !exercice) return
    const destinataires = [famille.parent1_email, famille.parent2_email].filter(Boolean) as string[]
    if (destinataires.length === 0) { toast.error('Aucune adresse e-mail famille renseignée.'); return }
    const ok = await confirm({
      title: `Envoyer l'engagement financier à ${destinataires.length} parent(s) ?`,
      message: destinataires.join(' · '),
    })
    if (!ok) return
    setSending(true)
    const res = await fetch('/api/admin/envoyer-engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familleId, exerciceId, ecoleId: ecole.id }),
    })
    const data = await res.json()
    setSending(false)
    if (!res.ok || !data.ok) { toast.error(data.error || 'Envoi échoué'); return }
    toast.success(`Engagement envoyé à ${destinataires.length} parent(s).`)
  }

  const fmtMontant = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  return (
    <div className="engagement-page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .engagement-page { padding: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <button onClick={() => router.push(`/${ecole.slug}/familles/${familleId}`)}
            style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>
            ← Retour fiche famille
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>
            Engagement financier — {famille.nom}
          </h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>
            Synthèse des frais annuels engagés par la famille pour l'année scolaire {exercice?.code || '…'}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={exerciceId} onChange={e => setExerciceId(e.target.value)}
            style={{ padding: '8px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, color: '#2563EB', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle || ex.code}</option>)}
          </select>
          <button onClick={() => window.print()}
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🖨 Imprimer
          </button>
          <button onClick={envoyerEmail} disabled={sending}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: sending ? 'wait' : 'pointer' }}>
            {sending ? 'Envoi…' : '📧 Envoyer aux parents'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
      ) : (
        <>
          {/* Bloc Engagement annuel */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0, marginBottom: 12 }}>
              Engagement annuel — détail par poste
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Poste</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Détail</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {/* Contrat scolarisation */}
                {contrat ? (
                  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>📜 Scolarité</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>
                      Contrat {labelStatutContrat(contrat.statut)}
                      {contrat.mode_reglement ? ` · ${labelModePaiement(contrat.mode_reglement)}` : ''}
                      {contrat.nb_echeances ? ` · ${contrat.nb_echeances} échéances` : ''}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtMontant(montantContrat)}</td>
                  </tr>
                ) : (
                  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>📜 Scolarité</td>
                    <td style={{ padding: '10px 12px', color: '#94A3B8', fontStyle: 'italic' }}>Aucun contrat pour cet exercice</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#CBD5E1' }}>—</td>
                  </tr>
                )}
                {/* Assurance */}
                {montantAssurance > 0 && (
                  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>🛡 Assurance scolaire</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>Souscrite via l'école</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtMontant(montantAssurance)}</td>
                  </tr>
                )}
                {/* Frais d'inscription */}
                {totalFraisInsc > 0 && (
                  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>📝 {isReinscription ? 'Réinscription' : 'Inscription'}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>
                      {fraisParEnfant > 0 ? `${fmtMontant(fraisParEnfant)} × ${nbEnfants} enfant(s)` : ''}
                      {fraisParEnfant > 0 && fraisFamille > 0 ? ' + ' : ''}
                      {fraisFamille > 0 ? `${fmtMontant(fraisFamille)} (famille)` : ''}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtMontant(totalFraisInsc)}</td>
                  </tr>
                )}
                {/* Cantine */}
                {cantine.length > 0 && (
                  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>🍽 Cantine</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>
                      {cantine.length} inscription(s) : {cantine.map(c => `${c.enfants?.prenom} (${c.cantine_forfaits?.nom})`).join(', ')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtMontant(totalCantine)}</td>
                  </tr>
                )}
                {/* Transport */}
                {transport.length > 0 && (
                  <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>🚌 Transport</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>
                      {transport.length} inscription(s) : {transport.map(t => `${t.enfants?.prenom} (${t.transport_forfaits?.nom})`).join(', ')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtMontant(totalTransport)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F8FAFC', borderTop: '2px solid #2563EB' }}>
                  <td style={{ padding: '12px', fontWeight: 800, fontSize: 14 }} colSpan={2}>Total engagé pour l'année</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#2563EB' }}>{fmtMontant(totalEngage)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bloc Suivi facturation */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0, marginBottom: 12 }}>
              Suivi de la facturation ({facturesActives.length} facture(s) active(s))
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'Total facturé', value: fmtMontant(totalFacture), color: '#1E293B', bg: '#F8FAFC' },
                { label: 'Total réglé', value: fmtMontant(totalRegle), color: '#065F46', bg: '#ECFDF5' },
                { label: 'Reste à régler', value: fmtMontant(resteARegler), color: resteARegler > 0 ? '#991B1B' : '#065F46', bg: resteARegler > 0 ? '#FEF2F2' : '#ECFDF5' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>
            {Math.abs(ecartEngageFacture) > 0.5 && (
              <div style={{ fontSize: 12, color: ecartEngageFacture > 0 ? '#B91C1C' : '#1E40AF', background: ecartEngageFacture > 0 ? '#FEF2F2' : '#EFF6FF', border: '1px solid', borderColor: ecartEngageFacture > 0 ? '#FECACA' : '#BFDBFE', borderRadius: 8, padding: '10px 14px' }}>
                {ecartEngageFacture > 0
                  ? `⚠️ Écart de ${fmtMontant(ecartEngageFacture)} non encore facturé (engagement supérieur aux factures émises)`
                  : `ℹ️ ${fmtMontant(-ecartEngageFacture)} facturé au-delà de l'engagement initial`}
              </div>
            )}
          </div>

          <div className="no-print" style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 18 }}>
            Cette synthèse est imprimable et peut être envoyée aux parents par e-mail.
          </div>
        </>
      )}
    </div>
  )
}
