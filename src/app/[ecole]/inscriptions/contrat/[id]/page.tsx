'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { formatStatut } from '@/lib/inscriptions'

export default function ContratAdminDetailPage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const contratId = params.id as string

  const [contrat, setContrat] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)

  useEffect(() => {
    async function load() {
      const s = createClient()
      const { data } = await s
        .from('contrats_scolarisation')
        .select('*, familles(nom, parent1_prenom, parent1_nom, parent1_email, parent1_telephone, parent2_prenom, parent2_nom, parent2_email), contrat_enfants(*, enfants(prenom, nom)), demandes_reduction(tarif_accorde, statut)')
        .eq('id', contratId)
        .single()
      setContrat(data)
      setLoading(false)
    }
    load()
  }, [contratId])

  async function valider() {
    if (!contrat) return
    setValidating(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const { error } = await s
      .from('contrats_scolarisation')
      .update({ statut: 'valide', valide_le: new Date().toISOString(), valide_par: session?.user.id })
      .eq('id', contratId)
    if (error) { alert('Erreur : ' + error.message); setValidating(false); return }

    // Notifier la famille
    try {
      await fetch('/api/notify-famille', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecole_id: ecole.id, famille_id: contrat.famille_id, type: 'contrat_valide' }),
      })
    } catch {}

    setContrat({ ...contrat, statut: 'valide' })
    setValidating(false)
    alert('Contrat validé. La facture sera générée depuis la liste des contrats si pas déjà créée.')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>
  if (!contrat) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Contrat introuvable</div>

  const st = formatStatut(contrat.statut)
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }
  const val: React.CSSProperties = { fontSize: 14, color: '#1E293B' }
  const fam = contrat.familles

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13 }}>← Retour</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0, flex: 1 }}>
          Contrat — {fam?.nom || '—'}
        </h1>
        <span style={{ fontSize: 12, fontWeight: 600, color: st.color, background: st.bg, padding: '5px 14px', borderRadius: 20 }}>
          {st.label}
        </span>
        {contrat.statut === 'soumis' && (
          <button onClick={valider} disabled={validating}
            style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: validating ? 'not-allowed' : 'pointer', opacity: validating ? 0.6 : 1 }}>
            {validating ? 'Validation…' : '✓ Valider le contrat'}
          </button>
        )}
      </div>

      {/* Famille */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Famille</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          <div><span style={lbl}>Responsable 1</span><span style={val}>{fam?.parent1_prenom || ''} {fam?.parent1_nom || ''}</span></div>
          <div><span style={lbl}>Responsable 2</span><span style={val}>{fam?.parent2_prenom || ''} {fam?.parent2_nom || '—'}</span></div>
          <div><span style={lbl}>Email principal</span><span style={val}>{fam?.parent1_email || '—'}</span></div>
          <div><span style={lbl}>Téléphone</span><span style={val}>{fam?.parent1_telephone || '—'}</span></div>
        </div>
      </div>

      {/* Enfants */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Enfants ({contrat.contrat_enfants?.length || 0})</h3>
        {(!contrat.contrat_enfants?.length) ? (
          <div style={{ fontSize: 13, color: '#94A3B8' }}>Aucun enfant.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                {['Élève', 'Classe prévue', 'Sous-total'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contrat.contrat_enfants.map((e: any) => (
                <tr key={e.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{e.enfants?.prenom} {e.enfants?.nom}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#475569' }}>{e.classe_prevue || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{Number(e.sous_total || 0).toLocaleString('fr-FR')} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Conditions règlement */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Conditions de règlement</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <div><span style={lbl}>Mode</span><span style={{ ...val, fontWeight: 600 }}>{contrat.mode_reglement || '—'}</span></div>
          <div><span style={lbl}>Échéances</span><span style={val}>{contrat.nb_echeances || '—'}</span></div>
          <div><span style={lbl}>Montant total</span><span style={{ ...val, fontWeight: 700, color: '#2563EB' }}>{Number(contrat.montant_total || 0).toLocaleString('fr-FR')} €</span></div>
          <div><span style={lbl}>Assurance école</span><span style={val}>{contrat.assurance_ecole ? `Oui (${Number(contrat.assurance_montant_total || 0).toLocaleString('fr-FR')} €)` : 'Non'}</span></div>
          <div><span style={lbl}>Autorisation image</span><span style={val}>{contrat.droit_image || contrat.autorisation_image ? 'Oui' : 'Non'}</span></div>
          <div><span style={lbl}>Soumis le</span><span style={val}>{contrat.soumis_le ? new Date(contrat.soumis_le).toLocaleDateString('fr-FR') : '—'}</span></div>
        </div>
        {contrat.observations && (
          <div style={{ marginTop: 14, padding: 12, background: '#F8FAFC', borderRadius: 8 }}>
            <span style={lbl}>Observations</span>
            <span style={{ ...val, whiteSpace: 'pre-wrap' }}>{contrat.observations}</span>
          </div>
        )}
      </div>

      {/* Réduction si applicable */}
      {contrat.demandes_reduction && contrat.demandes_reduction.length > 0 && contrat.demandes_reduction[0]?.statut === 'accepte' && (
        <div style={{ ...card, background: '#ECFDF5', border: '1px solid #10B981' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#059669', margin: '0 0 8px' }}>✓ Réduction commission appliquée</h3>
          <div style={{ fontSize: 14, color: '#065F46' }}>
            Tarif annuel accordé : <strong>{Number(contrat.demandes_reduction[0].tarif_accorde).toLocaleString('fr-FR')} €</strong>
          </div>
        </div>
      )}

      {/* Signature */}
      {contrat.signature_url && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Signature parent</h3>
          <img src={contrat.signature_url} alt="signature" style={{ maxWidth: 360, height: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }} />
          {contrat.signature_date && (
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>Signé le {new Date(contrat.signature_date).toLocaleDateString('fr-FR')}</div>
          )}
        </div>
      )}
    </div>
  )
}
