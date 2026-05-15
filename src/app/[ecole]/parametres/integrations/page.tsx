'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type ProviderKey = 'stripe' | 'gocardless' | 'brevo_sms' | 'yousign' | 'paypal'

type Meta = {
  actif: boolean
  mode: 'test' | 'live'
  public: Record<string, any>
  hints: Record<string, string>
} | null

const PROVIDERS: { key: ProviderKey; label: string; icon: string; desc: string }[] = [
  { key: 'stripe', label: 'Stripe', icon: '💳', desc: 'Paiement carte bancaire en ligne — chaque école sur son propre compte Stripe.' },
  { key: 'gocardless', label: 'GoCardless', icon: '🏦', desc: 'Prélèvement SEPA en ligne — mandats signés à distance par les familles.' },
  { key: 'brevo_sms', label: 'Brevo SMS', icon: '📱', desc: 'Envoi de SMS aux familles depuis votre propre compte Brevo (~0,05 €/SMS).' },
  { key: 'yousign', label: 'YouSign', icon: '✍️', desc: 'Signature électronique de contrats et documents à distance.' },
  { key: 'paypal', label: 'PayPal', icon: '🅿️', desc: 'Paiement en ligne via PayPal — carte ou compte PayPal, sur votre propre compte marchand.' },
]

