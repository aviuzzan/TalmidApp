'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Configuration des relances impayés.
 * Page séparée (au lieu d'un onglet inline) pour éviter les régressions sur
 * la page Paramètres principale.
 */

export default function RelancesConfigPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [cfg, setCfg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id])

  async function load() {
    setLoading(true)
    const { data } = await createClient()
      .from('relances_config').select('*').eq('ecole_id', ecole.id).maybeSingle()
    setCfg(data || {
      ecole_id: ecole.id, actif: false,
      delai_rappel: 15, delai_relance: 30, delai_demeure: 60,
      sujet_rappel: 'Rappel — Facture {{numero_facture}}',
      corps_rappel: '',
      sujet_relance: 'Relance — Facture {{numero_facture}} impayée',
      corps_relance: '',
      sujet_demeure: 'Mise en demeure — Facture {{numero_facture}}',
      corps_demeure: '',
    })
    setLoading(false)
  }

  async function save() {
    setSaving(true); setMsg('')
    const { error } = await createClient().from('relances_config').upsert({
      ecole_id: ecole.id,
      actif: !!cfg.actif,
      delai_rappel: Number(cfg.delai_rappel) || 15,
      delai_relance: Number(cfg.delai_relance) || 30,
      delai_demeure: Number(cfg.delai_demeure) || 60,
      sujet_rappel: cfg.sujet_rappel || '',
      corps_rappel: cfg.corps_rappel || '',
      sujet_relance: cfg.sujet_relance || '',
      corps_relance: cfg.corps_relance || '',
      sujet_demeure: cfg.sujet_demeure || '',
      corps_demeure: cfg.corps_demeure || '',
    }, { onConflict: 'ecole_id' })
    setSaving(false)
    if (error) setMsg('✗ Erreur : ' + error.message)
    else { setMsg('✓ Configuration enregistrée'); setTimeout(() => setMsg(''), 3000) }
  }

  function set(k: string, v: any) { setCfg({ ...cfg, [k]: v }) }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, textTransform: 'uppercase' }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Relances impayés — Configuration</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
            3 niveaux de relance automatique (rappel / relance / mise en demeure) selon les jours de retard.
          </p>
        </div>
        <button onClick={() => router.push(`/${ecole.slug}/parametres`)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>
          ← Paramètres
        </button>
      </div>

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
        Variables disponibles dans le sujet et le corps :
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {['{{prenom_parent}}', '{{numero_facture}}', '{{montant_du}}', '{{date_echeance}}', '{{nom_ecole}}'].map(v => (
            <code key={v} style={{ background: '#fff', padding: '3px 8px', borderRadius: 4, fontSize: 11, border: '1px solid #E2E8F0' }}>{v}</code>
          ))}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: cfg.actif ? '#ECFDF5' : '#fff', border: `1px solid ${cfg.actif ? '#A7F3D0' : '#E2E8F0'}`, borderRadius: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!cfg.actif} onChange={e => set('actif', e.target.checked)} style={{ width: 20, height: 20, cursor: 'pointer' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: cfg.actif ? '#065F46' : '#1E293B' }}>Envoi automatique {cfg.actif ? 'activé' : 'désactivé'}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            Le cron quotidien (8h UTC) parcourra les factures impayées et enverra le niveau adapté.
          </div>
        </div>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div>
          <label style={lbl}>Délai rappel (jours après échéance)</label>
          <input style={inp} type="number" min={1} value={cfg.delai_rappel} onChange={e => set('delai_rappel', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Délai relance (jours)</label>
          <input style={inp} type="number" min={1} value={cfg.delai_relance} onChange={e => set('delai_relance', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Délai mise en demeure (jours)</label>
          <input style={inp} type="number" min={1} value={cfg.delai_demeure} onChange={e => set('delai_demeure', e.target.value)} />
        </div>
      </div>

      {[
        { titre: '1. Rappel (ton neutre)',          sk: 'sujet_rappel',  ck: 'corps_rappel',  color: '#2563EB' },
        { titre: '2. Relance (ton ferme courtois)', sk: 'sujet_relance', ck: 'corps_relance', color: '#D97706' },
        { titre: '3. Mise en demeure (formel)',     sk: 'sujet_demeure', ck: 'corps_demeure', color: '#DC2626' },
      ].map(n => (
        <div key={n.sk} style={{ border: `1px solid ${n.color}33`, borderLeft: `3px solid ${n.color}`, borderRadius: 10, padding: 14, background: '#fff' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: n.color, marginBottom: 10 }}>{n.titre}</div>
          <label style={lbl}>Sujet de l&apos;email</label>
          <input style={{ ...inp, marginBottom: 10 }} value={cfg[n.sk] || ''} onChange={e => set(n.sk, e.target.value)} />
          <label style={lbl}>Corps (texte brut, retours à la ligne respectés)</label>
          <textarea style={{ ...inp, minHeight: 140, fontFamily: 'inherit', resize: 'vertical' }} value={cfg[n.ck] || ''} onChange={e => set(n.ck, e.target.value)} placeholder="Bonjour {{prenom_parent}}..." />
        </div>
      ))}

      {msg && (
        <div style={{
          background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2',
          color: msg.startsWith('✓') ? '#065F46' : '#991B1B',
          border: `1px solid ${msg.startsWith('✓') ? '#A7F3D0' : '#FECACA'}`,
          padding: '10px 14px', borderRadius: 8, fontSize: 13,
        }}>{msg}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement...' : '✓ Enregistrer la configuration'}
        </button>
      </div>
    </div>
  )
}
