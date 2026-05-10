'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ANNEE_COURANTE } from '@/lib/inscriptions'

export default function PortailFacturesPage() {
  const [facture, setFacture] = useState<any>(null)
  const [lignes, setLignes] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase
        .from('profiles').select('famille_id').eq('id', session.user.id).single()
      if (!profile?.famille_id) { setLoading(false); return }

      const { data: fact } = await supabase
        .from('factures_solde').select('*')
        .eq('famille_id', profile.famille_id)
        .eq('annee_scolaire', ANNEE_COURANTE)
        .maybeSingle()

      if (fact) {
        setFacture(fact)
        const [{ data: lig }, { data: regl }] = await Promise.all([
          supabase.from('facture_lignes').select('*, enfants(prenom, nom)').eq('facture_id', fact.id),
          supabase.from('reglements').select('*').eq('facture_id', fact.id).order('date_reglement', { ascending: false }),
        ])
        setLignes(lig ?? [])
        setReglements(regl ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: 40 }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>Mes factures</h1>
        <p style={{ color: '#64748B', fontSize: 13 }}>Année scolaire {ANNEE_COURANTE}</p>
      </div>

      {!facture ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
          Aucune facture pour l'année {ANNEE_COURANTE.replace('-', '/')}
        </div>
      ) : (
        <>
          {/* Solde */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Total facturé', value: `${Number(facture.total_facture).toLocaleString('fr-FR')} €`, color: '#2563EB', bg: '#EFF6FF' },
              { label: 'Total réglé', value: `${Number(facture.total_regle).toLocaleString('fr-FR')} €`, color: '#059669', bg: '#ECFDF5' },
              { label: 'Reste à régler', value: `${Number(facture.solde_restant).toLocaleString('fr-FR')} €`, color: Number(facture.solde_restant) > 0 ? '#DC2626' : '#059669', bg: Number(facture.solde_restant) > 0 ? '#FEF2F2' : '#ECFDF5' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '18px 22px' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Statut */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Facture {facture.numero}</span>
              <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 10 }}>Émise le {new Date(facture.date_emission).toLocaleDateString('fr-FR')}</span>
            </div>
            {(() => {
              const map: any = {
                en_attente: { label: '⏳ En attente de paiement', color: '#D97706', bg: '#FFFBEB' },
                partiel: { label: '◑ Partiellement réglée', color: '#2563EB', bg: '#EFF6FF' },
                solde: { label: '✓ Soldée', color: '#059669', bg: '#ECFDF5' },
                annule: { label: '✕ Annulée', color: '#DC2626', bg: '#FEF2F2' },
              }
              const s = map[facture.statut] || { label: facture.statut, color: '#64748B', bg: '#F1F5F9' }
              return <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600 }}>{s.label}</span>
            })()}
          </div>

          {facture.statut === 'en_attente' && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>💡</span>
              <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
                <strong>Paiement en attente.</strong> Votre facture vient d'être émise. L'école vous informera prochainement du moyen de règlement (chèques, prélèvement SEPA, ou virement). Aucune action n'est requise de votre part pour l'instant.
              </div>
            </div>
          )}
          {facture.statut === 'partiel' && Number(facture.solde_restant) > 0 && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>ℹ️</span>
              <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.5 }}>
                <strong>Reste à régler : {Number(facture.solde_restant).toLocaleString('fr-FR')} €.</strong> Vos prochains règlements apparaîtront automatiquement dans l'historique ci-dessous.
              </div>
            </div>
          )}
          {facture.statut === 'annule' && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.5 }}>
                <strong>Cette facture a été annulée par l'école.</strong> Si vous avez une question, contactez l'administration.
              </div>
            </div>
          )}

          {/* Détail */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>📋 Détail par élève</div>
            {lignes.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune ligne</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#F8FAFC' }}>
                  <tr>
                    {['Élève', 'Description', 'Montant'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={l.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{l.enfants?.prenom} {l.enfants?.nom}</td>
                      <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13 }}>{l.description}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E293B' }}>{Number(l.montant).toLocaleString('fr-FR')} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Règlements */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>💳 Historique des règlements</div>
            {reglements.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun règlement enregistré</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#F8FAFC' }}>
                  <tr>
                    {['Date', 'Mode', 'Référence', 'Montant'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reglements.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', color: '#475569' }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{r.mode_paiement}</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 13 }}>{r.reference || '—'}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
