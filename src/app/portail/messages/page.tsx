'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { calcRetention, couleurRetention } from '@/lib/retention-messages'
import { useI18n } from '@/lib/i18n'
import { dateLocale } from '@/lib/format-date'

type Tab = 'liste' | 'nouveau'

export default function PortailMessagesPage() {
  const router = useRouter()
  const { t, lang } = useI18n()
  const [tab, setTab] = useState<Tab>('liste')
  const [profile, setProfile] = useState<any>(null)
  const [threads, setThreads] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [dureeRetention, setDureeRetention] = useState<number>(15)
  const [loading, setLoading] = useState(true)

  // Nouveau thread form
  const [newServiceId, setNewServiceId] = useState('')
  const [newSujet, setNewSujet] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data: p } = await s.from('profiles').select('*, familles(ecole_id)').eq('id', session.user.id).single()
    if (!p) { setLoading(false); return }
    setProfile(p)
    const ecoleId = (p as any).familles?.ecole_id
    const [{ data: th }, { data: sv }] = await Promise.all([
      s.from('message_threads')
        .select('*, services(nom), messages(id, created_at, auteur_profile_id)')
        .eq('famille_id', p.famille_id)
        .order('last_message_at', { ascending: false }),
      ecoleId ? s.from('services').select('*').eq('ecole_id', ecoleId).eq('actif', true).order('ordre') : Promise.resolve({ data: [] }),
    ])
    setThreads(th ?? [])
    setServices(sv ?? [])
    if (ecoleId) {
      const { data: ec } = await s.from('ecoles').select('duree_retention_messages_jours').eq('id', ecoleId).single()
      setDureeRetention(ec?.duree_retention_messages_jours ?? 15)
    }
    setLoading(false)
  }

  async function createThread(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSending(true)
    if (!newServiceId || !newSujet.trim() || !newMessage.trim()) { setError(t('portail.messages.err.required')); setSending(false); return }
    const s = createClient()
    const { data: ecoleData } = await s.from('services').select('ecole_id').eq('id', newServiceId).single()
    const ecoleId = (ecoleData as any)?.ecole_id
    if (!ecoleId) { setError(t('portail.messages.err.service_not_found')); setSending(false); return }
    const { data: th, error: errT } = await s.from('message_threads').insert({
      ecole_id: ecoleId, service_id: newServiceId, famille_id: profile.famille_id,
      sujet: newSujet.trim(), statut: 'ouvert', created_by: profile.id,
    }).select().single()
    if (errT || !th) { setError(errT?.message || t('portail.messages.err.create')); setSending(false); return }
    const { error: errM } = await s.from('messages').insert({
      thread_id: th.id, auteur_profile_id: profile.id, contenu: newMessage.trim(),
    })
    if (errM) { setError(errM.message); setSending(false); return }
    // Notifier (best-effort)
    try {
      // FIX secu 27/07 : notify-message exige désormais un Bearer token
      const { data: { session } } = await s.auth.getSession()
      await fetch('/api/notify-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ thread_id: th.id, type: 'nouveau' }),
      })
    } catch {}
    router.push(`/portail/messages/${th.id}`)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>{t('portail.common.loading_dots')}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#1E293B' }}>{t('portail.messages.title')}</h1>
        <button onClick={() => setTab(tab === 'liste' ? 'nouveau' : 'liste')}
          style={{ background: tab === 'nouveau' ? '#F1F5F9' : '#2563EB', color: tab === 'nouveau' ? '#475569' : '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {tab === 'nouveau' ? t('portail.messages.back_to_list') : t('portail.messages.new_conversation')}
        </button>
      </div>

      {tab === 'liste' && (
        <>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#1E40AF', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🗑</span>
          <span dangerouslySetInnerHTML={{ __html: t('portail.messages.retention_note', { n: dureeRetention }) }} />
        </div>
        <div className="card" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          {threads.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
              {t('portail.messages.empty')}
              <div style={{ marginTop: 14 }}>
                <button onClick={() => setTab('nouveau')} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {t('portail.messages.start')}
                </button>
              </div>
            </div>
          ) : threads.map(th => {
            const lastMsg = (th.messages || []).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
            const lastIsFromOther = lastMsg && lastMsg.auteur_profile_id !== profile?.id
            const statutColor = th.statut === 'ouvert' ? '#2563EB' : th.statut === 'resolu' ? '#059669' : '#94A3B8'
            const statutLabel = th.statut === 'ouvert' ? t('portail.messages.status.open') : th.statut === 'resolu' ? t('portail.messages.status.resolved') : t('portail.messages.status.archived')
            return (
              <a key={th.id} href={`/portail/messages/${th.id}`}
                style={{ display: 'block', padding: '16px 20px', borderBottom: '1px solid #F1F5F9', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{th.sujet}</div>
                      {lastIsFromOther && <span style={{ background: '#2563EB', color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>{t('portail.messages.badge_new')}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      {th.services?.nom || t('portail.messages.service_deleted')} · {t('portail.messages.count', { n: (th.messages || []).length, s: (th.messages || []).length > 1 ? 's' : '' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: statutColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{statutLabel}</span>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                      {new Date(th.last_message_at).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {(() => {
                      const ret = calcRetention(th.last_message_at, dureeRetention)
                      const col = couleurRetention(ret.niveau)
                      return (
                        <div title={ret.labelComplet}
                          style={{ display: 'inline-block', marginTop: 4, background: col.bg, color: col.fg, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5 }}>
                          🗑 {ret.labelCourt}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </a>
            )
          })}
        </div>
        </>
      )}

      {tab === 'nouveau' && (
        <form onSubmit={createThread} className="card" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 18px', color: '#1E293B' }}>{t('portail.messages.form.title')}</h2>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>{t('portail.messages.form.recipient')}</div>
            <select value={newServiceId} onChange={e => setNewServiceId(e.target.value)} required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 14, background: '#fff' }}>
              <option value="">{t('portail.messages.form.choose_service')}</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.nom}{s.description ? ` — ${s.description}` : ''}</option>)}
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>{t('portail.messages.form.subject')}</div>
            <input type="text" value={newSujet} onChange={e => setNewSujet(e.target.value)} required maxLength={140}
              placeholder={t('portail.messages.form.subject_placeholder')}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>{t('portail.messages.form.your_message')}</div>
            <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} required rows={6}
              placeholder={t('portail.messages.form.message_placeholder')}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
          </label>

          {error && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 14 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setTab('liste')} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('portail.common.cancel')}</button>
            <button type="submit" disabled={sending} style={{ background: sending ? '#94A3B8' : '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: sending ? 'wait' : 'pointer' }}>
              {sending ? t('portail.messages.sending') : t('portail.messages.send')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
