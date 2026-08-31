'use client'
import { useState } from 'react'

/**
 * aaaa2 — Formulaire « Demander une démo » des vitrines (POST /api/demande-demo,
 * email a admin@talmidapp.fr avec Reply-To = le demandeur). Champ « website »
 * = pot de miel anti-robots : invisible pour un humain, un robot qui le
 * remplit recoit un faux OK et rien n'est envoye.
 */
export default function DemandeDemoForm({ clair = false, gradient, produit }: { clair?: boolean; gradient: string; produit: 'talmidapp' | 'yeter' }) {
  const [form, setForm] = useState({ nom: '', etablissement: '', email: '', telephone: '', message: '', website: '' })
  const [envoi, setEnvoi] = useState(false)
  const [ok, setOk] = useState(false)
  const [erreur, setErreur] = useState('')

  const texte = clair ? '#1E1B2E' : '#F1F5F9'
  const secondaire = clair ? '#5B5675' : '#A9B4C8'
  const bord = clair ? '#ECEAF4' : 'rgba(255,255,255,0.1)'
  const inp = {
    // dddd5 : 16px minimum, sinon iOS zoome automatiquement sur le champ a la saisie
    width: '100%', boxSizing: 'border-box' as const, padding: '11px 14px', borderRadius: 10, fontSize: 16,
    background: clair ? '#FAFAFD' : 'rgba(255,255,255,0.05)', border: '1px solid ' + bord, color: texte, outline: 'none',
  }
  const lbl = { fontSize: 12, fontWeight: 600 as const, color: secondaire, display: 'block', marginBottom: 6 }

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function envoyer() {
    if (!form.nom.trim() || !form.etablissement.trim() || !form.email.trim()) {
      setErreur('Merci de renseigner au moins votre nom, votre établissement et votre email.')
      return
    }
    setEnvoi(true); setErreur('')
    try {
      const res = await fetch('/api/demande-demo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, produit }),
      })
      const data = await res.json()
      if (!res.ok) { setErreur(data.error || "L'envoi a échoué, réessayez."); setEnvoi(false); return }
      setOk(true)
    } catch {
      setErreur("L'envoi a échoué, vérifiez votre connexion et réessayez.")
    }
    setEnvoi(false)
  }

  if (ok) {
    return (
      <div style={{ textAlign: 'center', padding: '34px 20px' }}>
        <div style={{ fontSize: 40 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: texte, marginTop: 10 }}>Demande bien reçue !</div>
        <div style={{ fontSize: 14, color: secondaire, marginTop: 6, lineHeight: 1.6 }}>
          Nous revenons vers vous très rapidement pour organiser votre démonstration.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'start' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div>
          <label style={lbl}>Votre nom *</label>
          <input style={inp} value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Prénom et nom" />
        </div>
        <div>
          <label style={lbl}>Établissement *</label>
          <input style={inp} value={form.etablissement} onChange={e => set('etablissement', e.target.value)} placeholder="Nom de votre structure" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div>
          <label style={lbl}>Email *</label>
          <input style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="vous@exemple.fr" />
        </div>
        <div>
          <label style={lbl}>Téléphone</label>
          <input style={inp} value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="06 12 34 56 78" />
        </div>
      </div>
      <div>
        <label style={lbl}>Votre besoin (facultatif)</label>
        <textarea style={{ ...inp, minHeight: 84, resize: 'vertical' as const }} value={form.message}
          onChange={e => set('message', e.target.value)}
          placeholder="Nombre d'enfants, fonctionnement actuel, questions…" />
      </div>
      {/* Pot de miel anti-robots : ne pas remplir */}
      <input value={form.website} onChange={e => set('website', e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: 'absolute', insetInlineStart: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
      {erreur && (
        <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 9, padding: '10px 14px', color: clair ? '#B91C1C' : '#F87171', fontSize: 13 }}>
          {erreur}
        </div>
      )}
      <button onClick={envoyer} disabled={envoi}
        style={{
          background: gradient, border: 'none', borderRadius: 12, padding: '14px 28px', color: '#fff',
          fontSize: 15, fontWeight: 800, cursor: envoi ? 'not-allowed' : 'pointer', opacity: envoi ? 0.7 : 1,
        }}>
        {envoi ? 'Envoi en cours…' : 'Demander une démo gratuite'}
      </button>
      <div style={{ fontSize: 11.5, color: secondaire, textAlign: 'center' }}>
        Vos coordonnées servent uniquement à vous recontacter pour la démonstration.
      </div>
    </div>
  )
}
