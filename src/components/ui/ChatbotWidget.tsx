'use client'
/**
 * Widget chatbot flottant.
 * S affiche en bas-droite si le chatbot est active pour l ecole de l utilisateur.
 *
 * A inclure dans:
 *  - src/app/portail/layout.tsx (cote parent)
 *  - src/components/ui/EcoleAppLayout.tsx (cote admin)
 */
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Message = { role: 'user' | 'bot'; text: string; conversationId?: string }

export default function ChatbotWidget() {
  const [active, setActive] = useState<boolean | null>(null)  // null = pas encore charge
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Verifie au montage si le chatbot est actif pour l'ecole de l user
  useEffect(() => {
    (async () => {
      try {
        const s = createClient()
        const { data: { session } } = await s.auth.getSession()
        if (!session) { setActive(false); return }
        const { data: profile } = await s.from('profiles').select('ecole_id, famille_id').eq('id', session.user.id).single()
        let ecoleId = profile?.ecole_id
        if (!ecoleId && profile?.famille_id) {
          const { data: f } = await s.from('familles').select('ecole_id').eq('id', profile.famille_id).single()
          ecoleId = f?.ecole_id
        }
        if (!ecoleId) { setActive(false); return }
        const { data: cfg } = await s.from('chatbot_config_ecole').select('active').eq('ecole_id', ecoleId).maybeSingle()
        setActive(cfg?.active === true)
      } catch { setActive(false) }
    })()
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  if (active !== true) return null

  async function envoyer() {
    const question = input.trim()
    if (!question || loading) return
    setInput('')
    setErreur('')
    setMessages(m => [...m, { role: 'user', text: question }])
    setLoading(true)
    try {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      const resp = await fetch('/api/chatbot/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ question }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setErreur(data.error || 'Erreur')
        setMessages(m => m.slice(0, -1))  // retire la question vu qu il n y a pas eu de reponse
      } else {
        setMessages(m => [...m, { role: 'bot', text: data.reponse, conversationId: data.conversationId }])
      }
    } catch (e: any) {
      setErreur(e.message || 'Erreur reseau')
      setMessages(m => m.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Bouton flottant - icone circulaire discrete (Levy) */}
      {!open && (
        <>
          <style>{`
            .levy-fab {
              position: fixed;
              bottom: 20px;
              right: 20px;
              z-index: 998;
              width: 56px;
              height: 56px;
              border-radius: 50%;
              background: linear-gradient(135deg, #2563EB, #1E40AF);
              border: none;
              color: #fff;
              cursor: pointer;
              box-shadow: 0 6px 18px rgba(37,99,235,0.4);
              display: flex;
              align-items: center;
              justify-content: center;
              transition: transform 0.18s, box-shadow 0.18s, opacity 0.18s;
              opacity: 0.88;
              padding: 0;
            }
            .levy-fab:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 24px rgba(37,99,235,0.55);
              opacity: 1;
            }
            .levy-fab:focus-visible {
              outline: 2px solid #1E40AF;
              outline-offset: 3px;
              opacity: 1;
            }
            .levy-fab-icon {
              font-size: 24px;
              line-height: 1;
            }
            .levy-fab-tooltip {
              position: absolute;
              right: calc(100% + 10px);
              top: 50%;
              transform: translateY(-50%);
              background: #1E293B;
              color: #fff;
              font-size: 12px;
              font-weight: 600;
              padding: 6px 10px;
              border-radius: 6px;
              white-space: nowrap;
              opacity: 0;
              pointer-events: none;
              transition: opacity 0.18s;
            }
            .levy-fab:hover .levy-fab-tooltip,
            .levy-fab:focus-visible .levy-fab-tooltip {
              opacity: 1;
            }
            @media (max-width: 640px) {
              .levy-fab {
                width: 48px;
                height: 48px;
                bottom: 16px;
                right: 16px;
                opacity: 0.82;
              }
              .levy-fab-icon {
                font-size: 20px;
              }
              .levy-fab-tooltip {
                display: none;
              }
            }
          `}</style>
          <button
            onClick={() => setOpen(true)}
            aria-label="Demandez à Levy, assistant virtuel"
            title="Demandez à Levy"
            className="levy-fab"
          >
            <span className="levy-fab-icon" aria-hidden="true">💬</span>
            <span className="levy-fab-tooltip" role="tooltip">Demandez à Levy</span>
          </button>
        </>
      )}

      {/* Panel ouvert */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 999,
          width: 380, maxWidth: 'calc(100vw - 32px)',
          height: 540, maxHeight: 'calc(100vh - 80px)',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(15,23,42,0.3)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            background: 'linear-gradient(135deg, #2563EB, #1E40AF)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>👨‍🎓</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>Levy</div>
                <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>Assistant virtuel TalmidApp</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: '#F8FAFC' }}>
            {messages.length === 0 && (
              <div style={{ color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 30, padding: '0 12px', lineHeight: 1.55 }}>
                👋 Bonjour, je suis <strong style={{ color: '#1E293B' }}>Levy</strong> !<br/>
                Je connais votre école et l&apos;app TalmidApp. Posez-moi votre question.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: m.role === 'user' ? '#2563EB' : '#fff',
                color: m.role === 'user' ? '#fff' : '#1E293B',
                padding: '9px 13px', borderRadius: 12,
                fontSize: 13, lineHeight: 1.45,
                border: m.role === 'bot' ? '1px solid #E2E8F0' : 'none',
                whiteSpace: 'pre-wrap',
              }}>{m.text}</div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid #E2E8F0', padding: '9px 13px', borderRadius: 12, fontSize: 13, color: '#64748B' }}>
                ⏳ Levy réfléchit…
              </div>
            )}
            {erreur && (
              <div style={{ alignSelf: 'center', background: '#FEF2F2', color: '#991B1B', padding: '7px 12px', borderRadius: 8, fontSize: 12 }}>{erreur}</div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={e => { e.preventDefault(); envoyer() }}
            style={{ borderTop: '1px solid #E2E8F0', padding: 10, background: '#fff', display: 'flex', gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              placeholder="Votre question à Levy…"
              disabled={loading}
              style={{
                flex: 1, padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8,
                fontSize: 13, outline: 'none',
              }} />
            <button type="submit" disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? '#CBD5E1' : '#2563EB',
                color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px',
                fontSize: 13, fontWeight: 600, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              }}>→</button>
          </form>
        </div>
      )}
    </>
  )
}
