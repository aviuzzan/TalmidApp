'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { uploadAttachments, fileIcon, formatSize, Attachment } from '@/lib/messages-upload'

export default function EcoleThreadPage() {
  const params = useParams()
  const router = useRouter()
  const ecole = useEcole()
  const threadId = params.id as string

  const [profile, setProfile] = useState<any>(null)
  const [thread, setThread] = useState<any>(null)
  const [services, setServices] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState<File[]>([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { load() }, [threadId])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: p } = await s.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const [{ data: t }, { data: msgs }, { data: sv }] = await Promise.all([
      s.from('message_threads').select('*, services(nom), familles(nom, numero, parent1_prenom, parent1_nom, parent1_email, parent1_telephone)').eq('id', threadId).single(),
      s.from('messages').select('*, profiles:auteur_profile_id(prenom, nom, role)').eq('thread_id', threadId).order('created_at'),
      s.from('services').select('*').eq('actif', true).order('ordre'),
    ])
    setThread(t); setMessages(msgs ?? []); setServices(sv ?? [])
    if (p) {
      await s.from('thread_participants').upsert({ thread_id: threadId, profile_id: p.id, last_read_at: new Date().toISOString() }, { onConflict: 'thread_id,profile_id' })
    }
    setLoading(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 200)
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault(); setError(''); if (!reply.trim()) return
    setSending(true)
    const s = createClient()
    let attachments: Attachment[] = []
    if (files.length > 0) {
      const { attachments: uploaded, errors: upErrs } = await uploadAttachments(s, threadId, files)
      if (upErrs.length > 0) { setError(upErrs.join(' / ')); setSending(false); return }
      attachments = uploaded
    }
    const { error: errM } = await s.from('messages').insert({
      thread_id: threadId, auteur_profile_id: profile.id, contenu: reply.trim(), fichiers_urls: attachments,
    })
    if (errM) { setError(errM.message); setSending(false); return }
    setReply(''); setFiles([])
    try {
      await fetch('/api/notify-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, type: 'reponse' }),
      })
    } catch {}
    await load(); setSending(false)
  }

  async function changeStatut(nouveau: 'ouvert' | 'resolu' | 'archive') {
    const s = createClient()
    const { error: err } = await s.from('message_threads').update({ statut: nouveau }).eq('id', threadId)
    if (err) { alert('Erreur : ' + err.message); return }
    await load()
  }

  async function transfererService(newServiceId: string) {
    if (!newServiceId) return
    const s = createClient()
    const { error: err } = await s.from('message_threads').update({ service_id: newServiceId }).eq('id', threadId)
    if (err) { alert('Erreur : ' + err.message); return }
    await load()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!thread) return <div style={{ padding: 60, textAlign: 'center', color: '#DC2626' }}>Conversation introuvable</div>

  const statutColor = thread.statut === 'ouvert' ? '#2563EB' : thread.statut === 'resolu' ? '#059669' : '#94A3B8'
  const statutLabel = thread.statut === 'ouvert' ? 'Ouvert' : thread.statut === 'resolu' ? 'Résolu' : 'Archivé'
  const familleNom = thread.familles ? `${thread.familles.parent1_prenom ?? ''} ${thread.familles.parent1_nom ?? ''}`.trim() || thread.familles.nom : 'Conversation interne'

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <a href={`/${ecole.slug}/messages`} style={{ fontSize: 13, color: '#64748B', textDecoration: 'none' }}>← Inbox</a>
      </div>

      <div className="card" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: '#1E293B' }}>{thread.sujet}</h1>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                <strong>{familleNom}</strong>
                {thread.familles && <> · Famille n° {thread.familles.numero}</>}
                {thread.familles?.parent1_email && <> · <a href={`mailto:${thread.familles.parent1_email}`} style={{ color: '#2563EB' }}>{thread.familles.parent1_email}</a></>}
                {thread.familles?.parent1_telephone && <> · {thread.familles.parent1_telephone}</>}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Service : <strong>{thread.services?.nom || '—'}</strong></div>
            </div>
            <span style={{ background: statutColor, color: '#fff', fontSize: 10, padding: '4px 9px', borderRadius: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{statutLabel}</span>
          </div>

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
            {thread.statut === 'ouvert' && (
              <>
                <button onClick={() => changeStatut('resolu')} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Marquer résolu</button>
                <button onClick={() => changeStatut('archive')} style={{ background: '#94A3B8', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🗄 Archiver</button>
              </>
            )}
            {thread.statut !== 'ouvert' && (
              <button onClick={() => changeStatut('ouvert')} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>↻ Rouvrir</button>
            )}
            <select value={thread.service_id || ''} onChange={e => transfererService(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 12, background: '#fff', marginLeft: 'auto' }}>
              <option value="" disabled>Transférer à…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: '18px 22px', maxHeight: 520, overflowY: 'auto', background: '#FAFBFC' }}>
          {messages.length === 0 && <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 20 }}>Aucun message</div>}
          {messages.map(m => {
            const isMe = m.auteur_profile_id === profile?.id
            const auteurNom = m.profiles ? `${m.profiles.prenom ?? ''} ${m.profiles.nom ?? ''}`.trim() || (m.profiles.role === 'parent' ? 'Famille' : 'École') : 'Inconnu'
            const isParent = m.profiles?.role === 'parent'
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
                <div style={{ maxWidth: '75%', background: isMe ? '#2563EB' : isParent ? '#FEF3C7' : '#fff', color: isMe ? '#fff' : '#1E293B', padding: '10px 14px', borderRadius: 12, border: isMe ? 'none' : '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4, fontWeight: 600 }}>
                    {isMe ? 'Vous' : auteurNom}{isParent && !isMe && ' (famille)'} · {new Date(m.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.contenu}</div>
                  {Array.isArray(m.fichiers_urls) && m.fichiers_urls.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {m.fichiers_urls.map((f: any, i: number) => (
                        <a key={i} href={f.url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: isMe ? 'rgba(255,255,255,0.15)' : '#F1F5F9', borderRadius: 6, fontSize: 12, color: isMe ? '#fff' : '#1E293B', textDecoration: 'none' }}>
                          <span>{fileIcon(f.type)}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <span style={{ opacity: 0.7 }}>{formatSize(f.size)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {thread.statut !== 'archive' ? (
          <form onSubmit={sendReply} style={{ padding: '16px 22px', borderTop: '1px solid #F1F5F9', background: '#fff' }}>
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} placeholder="Votre réponse…"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                📎 Joindre des fichiers
                <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))} style={{ display: 'none' }} />
              </label>
              {files.length > 0 && files.map((f, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, color: '#1E40AF' }}>
                  {fileIcon(f.type)} {f.name} ({formatSize(f.size)})
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1E40AF', padding: 0, fontSize: 13 }}>×</button>
                </span>
              ))}
            </div>
            {error && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 8, borderRadius: 6, fontSize: 12, marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="submit" disabled={sending || !reply.trim()} style={{ background: sending || !reply.trim() ? '#94A3B8' : '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: sending || !reply.trim() ? 'not-allowed' : 'pointer' }}>
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13, background: '#F8FAFC' }}>
            Cette conversation a été archivée. Cliquez sur Rouvrir pour répondre à nouveau.
          </div>
        )}
      </div>
    </div>
  )
}
