'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatStatut } from '@/lib/inscriptions'
import { useAnneeInscription } from '@/lib/inscription-context'

type SubTab = 'dossier' | 'facture' | 'documents'

export default function PortailInscriptionsPage() {
  const { anneeInscription } = useAnneeInscription()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initTab = (searchParams.get('tab') as SubTab) || 'dossier'
  const [tab, setTab] = useState<SubTab>(initTab)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', fontFamily: 'Inter, sans-serif', padding: '0 0 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Année {anneeInscription}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>
          Tout pour préparer la rentrée : votre dossier d'inscription, votre facture et les documents partagés par l'école.
        </p>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, marginBottom: 22, overflowX: 'auto' }}>
        {([
          { id: 'dossier', label: '📋 Dossier d\'inscription' },
          { id: 'facture', label: '💰 Facture' },
          { id: 'documents', label: '📂 Documents école' },
        ] as { id: SubTab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#1E293B' : '#64748B',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              whiteSpace: 'nowrap', minHeight: 38,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dossier' && <DossierTab router={router} />}
      {tab === 'facture' && <FactureTab />}
      {tab === 'documents' && <DocumentsTab />}
    </div>
  )
}

// ── ONGLET 1 : DOSSIER (DDR + Contrat + Nouvel enfant) ──
function DossierTab({ router }: { router: any }) {
  const { anneeInscription } = useAnneeInscription()
  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [contrat, setContrat] = useState<any>(null)
  const [reduction, setReduction] = useState<any>(null)
  const [contratsEnfants, setContratsEnfants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) return
    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }

    const [{ data: fam }, { data: enf }, { data: cfg }, { data: red }, { data: cont }] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*').eq('famille_id', profile.famille_id).order('prenom'),
      s.from('inscriptions_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
      s.from('contrats_scolarisation').select('*, contrat_enfants(enfant_id)').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
    ])
    setFamille(fam); setEnfants(enf ?? []); setConfig(cfg)
    setReduction(red); setContrat(cont)
    setContratsEnfants(cont?.contrat_enfants?.map((c: any) => c.enfant_id) ?? [])
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!famille) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 14 }}>Aucune famille liée à ce compte. Contactez l'école.</div>

  const today = new Date().toISOString().split('T')[0]
  const reductionsOuvertes = config?.reductions_ouvertes && config?.date_ouverture_reduction <= today && config?.date_cloture_reduction >= today
  const inscriptionsOuvertes = config?.inscriptions_ouvertes && config?.date_ouverture_inscription <= today && config?.date_cloture_inscription >= today
  const contratSoumis = contrat && ['soumis', 'valide'].includes(contrat.statut)

  return (
    <div>
      {/* Mes enfants */}
      {enfants.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎓</span> Vos enfants
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {enfants.map(enfant => {
              const dansContrat = contratsEnfants.includes(enfant.id)
              return (
                <div key={enfant.id} style={{ background: '#fff', border: `1px solid ${dansContrat ? 'rgba(16,185,129,0.3)' : '#E2E8F0'}`, borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff' }}>{enfant.prenom?.[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Élève inscrit</div>
                  </div>
                  {dansContrat
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, padding: '4px 12px' }}>✓ Réinscrit</span>
                    : <span style={{ fontSize: 12, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '4px 12px', fontWeight: 600 }}>En attente</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Étapes — l'inscription d'un nouvel enfant precede la reduction et le contrat */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Étape 1 : Nouvel enfant (si besoin) */}
        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#94A3B8' }}>1</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>Inscrire un nouvel enfant</span>
              <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>SI BESOIN</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Pour un enfant qui n'est pas encore dans l'école — à faire avant la demande de réduction et le contrat</div>
          </div>
          <button onClick={() => router.push('/portail/inscriptions/pedagogique')}
            style={{ background: '#1E293B', border: 'none', borderRadius: 10, padding: '10px 18px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
            Fiche d'inscription →
          </button>
        </div>

        <EtapeCard
          numero={2}
          titre="Demande de réduction"
          desc="Facultatif — déposez votre dossier avant la date limite"
          optional
          status={reduction && ['soumis', 'en_etude', 'accepte'].includes(reduction.statut) ? 'done' : reduction?.statut === 'brouillon' ? 'inprogress' : 'todo'}
          ouvert={reductionsOuvertes || !!reduction}
          dateLimite={config?.date_cloture_reduction ? `Avant le ${new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}` : null}
          statutLabel={reduction ? formatStatut(reduction.statut).label : null}
          statutColor={reduction ? formatStatut(reduction.statut).color : null}
          onAction={() => router.push('/portail/inscriptions/reduction')}
          actionLabel={reduction ? 'Voir mon dossier →' : 'Déposer une demande →'}
        />

        <EtapeCard
          numero={3}
          titre="Contrat de scolarisation"
          desc={enfants.length > 0 ? `Réinscrivez ${enfants.length > 1 ? 'vos enfants' : enfants[0]?.prenom || 'votre enfant'} pour ${anneeInscription}` : `Finalisez votre inscription pour ${anneeInscription}`}
          status={contratSoumis ? 'done' : contrat?.statut === 'brouillon' ? 'inprogress' : 'todo'}
          ouvert={inscriptionsOuvertes || !!contrat}
          dateLimite={config?.date_cloture_inscription ? `Avant le ${new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR')}` : null}
          statutLabel={contrat ? formatStatut(contrat.statut).label : null}
          statutColor={contrat ? formatStatut(contrat.statut).color : null}
          onAction={() => router.push('/portail/inscriptions/contrat')}
          actionLabel={contrat ? 'Voir mon contrat →' : `Remplir le contrat${enfants.length > 1 ? ` (${enfants.length} enfants)` : ''} →`}
          highlight
        />
      </div>

      {(config?.date_cloture_reduction || config?.date_cloture_inscription) && (
        <div style={{ marginTop: 28, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 12, letterSpacing: '0.05em' }}>DATES CLÉS</div>
          {config.date_cloture_reduction && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 8 }}>
              <span>Clôture demandes de réduction</span>
              <span style={{ fontWeight: 600, color: '#1E293B' }}>{new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {config.date_cloture_inscription && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B' }}>
              <span>Clôture contrats de scolarisation</span>
              <span style={{ fontWeight: 600, color: '#1E293B' }}>{new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ONGLET 2 : FACTURE (année courante) ──
function FactureTab() {
  const { anneeInscription } = useAnneeInscription()
  const [facture, setFacture] = useState<any>(null)
  const [lignes, setLignes] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) return
      const { data: profile } = await s.from('profiles').select('famille_id').eq('id', session.user.id).single()
      if (!profile?.famille_id) { setLoading(false); return }

      const { data: fact } = await s
        .from('factures_solde').select('*')
        .eq('famille_id', profile.famille_id)
        .eq('annee_scolaire', anneeInscription)
        .maybeSingle()

      if (fact) {
        setFacture(fact)
        const [{ data: lig }, { data: regl }] = await Promise.all([
          s.from('facture_lignes').select('*, enfants(prenom, nom)').eq('facture_id', fact.id),
          s.from('reglements').select('*').eq('facture_id', fact.id).order('date_reglement', { ascending: false }),
        ])
        setLignes(lig ?? [])
        setReglements(regl ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!facture) return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
      Aucune facture pour l'année {anneeInscription}.<br /><br />
      <span style={{ fontSize: 12 }}>La facture sera générée automatiquement après la validation de votre contrat de scolarisation par l'école.</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <a href={`/factures/${facture.id}/print?auto=true`} target="_blank" rel="noopener noreferrer" style={{ background: '#2563EB', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '5px 11px', fontSize: 11, fontWeight: 600, marginRight: 10 }}>📥 PDF</a>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Facture {facture.numero}</span>
          <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 10 }}>Émise le {new Date(facture.date_emission).toLocaleDateString('fr-FR')}</span>
        </div>
        {(() => {
          const m: any = {
            en_attente: { label: '⏳ En attente de paiement', color: '#D97706', bg: '#FFFBEB' },
            partiel: { label: '◑ Partiellement réglée', color: '#2563EB', bg: '#EFF6FF' },
            solde: { label: '✓ Soldée', color: '#059669', bg: '#ECFDF5' },
            annule: { label: '✕ Annulée', color: '#DC2626', bg: '#FEF2F2' },
          }
          const s = m[facture.statut] || { label: facture.statut, color: '#64748B', bg: '#F1F5F9' }
          return <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600 }}>{s.label}</span>
        })()}
      </div>

      {facture.statut === 'en_attente' && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
            <strong>Paiement en attente.</strong> Votre facture vient d'être émise. L'école vous informera prochainement du moyen de règlement (chèques, prélèvement SEPA, ou virement). Aucune action n'est requise pour l'instant.
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

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>📋 Détail</div>
        {lignes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune ligne</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>{['Élève', 'Description', 'Montant'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{l.enfants ? `${l.enfants.prenom || ''} ${l.enfants.nom || ''}`.trim() : 'Famille'}</td>
                  <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13 }}>{l.description}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E293B' }}>{Number(l.montant).toLocaleString('fr-FR')} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reglements.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>💳 Règlements</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>{['Date', 'Mode', 'Référence', 'Montant'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {reglements.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
                  <td style={{ padding: '12px 16px' }}><span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{r.mode_paiement}</span></td>
                  <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 13 }}>{r.reference || '—'}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── ONGLET 3 : DOCUMENTS ÉCOLE ──
function DocumentsTab() {
  const { anneeInscription } = useAnneeInscription()
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) return
      const { data: profile } = await s.from('profiles').select('ecole_id').eq('id', session.user.id).single()
      if (!profile?.ecole_id) { setLoading(false); return }
      const { data } = await s.from('documents_ecole_publics')
        .select('*')
        .eq('ecole_id', profile.ecole_id)
        .eq('annee_scolaire', anneeInscription)
        .eq('actif', true)
        .order('ordre').order('created_at', { ascending: false })
      setDocs(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  const TYPES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
    circulaire: { label: 'Circulaire', icon: '📢', color: '#2563EB', bg: '#EFF6FF' },
    liste_affaires: { label: "Liste d'affaires", icon: '📝', color: '#7C3AED', bg: '#F5F3FF' },
    calendrier: { label: 'Calendrier', icon: '📅', color: '#059669', bg: '#ECFDF5' },
    reglement: { label: 'Règlement', icon: '📜', color: '#92400E', bg: '#FEF3C7' },
    autre: { label: 'Document', icon: '📄', color: '#64748B', bg: '#F1F5F9' },
  }

  if (docs.length === 0) return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
      Aucun document partagé par l'école pour l'année {anneeInscription}.<br /><br />
      <span style={{ fontSize: 12 }}>L'établissement publiera ici la circulaire de rentrée, la liste des affaires, etc.</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {docs.map(d => {
        const t = TYPES[d.type_doc] || TYPES.autre
        return (
          <a key={d.id} href={d.fichier_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: t.bg, color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{t.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{d.titre}</div>
              {d.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{d.description}</div>}
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                <span style={{ background: t.bg, color: t.color, borderRadius: 5, padding: '1px 8px', fontWeight: 600 }}>{t.label}</span>
                {d.nom_fichier && <span style={{ marginLeft: 8 }}>{d.nom_fichier}</span>}
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>Ouvrir →</span>
          </a>
        )
      })}
    </div>
  )
}

function EtapeCard({ numero, titre, desc, status, ouvert, dateLimite, statutLabel, statutColor, onAction, actionLabel, optional, highlight }: {
  numero: number; titre: string; desc: string
  status: 'todo' | 'inprogress' | 'done'
  ouvert: boolean; dateLimite: string | null
  statutLabel: string | null; statutColor: string | null
  onAction: () => void; actionLabel: string
  optional?: boolean; highlight?: boolean
}) {
  const isDone = status === 'done'
  const isProgress = status === 'inprogress'
  return (
    <div style={{ background: highlight && !isDone ? 'linear-gradient(135deg, #EFF6FF, #F0F9FF)' : '#fff', border: `1px solid ${isDone ? 'rgba(16,185,129,0.3)' : highlight ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: isDone ? '#10B981' : isProgress ? '#F59E0B' : highlight ? '#2563EB' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: isDone || highlight || isProgress ? '#fff' : '#94A3B8' }}>
          {isDone ? '✓' : numero}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{titre}</span>
            {optional && <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>OPTIONNEL</span>}
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{desc}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            {statutLabel && <span style={{ fontSize: 11, fontWeight: 600, color: statutColor || '#64748B', background: `${statutColor}18`, borderRadius: 20, padding: '3px 10px' }}>{statutLabel}</span>}
            {dateLimite && !isDone && <span style={{ fontSize: 11, color: '#94A3B8' }}>📅 {dateLimite}</span>}
          </div>
        </div>
        {ouvert && (
          <button onClick={onAction}
            style={{ background: isDone ? '#F1F5F9' : highlight ? '#2563EB' : '#1E293B', border: 'none', borderRadius: 10, padding: '10px 18px', color: isDone ? '#64748B' : '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', boxShadow: !isDone && highlight ? '0 4px 12px rgba(37,99,235,0.3)' : 'none' }}>
            {actionLabel}
          </button>
        )}
        {!ouvert && !isDone && <span style={{ fontSize: 12, color: '#CBD5E1', flexShrink: 0 }}>Fermé</span>}
      </div>
    </div>
  )
}
