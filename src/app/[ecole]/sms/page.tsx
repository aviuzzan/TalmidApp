'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Classe = { id: string; nom: string; ordre: number }
type SmsLog = {
  id: string; destinataire_telephone: string; destinataire_nom: string | null;
  message: string; statut: string; created_at: string; erreur: string | null;
}

export default function SmsAdminPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<Classe[]>([])
  const [paramActif, setParamActif] = useState(false)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  // Form state
  const [cibleType, setCibleType] = useState<'classe' | 'tous' | 'liste'>('classe')
  const [cibleClasse, setCibleClasse] = useState<string>('')
  const [telephones, setTelephones] = useState<string>('')
  const [message, setMessage] = useState<string>('Bonjour {prenom}, ')
  const [logs, setLogs] = useState<SmsLog[]>([])

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: cls }, { data: param }, { data: ls }] = await Promise.all([
      s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre'),
      s.from('parametres_sms').select('actif').eq('ecole_id', ecole.id).maybeSingle(),
      s.from('sms_envoyes').select('id, destinataire_telephone, destinataire_nom, message, statut, created_at, erreur').eq('ecole_id', ecole.id).order('created_at', { ascending: false }).limit(30),
    ])
    setClasses((cls ?? []) as Classe[])
    setParamActif(Boolean(param?.actif))
    setLogs((ls ?? []) as SmsLog[])
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  async function envoyer() {
    if (!message.trim()) { setMsg('Message vide'); return }
    if (cibleType === 'classe' && !cibleClasse) { setMsg('Sélectionnez une classe'); return }
    if (cibleType === 'liste' && !telephones.trim()) { setMsg('Saisissez au moins un numéro'); return }
    if (!confirm(`Envoyer ce SMS ? ${cibleType === 'tous' ? '(tous les parents avec téléphone)' : ''}`)) return

    setSending(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setSending(false); setMsg('Session expirée'); return }

    const payload: any = {
      ecoleId: ecole.id,
      cibleType,
      message,
    }
    if (cibleType === 'classe') payload.cibleId = cibleClasse
    if (cibleType === 'liste') {
      payload.telephones = telephones.split(/[\n,;]/).map(t => t.trim()).filter(Boolean)
    }

    const res = await fetch('/api/admin/envoyer-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSending(false)
    if (!res.ok) { setMsg('Erreur : ' + (data.error || 'inconnue')); return }
    setMsg(`✓ ${data.envoyes} envoyé${data.envoyes > 1 ? 's' : ''}` + (data.echecs ? ` — ${data.echecs} échec${data.echecs > 1 ? 's' : ''}` : ''))
    setMessage('Bonjour {prenom}, ')
    setTimeout(() => setMsg(''), 6000)
    await load()
  }

  async function toggleActif() {
    const s = createClient()
    await s.from('parametres_sms').upsert({ ecole_id: ecole.id, actif: !paramActif, updated_at: new Date().toISOString() })
    setParamActif(!paramActif)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📱 Envoi SMS</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Communication SMS via Brevo — facturé à l&apos;unité (~0,05 €/SMS)</p>
        </div>
        <button onClick={toggleActif}
          style={{ background: paramActif ? '#ECFDF5' : '#FEF2F2', color: paramActif ? '#065F46' : '#991B1B', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {paramActif ? '✓ Service SMS activé' : '✕ Service SMS désactivé — Cliquer pour activer'}
        </button>
      </div>

      {!paramActif && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: '12px 16px', borderRadius: 10, fontSize: 13 }}>
          Le service SMS est désactivé. Activez-le ci-dessus pour autoriser les envois (nécessite que la clé Brevo soit configurée côté serveur).
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Nouveau SMS</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Destinataires</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { v: 'classe', l: '🏫 Par classe' },
              { v: 'tous', l: '👥 Toutes les familles' },
              { v: 'liste', l: '📋 Liste de numéros' },
            ].map(o => (
              <button key={o.v} onClick={() => setCibleType(o.v as any)}
                style={{ background: cibleType === o.v ? '#2563EB' : '#F1F5F9', color: cibleType === o.v ? '#fff' : '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {o.l}
              </button>
            ))}
          </div>

          {cibleType === 'classe' && (
            <select value={cibleClasse} onChange={e => setCibleClasse(e.target.value)} style={inp}>
              <option value="">— Choisir une classe —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          )}
          {cibleType === 'liste' && (
            <textarea value={telephones} onChange={e => setTelephones(e.target.value)} placeholder="0612345678, 0623456789 ou un par ligne"
              style={{ ...inp, minHeight: 80, resize: 'vertical' }} />
          )}

          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 6 }}>
            Message ({message.length} caractères — {Math.ceil(message.length / 160) || 1} segment{Math.ceil(message.length / 160) > 1 ? 's' : ''})
          </label>
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            placeholder="Variables disponibles : {prenom}, {nom}"
            style={{ ...inp, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }} maxLength={800} />
          <div style={{ fontSize: 11, color: '#94A3B8' }}>
            💡 1 segment SMS = 160 caractères. Au-delà, le message est facturé en plusieurs SMS (160, 306, 459 chars…).
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={envoyer} disabled={sending || !paramActif} className="btn-primary">
              {sending ? 'Envoi en cours...' : '📤 Envoyer SMS'}
            </button>
          </div>

          {msg && (
            <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B' }}>
              {msg}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>Historique des envois (30 derniers)</div>
        {logs.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun SMS envoyé pour l&apos;instant</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Date', 'Destinataire', 'Message', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{new Date(l.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ fontWeight: 600 }}>{l.destinataire_nom || '—'}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>{l.destinataire_telephone}</div>
                  </td>
                  <td style={{ padding: '11px 14px', color: '#475569', maxWidth: 320 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</div>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {l.statut === 'sent' ? (
                      <span style={{ background: '#ECFDF5', color: '#065F46', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>✓ Envoyé</span>
                    ) : (
                      <span title={l.erreur || ''} style={{ background: '#FEF2F2', color: '#991B1B', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>✕ Échec</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
