'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'

export default function NotificationsTab({ ecoleId }: { ecoleId: string }) {
  const toast = useToast()
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [ddrActif, setDdrActif] = useState(true)
  const [contratActif, setContratActif] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [testing, setTesting] = useState<'ddr' | 'contrat' | null>(null)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    createClient()
      .from('ecoles')
      .select('notif_emails_admin, notif_ddr_active, notif_contrat_active')
      .eq('id', ecoleId)
      .single()
      .then(({ data }) => {
        setEmails((data?.notif_emails_admin as string[] | null) ?? [])
        setDdrActif(data?.notif_ddr_active ?? true)
        setContratActif(data?.notif_contrat_active ?? true)
        setLoading(false)
      })
  }, [ecoleId])

  function isValidEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) }

  function addEmail() {
    const e = newEmail.trim().toLowerCase()
    if (!isValidEmail(e)) { toast.error('Email invalide'); return }
    if (emails.includes(e)) { toast.error('Cet email est déjà dans la liste'); return }
    setEmails([...emails, e])
    setNewEmail('')
  }

  function removeEmail(e: string) {
    setEmails(emails.filter(x => x !== e))
  }

  async function save() {
    setSaving(true); setSaved(false); setSaveErr(null)
    const { data, error } = await createClient().from('ecoles').update({
      notif_emails_admin: emails,
      notif_ddr_active: ddrActif,
      notif_contrat_active: contratActif,
    }).eq('id', ecoleId).select()
    setSaving(false)
    if (error) {
      setSaveErr('Erreur lors de l\'enregistrement : ' + error.message)
      return
    }
    if (!data || data.length === 0) {
      setSaveErr('Enregistrement bloqué (aucune ligne modifiée). Vérifiez vos permissions.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function testNotif(type: 'ddr' | 'contrat') {
    if (!emails.length) { toast.error('Ajoutez au moins un email avant de tester.'); return }
    setTesting(type); setTestMsg(null)
    try {
      const s = createClient()
      // On prend la 1ère famille de l'école pour faire un test réel via le même endpoint
      const { data: fam } = await s.from('familles').select('id').eq('ecole_id', ecoleId).limit(1).single()
      if (!fam) { setTestMsg({ ok: false, text: 'Aucune famille trouvée pour faire le test.' }); setTesting(null); return }
      const res = await fetch('/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecole_id: ecoleId, famille_id: fam.id, type: type === 'ddr' ? 'ddr_soumis' : 'contrat_soumis' }),
      })
      const json = await res.json()
      if (res.ok && json.success) setTestMsg({ ok: true, text: `✓ Email envoyé à ${json.destinataires} destinataire(s).` })
      else if (json.skipped) setTestMsg({ ok: false, text: `⏸️ Notification désactivée — ${json.reason}` })
      else setTestMsg({ ok: false, text: `Erreur : ${json.error || 'inconnue'}` })
    } catch (err: any) {
      setTestMsg({ ok: false, text: `Erreur : ${err?.message ?? 'inconnue'}` })
    }
    setTesting(null)
  }

  const inp = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const help = { fontSize: 11, color: '#94A3B8', marginTop: 4 }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>🔔 Notifications email aux administrateurs</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Recevez automatiquement un email quand une famille soumet une demande de réduction ou un contrat de scolarisation depuis le portail.
        </p>
      </div>

      {/* Destinataires */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
        <label style={lbl}>Destinataires *</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <input
            style={{ ...inp, flex: 1 }}
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
            placeholder="admin@ecole.fr"
            type="email"
          />
          <button onClick={addEmail}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '0 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
            + Ajouter
          </button>
        </div>
        <div style={help}>Plusieurs emails possibles. Chaque destinataire recevra une copie de la notification.</div>

        {emails.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {emails.map(e => (
              <div key={e} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                <span style={{ color: '#1E293B' }}>📧 {e}</span>
                <button onClick={() => removeEmail(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 18, lineHeight: 1, padding: 4 }} aria-label={`Retirer ${e}`}>×</button>
              </div>
            ))}
          </div>
        )}

        {emails.length === 0 && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>Aucun destinataire pour l'instant.</div>
        )}
      </div>

      {/* Toggles événements */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>📨 Demande de réduction soumise</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Email envoyé quand une famille soumet une DDR via le portail.</div>
          </div>
          <input type="checkbox" checked={ddrActif} onChange={e => setDdrActif(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#2563EB', cursor: 'pointer' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', cursor: 'pointer' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>📝 Contrat de scolarisation soumis</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Email envoyé quand une famille signe et soumet son contrat.</div>
          </div>
          <input type="checkbox" checked={contratActif} onChange={e => setContratActif(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#2563EB', cursor: 'pointer' }} />
        </label>
      </div>

      {/* Test + Save */}
      {saveErr && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#DC2626' }}>
          ⚠️ {saveErr}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ minHeight: 44, padding: '10px 22px' }}>
          {saving ? 'Enregistrement…' : '💾 Enregistrer'}
        </button>
        {saved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Enregistré</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => testNotif('ddr')} disabled={!!testing}
            style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 500, cursor: testing ? 'not-allowed' : 'pointer', minHeight: 40 }}>
            {testing === 'ddr' ? '...' : '🧪 Test DDR'}
          </button>
          <button onClick={() => testNotif('contrat')} disabled={!!testing}
            style={{ background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 500, cursor: testing ? 'not-allowed' : 'pointer', minHeight: 40 }}>
            {testing === 'contrat' ? '...' : '🧪 Test Contrat'}
          </button>
        </div>
      </div>

      {testMsg && (
        <div style={{ background: testMsg.ok ? 'rgba(16,185,129,0.08)' : '#FEF2F2', border: `1px solid ${testMsg.ok ? 'rgba(16,185,129,0.3)' : '#FECACA'}`, borderRadius: 10, padding: '11px 14px', fontSize: 13, color: testMsg.ok ? '#059669' : '#DC2626' }}>
          {testMsg.text}
        </div>
      )}

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#1E40AF', lineHeight: 1.6 }}>
        💡 Les emails sont envoyés via le SMTP configuré côté plateforme (Gmail Workspace de talmidapp.fr). Si aucun email ne part, vérifiez les variables SMTP_* sur Vercel.
      </div>
    </div>
  )
}