export default function IntegrationsPage() {
  const ecole = useEcole()
  const [provider, setProvider] = useState<ProviderKey>('stripe')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [metas, setMetas] = useState<Record<ProviderKey, Meta>>({ stripe: null, gocardless: null, brevo_sms: null, yousign: null, paypal: null })
  const [msg, setMsg] = useState('')

  // Form state per provider — secrets sont write-only (jamais relus en clair)
  const [stripeForm, setStripeForm] = useState({ publishable_key: '', secret_key: '', webhook_secret: '', mode: 'live' as 'test' | 'live' })
  const [gcForm, setGcForm] = useState({ creditor_id: '', access_token: '', webhook_secret: '', mode: 'live' as 'test' | 'live' })
  const [brevoForm, setBrevoForm] = useState({ expediteur: 'TalmidApp', signature: '', api_key: '' })
  const [ysForm, setYsForm] = useState({ api_key: '', webhook_secret: '', mode: 'live' as 'test' | 'live' })
  const [paypalForm, setPaypalForm] = useState({ client_id: '', client_secret: '', webhook_id: '', mode: 'live' as 'test' | 'live' })

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setLoading(false); return }
    const headers = { Authorization: `Bearer ${session.access_token}` }
    const [r1, r2, r3, r4, r5] = await Promise.all([
      fetch(`/api/admin/integrations?ecoleId=${ecole.id}&provider=stripe`, { headers }).then(r => r.json()),
      fetch(`/api/admin/integrations?ecoleId=${ecole.id}&provider=gocardless`, { headers }).then(r => r.json()),
      fetch(`/api/admin/integrations?ecoleId=${ecole.id}&provider=brevo_sms`, { headers }).then(r => r.json()),
      fetch(`/api/admin/integrations?ecoleId=${ecole.id}&provider=yousign`, { headers }).then(r => r.json()),
      fetch(`/api/admin/integrations?ecoleId=${ecole.id}&provider=paypal`, { headers }).then(r => r.json()),
    ])
    setMetas({ stripe: r1.integration, gocardless: r2.integration, brevo_sms: r3.integration, yousign: r4.integration, paypal: r5.integration })
    if (r1.integration) {
      setStripeForm(f => ({ ...f, publishable_key: r1.integration.public?.publishable_key || '', mode: r1.integration.mode || 'live' }))
    }
    if (r2.integration) {
      setGcForm(f => ({ ...f, creditor_id: r2.integration.public?.creditor_id || '', mode: r2.integration.mode || 'live' }))
    }
    if (r3.integration) {
      setBrevoForm(f => ({ ...f, expediteur: r3.integration.public?.expediteur || 'TalmidApp', signature: r3.integration.public?.signature || '' }))
    }
    if (r4.integration) {
      setYsForm(f => ({ ...f, mode: r4.integration.mode || 'live' }))
    }
    if (r5.integration) {
      setPaypalForm(f => ({ ...f, client_id: r5.integration.public?.client_id || '', mode: r5.integration.mode || 'live' }))
    }
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  async function save(p: ProviderKey, payload: any) {
    setSaving(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setSaving(false); return }
    const res = await fetch('/api/admin/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ecoleId: ecole.id, provider: p, ...payload }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg('Erreur : ' + (data.error || 'inconnue')); return }
    setMsg('✓ Sauvegardé')
    setTimeout(() => setMsg(''), 4000)
    await load()
    // Reset secret fields (write-only)
    if (p === 'stripe') setStripeForm(f => ({ ...f, secret_key: '', webhook_secret: '' }))
    if (p === 'gocardless') setGcForm(f => ({ ...f, access_token: '', webhook_secret: '' }))
    if (p === 'brevo_sms') setBrevoForm(f => ({ ...f, api_key: '' }))
    if (p === 'yousign') setYsForm(f => ({ ...f, api_key: '', webhook_secret: '' }))
  }

  async function toggleActif(p: ProviderKey) {
    const meta = metas[p]
    const current = meta?.actif || false
    if (!current) {
      // Activer : on doit avoir au moins les secrets requis
      const hints = meta?.hints || {}
      if (p === 'stripe' && !hints.secret_key) { setMsg('Sauvegardez d\'abord la Secret Key Stripe'); return }
      if (p === 'gocardless' && !hints.access_token) { setMsg('Sauvegardez d\'abord l\'Access Token GoCardless'); return }
      if (p === 'brevo_sms' && !hints.api_key) { setMsg('Sauvegardez d\'abord la clé API Brevo'); return }
      if (p === 'yousign' && !hints.api_key) { setMsg('Sauvegardez d\'abord la clé API YouSign'); return }
      if (p === 'paypal' && !hints.client_secret) { setMsg('Sauvegardez d\'abord le Client Secret PayPal'); return }
    }
    await save(p, { actif: !current })
  }

  async function supprimer(p: ProviderKey) {
    if (!confirm('Supprimer toutes les clés de cette intégration ? Cette action est irréversible.')) return
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setSaving(false); return }
    await fetch(`/api/admin/integrations?ecoleId=${ecole.id}&provider=${p}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setSaving(false)
    await load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', fontFamily: 'inherit' }
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }
  const hint: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 4 }

  const meta = metas[provider]
  const webhookUrl = (p: ProviderKey) => `https://talmidapp.fr/api/${p === 'gocardless' ? 'gocardless' : 'stripe'}/webhook?ecole=${ecole?.slug || ''}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🔌 Intégrations</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Connectez vos propres comptes Stripe, GoCardless, Brevo… Vos clés sont chiffrées et stockées de manière sécurisée.
        </p>
      </div>

      {/* Tabs providers */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PROVIDERS.map(p => (
          <button key={p.key} onClick={() => setProvider(p.key)}
            style={{
              background: provider === p.key ? '#1E40AF' : '#F1F5F9',
              color: provider === p.key ? '#fff' : '#475569',
              border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            <span>{p.icon}</span>
            <span>{p.label}</span>
            {metas[p.key]?.actif && <span style={{ background: '#10B981', width: 8, height: 8, borderRadius: '50%' }} />}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>
              {PROVIDERS.find(p => p.key === provider)?.icon} {PROVIDERS.find(p => p.key === provider)?.label}
            </h2>
            <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>
              {PROVIDERS.find(p => p.key === provider)?.desc}
            </p>
          </div>
          <button onClick={() => toggleActif(provider)} disabled={saving}
            style={{
              background: meta?.actif ? '#ECFDF5' : '#FEF2F2',
              color: meta?.actif ? '#065F46' : '#991B1B',
              border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
            {meta?.actif ? '✓ Activé' : '✕ Désactivé — Activer'}
          </button>
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B' }}>{msg}</div>
        )}

        {/* STRIPE FORM */}
        {provider === 'stripe' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={label}>Mode</label>
              <select value={stripeForm.mode} onChange={e => setStripeForm(f => ({ ...f, mode: e.target.value as any }))} style={inp}>
                <option value="test">Test (clés sk_test_, pas de vrais paiements)</option>
                <option value="live">Live (vrais paiements)</option>
              </select>
            </div>
            <div>
              <label style={label}>Publishable Key (pk_live_... ou pk_test_...)</label>
              <input type="text" value={stripeForm.publishable_key} onChange={e => setStripeForm(f => ({ ...f, publishable_key: e.target.value }))} placeholder="pk_live_..." style={inp} />
              <div style={hint}>Visible côté front, copie depuis https://dashboard.stripe.com/apikeys</div>
            </div>
            <div>
              <label style={label}>Secret Key (sk_live_... ou sk_test_...)</label>
              <input type="password" value={stripeForm.secret_key} onChange={e => setStripeForm(f => ({ ...f, secret_key: e.target.value }))}
                placeholder={meta?.hints.secret_key ? `Configurée (****${meta.hints.secret_key}) — laissez vide pour ne pas changer` : 'sk_live_...'} style={inp} />
              <div style={hint}>Chiffrée AES-256 avant stockage. Ne jamais partager.</div>
            </div>
            <div>
              <label style={label}>Webhook Signing Secret (whsec_...)</label>
              <input type="password" value={stripeForm.webhook_secret} onChange={e => setStripeForm(f => ({ ...f, webhook_secret: e.target.value }))}
                placeholder={meta?.hints.webhook_secret ? `Configurée (****${meta.hints.webhook_secret})` : 'whsec_...'} style={inp} />
              <div style={hint}>
                Dans Stripe Dashboard → Developers → Webhooks → Ajouter un endpoint :
                <code style={{ display: 'block', marginTop: 4, padding: 6, background: '#F1F5F9', borderRadius: 4, fontSize: 11 }}>{webhookUrl('stripe')}</code>
                Events à cocher : <code>checkout.session.completed</code>, <code>checkout.session.expired</code>, <code>payment_intent.payment_failed</code>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
              <button onClick={() => supprimer('stripe')} disabled={saving}
                style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                🗑 Supprimer les clés
              </button>
              <button onClick={() => save('stripe', {
                mode: stripeForm.mode,
                publicConfig: { publishable_key: stripeForm.publishable_key || null },
                secrets: {
                  ...(stripeForm.secret_key ? { secret_key: stripeForm.secret_key } : {}),
                  ...(stripeForm.webhook_secret ? { webhook_secret: stripeForm.webhook_secret } : {}),
                },
              })} disabled={saving} className="btn-primary">
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder Stripe'}
              </button>
            </div>
          </div>
        )}

        {/* GOCARDLESS FORM */}
        {provider === 'gocardless' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={label}>Mode</label>
              <select value={gcForm.mode} onChange={e => setGcForm(f => ({ ...f, mode: e.target.value as any }))} style={inp}>
                <option value="test">Sandbox (test)</option>
                <option value="live">Live (vrais prélèvements)</option>
              </select>
            </div>
            <div>
              <label style={label}>Creditor ID (CR000xxxx)</label>
              <input type="text" value={gcForm.creditor_id} onChange={e => setGcForm(f => ({ ...f, creditor_id: e.target.value }))} placeholder="CR000..." style={inp} />
              <div style={hint}>Trouvé dans GoCardless Dashboard → Settings → Account.</div>
            </div>
            <div>
              <label style={label}>Access Token</label>
              <input type="password" value={gcForm.access_token} onChange={e => setGcForm(f => ({ ...f, access_token: e.target.value }))}
                placeholder={meta?.hints.access_token ? `Configuré (****${meta.hints.access_token})` : 'live_...'} style={inp} />
              <div style={hint}>Dashboard → Developers → Create access token (permissions Read & Write).</div>
            </div>
            <div>
              <label style={label}>Webhook Secret</label>
              <input type="password" value={gcForm.webhook_secret} onChange={e => setGcForm(f => ({ ...f, webhook_secret: e.target.value }))}
                placeholder={meta?.hints.webhook_secret ? `Configuré (****${meta.hints.webhook_secret})` : 'webhook secret 64 chars'} style={inp} />
              <div style={hint}>
                Dashboard → Developers → Webhook endpoints → Add :
                <code style={{ display: 'block', marginTop: 4, padding: 6, background: '#F1F5F9', borderRadius: 4, fontSize: 11 }}>{webhookUrl('gocardless')}</code>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
              <button onClick={() => supprimer('gocardless')} disabled={saving}
                style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                🗑 Supprimer les clés
              </button>
              <button onClick={() => save('gocardless', {
                mode: gcForm.mode,
                publicConfig: { creditor_id: gcForm.creditor_id || null },
                secrets: {
                  ...(gcForm.access_token ? { access_token: gcForm.access_token } : {}),
                  ...(gcForm.webhook_secret ? { webhook_secret: gcForm.webhook_secret } : {}),
                },
              })} disabled={saving} className="btn-primary">
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder GoCardless'}
              </button>
            </div>
          </div>
        )}

        {/* YOUSIGN FORM */}
        {provider === 'yousign' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={label}>Mode</label>
              <select value={ysForm.mode} onChange={e => setYsForm(f => ({ ...f, mode: e.target.value as any }))} style={inp}>
                <option value="test">Sandbox (test, signatures non légales)</option>
                <option value="live">Production (signatures eIDAS niveau simple)</option>
              </select>
            </div>
            <div>
              <label style={label}>Clé API YouSign (Bearer token)</label>
              <input type="password" value={ysForm.api_key} onChange={e => setYsForm(f => ({ ...f, api_key: e.target.value }))}
                placeholder={meta?.hints.api_key ? `Configurée (****${meta.hints.api_key})` : 'YouSign API key v3'} style={inp} />
              <div style={hint}>
                YouSign Dashboard → Paramètres → API & Webhooks → Créer une clé API.<br/>
                Mode sandbox : <code>app-sandbox.yousign.com</code> · Mode live : <code>app.yousign.com</code>
              </div>
            </div>
            <div>
              <label style={label}>Webhook Secret (optionnel mais recommandé)</label>
              <input type="password" value={ysForm.webhook_secret} onChange={e => setYsForm(f => ({ ...f, webhook_secret: e.target.value }))}
                placeholder={meta?.hints.webhook_secret ? `Configuré (****${meta.hints.webhook_secret})` : 'webhook secret'} style={inp} />
              <div style={hint}>
                YouSign Dashboard → Webhooks → Ajouter :
                <code style={{ display: 'block', marginTop: 4, padding: 6, background: '#F1F5F9', borderRadius: 4, fontSize: 11 }}>https://talmidapp.fr/api/yousign/webhook?ecole={ecole?.slug || ''}</code>
                Events à cocher : <code>signature_request.activated</code>, <code>signature_request.done</code>, <code>signature_request.declined</code>, <code>signature_request.expired</code>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
              <button onClick={() => supprimer('yousign')} disabled={saving}
                style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                🗑 Supprimer les clés
              </button>
              <button onClick={() => save('yousign', {
                mode: ysForm.mode,
                secrets: {
                  ...(ysForm.api_key ? { api_key: ysForm.api_key } : {}),
                  ...(ysForm.webhook_secret ? { webhook_secret: ysForm.webhook_secret } : {}),
                },
              })} disabled={saving} className="btn-primary">
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder YouSign'}
              </button>
            </div>
          </div>
        )}

        {/* BREVO SMS FORM */}
        {provider === 'brevo_sms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={label}>Nom expéditeur (11 caractères max, alphanumériques)</label>
              <input type="text" value={brevoForm.expediteur} maxLength={11} onChange={e => setBrevoForm(f => ({ ...f, expediteur: e.target.value }))} placeholder="TalmidApp" style={inp} />
              <div style={hint}>Apparaît comme expéditeur sur le téléphone des familles.</div>
            </div>
            <div>
              <label style={label}>Signature (optionnelle, ajoutée à la fin de chaque SMS)</label>
              <input type="text" value={brevoForm.signature} onChange={e => setBrevoForm(f => ({ ...f, signature: e.target.value }))} placeholder="L'équipe administrative" style={inp} />
            </div>
            <div>
              <label style={label}>Clé API Brevo (xkeysib-...)</label>
              <input type="password" value={brevoForm.api_key} onChange={e => setBrevoForm(f => ({ ...f, api_key: e.target.value }))}
                placeholder={meta?.hints.api_key ? `Configurée (****${meta.hints.api_key})` : 'xkeysib-...'} style={inp} />
              <div style={hint}>Brevo Dashboard → SMTP & API → API Keys → Generate a new API key (Brevo v3).</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
              <button onClick={() => supprimer('brevo_sms')} disabled={saving}
                style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                🗑 Supprimer les clés
              </button>
              <button onClick={() => save('brevo_sms', {
                publicConfig: { expediteur: brevoForm.expediteur, signature: brevoForm.signature || null },
                secrets: brevoForm.api_key ? { api_key: brevoForm.api_key } : {},
              })} disabled={saving} className="btn-primary">
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder Brevo SMS'}
              </button>
            </div>
          </div>
        )}

        {/* PAYPAL FORM */}
        {provider === 'paypal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={label}>Mode</label>
              <select value={paypalForm.mode} onChange={e => setPaypalForm(f => ({ ...f, mode: e.target.value as any }))} style={inp}>
                <option value="live">Live (production)</option>
                <option value="test">Sandbox (test)</option>
              </select>
            </div>
            <div>
              <label style={label}>Client ID</label>
              <input type="text" value={paypalForm.client_id} onChange={e => setPaypalForm(f => ({ ...f, client_id: e.target.value }))} placeholder="AY..." style={inp} />
              <div style={hint}>PayPal Developer Dashboard → Apps &amp; Credentials → votre application → Client ID.</div>
            </div>
            <div>
              <label style={label}>Client Secret</label>
              <input type="password" value={paypalForm.client_secret} onChange={e => setPaypalForm(f => ({ ...f, client_secret: e.target.value }))}
                placeholder={meta?.hints.client_secret ? `Configuré (****${meta.hints.client_secret}) — laissez vide pour ne pas changer` : 'EK...'} style={inp} />
              <div style={hint}>Même page PayPal → Secret. Stocké chiffré, jamais relu en clair.</div>
            </div>
            <div>
              <label style={label}>Webhook ID (optionnel)</label>
              <input type="password" value={paypalForm.webhook_id} onChange={e => setPaypalForm(f => ({ ...f, webhook_id: e.target.value }))}
                placeholder={meta?.hints.webhook_id ? `Configuré (****${meta.hints.webhook_id})` : 'webhook id'} style={inp} />
              <div style={hint}>
                PayPal Dashboard → Webhooks → Ajouter :
                <code style={{ display: 'block', marginTop: 4, padding: 6, background: '#F1F5F9', borderRadius: 4, fontSize: 11 }}>https://talmidapp.fr/api/paypal/webhook?ecole={ecole?.slug || ''}</code>
                Events : <code>CHECKOUT.ORDER.APPROVED</code>, <code>PAYMENT.CAPTURE.COMPLETED</code>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
              <button onClick={() => supprimer('paypal')} disabled={saving}
                style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                🗑 Supprimer les clés
              </button>
              <button onClick={() => save('paypal', {
                mode: paypalForm.mode,
                publicConfig: { client_id: paypalForm.client_id },
                secrets: {
                  ...(paypalForm.client_secret ? { client_secret: paypalForm.client_secret } : {}),
                  ...(paypalForm.webhook_id ? { webhook_id: paypalForm.webhook_id } : {}),
                },
              })} disabled={saving} className="btn-primary">
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder PayPal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
