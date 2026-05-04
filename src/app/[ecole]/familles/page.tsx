'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const SITUATIONS = [
  { value: 'marie', label: 'Marié(e)' }, { value: 'celibataire', label: 'Célibataire' },
  { value: 'divorce', label: 'Divorcé(e)' }, { value: 'veuf', label: 'Veuf/Veuve' },
  { value: 'separe', label: 'Séparé(e)' }, { value: 'non_connu', label: 'Non connue' },
]

function Badge({ status }: { status: string }) {
  const map: any = {
    complet: ['#059669', '#ECFDF5', 'Complet'],
    en_attente: ['#2563EB', '#EFF6FF', 'En attente'],
    incomplet: ['#D97706', '#FFFBEB', 'Incomplet'],
  }
  const [c, bg, label] = map[status] ?? ['#64748B', '#F1F5F9', status]
  return <span className="badge" style={{ background: bg, color: c }}>{label}</span>
}

export default function FamillesPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [familles, setFamilles] = useState<any[]>([])
  const [modes, setModes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  const empty = {
    nom: '', statut_dossier: 'incomplet', situation_maritale: '',
    parent1_prenom: '', parent1_nom: '', parent1_email: '', parent1_telephone: '', parent1_emploi: '',
    parent1_numero_rue: '', parent1_code_postal: '', parent1_ville: '',
    parent2_prenom: '', parent2_nom: '', parent2_email: '', parent2_telephone: '', parent2_emploi: '',
    parent2_numero_rue: '', parent2_code_postal: '', parent2_ville: '',
    mode_paiement: '', part_pere: 100, part_mere: 0,
  }
  const [form, setForm] = useState(empty)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: fam }, { data: mds }] = await Promise.all([
      supabase.from('familles').select('*').order('date_creation', { ascending: false }),
      supabase.from('modes_paiement').select('*').order('libelle'),
    ])
    setFamilles(fam ?? []); setModes(mds ?? []); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = familles.filter(f =>
    f.nom?.toLowerCase().includes(search.toLowerCase()) ||
    f.numero?.includes(search) ||
    `${f.parent1_prenom} ${f.parent1_nom}`.toLowerCase().includes(search.toLowerCase())
  )

  function set(k: string, v: any) {
    setForm(p => {
      const u = { ...p, [k]: v }
      if (k === 'part_pere') u.part_mere = 100 - Number(v)
      if (k === 'part_mere') u.part_pere = 100 - Number(v)
      return u
    })
  }

  function openEdit(f: any) {
    setForm({
      nom: f.nom ?? '', statut_dossier: f.statut_dossier ?? 'incomplet',
      situation_maritale: f.situation_maritale ?? '',
      parent1_prenom: f.parent1_prenom ?? '', parent1_nom: f.parent1_nom ?? '',
      parent1_email: f.parent1_email ?? '', parent1_telephone: f.parent1_telephone ?? '',
      parent1_emploi: f.parent1_emploi ?? '', parent1_numero_rue: f.parent1_numero_rue ?? '',
      parent1_code_postal: f.parent1_code_postal ?? '', parent1_ville: f.parent1_ville ?? '',
      parent2_prenom: f.parent2_prenom ?? '', parent2_nom: f.parent2_nom ?? '',
      parent2_email: f.parent2_email ?? '', parent2_telephone: f.parent2_telephone ?? '',
      parent2_emploi: f.parent2_emploi ?? '', parent2_numero_rue: f.parent2_numero_rue ?? '',
      parent2_code_postal: f.parent2_code_postal ?? '', parent2_ville: f.parent2_ville ?? '',
      mode_paiement: f.mode_paiement ?? '', part_pere: f.part_pere ?? 100, part_mere: f.part_mere ?? 0,
    })
    setEditId(f.id); setShowForm(true); setError('')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      nom: form.nom, statut_dossier: form.statut_dossier,
      situation_maritale: form.situation_maritale || null,
      parent1_prenom: form.parent1_prenom, parent1_nom: form.parent1_nom,
      parent1_email: form.parent1_email, parent1_telephone: form.parent1_telephone,
      parent1_emploi: form.parent1_emploi, parent1_numero_rue: form.parent1_numero_rue,
      parent1_code_postal: form.parent1_code_postal, parent1_ville: form.parent1_ville,
      parent2_prenom: form.parent2_prenom || null, parent2_nom: form.parent2_nom || null,
      parent2_email: form.parent2_email || null, parent2_telephone: form.parent2_telephone || null,
      parent2_emploi: form.parent2_emploi || null,
      parent2_numero_rue: form.parent2_numero_rue || null,
      parent2_code_postal: form.parent2_code_postal || null, parent2_ville: form.parent2_ville || null,
      mode_paiement: form.mode_paiement || null, part_pere: form.part_pere, part_mere: form.part_mere,
    }
    const supabase = createClient()
    const { error: err } = editId
      ? await supabase.from('familles').update(payload).eq('id', editId)
      : await supabase.from('familles').insert(payload)
    if (err) { setError(`Erreur : ${err.message}`); setSaving(false); return }
    setShowForm(false); setEditId(null); setForm(empty); load(); setSaving(false)
  }

  async function del(f: any) {
    await createClient().from('familles').delete().eq('id', f.id)
    setDeleteTarget(null); load()
  }

  const inp = { width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none' }
  const sec = (t: string) => (
    <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '2px solid #EFF6FF', paddingBottom: 8, marginBottom: 14 }}>{t}</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Familles</h1>
          <p style={{ color: '#64748B', fontSize: 13 }}>{familles.length} famille{familles.length > 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(empty); setEditId(null); setShowForm(true); setError('') }}>
          + Nouvelle famille
        </button>
      </div>

      <div className="card" style={{ padding: '10px 16px' }}>
        <input style={{ ...inp, border: 'none', background: 'transparent', width: '100%' }}
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Rechercher par nom, numéro ou parent..." />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#F8FAFC' }}>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['N°', 'Famille', 'Parent 1', 'Téléphone', 'Statut', 'Élèves', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#CBD5E1' }}>Aucune famille trouvée</td></tr>
            ) : filtered.map((f, i) => (
              <tr key={f.id}
                style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '13px 16px', fontFamily: 'monospace', fontSize: 12, color: '#94A3B8' }}>{f.numero}</td>
                <td style={{ padding: '13px 16px', fontWeight: 600, color: '#1E293B' }}>{f.nom}</td>
                <td style={{ padding: '13px 16px', color: '#475569', fontSize: 13 }}>{f.parent1_prenom} {f.parent1_nom}</td>
                <td style={{ padding: '13px 16px', color: '#475569', fontSize: 13 }}>{f.parent1_telephone}</td>
                <td style={{ padding: '13px 16px' }}><Badge status={f.statut_dossier} /></td>
                <td style={{ padding: '13px 16px' }}>
                  <button onClick={() => router.push(`/${ecole.slug}/familles/${f.id}`)}
                    style={{ background: '#EFF6FF', color: '#2563EB', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Voir →
                  </button>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => openEdit(f)}>✏️ Modifier</button>
                    <button className="btn-danger" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setDeleteTarget(f)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal ajout/modif */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 740, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '24px 28px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{editId ? '✏️ Modifier la famille' : '➕ Nouvelle famille'}</h2>
              <button onClick={() => { setShowForm(false); setEditId(null) }} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
            </div>

            <form onSubmit={save} style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>
              {sec('Informations générales')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / 2' }}>
                  <label className="label required">Nom de famille</label>
                  <input style={inp} value={form.nom} onChange={e => set('nom', e.target.value)} required placeholder="Ex: Cohen" />
                </div>
                <div>
                  <label className="label required">Situation maritale</label>
                  <select style={inp} value={form.situation_maritale} onChange={e => set('situation_maritale', e.target.value)} required>
                    <option value="">-- Sélectionner --</option>
                    {SITUATIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label required">Statut dossier</label>
                  <select style={inp} value={form.statut_dossier} onChange={e => set('statut_dossier', e.target.value)}>
                    <option value="incomplet">Incomplet</option>
                    <option value="en_attente">En attente</option>
                    <option value="complet">Complet</option>
                  </select>
                </div>
              </div>

              {sec('Parent 1 — Tous les champs obligatoires')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label required">Prénom</label><input style={inp} value={form.parent1_prenom} onChange={e => set('parent1_prenom', e.target.value)} required /></div>
                <div><label className="label required">Nom</label><input style={inp} value={form.parent1_nom} onChange={e => set('parent1_nom', e.target.value)} required /></div>
                <div><label className="label required">Email</label><input style={inp} type="email" value={form.parent1_email} onChange={e => set('parent1_email', e.target.value)} required /></div>
                <div><label className="label required">Téléphone</label><input style={inp} value={form.parent1_telephone} onChange={e => set('parent1_telephone', e.target.value)} required /></div>
                <div style={{ gridColumn: '1 / -1' }}><label className="label required">Emploi / Profession</label><input style={inp} value={form.parent1_emploi} onChange={e => set('parent1_emploi', e.target.value)} required /></div>
                <div style={{ gridColumn: '1 / -1' }}><label className="label required">Numéro et rue</label><input style={inp} value={form.parent1_numero_rue} onChange={e => set('parent1_numero_rue', e.target.value)} required /></div>
                <div><label className="label required">Code postal</label><input style={inp} value={form.parent1_code_postal} onChange={e => set('parent1_code_postal', e.target.value)} required /></div>
                <div><label className="label required">Ville</label><input style={inp} value={form.parent1_ville} onChange={e => set('parent1_ville', e.target.value)} required /></div>
              </div>

              {sec('Parent 2 — Adresse optionnelle')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="label required">Prénom</label><input style={inp} value={form.parent2_prenom} onChange={e => set('parent2_prenom', e.target.value)} required /></div>
                <div><label className="label required">Nom</label><input style={inp} value={form.parent2_nom} onChange={e => set('parent2_nom', e.target.value)} required /></div>
                <div><label className="label required">Email</label><input style={inp} type="email" value={form.parent2_email} onChange={e => set('parent2_email', e.target.value)} required /></div>
                <div><label className="label required">Téléphone</label><input style={inp} value={form.parent2_telephone} onChange={e => set('parent2_telephone', e.target.value)} required /></div>
                <div style={{ gridColumn: '1 / -1' }}><label className="label required">Emploi / Profession</label><input style={inp} value={form.parent2_emploi} onChange={e => set('parent2_emploi', e.target.value)} required /></div>
                <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#F0F9FF', borderRadius: 8, fontSize: 12, color: '#0369A1' }}>
                  ℹ️ Adresse uniquement si différente du parent 1 (parents séparés/divorcés)
                </div>
                <div style={{ gridColumn: '1 / -1' }}><label className="label">Numéro et rue</label><input style={inp} value={form.parent2_numero_rue} onChange={e => set('parent2_numero_rue', e.target.value)} /></div>
                <div><label className="label">Code postal</label><input style={inp} value={form.parent2_code_postal} onChange={e => set('parent2_code_postal', e.target.value)} /></div>
                <div><label className="label">Ville</label><input style={inp} value={form.parent2_ville} onChange={e => set('parent2_ville', e.target.value)} /></div>
              </div>

              {sec('Informations financières')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="label">Mode de paiement</label>
                  <select style={inp} value={form.mode_paiement} onChange={e => set('mode_paiement', e.target.value)}>
                    <option value="">-- Sélectionner --</option>
                    {modes.map((m: any) => <option key={m.id} value={m.code}>{m.libelle}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Part père (%)</label>
                  <input style={inp} type="number" min={0} max={100} value={form.part_pere} onChange={e => set('part_pere', Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Part mère (%)</label>
                  <input style={inp} type="number" min={0} max={100} value={form.part_mere} onChange={e => set('part_mere', Number(e.target.value))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ height: 8, borderRadius: 4, background: '#E2E8F0', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${form.part_pere}%`, background: 'linear-gradient(90deg, #2563EB, #60A5FA)', borderRadius: 4, transition: 'width 0.2s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B', marginTop: 4 }}>
                    <span>Père : {form.part_pere}%</span><span>Mère : {form.part_mere}%</span>
                  </div>
                </div>
              </div>

              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : editId ? '✓ Mettre à jour' : '✓ Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 440, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Supprimer la famille</h3>
            <p style={{ color: '#475569', fontSize: 13, marginBottom: 6 }}>
              Êtes-vous sûr de vouloir supprimer la famille <strong>{deleteTarget.nom}</strong> ({deleteTarget.numero}) ?
            </p>
            <p style={{ color: '#DC2626', fontSize: 12, marginBottom: 20 }}>
              ⚠️ Cette action est irréversible. Tous les enfants liés seront également supprimés.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Annuler</button>
              <button className="btn-danger" onClick={() => del(deleteTarget)}>Oui, supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
