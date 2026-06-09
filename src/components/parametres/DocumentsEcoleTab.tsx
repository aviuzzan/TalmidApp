'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

export default function DocumentsEcoleTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<any>({ titre: '', description: '', type_doc: 'circulaire' })
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await createClient()
      .from('documents_ecole_publics').select('*')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', annee)
      .order('ordre').order('created_at', { ascending: false })
    setDocs(data ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [ecoleId, annee])

  async function uploadAndCreate() {
    if (!pendingFile || !form.titre) { setErrMsg('Titre + fichier requis'); return }
    setErrMsg(null); setUploading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const fd = new FormData()
    fd.append('file', pendingFile)
    fd.append('familleId', 'doc-ecole-' + ecoleId)
    fd.append('label', 'Document école')
    fd.append('configId', annee)
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` }, body: fd })
    const json = await res.json()
    if (!json.success) { setErrMsg('Erreur upload : ' + (json.error || 'inconnue')); setUploading(false); return }
    const { error } = await s.from('documents_ecole_publics').insert({
      ecole_id: ecoleId, annee_scolaire: annee, titre: form.titre,
      description: form.description || null, fichier_url: json.url,
      nom_fichier: json.nom, taille_ko: json.taille_ko, type_doc: form.type_doc,
      created_by: session?.user.id,
    })
    setUploading(false)
    if (error) { setErrMsg('Erreur enregistrement : ' + error.message); return }
    setForm({ titre: '', description: '', type_doc: 'circulaire' })
    setPendingFile(null)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  async function toggleActif(id: string, actif: boolean) {
    await createClient().from('documents_ecole_publics').update({ actif: !actif }).eq('id', id); load()
  }
  async function supprimer(id: string) {
    const ok = await confirmDialog({ title: 'Supprimer ce document ?', danger: true })
    if (!ok) return
    const { error } = await createClient().from('documents_ecole_publics').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Document supprimé'); load()
  }

  const inp = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const TYPES: Record<string, { label: string; icon: string }> = {
    circulaire: { label: 'Circulaire', icon: '📢' },
    liste_affaires: { label: "Liste d'affaires", icon: '📝' },
    calendrier: { label: 'Calendrier', icon: '📅' },
    reglement: { label: 'Règlement', icon: '📜' },
    autre: { label: 'Autre', icon: '📄' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>📂 Documents partagés aux familles — {annee}</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Ces documents sont visibles dans l'espace famille › Année N+1 › Documents école. Idéal pour la circulaire de rentrée, la liste d'affaires scolaires, le calendrier annuel, etc.
        </p>
      </div>

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 12px' }}>Ajouter un document</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Titre *</label>
            <input style={inp} value={form.titre} onChange={e => setForm((p: any) => ({ ...p, titre: e.target.value }))} placeholder="Ex: Circulaire de rentrée 2026-2027" />
          </div>
          <div>
            <label style={lbl}>Description</label>
            <input style={inp} value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} placeholder="Description courte (optionnel)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={lbl}>Type</label>
              <select style={inp} value={form.type_doc} onChange={e => setForm((p: any) => ({ ...p, type_doc: e.target.value }))}>
                {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Fichier (PDF, image, max 10 Mo)</label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                onChange={e => setPendingFile(e.target.files?.[0] || null)}
                style={{ ...inp, padding: '7px 12px' }} />
            </div>
          </div>
          {errMsg && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#DC2626' }}>⚠️ {errMsg}</div>}
          <button onClick={uploadAndCreate} disabled={uploading || !pendingFile || !form.titre}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading || !pendingFile || !form.titre ? 0.5 : 1, alignSelf: 'flex-start', minHeight: 44 }}>
            {uploading ? 'Upload…' : '+ Ajouter le document'}
          </button>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 10px' }}>Documents existants ({docs.length})</h3>
        {loading ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Chargement...</div>
          : docs.length === 0 ? <div style={{ color: '#94A3B8', fontSize: 13, fontStyle: 'italic' }}>Aucun document pour cette année.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(d => {
                const t = TYPES[d.type_doc] || TYPES.autre
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, opacity: d.actif ? 1 : 0.55 }}>
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.titre}</div>
                      {d.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{d.description}</div>}
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                        {t.label} · {d.nom_fichier} {d.taille_ko && `(${d.taille_ko} Ko)`}
                      </div>
                    </div>
                    <a href={d.fichier_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: '5px 12px', textDecoration: 'none' }}>Voir</a>
                    <button onClick={() => toggleActif(d.id, d.actif)}
                      style={{ fontSize: 12, color: d.actif ? '#64748B' : '#10B981', background: '#F1F5F9', border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
                      {d.actif ? '👁️ Cacher' : '👁️ Activer'}
                    </button>
                    <button onClick={() => supprimer(d.id)}
                      style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>🗑️</button>
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}
