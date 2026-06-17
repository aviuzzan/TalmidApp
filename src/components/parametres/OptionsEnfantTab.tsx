'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Gestion des options coch ables sur la fiche p dagogique d un enfant
 * (Transport, Instruction religieuse, Garderie, etc.).
 * L admin peut ajouter, modifier, d sactiver, supprimer, r ordonner.
 *
 * Le code est l identifiant interne (slug) ; le label est ce que voit le parent.
 * Les codes "transport", "instruction_religieuse", "etude_garderie" sont les
 * options legacy : on garde ce comportement mais le label est modifiable.
 */
export default function OptionsEnfantTab({ ecoleId }: { ecoleId: string }) {
  const [options, setOptions] = useState<any[]>([])
  const [newOpt, setNewOpt] = useState({ label: '', code: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  useEffect(() => { load() }, [ecoleId])

  async function load() {
    setLoading(true)
    const { data } = await createClient()
      .from('options_enfant_config').select('*').eq('ecole_id', ecoleId).order('ordre')
    setOptions(data ?? [])
    setLoading(false)
  }

  function genererCode(label: string): string {
    return label.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
      .slice(0, 40)
  }

  async function ajouter() {
    if (!newOpt.label.trim()) return
    setSaving(true)
    const code = newOpt.code.trim() || genererCode(newOpt.label)
    await createClient().from('options_enfant_config').insert({
      ecole_id: ecoleId,
      code,
      label: newOpt.label.trim(),
      ordre: options.length,
    })
    setNewOpt({ label: '', code: '' })
    await load(); setSaving(false)
  }

  async function renommer(opt: any) {
    const v = prompt('Nouveau libell  :', opt.label)
    if (v === null || !v.trim()) return
    await createClient().from('options_enfant_config').update({ label: v.trim() }).eq('id', opt.id)
    await load()
  }

  async function toggle(opt: any) {
    await createClient().from('options_enfant_config').update({ actif: !opt.actif }).eq('id', opt.id)
    await load()
  }

  async function supprimer(opt: any) {
    if (!confirm(`Supprimer d finitivement l option "${opt.label}" ?\nLes coches d j  enregistr es sur les fiches enfants resteront mais ne seront plus affich es.`)) return
    await createClient().from('options_enfant_config').delete().eq('id', opt.id)
    await load()
  }

  async function deplacer(opt: any, dir: -1 | 1) {
    const sorted = options.slice().sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
    const idx = sorted.findIndex((o: any) => o.id === opt.id)
    const swap = sorted[idx + dir]
    if (!swap) return
    const s = createClient()
    await s.from('options_enfant_config').update({ ordre: swap.ordre }).eq('id', opt.id)
    await s.from('options_enfant_config').update({ ordre: opt.ordre }).eq('id', swap.id)
    await load()
  }

  if (loading) return <div style={{ padding: 20, color: '#94A3B8' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: '#64748B', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '9px 14px' }}>
        Ces options apparaissent en cases   cocher sur la fiche p dagogique de chaque enfant (c t  parent et admin). Vous pouvez en ajouter de nouvelles, renommer, d sactiver temporairement ou supprimer.
      </div>

      {/* Ajout */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>LIBELLÉ AFFICHÉ</div>
            <input style={{ ...inp, width: '100%' }} value={newOpt.label}
              onChange={e => setNewOpt(p => ({ ...p, label: e.target.value }))}
              placeholder="Ex : Cantine spéciale, Sortie sportive, Étude du soir..."
              onKeyDown={e => e.key === 'Enter' && ajouter()} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>CODE (auto si vide)</div>
            <input style={{ ...inp, width: '100%' }} value={newOpt.code}
              onChange={e => setNewOpt(p => ({ ...p, code: e.target.value.replace(/[^a-z0-9_]/g, '') }))}
              placeholder="auto-généré" />
          </div>
          <button onClick={ajouter} disabled={saving || !newOpt.label.trim()}
            style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Ajouter
          </button>
        </div>
      </div>

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.length === 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#92400E' }}>
            Aucune option configurée. Ajoutez-en une pour qu'elle apparaisse sur la fiche pédagogique.
          </div>
        )}
        {options.map(o => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', opacity: o.actif ? 1 : 0.5 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: o.actif ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: '#1E293B' }}>{o.label}</span>
            <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace', background: '#F8FAFC', borderRadius: 4, padding: '2px 6px' }}>{o.code}</span>
            <button onClick={() => deplacer(o, -1)} title="Monter" style={{ fontSize: 11, color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 7px', cursor: 'pointer' }}>↑</button>
            <button onClick={() => deplacer(o, 1)} title="Descendre" style={{ fontSize: 11, color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 7px', cursor: 'pointer' }}>↓</button>
            <button onClick={() => renommer(o)} title="Renommer" style={{ fontSize: 11, color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>✏</button>
            <button onClick={() => toggle(o)} style={{ fontSize: 11, color: o.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
              {o.actif ? 'Désactiver' : 'Activer'}
            </button>
            <button onClick={() => supprimer(o)} title="Supprimer" style={{ fontSize: 13, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
