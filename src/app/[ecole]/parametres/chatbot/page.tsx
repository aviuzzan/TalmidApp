'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function ChatbotConfigPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [active, setActive] = useState(false)
  const [ton, setTon] = useState('professionnel_chaleureux')
  const [limite, setLimite] = useState(30)
  const [faq, setFaq] = useState('')

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id])

  async function load() {
    const s = createClient()
    const [{ data: cfg }, { data: f }] = await Promise.all([
      s.from('chatbot_config_ecole').select('*').eq('ecole_id', ecole.id).maybeSingle(),
      s.from('chatbot_faq').select('contenu_markdown').eq('ecole_id', ecole.id).maybeSingle(),
    ])
    if (cfg) {
      setActive(cfg.active === true)
      setTon(cfg.ton || 'professionnel_chaleureux')
      setLimite(cfg.limite_parent_par_jour || 30)
    }
    if (f) setFaq(f.contenu_markdown || '')
    setLoading(false)
  }

  async function sauvegarder() {
    setSaving(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const { error: e1 } = await s.from('chatbot_config_ecole').upsert({
      ecole_id: ecole.id, active, ton, limite_parent_par_jour: limite, updated_at: new Date().toISOString(),
    })
    const { error: e2 } = await s.from('chatbot_faq').upsert({
      ecole_id: ecole.id, contenu_markdown: faq,
      updated_by: session?.user.id, updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (e1 || e2) setMsg('❌ ' + (e1?.message || e2?.message))
    else setMsg('✓ Configuration enregistrée')
    setTimeout(() => setMsg(''), 4000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', background: '#fff' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880, margin: '0 auto', padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button onClick={() => router.push(`/${ecole.slug}/parametres`)}
            style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#475569', cursor: 'pointer', marginBottom: 8 }}>← Paramètres</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>👨‍🎓 Levy — Assistant virtuel</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            Levy aide vos parents et admins en repondant a leurs questions. Configurez l&apos;activation, le ton et la FAQ qu&apos;il utilisera.
          </p>
        </div>
        <button onClick={sauvegarder} disabled={saving}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>{msg}</div>
      )}

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Activation</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <div onClick={() => setActive(!active)}
            style={{ width: 44, height: 26, borderRadius: 13, background: active ? '#10B981' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 3, left: active ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{active ? 'Levy activé' : 'Levy désactivé'}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Quand activé, le bouton "Demandez à Levy" apparaît sur le portail parent et la console admin.</div>
          </div>
        </label>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Réglages</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={lbl}>Ton de Levy</label>
            <select value={ton} onChange={e => setTon(e.target.value)} style={inp}>
              <option value="professionnel_chaleureux">Professionnel & chaleureux</option>
              <option value="formel">Formel</option>
              <option value="familier">Familier</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Limite questions / jour (parent)</label>
            <input type="number" min="5" max="200" value={limite} onChange={e => setLimite(parseInt(e.target.value) || 30)} style={inp} />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Les admins n'ont pas de limite.</div>
          </div>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>FAQ que Levy doit connaître</h2>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 14px' }}>
          Levy connait déjà vos données (familles, factures, élèves...) et sait expliquer comment utiliser TalmidApp.
          Ajoutez ici les infos spécifiques à votre école que Levy ne peut pas deviner : calendrier scolaire, horaires d&apos;ouverture, contacts secrétariat, règles cantine/transport, dates des fêtes, etc.
          Format Markdown libre — sections avec ##, listes avec -.
        </p>
        <textarea value={faq} onChange={e => setFaq(e.target.value)}
          rows={20}
          placeholder={`## Calendrier 2026-2027
- Rentrée : ...
- Vacances de Noël : ...

## Horaires
- Lundi-Jeudi : ...

## Contacts
- Secrétariat : ...
- Comptabilité : ...

## Cantine
- Tarif : ...
- Inscription : ...`}
          style={{ ...inp, fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.55, resize: 'vertical' }}
        />
      </div>
    </div>
  )
}
