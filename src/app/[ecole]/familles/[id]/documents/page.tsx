'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Doc = {
  id: string
  type: string
  nom: string
  storage_path: string
  taille: number | null
  mime_type: string | null
  visible_famille: boolean
  created_at: string
}

const TYPES = [
  { v: 'justificatif', l: 'Justificatif (CAF, impots, RIB...)' },
  { v: 'facture', l: 'Facture' },
  { v: 'attestation', l: 'Attestation' },
  { v: 'livret', l: 'Livret scolaire' },
  { v: 'photo', l: 'Photo / certificat medical' },
  { v: 'autre', l: 'Autre' },
]

export default function DocumentsFamillePage() {
  const params = useParams()
  const ecole = useEcole()
  const familleId = params.id as string

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docs, setDocs] = useState<Doc[]>([])
  const [familleNom, setFamilleNom] = useState('')
  const [msg, setMsg] = useState('')

  // form
  const [type, setType] = useState('autre')
  const [nom, setNom] = useState('')
  const [visibleFamille, setVisibleFamille] = useState(true)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => { if (familleId && ecole?.id) load() }, [familleId, ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    const { data: famille } = await s.from('familles').select('nom_famille').eq('id', familleId).single()
    if (famille) setFamilleNom(famille.nom_famille || '')

    const { data: list } = await s.from('documents_famille')
      .select('id, type, nom, storage_path, taille, mime_type, visible_famille, created_at')
      .eq('famille_id', familleId)
      .order('created_at', { ascending: false })
    setDocs(list || [])
    setLoading(false)
  }

  async function upload() {
    if (!file) { setMsg('Erreur : selectionnez un fichier'); return }
    if (!nom.trim()) { setMsg('Erreur : nom du document requis'); return }
    setUploading(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()

    const safeFile = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${ecole.id}/${familleId}/${Date.now()}_${safeFile}`

    const { error: upErr } = await s.storage.from('documents-famille').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (upErr) { setMsg('Erreur upload : ' + upErr.message); setUploading(false); return }

    const { error: insErr } = await s.from('documents_famille').insert({
      famille_id: familleId,
      ecole_id: ecole.id,
      type,
      nom: nom.trim(),
      storage_path: path,
      taille: file.size,
      mime_type: file.type || null,
      visible_famille: visibleFamille,
      uploaded_by: session?.user.id,
    })
    if (insErr) {
      await s.storage.from('documents-famille').remove([path])
      setMsg('Erreur enregistrement : ' + insErr.message)
      setUploading(false); return
    }

    setMsg('Document ajoute')
    setFile(null); setNom(''); setType('autre'); setVisibleFamille(true)
    const input = document.getElementById('file-input') as HTMLInputElement
    if (input) input.value = ''
    await load()
    setUploading(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function deleteDoc(doc: Doc) {
    if (!confirm(`Supprimer le document "${doc.nom}" ?`)) return
    const s = createClient()
    await s.storage.from('documents-famille').remove([doc.storage_path])
    await s.from('documents_famille').delete().eq('id', doc.id)
    await load()
  }

  async function download(doc: Doc) {
    const s = createClient()
    const { data } = await s.storage.from('documents-famille').createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function toggleVisible(doc: Doc) {
    const s = createClient()
    await s.from('documents_famille').update({ visible_famille: !doc.visible_famille }).eq('id', doc.id)
    await load()
  }

  function fmtSize(b: number | null) {
    if (!b) return '-'
    if (b < 1024) return b + ' o'
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' Ko'
    return (b / (1024 * 1024)).toFixed(1) + ' Mo'
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: '#1E293B', outline: 'none', background: '#fff', boxSizing: 'border-box' }
  const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 5 }
  const box: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, marginBottom: 14 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Documents famille</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>{familleNom}</p>
      </div>

      {msg && (
        <div style={{
          background: msg.startsWith('Erreur') ? '#FEF2F2' : '#ECFDF5',
          color: msg.startsWith('Erreur') ? '#991B1B' : '#065F46',
          padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
        }}>{msg}</div>
      )}

      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Ajouter un document</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={label}>Nom du document</label>
            <input style={inp} value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Avis d'imposition 2024" />
          </div>
          <div>
            <label style={label}>Type</label>
            <select style={inp} value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>Fichier (PDF, image, Word - max 10 Mo)</label>
            <input id="file-input" type="file" onChange={e => setFile(e.target.files?.[0] || null)}
              accept=".pdf,image/*,.doc,.docx"
              style={{ ...inp, padding: '6px 8px' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={visibleFamille} onChange={e => setVisibleFamille(e.target.checked)} />
              <span>Visible par la famille dans son espace portail</span>
            </label>
          </div>
        </div>
        <button onClick={upload} disabled={uploading || !file || !nom.trim()}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', opacity: (uploading || !file || !nom.trim()) ? 0.6 : 1 }}>
          {uploading ? 'Envoi...' : 'Ajouter le document'}
        </button>
      </div>

      <div style={box}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Documents enregistres ({docs.length})</div>
        {docs.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Aucun document pour cette famille.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Nom</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Type</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Taille</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Visible</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', color: '#1E293B', fontWeight: 500 }}>{d.nom}</td>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>{TYPES.find(t => t.v === d.type)?.l || d.type}</td>
                    <td style={{ padding: '10px 12px', color: '#64748B', textAlign: 'right' }}>{fmtSize(d.taille)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button onClick={() => toggleVisible(d)}
                        style={{
                          background: d.visible_famille ? '#DCFCE7' : '#F1F5F9',
                          color: d.visible_famille ? '#166534' : '#64748B',
                          border: 'none', borderRadius: 12, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}>{d.visible_famille ? 'Oui' : 'Non'}</button>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748B', fontSize: 12 }}>{new Date(d.created_at).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button onClick={() => download(d)} style={{ background: '#EFF6FF', color: '#1E40AF', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginRight: 4 }}>Telecharger</button>
                      <button onClick={() => deleteDoc(d)} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Suppr</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
