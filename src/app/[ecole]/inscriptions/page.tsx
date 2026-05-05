'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { ANNEE_COURANTE, formatStatut } from '@/lib/inscriptions'

type Onglet = 'tableau_bord' | 'pedagogique' | 'reduction' | 'contrats' | 'cheques'

export default function InscriptionsAdminPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [onglet, setOnglet] = useState<Onglet>('tableau_bord')
  const [annee, setAnnee] = useState(ANNEE_COURANTE)
  const [config, setConfig] = useState<any>(null)
  const [stats, setStats] = useState({ pedagogique: 0, reduction: 0, contrats: 0, cheques_a_encaisser: 0 })
  const [dossiers, setDossiers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [ecole.id, annee])

  async function loadAll() {
    setLoading(true)
    const s = createClient()
    const [
      { data: cfg },
      { count: ped },
      { count: red },
      { count: cont },
      { count: chq },
      { data: contrats },
    ] = await Promise.all([
      s.from('inscriptions_config').select('*').eq('ecole_id', ecole.id).eq('annee_scolaire', annee).single(),
      s.from('inscriptions_pedagogiques').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('annee_scolaire', annee),
      s.from('demandes_reduction').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('annee_scolaire', annee),
      s.from('contrats_scolarisation').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('annee_scolaire', annee),
      s.from('cheques_prevus').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('statut', 'prevu').lte('date_echeance', new Date().toISOString().split('T')[0]),
      s.from('contrats_scolarisation').select('*, familles(nom, email_parent1), contrat_enfants(*, enfants(prenom, nom))').eq('ecole_id', ecole.id).eq('annee_scolaire', annee).order('created_at', { ascending: false }),
    ])
    setConfig(cfg)
    setStats({ pedagogique: ped ?? 0, reduction: red ?? 0, contrats: cont ?? 0, cheques_a_encaisser: chq ?? 0 })
    setDossiers(contrats ?? [])
    setLoading(false)
  }

  async function sauvegarderConfig(updates: any) {
    setSaving(true)
    const s = createClient()
    if (config?.id) {
      await s.from('inscriptions_config').update(updates).eq('id', config.id)
    } else {
      await s.from('inscriptions_config').insert({ ecole_id: ecole.id, annee_scolaire: annee, ...updates })
    }
    await loadAll()
    setSaving(false)
  }

  const ONGLETS: { id: Onglet; label: string; icon: string; count?: number }[] = [
    { id: 'tableau_bord', label: 'Tableau de bord', icon: '◈' },
    { id: 'pedagogique', label: 'Fiches pédagogiques', icon: '📋', count: stats.pedagogique },
    { id: 'reduction', label: 'Demandes de réduction', icon: '💸', count: stats.reduction },
    { id: 'contrats', label: 'Contrats', icon: '📝', count: stats.contrats },
    { id: 'cheques', label: 'Chèques', icon: '🏦', count: stats.cheques_a_encaisser },
  ]

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Inscriptions N+1</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Gestion des inscriptions {annee}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            style={{ ...inp, width: 'auto', fontWeight: 600, color: '#1E293B' }}>
            <option value="2026-2027">2026-2027</option>
            <option value="2027-2028">2027-2028</option>
          </select>
          <button onClick={() => router.push(`/${ecole.slug}/parametres?tab=inscriptions`)}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '9px 16px', fontSize: 13, color: '#475569', cursor: 'pointer', fontWeight: 500 }}>
            ⚙️ Config
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4 }}>
        {ONGLETS.map(o => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            style={{
              flex: 1, padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: onglet === o.id ? '#fff' : 'transparent',
              color: onglet === o.id ? '#1E293B' : '#64748B',
              fontSize: 12, fontWeight: onglet === o.id ? 600 : 400,
              boxShadow: onglet === o.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s',
            }}>
            {o.icon} {o.label}
            {o.count !== undefined && o.count > 0 && (
              <span style={{ background: '#2563EB', color: '#fff', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{o.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TABLEAU DE BORD ── */}
      {onglet === 'tableau_bord' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Fiches péda.', value: stats.pedagogique, icon: '📋', color: '#6366F1', bg: 'rgba(99,102,241,0.08)' },
              { label: 'Demandes réduction', value: stats.reduction, icon: '💸', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
              { label: 'Contrats', value: stats.contrats, icon: '📝', color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
              { label: 'Chèques à encaisser', value: stats.cheques_a_encaisser, icon: '🏦', color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginBottom: 10 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{loading ? '—' : s.value}</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Config inscriptions */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 18px' }}>Configuration {annee}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Réductions */}
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6366F1', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  DEMANDES DE RÉDUCTION
                  <button onClick={() => sauvegarderConfig({ reductions_ouvertes: !config?.reductions_ouvertes })}
                    style={{ width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: config?.reductions_ouvertes ? '#6366F1' : '#CBD5E1', position: 'relative', transition: 'all 0.2s' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: config?.reductions_ouvertes ? 21 : 3, transition: 'all 0.2s' }} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={lbl}>Ouverture</label>
                    <input style={inp} type="date" defaultValue={config?.date_ouverture_reduction || ''}
                      onBlur={e => sauvegarderConfig({ date_ouverture_reduction: e.target.value || null })} />
                  </div>
                  <div>
                    <label style={lbl}>Clôture</label>
                    <input style={inp} type="date" defaultValue={config?.date_cloture_reduction || ''}
                      onBlur={e => sauvegarderConfig({ date_cloture_reduction: e.target.value || null })} />
                  </div>
                </div>
              </div>

              {/* Inscriptions */}
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#10B981', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  INSCRIPTIONS (CONTRATS)
                  <button onClick={() => sauvegarderConfig({ inscriptions_ouvertes: !config?.inscriptions_ouvertes })}
                    style={{ width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: config?.inscriptions_ouvertes ? '#10B981' : '#CBD5E1', position: 'relative', transition: 'all 0.2s' }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: config?.inscriptions_ouvertes ? 21 : 3, transition: 'all 0.2s' }} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={lbl}>Ouverture</label>
                    <input style={inp} type="date" defaultValue={config?.date_ouverture_inscription || ''}
                      onBlur={e => sauvegarderConfig({ date_ouverture_inscription: e.target.value || null })} />
                  </div>
                  <div>
                    <label style={lbl}>Clôture</label>
                    <input style={inp} type="date" defaultValue={config?.date_cloture_inscription || ''}
                      onBlur={e => sauvegarderConfig({ date_cloture_inscription: e.target.value || null })} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 14 }}>
              <div>
                <label style={lbl}>Frais d'inscription (€)</label>
                <input style={inp} type="number" defaultValue={config?.frais_inscription || 0}
                  onBlur={e => sauvegarderConfig({ frais_inscription: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <label style={lbl}>Assurance scolaire (€/enfant)</label>
                <input style={inp} type="number" defaultValue={config?.montant_assurance || 12}
                  onBlur={e => sauvegarderConfig({ montant_assurance: parseFloat(e.target.value) || 12 })} />
              </div>
              <div>
                <label style={lbl}>Message d'accueil portail</label>
                <input style={inp} defaultValue={config?.message_accueil || ''}
                  onBlur={e => sauvegarderConfig({ message_accueil: e.target.value })}
                  placeholder="Message affiché aux parents..." />
              </div>
            </div>
          </div>

          {/* Derniers dossiers */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
              Derniers contrats soumis
            </div>
            {dossiers.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun contrat pour l'instant</div>
            ) : dossiers.slice(0, 8).map((d, i) => {
              const st = formatStatut(d.statut)
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: i < 7 ? '1px solid #F8FAFC' : 'none', gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.familles?.nom || '—'}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>
                      {d.contrat_enfants?.length || 0} enfant(s) · {d.montant_total ? `${d.montant_total.toLocaleString('fr-FR')}€` : '—'}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 20 }}>{st.label}</span>
                  <button onClick={() => setOnglet('contrats')}
                    style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                    Voir →
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CONTRATS ── */}
      {onglet === 'contrats' && (
        <ContratsList ecoleId={ecole.id} ecoleSlug={ecole.slug} annee={annee} />
      )}

      {/* ── RÉDUCTIONS ── */}
      {onglet === 'reduction' && (
        <ReductionsList ecoleId={ecole.id} annee={annee} ecoleSlug={ecole.slug} />
      )}

      {/* ── PÉDAGOGIQUE ── */}
      {onglet === 'pedagogique' && (
        <PedagogiqueList ecoleId={ecole.id} annee={annee} />
      )}

      {/* ── CHÈQUES ── */}
      {onglet === 'cheques' && (
        <ChequesList ecoleId={ecole.id} annee={annee} />
      )}
    </div>
  )
}

// ── SOUS-COMPOSANTS ──

function ContratsList({ ecoleId, ecoleSlug, annee }: { ecoleId: string; ecoleSlug: string; annee: string }) {
  const [contrats, setContrats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('tous')

  useEffect(() => {
    createClient()
      .from('contrats_scolarisation')
      .select('*, familles(nom, email_parent1, telephone_parent1), contrat_enfants(*, enfants(prenom, nom))')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', annee)
      .order('soumis_le', { ascending: false })
      .then(({ data }) => { setContrats(data ?? []); setLoading(false) })
  }, [ecoleId, annee])

  async function validerContrat(id: string, userId: string) {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    await s.from('contrats_scolarisation').update({ statut: 'valide', valide_le: new Date().toISOString(), valide_par: session?.user.id }).eq('id', id)
    // Créer facture automatiquement
    const contrat = contrats.find(c => c.id === id)
    if (contrat?.montant_total) {
      await s.from('factures').insert({
        famille_id: contrat.famille_id,
        description: `Scolarité ${annee}`,
        montant_total: contrat.montant_total,
        statut: 'envoyee',
        date_emission: new Date().toISOString().split('T')[0],
      })
    }
    setContrats(p => p.map(c => c.id === id ? { ...c, statut: 'valide' } : c))
  }

  const filtres = ['tous', 'soumis', 'valide', 'brouillon']
  const liste = filtre === 'tous' ? contrats : contrats.filter(c => c.statut === filtre)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8 }}>
        {filtres.map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: filtre === f ? 600 : 400, background: filtre === f ? '#2563EB' : '#F1F5F9', color: filtre === f ? '#fff' : '#64748B' }}>
            {f.charAt(0).toUpperCase() + f.slice(1)} {f === 'tous' ? `(${contrats.length})` : `(${contrats.filter(c => c.statut === f).length})`}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
          : liste.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun contrat</div>
          : liste.map((c, i) => {
            const st = formatStatut(c.statut)
            return (
              <div key={c.id} style={{ padding: '14px 20px', borderBottom: i < liste.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{c.familles?.nom}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>
                    {c.contrat_enfants?.map((e: any) => e.enfants?.prenom).join(', ')}
                    {' · '}{c.mode_reglement} · {c.montant_total ? `${c.montant_total.toLocaleString('fr-FR')}€` : '—'}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 20 }}>{st.label}</span>
                {c.soumis_le && <div style={{ fontSize: 11, color: '#CBD5E1' }}>{new Date(c.soumis_le).toLocaleDateString('fr-FR')}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  {c.statut === 'soumis' && (
                    <button onClick={() => validerContrat(c.id, c.famille_id)}
                      style={{ fontSize: 12, color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}>
                      ✓ Valider
                    </button>
                  )}
                  <button
                    style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
                    Voir
                  </button>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

function ReductionsList({ ecoleId, annee, ecoleSlug }: { ecoleId: string; annee: string; ecoleSlug: string }) {
  const router = useRouter()
  const [liste, setListe] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('demandes_reduction')
      .select('*, familles(nom)')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', annee)
      .order('soumis_le', { ascending: false })
      .then(({ data }) => { setListe(data ?? []); setLoading(false) })
  }, [ecoleId, annee])

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const STATUT_PRIORITY = { soumis: 0, en_etude: 1, accepte: 2, refuse: 3, brouillon: 4 }
  const sorted = [...liste].sort((a, b) => (STATUT_PRIORITY[a.statut as keyof typeof STATUT_PRIORITY] ?? 9) - (STATUT_PRIORITY[b.statut as keyof typeof STATUT_PRIORITY] ?? 9))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Compteurs par statut */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { statut: 'soumis', label: 'À traiter', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
          { statut: 'en_etude', label: 'En étude', color: '#0891B2', bg: 'rgba(8,145,178,0.1)' },
          { statut: 'accepte', label: 'Acceptés', color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
          { statut: 'refuse', label: 'Refusés', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
        ].map(s => {
          const n = liste.filter(d => d.statut === s.statut).length
          return (
            <div key={s.statut} style={{ background: s.bg, borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{n}</div>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</div>
            </div>
          )
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
          Dossiers de réduction ({liste.length})
        </div>
        {liste.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun dossier</div>
        ) : sorted.map((d, i) => {
          const st = formatStatut(d.statut)
          return (
            <div key={d.id} style={{ padding: '14px 20px', borderBottom: i < sorted.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = '#F8FAFC'}
              onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}
              onClick={() => router.push(`/${ecoleSlug}/inscriptions/reduction/${d.id}`)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.familles?.nom}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  {d.nb_enfants_concernes || 0} enfant(s) · Proposé : {d.tarif_propose ? `${parseFloat(d.tarif_propose).toLocaleString('fr-FR')} €` : '—'}
                  {d.tarif_accorde ? ` · Accordé : ${parseFloat(d.tarif_accorde).toLocaleString('fr-FR')} €` : ''}
                  {d.soumis_le ? ` · ${new Date(d.soumis_le).toLocaleDateString('fr-FR')}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 20 }}>{st.label}</span>
              <span style={{ fontSize: 13, color: '#94A3B8' }}>→</span>
            </div>
          )
        })}
      </div>
    </div>
    </div>
  )
}

function PedagogiqueList({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [liste, setListe] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('inscriptions_pedagogiques')
      .select('*, familles(nom), enfants(prenom, nom), secteurs(nom)')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', annee)
      .order('soumis_le', { ascending: false })
      .then(({ data }) => { setListe(data ?? []); setLoading(false) })
  }, [ecoleId, annee])

  async function changerStatut(id: string, statut: string) {
    await createClient().from('inscriptions_pedagogiques').update({ statut }).eq('id', id)
    setListe(p => p.map(d => d.id === id ? { ...d, statut } : d))
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
        Fiches pédagogiques ({liste.length})
      </div>
      {liste.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune fiche</div>
      ) : liste.map((d, i) => {
        const st = formatStatut(d.statut)
        return (
          <div key={d.id} style={{ padding: '14px 20px', borderBottom: i < liste.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.enfants?.prenom} {d.enfants?.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{d.familles?.nom} · Secteur : {d.secteurs?.nom || '—'} · Classe : {d.classe_souhaitee || '—'}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 20 }}>{st.label}</span>
            {d.statut === 'soumis' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => changerStatut(d.id, 'accepte')} style={{ fontSize: 11, color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Accepter</button>
                <button onClick={() => changerStatut(d.id, 'refuse')} style={{ fontSize: 11, color: '#EF4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Refuser</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ChequesList({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [cheques, setCheques] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('cheques_prevus')
      .select('*, familles(nom), contrats_scolarisation(annee_scolaire)')
      .eq('ecole_id', ecoleId)
      .order('date_echeance')
      .then(({ data }) => { setCheques(data ?? []); setLoading(false) })
  }, [ecoleId])

  async function encaisser(id: string) {
    await createClient().from('cheques_prevus').update({ statut: 'encaisse', encaisse_le: new Date().toISOString().split('T')[0] }).eq('id', id)
    setCheques(p => p.map(c => c.id === id ? { ...c, statut: 'encaisse' } : c))
  }

  const today = new Date().toISOString().split('T')[0]
  const aEncaisser = cheques.filter(c => c.statut === 'prevu' && c.date_echeance <= today)
  const aVenir = cheques.filter(c => c.statut === 'prevu' && c.date_echeance > today)
  const encaisses = cheques.filter(c => c.statut === 'encaisse')

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const Section = ({ title, list, color, showEncaisser }: any) => (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color, display: 'flex', justifyContent: 'space-between' }}>
        {title} <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 400 }}>
          Total : {list.reduce((s: number, c: any) => s + (c.montant || 0), 0).toLocaleString('fr-FR')}€
        </span>
      </div>
      {list.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>Aucun</div>
        : list.map((c: any, i: number) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '11px 20px', borderBottom: i < list.length - 1 ? '1px solid #F8FAFC' : 'none', gap: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#64748B', flexShrink: 0 }}>{c.numero_cheque}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{c.familles?.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Échéance : {new Date(c.date_echeance).toLocaleDateString('fr-FR')}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{c.montant?.toLocaleString('fr-FR')}€</div>
            {showEncaisser && (
              <button onClick={() => encaisser(c.id)}
                style={{ fontSize: 12, color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}>
                ✓ Encaisser
              </button>
            )}
          </div>
        ))
      }
    </div>
  )

  return (
    <div>
      <Section title={`⚠️ À encaisser maintenant (${aEncaisser.length})`} list={aEncaisser} color="#EF4444" showEncaisser />
      <Section title={`📅 À venir (${aVenir.length})`} list={aVenir} color="#F59E0B" showEncaisser={false} />
      <Section title={`✅ Encaissés (${encaisses.length})`} list={encaisses} color="#10B981" showEncaisser={false} />
    </div>
  )
}
