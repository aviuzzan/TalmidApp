'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function FraisInscriptionTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [form, setForm] = useState<any>({ inscription_par_enfant: '', inscription_par_famille: '', reinscription_par_enfant: '', reinscription_par_famille: '' })
  const [recordId, setRecordId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    createClient().from('frais_inscription_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRecordId(data.id)
          setForm({
            inscription_par_enfant: data.inscription_par_enfant?.toString() || '',
            inscription_par_famille: data.inscription_par_famille?.toString() || '',
            reinscription_par_enfant: data.reinscription_par_enfant?.toString() || '',
            reinscription_par_famille: data.reinscription_par_famille?.toString() || '',
          })
        } else {
          setRecordId(null)
          setForm({ inscription_par_enfant: '', inscription_par_famille: '', reinscription_par_enfant: '', reinscription_par_famille: '' })
        }
        setLoading(false)
      })
  }, [ecoleId, annee])

  async function save() {
    setSaving(true); setSaved(false); setSaveErr(null)
    const payload = {
      ecole_id: ecoleId, annee_scolaire: annee,
      inscription_par_enfant: parseFloat(form.inscription_par_enfant) || 0,
      inscription_par_famille: parseFloat(form.inscription_par_famille) || 0,
      reinscription_par_enfant: parseFloat(form.reinscription_par_enfant) || 0,
      reinscription_par_famille: parseFloat(form.reinscription_par_famille) || 0,
      updated_at: new Date().toISOString(),
    }
    const s = createClient()
    let error
    if (recordId) {
      ;({ error } = await s.from('frais_inscription_config').update(payload).eq('id', recordId))
    } else {
      const res = await s.from('frais_inscription_config').insert(payload).select().single()
      error = res.error
      if (res.data) setRecordId(res.data.id)
    }
    setSaving(false)
    if (error) { setSaveErr('Erreur : ' + error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inp = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const help = { fontSize: 11, color: '#94A3B8', marginTop: 4 }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>🧾 Frais d'inscription / réinscription — {annee}</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Ces montants sont ajoutés automatiquement à la facture quand un contrat est validé. "Par enfant" est multiplié par le nombre d'enfants ; "par famille" est compté une seule fois.
        </p>
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1D4ED8', margin: '0 0 12px' }}>Inscription (nouvel enfant)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={lbl}>Par enfant (€)</label>
            <input style={inp} type="number" step="0.01" value={form.inscription_par_enfant}
              onChange={e => setForm((p: any) => ({ ...p, inscription_par_enfant: e.target.value }))} />
            <div style={help}>Pour chaque nouvel enfant ajouté via la fiche pédagogique.</div>
          </div>
          <div>
            <label style={lbl}>Par famille (€)</label>
            <input style={inp} type="number" step="0.01" value={form.inscription_par_famille}
              onChange={e => setForm((p: any) => ({ ...p, inscription_par_famille: e.target.value }))} />
            <div style={help}>Forfait famille appliqué une fois si au moins 1 nouvel enfant.</div>
          </div>
        </div>
      </div>

      <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#92400E', margin: '0 0 12px' }}>Réinscription (enfant existant)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={lbl}>Par enfant (€)</label>
            <input style={inp} type="number" step="0.01" value={form.reinscription_par_enfant}
              onChange={e => setForm((p: any) => ({ ...p, reinscription_par_enfant: e.target.value }))} />
            <div style={help}>Pour chaque enfant déjà inscrit qui reconduit.</div>
          </div>
          <div>
            <label style={lbl}>Par famille (€)</label>
            <input style={inp} type="number" step="0.01" value={form.reinscription_par_famille}
              onChange={e => setForm((p: any) => ({ ...p, reinscription_par_famille: e.target.value }))} />
            <div style={help}>Forfait famille appliqué une fois si au moins 1 réinscription.</div>
          </div>
        </div>
      </div>

      {saveErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#DC2626' }}>⚠️ {saveErr}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ minHeight: 44, padding: '10px 22px' }}>
          {saving ? 'Enregistrement…' : '💾 Enregistrer'}
        </button>
        {saved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Enregistré</span>}
      </div>
    </div>
  )
}
