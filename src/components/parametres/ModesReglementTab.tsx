'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Gestion des modes de règlement disponibles dans le contrat de scolarisation
 * et la saisie des paiements.
 *
 * - 4 modes "système" préinstallés (chèque, SEPA, GoCardless, Stripe) : on/off
 * - L'admin peut créer N modes "personnalisés" (espèces, virement, etc.)
 */
export default function ModesReglementTab({ ecoleId }: { ecoleId: string }) {
  const [modes, setModes] = useState<any[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const TYPES_SYSTEME = [
    { value: 'cheque', label: 'Chèque', desc: 'Chèques remis à la comptabilité', icon: '📝' },
    { value: 'sepa', label: 'Prélèvement SEPA', desc: 'Export XML SEPA / Sage Direct', icon: '🏦' },
    { value: 'gocardless', label: 'GoCardless', desc: 'Prélèvement en ligne', icon: '🔗', comingSoon: true },
    { value: 'stripe', label: 'Carte bancaire', desc: 'Paiement Stripe', icon: '💳', comingSoon: true },
  ]
  const systemKeys = new Set(TYPES_SYSTEME.map(t => t.value))

  useEffect(() => {
    createClient().from('modes_reglement_ecole').select('*').eq('ecole_id', ecoleId).order('ordre').then(({ data }) => setModes(data ?? []))
  }, [ecoleId])

  async function toggle(id: string, actif: boolean) {
    await createClient().from('modes_reglement_ecole').update({ actif: !actif }).eq('id', id)
    setModes(p => p.map(m => m.id === id ? { ...m, actif: !actif } : m))
  }

  async function activerSysteme(type: string, label: string) {
    const existing = modes.find(m => m.type === type)
    if (existing) return
    const { data } = await createClient().from('modes_reglement_ecole').insert({
      ecole_id: ecoleId, type, label, actif: true, ordre: modes.length,
    }).select().single()
    if (data) setModes(p => [...p, data])
  }

  function slugify(s: string): string {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)
  }

  async function ajouterPersonnalise() {
    const lab = newLabel.trim()
    if (!lab) return
    let type = slugify(lab)
    if (systemKeys.has(type) || modes.find(m => m.type === type)) {
      type = `${type}_${Date.now().toString(36).slice(-4)}`
    }
    setSaving(true)
    const { data } = await createClient().from('modes_reglement_ecole').insert({
      ecole_id: ecoleId, type, label: lab, actif: true, ordre: modes.length,
    }).select().single()
    if (data) {
      setModes(p => [...p, data])
      setNewLabel('')
    }
    setSaving(false)
  }

  async function renommer(m: any) {
    const v = prompt('Nouveau libellé :', m.label)
    if (v === null || !v.trim()) return
    await createClient().from('modes_reglement_ecole').update({ label: v.trim() }).eq('id', m.id)
    setModes(p => p.map(x => x.id === m.id ? { ...x, label: v.trim() } : x))
  }

  async function supprimer(m: any) {
    if (!confirm(`Supprimer le mode "${m.label}" ?\nLes règlements déjà saisis avec ce mode resteront.`)) return
    await createClient().from('modes_reglement_ecole').delete().eq('id', m.id)
    setModes(p => p.filter(x => x.id !== m.id))
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const customsModes = modes.filter(m => !systemKeys.has(m.type))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* SECTION 1 : Modes système */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Modes intégrés</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TYPES_SYSTEME.map(t => {
            const existing = modes.find(m => m.type === t.value)
            return (
              <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', opacity: t.comingSoon ? 0.6 : 1 }}>
                <div style={{ fontSize: 18 }}>{t.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t.label}
                    {t.comingSoon && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#D97706', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>Bientôt</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{t.desc}</div>
                </div>
                {!t.comingSoon && (existing ? (
                  <button onClick={() => toggle(existing.id, existing.actif)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: existing.actif ? '#2563EB' : '#CBD5E1', position: 'relative', transition: 'all 0.2s' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: existing.actif ? 23 : 3, transition: 'all 0.2s' }} />
                  </button>
                ) : (
                  <button onClick={() => activerSysteme(t.value, t.label)} style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>Activer</button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* SECTION 2 : Modes personnalisés */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Modes personnalisés</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input style={{ ...inp, flex: 1 }} value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Ex : Espèces, Virement, Bon CAF..."
            onKeyDown={e => e.key === 'Enter' && ajouterPersonnalise()} />
          <button onClick={ajouterPersonnalise} disabled={saving || !newLabel.trim()}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Ajouter
          </button>
        </div>
        {customsModes.length === 0 && (
          <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', padding: '8px 0' }}>Aucun mode personnalisé. Ajoutez par exemple "Espèces" ou "Virement".</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {customsModes.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', opacity: m.actif ? 1 : 0.5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.actif ? '#10B981' : '#CBD5E1' }} />
              <span style={{ flex: 1, fontSize: 13, color: '#1E293B' }}>{m.label}</span>
              <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace', background: '#F8FAFC', borderRadius: 4, padding: '2px 6px' }}>{m.type}</span>
              <button onClick={() => renommer(m)} style={{ fontSize: 11, color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>✏</button>
              <button onClick={() => toggle(m.id, m.actif)} style={{ fontSize: 11, color: m.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                {m.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button onClick={() => supprimer(m)} style={{ fontSize: 13, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
