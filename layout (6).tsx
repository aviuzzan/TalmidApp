'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const PLANS = [
  { value: 'starter', label: 'Starter', desc: 'Jusqu\'à 50 élèves', price: '0.80€/élève' },
  { value: 'pro', label: 'Pro', desc: 'Jusqu\'à 200 élèves', price: '1€/élève' },
  { value: 'enterprise', label: 'Enterprise', desc: 'Illimité', price: 'Sur devis' },
]

const COULEURS = [
  '#2563EB', '#7C3AED', '#059669', '#DC2626',
  '#D97706', '#0891B2', '#DB2777', '#1D4ED8',
]

function slugify(str: string) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30)
}

export default function NouvelleEcolePage() {
  const router = useRouter()
  const [form, setForm] = useState({
    nom: '',
    slug: '',
    couleur_primaire: '#2563EB',
    email_contact: '',
    telephone: '',
    adresse: '',
    ville: '',
    plan: 'pro',
    notes_admin: '',
  })
  const [slugManuel, setSlugManuel] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<1 | 2>(1)

  function set(key: string, val: string) {
    setForm(p => {
      const next = { ...p, [key]: val }
      if (key === 'nom' && !slugManuel) next.slug = slugify(val)
      return next
    })
  }

  async function creer() {
    if (!form.nom.trim() || !form.slug.trim()) { setError('Nom et slug obligatoires'); return }
    setLoading(true); setError('')

    const s = createClient()

    // Vérifier que le slug n'existe pas
    const { data: existing } = await s.from('ecoles').select('id').eq('slug', form.slug).single()
    if (existing) { setError(`Le slug « ${form.slug} » est déjà utilisé.`); setLoading(false); return }

    const { data: ecole, error: err } = await s.from('ecoles').insert({
      nom: form.nom,
      slug: form.slug,
      couleur_primaire: form.couleur_primaire,
      email_contact: form.email_contact || null,
      telephone: form.telephone || null,
      adresse: form.adresse || null,
      ville: form.ville || null,
      plan: form.plan,
      notes_admin: form.notes_admin || null,
      actif: true,
      date_debut_abonnement: new Date().toISOString().split('T')[0],
    }).select().single()

    if (err) { setError(err.message); setLoading(false); return }

    // Logger l'action
    const { data: { session } } = await s.auth.getSession()
    if (session) {
      await s.from('admin_logs').insert({
        admin_id: session.user.id,
        ecole_id: ecole.id,
        action: 'ecole_creee',
        details: { nom: form.nom, slug: form.slug, plan: form.plan },
      })
    }

    router.push(`/admin/ecoles/${ecole.id}?created=1`)
  }

  const inp = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '10px 14px', color: '#F1F5F9', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
  }
  const lbl = { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 6, letterSpacing: '0.03em' }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
        <button onClick={() => router.push('/admin/dashboard')}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 14px', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
          ← Retour
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>Nouvelle école</h1>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 2 }}>Créer un espace école sur TalmidApp</p>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {[{ n: 1, label: 'Identité' }, { n: 2, label: 'Plan & config' }].map(s => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: step >= s.n ? '#6366F1' : 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: step >= s.n ? '#fff' : 'rgba(255,255,255,0.3)',
            }}>{s.n}</div>
            <span style={{ fontSize: 13, color: step >= s.n ? '#A5B4FC' : 'rgba(255,255,255,0.3)', fontWeight: step >= s.n ? 600 : 400 }}>{s.label}</span>
            {s.n < 2 && <div style={{ flex: 1, height: 1, background: step > s.n ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)' }} />}
          </div>
        ))}
      </div>

      <div style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28 }}>

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Nom */}
            <div>
              <label style={lbl}>NOM DE L'ÉCOLE *</label>
              <input style={inp} value={form.nom} onChange={e => set('nom', e.target.value)}
                placeholder="Ex : Heder Loubavitch, École Beth Rivkah..." />
            </div>

            {/* Slug */}
            <div>
              <label style={lbl}>URL DE L'ESPACE *</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
                <span style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.25)', fontSize: 13, borderRight: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>talmidapp.fr/</span>
                <input
                  style={{ ...inp, border: 'none', background: 'transparent', flex: 1, borderRadius: 0 }}
                  value={form.slug}
                  onChange={e => { setSlugManuel(true); set('slug', slugify(e.target.value)) }}
                  placeholder="nomdelecole"
                />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 5 }}>
                Généré automatiquement · minuscules, sans espaces ni accents
              </div>
            </div>

            {/* Couleur */}
            <div>
              <label style={lbl}>COULEUR PRINCIPALE</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {COULEURS.map(c => (
                  <button key={c} onClick={() => set('couleur_primaire', c)}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                      outline: form.couleur_primaire === c ? `3px solid ${c}` : 'none',
                      outlineOffset: 2, transform: form.couleur_primaire === c ? 'scale(1.15)' : 'scale(1)',
                      transition: 'all 0.15s',
                    }} />
                ))}
                <input type="color" value={form.couleur_primaire}
                  onChange={e => set('couleur_primaire', e.target.value)}
                  style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'none' }} />
              </div>
            </div>

            {/* Preview URL */}
            {form.slug && (
              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: '#818CF8', fontWeight: 600, marginBottom: 4 }}>APERÇU</div>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#A5B4FC' }}>
                  talmidapp.fr/{form.slug}/login
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#A5B4FC' }}>
                  talmidapp.fr/{form.slug}/dashboard
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { if (!form.nom || !form.slug) { setError('Nom et slug obligatoires'); return } setError(''); setStep(2) }}
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', border: 'none', borderRadius: 10, padding: '11px 24px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Suivant →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Plan */}
            <div>
              <label style={lbl}>PLAN D'ABONNEMENT</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {PLANS.map(p => (
                  <button key={p.value} onClick={() => set('plan', p.value)}
                    style={{
                      flex: 1, padding: '14px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                      border: form.plan === p.value ? '2px solid #6366F1' : '1px solid rgba(255,255,255,0.08)',
                      background: form.plan === p.value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                      transition: 'all 0.15s',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: form.plan === p.value ? '#A5B4FC' : '#94A3B8' }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{p.desc}</div>
                    <div style={{ fontSize: 12, color: form.plan === p.value ? '#818CF8' : 'rgba(255,255,255,0.25)', marginTop: 4, fontWeight: 600 }}>{p.price}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Contact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>EMAIL DE CONTACT</label>
                <input style={inp} type="email" value={form.email_contact} onChange={e => set('email_contact', e.target.value)} placeholder="admin@ecole.fr" />
              </div>
              <div>
                <label style={lbl}>TÉLÉPHONE</label>
                <input style={inp} value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="01 23 45 67 89" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>ADRESSE</label>
                <input style={inp} value={form.adresse} onChange={e => set('adresse', e.target.value)} placeholder="12 rue de la Paix" />
              </div>
              <div>
                <label style={lbl}>VILLE</label>
                <input style={inp} value={form.ville} onChange={e => set('ville', e.target.value)} placeholder="Paris" />
              </div>
            </div>

            <div>
              <label style={lbl}>NOTES INTERNES (visibles uniquement par toi)</label>
              <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={form.notes_admin}
                onChange={e => set('notes_admin', e.target.value)}
                placeholder="Informations sur l'école, conditions particulières..." />
            </div>

            {error && (
              <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 14px', color: '#F87171', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setStep(1)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '11px 20px', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
                ← Retour
              </button>
              <button onClick={creer} disabled={loading}
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Création...' : '🚀 Créer l\'école'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
