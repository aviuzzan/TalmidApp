'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function PortailThreadPage() {
  const params = useParams()
  const router = useRouter()
  const threadId = params.id as string

  const [profile, setProfile] = useState<any>(null)
  const [thread, setThread] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { load() }, [threadId])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: p } = await s.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)
    const [{ data: t }, { data: msgs }] = await Promise.all([
      s.from('message_threads').select('*, services(nom)').eq('id', threadId).single(),
      s.from('messages').select('*, profiles:auteur_profile_id(prenom, nom, role)').eq('thread_id', threadId).order('created_at'),
    ])
    setThread(t); setMessages(msgs ?? [])
    // Marquer comme lu (upsert thread_participants)
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
    const { error: errM } = await s.from('messages').insert({
      thread_id: threadId, auteur_profile_id: profile.id, contenu: reply.trim(),
    })
    if (errM) { setError(errM.message); setSending(false); return }
    setReply('')
    // notif (best-effort)
    try {
      await fetch('/api/notify-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, type: 'reponse' }),
      })
    } catch {}
    await load(); setSending(false)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!thread) return <div style={{ padding: 60, textAlign: 'center', color: '#DC2626' }}>Conversation introuvable</div>

  const statutColor = thread.statut === 'ouvert' ? '#2563EB' : thread.statut === 'resolu' ? '#059669' : '#94A3B8'
  const statutLabel = thread.statut === 'ouvert' ? 'Ouvert' : thread.statut === 'resolu' ? 'Résolu' : 'Archivé'

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <a href="/portail/messages" style={{ fontSize: 13, color: '#64748B', textDecoration: 'none' }}>← Mes conversations</a>
      </div>

      <div className="card" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: '#1E293B' }}>{thread.sujet}</h1>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                Destinataire : <strong>{thread.services?.nom || '—'}</strong>
              </div>
            </div>
            <span style={{ background: statutColor, color: '#fff', fontSize: 10, padding: '4px 9px', borderRadius: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{statutLabel}</span>
          </div>
        </div>

        <div style={{ padding: '18px 22px', maxHeight: 520, overflowY: 'auto', background: '#FAFBFC' }}>
          {messages.length === 0 && <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 20 }}>Aucun message</div>}
          {messages.map(m => {
            const isMe = m.auteur_profile_id === profile?.id
            const auteurNom = m.profiles ? `${m.profiles.prenom ?? ''} ${m.profiles.nom ?? ''}`.trim() || (m.profiles.role === 'parent' ? 'Vous' : 'École') : 'Inconnu'
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
                <div style={{ maxWidth: '75%', background: isMe ? '#2563EB' : '#fff', color: isMe ? '#fff' : '#1E293B', padding: '10px 14px', borderRadius: 12, border: isMe ? 'none' : '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4, fontWeight: 600 }}>
                    {isMe ? 'Vous' : auteurNom} · {new Date(m.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.contenu}</div>
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
            {error && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 8, borderRadius: 6, fontSize: 12, marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="submit" disabled={sending || !reply.trim()} style={{ background: sending || !reply.trim() ? '#94A3B8' : '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: sending || !reply.trim() ? 'not-allowed' : 'pointer' }}>
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13, background: '#F8FAFC' }}>
            Cette conversation a été archivée.
          </div>
        )}
      </div>
    </div>
  )
}
