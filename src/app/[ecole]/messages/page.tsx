'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Tab = 'inbox' | 'nouveau'
type Filtre = 'ouvert' | 'resolu' | 'archive' | 'tous'

export default function EcoleMessagesPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [tab, setTab] = useState<Tab>('inbox')
  const [filtre, setFiltre] = useState<Filtre>('ouvert')
  const [serviceFiltre, setServiceFiltre] = useState<string>('')
  const [profile, setProfile] = useState<any>(null)
  const [services, setServices] = useState<any[]>([])
  const [threads, setThreads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Form nouveau interne
  const [newServiceId, setNewServiceId] = useState('')
  const [newSujet, setNewSujet] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id, filtre, serviceFiltre])

  async function load() {
    setLoading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: p } = await s.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(p)

    let q = s.from('message_threads')
      .select('*, services(nom), familles(nom, numero, parent1_prenom, parent1_nom), messages(id, created_at, auteur_profile_id)')
      .eq('ecole_id', ecole.id)
      .order('last_message_at', { ascending: false })
    if (filtre !== 'tous') q = q.eq('statut', filtre)
    if (serviceFiltre) q = q.eq('service_id', serviceFiltre)
    const [{ data: th }, { data: sv }] = await Promise.all([
      q,
      s.from('services').select('*').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
    ])
    setThreads(th ?? [])
    setServices(sv ?? [])
    setLoading(false)
  }

  async function createInterne(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSending(true)
    if (!newServiceId || !newSujet.trim() || !newMessage.trim()) { setError('Tous les champs sont requis'); setSending(false); return }
    const s = createClient()
    const { data: th, error: errT } = await s.from('message_threads').insert({
      ecole_id: ecole.id, service_id: newServiceId, famille_id: null,
      sujet: newSujet.trim(), statut: 'ouvert', created_by: profile.id,
    }).select().single()
    if (errT || !th) { setError(errT?.message || 'Erreur'); setSending(false); return }
    await s.from('messages').insert({ thread_id: th.id, auteur_profile_id: profile.id, contenu: newMessage.trim() })
    try {
      await fetch('/api/notify-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: th.id, type: 'nouveau' }),
      })
    } catch {}
    router.push(`/${ecole.slug}/messages/${th.id}`)
  }

  if (loading && !threads.length) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#1E293B' }}>💬 Messagerie école</h1>
        <button onClick={() => setTab(tab === 'inbox' ? 'nouveau' : 'inbox')}
          style={{ background: tab === 'nouveau' ? '#F1F5F9' : '#2563EB', color: tab === 'nouveau' ? '#475569' : '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {tab === 'nouveau' ? '← Inbox' : '+ Nouveau (interne)'}
        </button>
      </div>

      {tab === 'inbox' && (
        <>
          {/* Filtres */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(['ouvert', 'resolu', 'archive', 'tous'] as Filtre[]).map(f => (
              <button key={f} onClick={() => setFiltre(f)}
                style={{ background: filtre === f ? '#1E293B' : '#fff', color: filtre === f ? '#fff' : '#475569', border: '1px solid #E2E8F0', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                {f === 'ouvert' ? 'Ouverts' : f === 'resolu' ? 'Résolus' : f === 'archive' ? 'Archivés' : 'Tous'}
              </button>
            ))}
            <select value={serviceFiltre} onChange={e => setServiceFiltre(e.target.value)}
              style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, background: '#fff' }}>
              <option value="">Tous les services</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>

          <div className="card" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            {threads.length === 0 ? (
              <div style={{ padding: 50, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Aucune conversation</div>
            ) : threads.map(t => {
              const lastMsg = (t.messages || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
              const lastIsFromOther = lastMsg && lastMsg.auteur_profile_id !== profile?.id
              const familleNom = t.familles ? `${t.familles.parent1_prenom ?? ''} ${t.familles.parent1_nom ?? ''}`.trim() || t.familles.nom : 'Interne'
              const statutColor = t.statut === 'ouvert' ? '#2563EB' : t.statut === 'resolu' ? '#059669' : '#94A3B8'
              const statutLabel = t.statut === 'ouvert' ? 'Ouvert' : t.statut === 'resolu' ? 'Résolu' : 'Archivé'
              return (
                <a key={t.id} href={`/${ecole.slug}/messages/${t.id}`}
                  style={{ display: 'block', padding: '14px 18px', borderBottom: '1px solid #F1F5F9', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{t.sujet}</div>
                        {lastIsFromOther && <span style={{ background: '#2563EB', color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>NOUVEAU</span>}
                        {!t.famille_id && <span style={{ background: '#F3F4F6', color: '#475569', fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600 }}>INTERNE</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>
                        <strong>{familleNom}</strong> · {t.services?.nom || '—'} · {(t.messages || []).length} message{(t.messages || []).length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: statutColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{statutLabel}</span>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                        {new Date(t.last_message_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </>
      )}

      {tab === 'nouveau' && (
        <form onSubmit={createInterne} className="card" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#1E293B' }}>Nouvelle conversation interne</h2>
          <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 18px' }}>Pour échanger entre agents (sans famille). Tous les agents du service choisi pourront y répondre.</p>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Service destinataire</div>
            <select value={newServiceId} onChange={e => setNewServiceId(e.target.value)} required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 14, background: '#fff' }}>
              <option value="">— Choisir un service —</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Sujet</div>
            <input type="text" value={newSujet} onChange={e => setNewSujet(e.target.value)} required maxLength={140}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Message</div>
            <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} required rows={6}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
          </label>

          {error && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 14 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setTab('inbox')} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
            <button type="submit" disabled={sending} style={{ background: sending ? '#94A3B8' : '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: sending ? 'wait' : 'pointer' }}>
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
