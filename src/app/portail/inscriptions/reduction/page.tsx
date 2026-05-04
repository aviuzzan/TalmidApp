'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ANNEE_COURANTE, formatStatut } from '@/lib/inscriptions'

const PIECES = [
  'Les 3 derniers bulletins de salaire ou justificatifs France Travail',
  'Le bulletin de salaire de décembre ou justificatif des revenus annuels',
  "L'avis d'imposition 2025 sur revenus 2024 (document complet avec QR code)",
  "L'attestation de paiement des allocations familiales (- de 3 mois)",
  "L'attestation de quotient familial de la CAF",
  "La dernière quittance de loyer ou tableau d'amortissement",
  "Le justificatif de règlement des scolarités dans les autres écoles juives",
]

export default function DemandeReductionPage() {
  const router = useRouter()
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [enfants, setEnfants] = useState<any[]>([])
  const [famille, setFamille] = useState<any>(null)
  const [demande, setDemande] = useState<any>(null)
  const [form, setForm] = useState<any>({ situation_familiale: 'marie', logement_type: 'locataire', pieces_jointes: [] })
  const [revenus, setRevenus] = useState<any[]>([{ nom_prenom: '', lien_parente: '', employeur: '', salaire_mensuel_net: '', nb_mois: 12 }])
  const [piecesConfirmees, setPiecesConfirmees] = useState<boolean[]>(PIECES.map(() => false))
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) return
    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    setFamilleId(profile.famille_id); setEcoleId(profile.ecole_id)

    const [{ data: fam }, { data: enf }, { data: dem }] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*').eq('famille_id', profile.famille_id),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
    ])
    setFamille(fam); setEnfants(enf ?? [])
    if (dem) { setDemande(dem); setForm(dem) }
    setLoading(false)
  }

  function set(key: string, val: any) { setForm((p: any) => ({ ...p, [key]: val })) }

  async function soumettre() {
    if (!form.attestation_honneur) { alert('Veuillez cocher l\'attestation sur l\'honneur'); return }
    setSaving(true)
    const s = createClient()
    const payload = {
      ...form, famille_id: familleId, ecole_id: ecoleId,
      annee_scolaire: ANNEE_COURANTE, statut: 'soumis', soumis_le: new Date().toISOString(),
    }
    if (demande?.id) {
      await s.from('demandes_reduction').update(payload).eq('id', demande.id)
      // Mettre à jour les revenus
      await s.from('demandes_reduction_revenus').delete().eq('demande_id', demande.id)
      if (revenus.filter(r => r.nom_prenom).length > 0) {
        await s.from('demandes_reduction_revenus').insert(revenus.filter(r => r.nom_prenom).map(r => ({ ...r, demande_id: demande.id })))
      }
    } else {
      const { data: newDem } = await s.from('demandes_reduction').insert(payload).select().single()
      if (newDem && revenus.filter(r => r.nom_prenom).length > 0) {
        await s.from('demandes_reduction_revenus').insert(revenus.filter(r => r.nom_prenom).map(r => ({ ...r, demande_id: newDem.id })))
      }
      if (newDem) setDemande(newDem)
    }
    setSaving(false)
    router.push('/portail/inscriptions')
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const soumis = demande && ['soumis', 'en_etude', 'accepte', 'refuse'].includes(demande.statut)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  if (soumis) {
    const st = formatStatut(demande.statut)
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 32, display: 'block' }}>← Retour</button>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📨</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>Demande soumise</h2>
        <p style={{ color: '#64748B', fontSize: 14, margin: '8px 0 24px' }}>Votre dossier est en cours d'examen par la commission.</p>
        <span style={{ fontSize: 14, fontWeight: 700, color: st.color, background: st.bg, padding: '8px 20px', borderRadius: 20 }}>{st.label}</span>
        {demande.tarif_accorde && (
          <div style={{ marginTop: 24, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>Tarif accordé par la commission</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 4 }}>{demande.tarif_accorde.toLocaleString('fr-FR')} €</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, sans-serif' }}>
      <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 20, padding: 0 }}>← Retour</button>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>Demande de réduction {ANNEE_COURANTE}</h1>
      <p style={{ color: '#64748B', fontSize: 13, marginBottom: 28 }}>Toutes les informations restent strictement confidentielles.</p>

      {/* Pièces justificatives */}
      <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: 18, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 12 }}>⚠️ Pièces justificatives obligatoires à joindre</div>
        {PIECES.map((p, i) => (
          <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, cursor: 'pointer', fontSize: 12, color: '#78350F' }}>
            <input type="checkbox" style={{ marginTop: 2, flexShrink: 0 }} checked={piecesConfirmees[i]}
              onChange={e => setPiecesConfirmees(prev => prev.map((v, j) => j === i ? e.target.checked : v))} />
            {p}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Situation */}
        <div>
          <label style={lbl}>Situation familiale</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['marie', 'Marié(e)'], ['veuf', 'Veuf/Veuve'], ['divorce', 'Divorcé(e)'], ['autre', 'Autre']].map(([v, l]) => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', background: form.situation_familiale === v ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${form.situation_familiale === v ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, padding: '8px 14px', color: '#1E293B' }}>
                <input type="radio" name="situation" checked={form.situation_familiale === v} onChange={() => set('situation_familiale', v)} style={{ display: 'none' }} />
                {l}
              </label>
            ))}
          </div>
        </div>

        {/* Enfants concernés */}
        <div>
          <label style={lbl}>Enfants concernés par la demande</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {enfants.map(e => (
              <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#1E293B', cursor: 'pointer', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
                <input type="checkbox" />
                <div>
                  <div style={{ fontWeight: 600 }}>{e.prenom} {e.nom}</div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Dont au collège</label>
              <input style={inp} type="number" min="0" value={form.nb_collège || 0} onChange={e => set('nb_collège', parseInt(e.target.value) || 0)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Dont au lycée</label>
              <input style={inp} type="number" min="0" value={form.nb_lycee || 0} onChange={e => set('nb_lycee', parseInt(e.target.value) || 0)} />
            </div>
          </div>
        </div>

        {/* Logement */}
        <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 18, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 14 }}>LOGEMENT</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            {[['proprietaire', 'Propriétaire'], ['locataire', 'Locataire'], ['autre', 'Autre']].map(([v, l]) => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', background: form.logement_type === v ? '#EFF6FF' : '#fff', border: `1px solid ${form.logement_type === v ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, padding: '7px 14px', color: '#1E293B' }}>
                <input type="radio" name="logement" checked={form.logement_type === v} onChange={() => set('logement_type', v)} style={{ display: 'none' }} />
                {l}
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Nb de pièces</label><input style={inp} type="number" value={form.logement_nb_pieces || ''} onChange={e => set('logement_nb_pieces', parseInt(e.target.value))} /></div>
            <div><label style={lbl}>Loyer/remboursement (€/mois)</label><input style={inp} type="number" value={form.logement_loyer_mensuel || ''} onChange={e => set('logement_loyer_mensuel', parseFloat(e.target.value))} /></div>
            <div><label style={lbl}>Charges (€/mois)</label><input style={inp} type="number" value={form.logement_charges_mensuelles || ''} onChange={e => set('logement_charges_mensuelles', parseFloat(e.target.value))} /></div>
          </div>
        </div>

        {/* Revenus */}
        <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 18, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 14 }}>REVENUS DU FOYER</div>
          {revenus.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
              <input style={inp} placeholder="Nom / Prénom" value={r.nom_prenom} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, nom_prenom: e.target.value } : x))} />
              <input style={inp} placeholder="Lien" value={r.lien_parente} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, lien_parente: e.target.value } : x))} />
              <input style={inp} placeholder="Employeur" value={r.employeur} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, employeur: e.target.value } : x))} />
              <input style={inp} type="number" placeholder="Salaire net" value={r.salaire_mensuel_net} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, salaire_mensuel_net: e.target.value } : x))} />
              <input style={inp} type="number" placeholder="Nb mois" value={r.nb_mois} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, nb_mois: parseInt(e.target.value) } : x))} />
              {i > 0 && <button onClick={() => setRevenus(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 18, padding: 0 }}>×</button>}
            </div>
          ))}
          <button onClick={() => setRevenus(p => [...p, { nom_prenom: '', lien_parente: '', employeur: '', salaire_mensuel_net: '', nb_mois: 12 }])}
            style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0, marginTop: 4 }}>
            + Ajouter une personne
          </button>
        </div>

        {/* Allocations */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          <div><label style={lbl}>Allocations familiales (€/mois)</label><input style={inp} type="number" value={form.alloc_familiales_mensuelles || ''} onChange={e => set('alloc_familiales_mensuelles', parseFloat(e.target.value))} /></div>
          <div><label style={lbl}>Quotient familial CAF (€)</label><input style={inp} type="number" value={form.quotient_familial || ''} onChange={e => set('quotient_familial', parseFloat(e.target.value))} /></div>
          <div><label style={lbl}>Allocation chômage (€/mois)</label><input style={inp} type="number" value={form.alloc_chomage_mensuelle || ''} onChange={e => set('alloc_chomage_mensuelle', parseFloat(e.target.value))} /></div>
          <div><label style={lbl}>APL / Aide logement (€/mois)</label><input style={inp} type="number" value={form.apl_mensuelle || ''} onChange={e => set('apl_mensuelle', parseFloat(e.target.value))} /></div>
        </div>

        {/* Proposition */}
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 14 }}>VOTRE PROPOSITION</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Tarif annuel proposé (€)</label>
              <input style={inp} type="number" value={form.tarif_propose || ''} onChange={e => set('tarif_propose', parseFloat(e.target.value))} placeholder="Ex: 3000" />
            </div>
            <div>
              <label style={lbl}>Pour combien d'enfants</label>
              <input style={inp} type="number" value={form.nb_enfants_concernes || ''} onChange={e => set('nb_enfants_concernes', parseInt(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Commentaire */}
        <div>
          <label style={lbl}>Commentaire (optionnel)</label>
          <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.commentaire || ''} onChange={e => set('commentaire', e.target.value)} placeholder="Précisions sur votre situation..." />
        </div>

        {/* Attestation */}
        <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 18, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 14 }}>ATTESTATION SUR L'HONNEUR</div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
            <input type="checkbox" checked={!!form.attestation_honneur} onChange={e => set('attestation_honneur', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>Je soussigné(e) <strong>{famille?.nom_parent1 || 'le responsable'}</strong> atteste sur l'honneur que tous les renseignements portés sur ce dossier sont conformes, sincères et véritables. Je m'engage à informer la comptabilité de toute modification de ma situation.</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div><label style={lbl}>Fait à</label><input style={inp} value={form.attestation_lieu || ''} onChange={e => set('attestation_lieu', e.target.value)} /></div>
            <div><label style={lbl}>Le</label><input style={inp} type="date" value={form.attestation_date || new Date().toISOString().split('T')[0]} onChange={e => set('attestation_date', e.target.value)} /></div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}>
          <button onClick={() => router.push('/portail/inscriptions')}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={soumettre} disabled={saving}
            style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Envoi...' : '📨 Soumettre la demande'}
          </button>
        </div>
      </div>
    </div>
  )
}
