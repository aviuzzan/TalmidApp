'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * iiii5 — Super admin : fiches de bienvenue des nouvelles écoles.
 * Générer un lien /bienvenue/<token>, suivre les statuts, consulter une
 * soumission (données + fichiers en URLs signées) et la marquer validée.
 * La création effective de l'école reste l'assistant « Nouvelle école »
 * (+ import CSV) : la validation ici fige la fiche côté établissement.
 */

type Fiche = {
  id: string; token: string; nom_ecole: string; produit: string; email_destinataire: string | null
  statut: string; created_at: string; soumis_le: string | null; valide_le: string | null
}

const STATUTS: Record<string, { label: string; bg: string; fg: string }> = {
  envoye: { label: 'Envoyée — en attente', bg: '#FEF3C7', fg: '#92400E' },
  soumis: { label: 'Soumise — à examiner', bg: '#DBEAFE', fg: '#1D4ED8' },
  valide: { label: 'Validée', bg: '#D1FAE5', fg: '#065F46' },
}

export default function AdminOnboardingPage() {
  const [fiches, setFiches] = useState<Fiche[]>([])
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauProduit, setNouveauProduit] = useState<'talmidapp' | 'yeter'>('talmidapp')
  const [nouveauEmail, setNouveauEmail] = useState('')

  const api = useCallback(async (init?: RequestInit, query = '') => {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Session expirée — reconnectez-vous.')
    const res = await fetch('/api/admin/onboarding' + query, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(init?.headers || {}) },
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erreur serveur')
    return json
  }, [])

  const charger = useCallback(async () => {
    setLoading(true)
    try { const json = await api(); setFiches(json.fiches || []) } catch (e: any) { setMsg('⚠️ ' + e.message) }
    setLoading(false)
  }, [api])
  useEffect(() => { charger() }, [charger])

  async function creer() {
    if (!nouveauNom.trim()) { setMsg('⚠️ Indiquez le nom de l\'établissement.'); return }
    setBusy(true); setMsg('')
    try {
      const json = await api({ method: 'POST', body: JSON.stringify({ nomEcole: nouveauNom, produit: nouveauProduit, emailDestinataire: nouveauEmail }) })
      await navigator.clipboard.writeText(json.url).catch(() => {})
      setMsg('✅ Lien créé et copié : ' + json.url)
      setNouveauNom(''); setNouveauEmail('')
      await charger()
    } catch (e: any) { setMsg('⚠️ ' + e.message) }
    setBusy(false)
  }

  async function ouvrirDetail(id: string) {
    setBusy(true); setMsg('')
    try { const json = await api(undefined, `?id=${id}`); setDetail(json.fiche) } catch (e: any) { setMsg('⚠️ ' + e.message) }
    setBusy(false)
  }

  const [validerConfirme, setValiderConfirme] = useState('')
  async function valider(id: string) {
    // Confirmation en deux temps, sans dialogue natif du navigateur (dddd1)
    if (validerConfirme !== id) { setValiderConfirme(id); setMsg('⚠️ Cliquez à nouveau sur « Valider » pour confirmer — l\'établissement ne pourra plus modifier sa fiche.'); return }
    setValiderConfirme('')
    setBusy(true)
    try { await api({ method: 'PATCH', body: JSON.stringify({ id, action: 'valider' }) }); setMsg('✅ Fiche validée.'); setDetail(null); await charger() }
    catch (e: any) { setMsg('⚠️ ' + e.message) }
    setBusy(false)
  }

  function copierLien(f: Fiche) {
    const url = `https://www.talmidapp.fr/bienvenue/${f.token}`
    navigator.clipboard.writeText(url).then(() => setMsg('✅ Lien copié : ' + url)).catch(() => setMsg(url))
  }

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13.5 }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E6EAF2', borderRadius: 14, padding: 20, marginTop: 16 }

  const D = detail
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>📝 Fiches de bienvenue</h1>
      <p style={{ fontSize: 13.5, color: '#64748B', marginTop: 6 }}>
        Générez un lien à envoyer à la direction d&apos;une nouvelle école : elle remplit tout en ligne
        (infos, équipe, tarifs, fichiers), vous examinez puis validez avant de créer l&apos;école.
      </p>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Nouveau lien</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input style={{ ...inp, flex: 2, minWidth: 200 }} placeholder="Nom de l'établissement" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)} />
          <select style={{ ...inp, flex: 1, minWidth: 130 }} value={nouveauProduit} onChange={e => setNouveauProduit(e.target.value as any)}>
            <option value="talmidapp">TalmidApp</option>
            <option value="yeter">Yeter</option>
          </select>
          <input style={{ ...inp, flex: 2, minWidth: 200 }} placeholder="Email du destinataire (facultatif)" value={nouveauEmail} onChange={e => setNouveauEmail(e.target.value)} />
          <button disabled={busy} onClick={creer}
            style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            Créer le lien
          </button>
        </div>
      </div>

      {msg && <div style={{ ...card, fontSize: 13.5, color: msg.startsWith('✅') ? '#047857' : '#B45309', wordBreak: 'break-all' }}>{msg}</div>}

      <div style={card}>
        {loading ? <div style={{ color: '#94A3B8', fontSize: 13.5 }}>Chargement…</div> :
         fiches.length === 0 ? <div style={{ color: '#94A3B8', fontSize: 13.5 }}>Aucune fiche pour le moment.</div> :
         fiches.map(f => {
           const st = STATUTS[f.statut] || STATUTS.envoye
           return (
             <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
               <div style={{ flex: 2, minWidth: 160 }}>
                 <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{f.nom_ecole}</div>
                 <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{f.produit === 'yeter' ? 'Yeter' : 'TalmidApp'} · créée le {new Date(f.created_at).toLocaleDateString('fr-FR')}{f.soumis_le ? ' · soumise le ' + new Date(f.soumis_le).toLocaleDateString('fr-FR') : ''}</div>
               </div>
               <span style={{ fontSize: 11.5, fontWeight: 700, background: st.bg, color: st.fg, borderRadius: 999, padding: '4px 12px' }}>{st.label}</span>
               <button onClick={() => copierLien(f)} style={{ ...inp, cursor: 'pointer', fontWeight: 600, color: '#334155' }}>Copier le lien</button>
               <button onClick={() => ouvrirDetail(f.id)} style={{ ...inp, cursor: 'pointer', fontWeight: 600, color: '#1D4ED8' }}>Voir</button>
             </div>
           )
         })}
      </div>

      {D && (
        <div style={{ ...card, border: '2px solid #C7D2FE' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }}>{D.nom_ecole} — fiche {STATUTS[D.statut]?.label?.toLowerCase() || D.statut}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {D.statut === 'soumis' && (
                <button disabled={busy} onClick={() => valider(D.id)}
                  style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  ✓ Valider la fiche
                </button>
              )}
              <button onClick={() => setDetail(null)} style={{ ...inp, cursor: 'pointer' }}>Fermer</button>
            </div>
          </div>
          <pre style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 14, color: '#1E293B' }}>
{JSON.stringify(D.donnees, null, 2)}
          </pre>
          {(D.fichiers || []).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Fichiers reçus</div>
              {(D.fichiers as any[]).map((f, i) => (
                <div key={i} style={{ fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: '#64748B' }}>[{f.champ}]</span>{' '}
                  {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#1D4ED8' }}>{f.nom}</a> : f.nom}
                  <span style={{ color: '#94A3B8' }}> · {Math.round((f.taille || 0) / 1024)} Ko</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
