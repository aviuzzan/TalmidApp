'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Doc = {
  id: string
  type: string
  nom: string
  storage_path: string
  taille: number | null
  mime_type: string | null
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  justificatif: 'Justificatif',
  facture: 'Facture',
  attestation: 'Attestation',
  livret: 'Livret scolaire',
  photo: 'Photo / certificat',
  autre: 'Autre',
}

export default function PortailDocumentsPage() {
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<Doc[]>([])
  const [filter, setFilter] = useState<string>('tous')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setLoading(false); return }
    const { data: profile } = await s.from('profiles').select('famille_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    const { data: list } = await s.from('documents_famille')
      .select('id, type, nom, storage_path, taille, mime_type, created_at')
      .eq('famille_id', profile.famille_id)
      .eq('visible_famille', true)
      .order('created_at', { ascending: false })
    setDocs(list || [])
    setLoading(false)
  }

  async function download(doc: Doc) {
    const s = createClient()
    const { data } = await s.storage.from('documents-famille').createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  function fmtSize(b: number | null) {
    if (!b) return '—'
    if (b < 1024) return b + ' o'
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' Ko'
    return (b / (1024 * 1024)).toFixed(1) + ' Mo'
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  const docsByType: Record<string, Doc[]> = {}
  for (const d of docs) {
    if (!docsByType[d.type]) docsByType[d.type] = []
    docsByType[d.type].push(d)
  }
  const types = Object.keys(docsByType).sort()
  const visibleDocs = filter === 'tous' ? docs : docs.filter(d => d.type === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <a href="/portail/demarches" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: 13, textDecoration: 'none', width: 'fit-content' }}>← Démarches</a>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Mes documents</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
          Documents partagés par l&apos;école — {docs.length} document{docs.length > 1 ? 's' : ''}
        </p>
      </div>

      {docs.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          Aucun document partagé pour le moment. L&apos;école pourra y ajouter vos justificatifs, factures, attestations...
        </div>
      ) : (
        <>
          {types.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setFilter('tous')}
                style={{
                  padding: '6px 12px', borderRadius: 16, border: '1px solid',
                  borderColor: filter === 'tous' ? '#2563EB' : '#E2E8F0',
                  background: filter === 'tous' ? '#EFF6FF' : '#fff',
                  color: filter === 'tous' ? '#1E40AF' : '#64748B',
                  fontSize: 12, fontWeight: filter === 'tous' ? 600 : 400, cursor: 'pointer',
                }}>Tous ({docs.length})</button>
              {types.map(t => (
                <button key={t} onClick={() => setFilter(t)}
                  style={{
                    padding: '6px 12px', borderRadius: 16, border: '1px solid',
                    borderColor: filter === t ? '#2563EB' : '#E2E8F0',
                    background: filter === t ? '#EFF6FF' : '#fff',
                    color: filter === t ? '#1E40AF' : '#64748B',
                    fontSize: 12, fontWeight: filter === t ? 600 : 400, cursor: 'pointer',
                  }}>{TYPE_LABEL[t] || t} ({docsByType[t].length})</button>
              ))}
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            {visibleDocs.map((d, i) => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderBottom: i < visibleDocs.length - 1 ? '1px solid #F1F5F9' : 'none',
                gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 3 }}>{d.nom}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>
                    {TYPE_LABEL[d.type] || d.type} · {fmtSize(d.taille)} · ajouté le {new Date(d.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <button onClick={() => download(d)}
                  style={{
                    background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7,
                    padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Télécharger</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, fontSize: 12, color: '#475569' }}>
        Pour ajouter un document à votre dossier (justificatif, attestation, RIB...), contactez directement le secrétariat de l&apos;école.
      </div>
    </div>
  )
}
