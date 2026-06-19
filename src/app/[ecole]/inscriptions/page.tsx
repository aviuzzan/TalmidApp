'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { formatStatut } from '@/lib/inscriptions'
import { getExerciceInscription } from '@/lib/annee-inscription'
import { labelModePaiement } from '@/lib/statuts'
import { useI18n } from '@/lib/i18n'

type Onglet = 'tableau_bord' | 'pedagogique' | 'reduction' | 'contrats' | 'cheques'

export default function InscriptionsAdminPage() {
  const { t } = useI18n()
  const router = useRouter()
  const ecole = useEcole()
  const [onglet, setOnglet] = useState<Onglet>('tableau_bord')
  const [annee, setAnnee] = useState('')
  const [anneesDispo, setAnneesDispo] = useState<string[]>([])
  const [config, setConfig] = useState<any>(null)
  const [stats, setStats] = useState({ pedagogique: 0, reduction: 0, contrats: 0, cheques_a_encaisser: 0 })
  const [dossiers, setDossiers] = useState<any[]>([])
  const [tranchesEcole, setTranchesEcole] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ecole?.id) getExerciceInscription(createClient(), ecole.id).then(r => setAnnee(r.code))
  }, [ecole?.id])

  useEffect(() => {
    if (!ecole?.id) return
    const s = createClient()
    s.from('exercices').select('code').eq('ecole_id', ecole.id).order('code').then(({ data }) => {
      const codes = Array.from(new Set((data || []).map((r: any) => r.code).filter(Boolean))) as string[]
      if (codes.length) setAnneesDispo(codes)
    })
  }, [ecole?.id])
  useEffect(() => { if (annee) loadAll() }, [ecole.id, annee])

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
      s.from('contrats_scolarisation').select('*, familles(nom, parent1_email), contrat_enfants(*, enfants(prenom, nom))').eq('ecole_id', ecole.id).eq('annee_scolaire', annee).order('created_at', { ascending: false }),
    ])
    setConfig(cfg)
    setStats({ pedagogique: ped ?? 0, reduction: red ?? 0, contrats: cont ?? 0, cheques_a_encaisser: chq ?? 0 })
    setDossiers(contrats ?? [])
    const { data: trs } = await s.from('tranches_facturation').select('id, libelle, ordre').eq('ecole_id', ecole.id).order('ordre')
    setTranchesEcole(trs ?? [])
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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('pages.inscriptions.title')}</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Gestion des inscriptions {annee}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            style={{ ...inp, width: 'auto', fontWeight: 600, color: '#1E293B' }}>
            {(() => {
              const list = anneesDispo.length > 0 ? anneesDispo : (annee ? [annee] : [])
              const withCurrent = annee && !list.includes(annee) ? [...list, annee] : list
              return withCurrent.map(code => <option key={code} value={code}>{code}</option>)
            })()}
          </select>
          <button onClick={() => router.push(`/${ecole.slug}/parametres?tab=inscriptions`)}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '9px 16px', fontSize: 13, color: '#475569', cursor: 'pointer', fontWeight: 500 }}>
            ⚙️ Config
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="ecole-tabs" style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4 }}>
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
                  <div>
                    <label style={lbl}>Tranches éligibles à la DDR</label>
                    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {tranchesEcole.length === 0 && (
                        <div style={{ fontSize: 11, color: '#94A3B8', padding: '6px 4px' }}>Aucune tranche configurée. Va dans Paramètres &gt; Tranches.</div>
                      )}
                      {tranchesEcole.map(tr => {
                        const eligibles: string[] = config?.tranches_eligibles_ddr || []
                        const isChecked = eligibles.includes(tr.id)
                        return (
                          <label key={tr.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#475569', cursor: 'pointer', padding: '4px 4px' }}>
                            <input type="checkbox" checked={isChecked}
                              onChange={() => {
                                const next = isChecked ? eligibles.filter((x: string) => x !== tr.id) : [...eligibles, tr.id]
                                sauvegarderConfig({ tranches_eligibles_ddr: next })
                              }} />
                            {tr.libelle}
                          </label>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, lineHeight: 1.4 }}>
                      Si aucune case n&apos;est cochée, <strong>aucune famille</strong> ne pourra faire de DDR. Cocher uniquement les tranches qui ont droit à une réduction sur dossier (typiquement "Tarif réduit (sur dossier)").
                    </div>
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

            {/* Bandeau personnalisable affiché en haut du portail famille quand inscriptions ouvertes */}
            <div style={{ marginTop: 20, background: '#ECFDF5', border: '1px solid #10B981', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#065F46', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>📣 BANDEAU "INSCRIPTIONS OUVERTES" — VISIBLE COTE PARENT</span>
                <span style={{ fontSize: 10, color: '#10B981', fontWeight: 500 }}>S&apos;affiche automatiquement quand les inscriptions sont ouvertes</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Titre du bandeau (laissez vide pour utiliser le texte par défaut)</label>
                  <input style={inp} defaultValue={config?.bandeau_titre || ''}
                    onBlur={e => sauvegarderConfig({ bandeau_titre: e.target.value || null })}
                    placeholder={`Période d'inscriptions ${annee} ouverte`} />
                </div>
                <div>
                  <label style={lbl}>Message du bandeau (laissez vide pour le texte automatique avec la date limite)</label>
                  <textarea style={{ ...inp, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} defaultValue={config?.bandeau_message || ''}
                    onBlur={e => sauvegarderConfig({ bandeau_message: e.target.value || null })}
                    placeholder={`Vous pouvez inscrire vos enfants pour l'année ${annee} jusqu'au [date]. Nous restons à votre disposition pour toute question.`} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#065F46', marginTop: 8, fontStyle: 'italic' }}>
                💡 Ces 2 champs sont optionnels. Si vide, TalmidApp génère automatiquement un titre et un message clair avec la date de clôture configurée ci-dessus.
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
  const router = useRouter()
  const [contrats, setContrats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('tous')

  useEffect(() => {
    createClient()
      .from('contrats_scolarisation')
      .select('*, familles(nom, parent1_email, parent1_telephone), contrat_enfants(*, enfants(prenom, nom))')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', annee)
      .order('soumis_le', { ascending: false })
      .then(({ data }) => { setContrats(data ?? []); setLoading(false) })
  }, [ecoleId, annee])

  async function validerContrat(id: string, _userId: string) {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const contrat = contrats.find(c => c.id === id)
    if (!contrat) { alert('Contrat introuvable'); return }

    // 1. Marquer contrat comme validé
    const { data: upd, error: updErr } = await s
      .from('contrats_scolarisation')
      .update({ statut: 'valide', valide_le: new Date().toISOString(), valide_par: session?.user.id })
      .eq('id', id)
      .select()
    if (updErr || !upd || upd.length === 0) {
      alert('Erreur lors de la validation : ' + (updErr?.message || 'aucune ligne modifiée'))
      return
    }

    // 2. Vérifier existence facture (contrainte unique famille_id + annee_scolaire).
    //    Si active → idempotent. Si annulée → on la réactive (purge lignes + reset statut).
    const { data: existingFact } = await s
      .from('factures')
      .select('id, numero, statut')
      .eq('famille_id', contrat.famille_id)
      .eq('annee_scolaire', annee)
      .maybeSingle()

    const existing = existingFact && existingFact.statut !== 'annule' ? existingFact : null
    const factureAReactiver = existingFact && existingFact.statut === 'annule' ? existingFact : null

    if (factureAReactiver) {
      // Purger les anciennes lignes
      await s.from('facture_lignes').delete().eq('facture_id', factureAReactiver.id)
    }

    if (!existing) {
      // 2a. Numéro facture séquentiel : FACT-{YYYY}-{NNNN}
      const yearSuffix = annee.split('-')[1] || new Date().getFullYear().toString()
      const { data: lastFact } = await s
        .from('factures')
        .select('numero')
        .like('numero', `FACT-${yearSuffix}-%`)
        .order('numero', { ascending: false })
        .limit(1)
        .maybeSingle()
      let nextNum = 1
      if (lastFact?.numero) {
        const m = lastFact.numero.match(/FACT-\d+-(\d+)$/)
        if (m) nextNum = parseInt(m[1]) + 1
      }
      const numero = `FACT-${yearSuffix}-${String(nextNum).padStart(4, '0')}`

      // Résoudre exercice_id pour que la facture remonte dans Direction et Finances filtrés par exercice
      let exerciceIdForFact: string | null = contrat.exercice_id || null
      if (!exerciceIdForFact) {
        const { data: ex } = await s.from('exercices').select('id').eq('ecole_id', ecoleId).eq('code', annee).maybeSingle()
        exerciceIdForFact = ex?.id || null
      }

      // 2b. INSERT (création) OU UPDATE (réactivation d'une facture annulée)
      let nf: any = null
      let insErr: any = null
      if (factureAReactiver) {
        const upd = await s
          .from('factures')
          .update({
            statut: 'en_attente',
            annule_le: null,
            exercice_id: exerciceIdForFact,
            date_emission: new Date().toISOString().split('T')[0],
            notes: `Réactivée après re-validation du contrat ${annee}`,
          })
          .eq('id', factureAReactiver.id)
          .select()
          .single()
        nf = upd.data
        insErr = upd.error
      } else {
        const ins = await s
          .from('factures')
          .insert({
            famille_id: contrat.famille_id,
            annee_scolaire: annee,
            exercice_id: exerciceIdForFact,
            numero,
            date_emission: new Date().toISOString().split('T')[0],
            statut: 'en_attente',
            notes: `Générée automatiquement à la validation du contrat ${annee}`,
          })
          .select()
          .single()
        nf = ins.data
        insErr = ins.error
      }

      if (insErr || !nf) {
        alert('Contrat validé mais erreur création facture : ' + (insErr?.message || 'inconnue'))
        setContrats(p => p.map(c => c.id === id ? { ...c, statut: 'valide' } : c))
        return
      }

      // 2c. Récup DDR validée + map tarifs + config frais + nouveaux enfants
      const enfantIds = (contrat.contrat_enfants || []).map((e: any) => e.enfant_id).filter(Boolean)
      const [{ data: ddr }, { data: tarifsList }, { data: fraisCfg }, { data: pedagos }] = await Promise.all([
        s.from('demandes_reduction').select('tarif_accorde, statut')
          .eq('famille_id', contrat.famille_id).eq('annee_scolaire', annee)
          .eq('statut', 'accepte').maybeSingle(),
        s.from('tarifs_secteur').select('id, inclus_dans_reduction').eq('ecole_id', ecoleId),
        s.from('frais_inscription_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).maybeSingle(),
        enfantIds.length
          ? s.from('inscriptions_pedagogiques').select('enfant_id').eq('annee_scolaire', annee).in('enfant_id', enfantIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const nouveauxIds = new Set((pedagos || []).map((p: any) => p.enfant_id))
      const tarifMap: Record<string, boolean> = {}
      ;(tarifsList || []).forEach((t: any) => { tarifMap[t.id] = t.inclus_dans_reduction !== false })

      const lignes: any[] = []
      const enfants = contrat.contrat_enfants || []

      if (ddr?.tarif_accorde) {
        // DDR validée : 1 ligne forfait commission + 1 ligne par enfant pour les options
        const enfantsLabels = enfants
          .map((e: any) => `${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim())
          .filter(Boolean)
          .join(' + ')
        const descForfait = enfantsLabels
          ? `Forfait scolarité ${annee} — Famille (${enfants.length} enfant${enfants.length > 1 ? 's' : ''} : ${enfantsLabels}) — tarif accordé par la commission`
          : `Forfait scolarité ${annee} (tarif accordé par la commission)`
        lignes.push({
          facture_id: nf.id,
          enfant_id: null,
          description: descForfait,
          montant: parseFloat(ddr.tarif_accorde) || 0,
          deductible: true,
        })
        for (const e of enfants) {
          const totalOptions = (e.postes || []).reduce((acc: number, p: any) => {
            const inclus = tarifMap[p.tarif_id] !== false
            return acc + (inclus ? 0 : (parseFloat(p.montant) || 0))
          }, 0)
          if (totalOptions > 0) {
            lignes.push({
              facture_id: nf.id,
              enfant_id: e.enfant_id,
              description: `Options ${annee} — ${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim(),
              montant: totalOptions,
              deductible: false,
            })
          }
        }
      } else {
        // Pas de DDR validée : on éclate les postes du contrat (Frais de scolarité,
        // Demi-pension, Navette, Cantine, etc.) pour que la facture montre le détail
        // au lieu d'un montant global.
        for (const e of enfants) {
          const postes = Array.isArray((e as any).postes) ? (e as any).postes : []
          const enfantLabel = e.enfants ? `${e.enfants.prenom || ''} ${e.enfants.nom || ''}`.trim() : ''
          const classe = e.classe_prevue ? ` (${e.classe_prevue})` : ''
          if (postes.length > 0) {
            for (const p of postes) {
              const montant = parseFloat(p.montant) || 0
              if (montant <= 0) continue
              const nom = p.nom || 'Poste'
              const tarifInclus = tarifMap[p.tarif_id]
              const estScolarite = /scolarit/i.test(nom)
              const deductible = tarifInclus !== undefined ? tarifInclus !== false : estScolarite
              lignes.push({
                facture_id: nf.id,
                enfant_id: e.enfant_id,
                description: `${nom} ${annee} — ${enfantLabel}${classe}`.trim(),
                montant,
                deductible,
              })
            }
          } else if (e.sous_total != null) {
            lignes.push({
              facture_id: nf.id,
              enfant_id: e.enfant_id,
              description: `Scolarité ${annee}${e.classe_prevue ? ' — ' + e.classe_prevue : ''}${enfantLabel ? ' (' + enfantLabel + ')' : ''}`.trim(),
              montant: parseFloat(e.sous_total) || 0,
              deductible: true,
            })
          }
        }
      }

      // + assurance scolaire si souscrite
      if (contrat.assurance_ecole && contrat.assurance_montant_total) {
        lignes.push({
          facture_id: nf.id,
          enfant_id: null,
          description: `Assurance scolaire ${annee}`,
          montant: parseFloat(contrat.assurance_montant_total) || 0,
          deductible: false,
        })
      }

      // + frais inscription / réinscription selon config école
      if (fraisCfg) {
        const enfantsList = contrat.contrat_enfants || []
        const nouveauxEnfants = enfantsList.filter((e: any) => nouveauxIds.has(e.enfant_id))
        const reinscriptionsEnfants = enfantsList.filter((e: any) => !nouveauxIds.has(e.enfant_id))

        // Inscription par enfant (nouveaux)
        const fraisInscEnfant = parseFloat(fraisCfg.inscription_par_enfant) || 0
        if (fraisInscEnfant > 0) {
          for (const e of nouveauxEnfants) {
            lignes.push({
              facture_id: nf.id,
              enfant_id: e.enfant_id,
              description: `Frais d'inscription ${annee} — ${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim(),
              montant: fraisInscEnfant,
              deductible: false,
            })
          }
        }
        // Inscription forfait famille (si au moins 1 nouveau)
        const fraisInscFamille = parseFloat(fraisCfg.inscription_par_famille) || 0
        if (fraisInscFamille > 0 && nouveauxEnfants.length > 0) {
          lignes.push({
            facture_id: nf.id,
            enfant_id: null,
            description: `Frais d'inscription forfait famille ${annee}`,
            montant: fraisInscFamille,
            deductible: false,
          })
        }
        // Réinscription par enfant
        const fraisReinsEnfant = parseFloat(fraisCfg.reinscription_par_enfant) || 0
        if (fraisReinsEnfant > 0) {
          for (const e of reinscriptionsEnfants) {
            lignes.push({
              facture_id: nf.id,
              enfant_id: e.enfant_id,
              description: `Frais de réinscription ${annee} — ${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim(),
              montant: fraisReinsEnfant,
              deductible: false,
            })
          }
        }
        // Réinscription forfait famille (si au moins 1 réinscription)
        const fraisReinsFamille = parseFloat(fraisCfg.reinscription_par_famille) || 0
        if (fraisReinsFamille > 0 && reinscriptionsEnfants.length > 0) {
          lignes.push({
            facture_id: nf.id,
            enfant_id: null,
            description: `Frais de réinscription forfait famille ${annee}`,
            montant: fraisReinsFamille,
            deductible: false,
          })
        }
      }

      if (lignes.length) {
        const { error: ligErr } = await s.from('facture_lignes').insert(lignes)
        if (ligErr) {
          alert('Facture créée mais erreur sur les lignes : ' + ligErr.message)
        }
      }
    }

    // Notifier la famille par email (best-effort)
    try {
      await fetch('/api/notify-famille', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ecole_id: ecoleId,
          famille_id: contrat.famille_id,
          type: 'contrat_valide',
        }),
      })
    } catch {}

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
                    {' · '}{labelModePaiement(c.mode_reglement)} · {c.montant_total ? `${c.montant_total.toLocaleString('fr-FR')}€` : '—'}
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
                  <button onClick={() => router.push(`/${ecoleSlug}/inscriptions/contrat/${c.id}`)}
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

  async function validerReduction(id: string) {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    await s.from('demandes_reduction').update({ statut: 'accepte', traite_le: new Date().toISOString(), traite_par: session?.user.id }).eq('id', id)
    setListe(p => p.map(d => d.id === id ? { ...d, statut: 'accepte' } : d))
  }

  async function refuserReduction(id: string) {
    if (!confirm('Refuser cette demande de réduction ?')) return
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    await s.from('demandes_reduction').update({ statut: 'refuse', traite_le: new Date().toISOString(), traite_par: session?.user.id }).eq('id', id)
    setListe(p => p.map(d => d.id === id ? { ...d, statut: 'refuse' } : d))
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const priorite: Record<string, number> = { soumis: 0, en_etude: 1, accepte: 2, refuse: 3, brouillon: 4 }
  const sorted = [...liste].sort((a, b) => (priorite[a.statut] ?? 9) - (priorite[b.statut] ?? 9))

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
              {d.statut === 'soumis' && (
                <div style={{ display: 'flex', gap: 6 }} onClick={ev => ev.stopPropagation()}>
                  <button onClick={ev => { ev.stopPropagation(); validerReduction(d.id) }}
                    style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 32 }}>
                    ✓ Valider
                  </button>
                  <button onClick={ev => { ev.stopPropagation(); refuserReduction(d.id) }}
                    style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 32 }}>
                    ✗ Refuser
                  </button>
                </div>
              )}
              <span style={{ fontSize: 13, color: '#94A3B8' }}>→</span>
            </div>
          )
        })}
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
    const s = createClient()
    const { error: errFiche } = await s.from('inscriptions_pedagogiques').update({ statut }).eq('id', id)
    if (errFiche) { alert('Erreur fiche : ' + errFiche.message); return }
    // Repercuter sur l'eleve : accepte => inscrit (debloque la reinscription), refuse => refuse
    const fiche = liste.find(d => d.id === id)
    if (fiche?.enfant_id) {
      const nouveauStatut = statut === 'accepte' ? 'inscrit' : statut === 'refuse' ? 'refuse' : null
      if (nouveauStatut) {
        // 1) Update statut sur enfants (debloque la reinscription)
        const { data, error: errEnf } = await s
          .from('enfants')
          .update({ statut_inscription: nouveauStatut })
          .eq('id', fiche.enfant_id)
          .select('id, statut_inscription')
        if (errEnf || !data || data.length === 0) {
          alert(`Fiche validée mais le statut de l'élève n'a pas pu être mis à jour. Détail : ${errEnf?.message || 'aucune ligne modifiée (probablement RLS)'}`)
          return
        }
        // 2) Update aussi scolarites.statut_inscription pour l'annee de la fiche
        // C'est ce qui s'affiche dans la fiche enfant (parcours scolaire par annee).
        if (fiche.annee_scolaire) {
          const { error: errSco } = await s
            .from('scolarites')
            .update({ statut_inscription: nouveauStatut })
            .eq('enfant_id', fiche.enfant_id)
            .eq('annee_scolaire', fiche.annee_scolaire)
          if (errSco) {
            console.warn('Update scolarites echoue (non bloquant) :', errSco.message)
          }
        }
      }
    }
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

  // Valider la reception physique d'un cheque : il devient alors visible/exploitable
  async function marquerRecu(id: string) {
    await createClient().from('cheques_prevus').update({ statut: 'prevu' }).eq('id', id)
    setCheques(p => p.map(c => c.id === id ? { ...c, statut: 'prevu' } : c))
  }

  const today = new Date().toISOString().split('T')[0]
  const attenteReception = cheques.filter(c => c.statut === 'attente_reception')
  const aEncaisser = cheques.filter(c => c.statut === 'prevu' && c.date_echeance <= today)
  const aVenir = cheques.filter(c => c.statut === 'prevu' && c.date_echeance > today)
  const encaisses = cheques.filter(c => c.statut === 'encaisse')

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const Section = ({ title, list, color, showEncaisser, showRecu }: any) => (
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
            {showRecu && (
              <button onClick={() => marquerRecu(c.id)}
                style={{ fontSize: 12, color: '#2563EB', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}>
                ✓ Marquer reçu
              </button>
            )}
          </div>
        ))
      }
    </div>
  )

  return (
    <div>
      <Section title={`⏳ En attente de réception (${attenteReception.length})`} list={attenteReception} color="#2563EB" showRecu />
      <Section title={`⚠️ À encaisser maintenant (${aEncaisser.length})`} list={aEncaisser} color="#EF4444" showEncaisser />
      <Section title={`📅 À venir (${aVenir.length})`} list={aVenir} color="#F59E0B" showEncaisser={false} />
      <Section title={`✅ Encaissés (${encaisses.length})`} list={encaisses} color="#10B981" showEncaisser={false} />
    </div>
  )
}
