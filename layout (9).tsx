'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Tab = 'infos' | 'import' | 'acces'

const PLANS = ['starter', 'pro', 'enterprise']
const COULEURS = ['#2563EB', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#1D4ED8']

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 30)
}

export default function GererEcolePage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const ecoleId = params.id as string

  const [ecole, setEcole] = useState<any>(null)
  const [form, setForm] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('infos')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(searchParams.get('created') === '1' ? 'École créée avec succès ! 🎉' : '')
  const [error, setError] = useState('')
  const [stats, setStats] = useState({ familles: 0, eleves: 0 })

  // Import CSV
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvData, setCsvData] = useState<any[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')

  useEffect(() => {
    load()
  }, [ecoleId])

  async function load() {
    const s = createClient()
    const [{ data: e }, { count: f }, { count: el }] = await Promise.all([
      s.from('ecoles').select('*').eq('id', ecoleId).single(),
      s.from('familles').select('*', { count: 'exact', head: true }),
      s.from('enfants').select('*', { count: 'exact', head: true }),
    ])
    if (e) { setEcole(e); setForm({ ...e }) }
    setStats({ familles: f ?? 0, eleves: el ?? 0 })
  }

  function set(key: string, val: any) {
    setForm((p: any) => ({ ...p, [key]: val }))
  }

  async function sauvegarder() {
    setSaving(true); setError(''); setSuccess('')
    const s = createClient()

    // Vérifier slug si changé
    if (form.slug !== ecole.slug) {
      const { data: ex } = await s.from('ecoles').select('id').eq('slug', form.slug).neq('id', ecoleId).single()
      if (ex) { setError(`Le slug « ${form.slug} » est déjà utilisé.`); setSaving(false); return }
    }

    const { error: err } = await s.from('ecoles').update({
      nom: form.nom, slug: form.slug, couleur_primaire: form.couleur_primaire,
      email_contact: form.email_contact, telephone: form.telephone,
      adresse: form.adresse, ville: form.ville,
      plan: form.plan, actif: form.actif, notes_admin: form.notes_admin,
    }).eq('id', ecoleId)

    if (err) { setError(err.message) }
    else {
      setSuccess('Modifications enregistrées ✓')
      const { data: { session } } = await s.auth.getSession()
      if (session) await s.from('admin_logs').insert({ admin_id: session.user.id, ecole_id: ecoleId, action: 'ecole_modifiee', details: { slug: form.slug } })
      await load()
    }
    setSaving(false)
  }

  // Import CSV familles
  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n').map(l => l.split(/[,;]/))
      if (lines.length < 2) return
      const headers = lines[0].map(h => h.trim().replace(/"/g, ''))
      const rows = lines.slice(1).map(row =>
        Object.fromEntries(headers.map((h, i) => [h, (row[i] || '').trim().replace(/"/g, '')]))
      )
      setCsvHeaders(headers)
      setCsvData(rows.slice(0, 5)) // preview 5 lignes
    }
    reader.readAsText(file)
  }

  async function importerFamilles() {
    if (!fileRef.current?.files?.[0]) return
    setImporting(true); setImportResult('')
    const file = fileRef.current.files[0]
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n').map(l => l.split(/[,;]/))
      const headers = lines[0].map(h => h.trim().replace(/"/g, '').toLowerCase())
      const rows = lines.slice(1)
      const s = createClient()
      let ok = 0; let err = 0

      for (const row of rows) {
        const cols = Object.fromEntries(headers.map((h, i) => [h, (row[i] || '').trim().replace(/"/g, '')]))
        if (!cols.nom) { err++; continue }
        const { error: e } = await s.from('familles').insert({
          nom: cols.nom,
          email_parent1: cols.email || cols.email_parent1 || null,
          telephone_parent1: cols.telephone || cols.tel || null,
          statut_dossier: 'complet',
        })
        if (e) err++; else ok++
      }
      setImportResult(`✓ ${ok} famille(s) importée(s) · ${err} erreur(s)`)
      setImporting(false)
      await load()
    }
    reader.readAsText(file)
  }

  if (!ecole || !form) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      <div style={{ color: 'rgba(255,255,255,0.2)' }}>Chargement...</div>
    </div>
  )

  const inp = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '10px 14px', color: '#F1F5F9', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
  }
  const lbl = { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'infos', label: 'Informations', icon: '📝' },
    { id: 'import', label: 'Importer des données', icon: '📥' },
    { id: 'acces', label: 'Accès direct', icon: '🔗' },
  ]

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button onClick={() => router.push('/admin/dashboard')}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 14px', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
          ← Retour
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: `linear-gradient(135deg, ${ecole.couleur_primaire || '#2563EB'}, #60A5FA)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff',
          }}>{ecole.nom[0]?.toUpperCase()}</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>{ecole.nom}</h1>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
              <code style={{ fontSize: 11, color: '#64748B', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4 }}>/{ecole.slug}</code>
              <span style={{ fontSize: 11, color: ecole.actif ? '#34D399' : '#F87171' }}>{ecole.actif ? '● Active' : '● Suspendue'}</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '8px 16px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#60A5FA' }}>{stats.familles}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>familles</div>
            </div>
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '8px 16px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#34D399' }}>{stats.eleves}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>élèves</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.id ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: tab === t.id ? '#A5B4FC' : 'rgba(255,255,255,0.35)',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400, transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28 }}>

        {/* ── TAB INFOS ── */}
        {tab === 'infos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Nom de l'école</label>
                <input style={inp} value={form.nom} onChange={e => set('nom', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Slug URL</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
                  <span style={{ padding: '10px 10px', color: 'rgba(255,255,255,0.2)', fontSize: 12, borderRight: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>fr/</span>
                  <input style={{ ...inp, border: 'none', background: 'transparent', flex: 1, borderRadius: 0 }} value={form.slug} onChange={e => set('slug', slugify(e.target.value))} />
                </div>
              </div>
            </div>

            <div>
              <label style={lbl}>Couleur principale</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {COULEURS.map(c => (
                  <button key={c} onClick={() => set('couleur_primaire', c)} style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                    outline: form.couleur_primaire === c ? `3px solid ${c}` : 'none', outlineOffset: 2,
                    transform: form.couleur_primaire === c ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.15s',
                  }} />
                ))}
                <input type="color" value={form.couleur_primaire} onChange={e => set('couleur_primaire', e.target.value)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Email de contact</label>
                <input style={inp} type="email" value={form.email_contact || ''} onChange={e => set('email_contact', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Téléphone</label>
                <input style={inp} value={form.telephone || ''} onChange={e => set('telephone', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Adresse</label>
                <input style={inp} value={form.adresse || ''} onChange={e => set('adresse', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Ville</label>
                <input style={inp} value={form.ville || ''} onChange={e => set('ville', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Plan</label>
                <select style={inp} value={form.plan} onChange={e => set('plan', e.target.value)}>
                  {PLANS.map(p => <option key={p} value={p} style={{ background: '#0D1526' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 24 }}>
                <label style={{ ...lbl, margin: 0 }}>ÉCOLE ACTIVE</label>
                <button onClick={() => set('actif', !form.actif)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                    background: form.actif ? '#6366F1' : 'rgba(255,255,255,0.1)', position: 'relative',
                  }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, transition: 'all 0.2s',
                    left: form.actif ? 23 : 3,
                  }} />
                </button>
              </div>
            </div>

            <div>
              <label style={lbl}>Notes internes</label>
              <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={form.notes_admin || ''}
                onChange={e => set('notes_admin', e.target.value)} />
            </div>

            {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 14px', color: '#F87171', fontSize: 13 }}>{error}</div>}
            {success && <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, padding: '10px 14px', color: '#34D399', fontSize: 13 }}>{success}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={sauvegarder} disabled={saving}
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}

        {/* ── TAB IMPORT ── */}
        {tab === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h3 style={{ color: '#F1F5F9', fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>Import CSV — Familles</h3>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: '0 0 16px' }}>
                Colonnes reconnues : <code style={{ color: '#A5B4FC' }}>nom</code>, <code style={{ color: '#A5B4FC' }}>email</code>, <code style={{ color: '#A5B4FC' }}>telephone</code>
                <br />Séparateur virgule ou point-virgule, encodage UTF-8.
              </p>

              {/* Zone upload */}
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed rgba(99,102,241,0.3)', borderRadius: 12,
                  padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
                  background: 'rgba(99,102,241,0.04)', transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.6)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.3)'}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <div style={{ color: '#A5B4FC', fontSize: 13, fontWeight: 600 }}>Choisir un fichier CSV</div>
                <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 4 }}>ou glisser-déposer ici</div>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCsvFile} />
              </div>

              {/* Prévisualisation */}
              {csvData.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                    Aperçu ({csvData.length} lignes sur {fileRef.current?.files?.[0] ? '...' : '?'})
                  </div>
                  <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>{csvHeaders.map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#818CF8', background: 'rgba(99,102,241,0.1)', fontWeight: 600 }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {csvData.map((row, i) => (
                          <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            {csvHeaders.map(h => <td key={h} style={{ padding: '7px 12px', color: 'rgba(255,255,255,0.5)' }}>{row[h]}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button onClick={importerFamilles} disabled={importing}
                      style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', border: 'none', borderRadius: 10, padding: '11px 24px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.7 : 1 }}>
                      {importing ? 'Import en cours...' : `📥 Importer toutes les familles`}
                    </button>
                  </div>
                </div>
              )}

              {importResult && (
                <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, padding: '12px 16px', color: '#34D399', fontSize: 13, marginTop: 8 }}>
                  {importResult}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB ACCES ── */}
        {tab === 'acces' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ color: '#F1F5F9', fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Accès direct à l'école</h3>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>
              Tu peux accéder directement à n'importe quelle page de cette école.
            </p>

            {[
              { label: 'Tableau de bord', path: 'dashboard', icon: '◈', desc: 'Vue générale de l\'école' },
              { label: 'Familles', path: 'familles', icon: '👨‍👩‍👧', desc: 'Gestion des familles et élèves' },
              { label: 'Finances', path: 'finances', icon: '💰', desc: 'Factures et règlements' },
              { label: 'Paramètres', path: 'parametres', icon: '⚙️', desc: 'Classes, modes de paiement...' },
            ].map(item => (
              <div key={item.path}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>/{ecole.slug}/{item.path}</div>
                  </div>
                </div>
                <button onClick={() => router.push(`/${ecole.slug}/${item.path}`)}
                  style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8, padding: '7px 16px', color: '#60A5FA', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Accéder →
                </button>
              </div>
            ))}

            <div style={{ marginTop: 8, padding: '14px 18px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600, marginBottom: 4 }}>⚠️ Note</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                En accédant au dashboard de l'école, tu es identifié comme super_admin. Toutes tes actions sont loguées.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
