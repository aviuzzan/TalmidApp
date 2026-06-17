'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Paramètres de l'assurance scolaire proposée aux familles dans le contrat.
 *  - assurance_proposee : si false, la section assurance est masquée du portail
 *  - assurance_montant_annuel : montant par enfant (€)
 */
export default function AssuranceTab({ ecoleId }: { ecoleId: string }) {
  const [form, setForm] = useState({ assurance_proposee: true, assurance_montant_annuel: '12' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    createClient().from('ecoles')
      .select('assurance_proposee, assurance_montant_annuel')
      .eq('id', ecoleId).maybeSingle()
      .then(({ data }) => {
        if (data) setForm({
          assurance_proposee: data.assurance_proposee !== false,
          assurance_montant_annuel: String(data.assurance_montant_annuel ?? 12),
        })
        setLoading(false)
      })
  }, [ecoleId])

  async function sauvegarder() {
    setSaving(true)
    await createClient().from('ecoles').update({
      assurance_proposee: form.assurance_proposee,
      assurance_montant_annuel: parseFloat(form.assurance_montant_annuel) || 0,
    }).eq('id', ecoleId)
    setSaving(false)
    setSavedAt(new Date())
    setTimeout(() => setSavedAt(null), 3000)
  }

  if (loading) return <div style={{ padding: 20, color: '#94A3B8' }}>Chargement...</div>

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: 160, boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
      <div style={{ fontSize: 12, color: '#64748B', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '9px 14px' }}>
        Quand l'école propose une assurance, le parent peut la choisir sur son contrat ou fournir sa propre attestation. Si vous désactivez cette option, la section "Assurance scolaire" est masquée du contrat (les parents fournissent forcément leur propre attestation).
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px' }}>
        <input type="checkbox" checked={form.assurance_proposee} onChange={e => setForm(p => ({ ...p, assurance_proposee: e.target.checked }))} style={{ width: 18, height: 18, accentColor: '#2563EB' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>L'école propose une assurance scolaire</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Décochez si l'école ne propose pas d'assurance.</div>
        </div>
      </label>

      {form.assurance_proposee && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Montant annuel par enfant
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <input style={inp} type="number" min="0" step="0.01" value={form.assurance_montant_annuel}
              onChange={e => setForm(p => ({ ...p, assurance_montant_annuel: e.target.value }))} />
            <span style={{ fontSize: 14, color: '#475569' }}>€ / enfant / an</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={sauvegarder} disabled={saving}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {savedAt && <span style={{ fontSize: 12, color: '#10B981' }}>✓ Enregistré</span>}
      </div>
    </div>
  )
}
