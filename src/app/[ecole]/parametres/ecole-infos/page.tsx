'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Page d'édition des informations administratives de l'école :
 * coordonnées, SIREN (pour DSN), code UAI/RNE + académie (pour LSU et connecteurs EN).
 */
export default function EcoleInfosPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({
    nom: '', email_contact: '', telephone: '',
    adresse: '', code_postal: '', ville: '',
    siren: '', code_uai: '', code_rne: '', academie: '', sous_contrat: false,
  })

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const { data } = await s.from('ecoles').select('nom, email_contact, telephone, adresse, code_postal, ville, siren, code_uai, code_rne, academie, sous_contrat').eq('id', ecole.id).single()
    if (data) {
      setForm({
        nom: data.nom || '',
        email_contact: data.email_contact || '',
        telephone: data.telephone || '',
        adresse: data.adresse || '',
        code_postal: data.code_postal || '',
        ville: data.ville || '',
        siren: data.siren || '',
        code_uai: data.code_uai || '',
        code_rne: data.code_rne || '',
        academie: data.academie || '',
        sous_contrat: Boolean(data.sous_contrat),
      })
    }
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setMsg('')
    const s = createClient()
    const { error } = await s.from('ecoles').update({
      nom: form.nom,
      email_contact: form.email_contact || null,
      telephone: form.telephone || null,
      adresse: form.adresse || null,
      code_postal: form.code_postal || null,
      ville: form.ville || null,
      siren: form.siren || null,
      code_uai: form.code_uai || null,
      code_rne: form.code_rne || null,
      academie: form.academie || null,
      sous_contrat: form.sous_contrat,
    }).eq('id', ecole.id)
    setSaving(false)
    if (error) { setMsg('Erreur : ' + error.message); return }
    setMsg('✓ Informations enregistrées')
    setTimeout(() => setMsg(''), 4000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🏫 Informations de l&apos;école</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Coordonnées + identifiants administratifs (SIREN pour la DSN, code UAI/RNE pour le LSU et les connecteurs Éducation Nationale).
        </p>
      </div>

      {/* Coordonnées */}
      <div style={card}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>Coordonnées</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={lbl}>Nom de l&apos;école</label><input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><label style={lbl}>Email de contact</label><input type="email" value={form.email_contact} onChange={e => setForm({ ...form, email_contact: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>Téléphone</label><input value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} style={inp} /></div>
          </div>
          <div><label style={lbl}>Adresse</label><input value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} placeholder="12 rue de la Paix" style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
            <div><label style={lbl}>Code postal</label><input value={form.code_postal} onChange={e => setForm({ ...form, code_postal: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>Ville</label><input value={form.ville} onChange={e => setForm({ ...form, ville: e.target.value })} style={inp} /></div>
          </div>
        </div>
      </div>

      {/* Identifiants administratifs */}
      <div style={card}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>Identifiants administratifs</h2>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 14px' }}>
          Requis pour la paie (DSN), le Livret Scolaire Unique et les connecteurs ONDE / SIECLE.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>SIREN (9 chiffres)</label>
              <input value={form.siren} onChange={e => setForm({ ...form, siren: e.target.value })} placeholder="123456789" maxLength={9} style={inp} />
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Pour la déclaration DSN</div>
            </div>
            <div>
              <label style={lbl}>Code UAI (RNE établissement)</label>
              <input value={form.code_uai} onChange={e => setForm({ ...form, code_uai: e.target.value })} placeholder="0750123A" maxLength={8} style={inp} />
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Pour le LSU et SIECLE</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>Code RNE (si différent de l&apos;UAI)</label>
              <input value={form.code_rne} onChange={e => setForm({ ...form, code_rne: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={lbl}>Académie</label>
              <input value={form.academie} onChange={e => setForm({ ...form, academie: e.target.value })} placeholder="Paris, Créteil, Versailles..." style={inp} />
            </div>
          </div>
          <label style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input type="checkbox" checked={form.sous_contrat} onChange={e => setForm({ ...form, sous_contrat: e.target.checked })} />
            École sous contrat avec l&apos;État (active le LSU et les connecteurs Éducation Nationale)
          </label>
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B' }}>{msg}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement...' : '💾 Enregistrer'}
        </button>
      </div>
    </div>
  )
}
