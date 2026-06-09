'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

export default function ConfigPaiementTab({ ecoleId }: { ecoleId: string }) {
  const toast = useToast()
  const [config, setConfig] = useState<any>(null)
  const [dates, setDates] = useState<any[]>([])
  const [newJour, setNewJour] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [ecoleId])

  async function load() {
    const s = createClient()
    const [{ data: cfg }, { data: d }] = await Promise.all([
      s.from('contrat_paiement_config').select('*').eq('ecole_id', ecoleId).single(),
      s.from('dates_encaissement').select('*').eq('ecole_id', ecoleId).order('ordre'),
    ])
    setConfig(cfg); setDates(d ?? [])
  }

  async function sauvegarderConfig() {
    setSaving(true)
    const s = createClient()
    if (config?.id) await s.from('contrat_paiement_config').update({ nb_echeances_min: config.nb_echeances_min, nb_echeances_max: config.nb_echeances_max }).eq('id', config.id)
    else await s.from('contrat_paiement_config').insert({ ecole_id: ecoleId, nb_echeances_min: config?.nb_echeances_min || 1, nb_echeances_max: config?.nb_echeances_max || 12 })
    await load(); setSaving(false)
  }

  async function ajouterDate() {
    const jour = parseInt(newJour)
    if (!jour || jour < 1 || jour > 28) { toast.error('Jour entre 1 et 28'); return }
    await createClient().from('dates_encaissement').insert({ ecole_id: ecoleId, jour_du_mois: jour, label: newLabel || `${jour === 1 ? '1er' : jour + 'e'} du mois`, ordre: dates.length })
    setNewJour(''); setNewLabel(''); await load()
  }

  async function toggleDate(id: string, actif: boolean) {
    await createClient().from('dates_encaissement').update({ actif: !actif }).eq('id', id); await load()
  }

  async function supprimerDate(id: string) {
    await createClient().from('dates_encaissement').delete().eq('id', id); await load()
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Nombre d'échéances */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Nombre d'échéances autorisées</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 360 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 }}>MINIMUM</label>
            <input style={inp} type="number" min="1" max="12" value={config?.nb_echeances_min || 1}
              onChange={e => setConfig((p: any) => ({ ...p, nb_echeances_min: parseInt(e.target.value) || 1 }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 }}>MAXIMUM</label>
            <input style={inp} type="number" min="1" max="12" value={config?.nb_echeances_max || 12}
              onChange={e => setConfig((p: any) => ({ ...p, nb_echeances_max: parseInt(e.target.value) || 12 }))} />
          </div>
        </div>
        <button onClick={sauvegarderConfig} disabled={saving}
          style={{ marginTop: 12, background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {config?.nb_echeances_min && config?.nb_echeances_max && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748B' }}>
            Les parents pourront choisir de {config.nb_echeances_min} à {config.nb_echeances_max} échéances.
          </div>
        )}
      </div>

      {/* Dates d'encaissement */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>Dates d'encaissement disponibles</div>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 14px' }}>Les parents choisissent parmi ces dates pour leurs prélèvements/chèques. Maximum 28 (pour compatibilité tous mois).</p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 80 }}>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>JOUR</div>
            <input style={{ ...inp }} type="number" min="1" max="28" value={newJour} onChange={e => setNewJour(e.target.value)} placeholder="1" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>LIBELLÉ (optionnel)</div>
            <input style={{ ...inp }} value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ex: 1er du mois" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={ajouterDate} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              + Ajouter
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {dates.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: d.actif ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${d.actif ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, padding: '8px 12px', opacity: d.actif ? 1 : 0.6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: d.actif ? '#2563EB' : '#94A3B8' }}>{d.jour_du_mois}</span>
              <span style={{ fontSize: 12, color: '#64748B' }}>{d.label}</span>
              <button onClick={() => toggleDate(d.id, d.actif)} style={{ fontSize: 10, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>
                {d.actif ? '⏸' : '▶'}
              </button>
              <button onClick={() => supprimerDate(d.id)} style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
