'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function ComptesParentsPage() {
  const ecole = useEcole()
  const [familles, setFamilles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal création
  const [modal, setModal] = useState<any>(null) // { famille }
  const [form, setForm] = useState({ email: '', parentSlot: 'parent1' })
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [inviteRunning, setInviteRunning] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [renvoyantId, setRenvoyantId] = useState<string | null>(null)
  const [renvoiMsg, setRenvoiMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  const [supprId, setSupprId] = useState<string | null>(null)

  async function supprimerCompte(famille: any) {
    const compte = famille.comptes?.[0]
    if (!compte) return
    if (!confirm(`Supprimer le compte parent de ${famille.nom} ?\n\nLa famille et les données ne seront PAS supprimées, seulement l'accès portail. Le parent ne pourra plus se connecter avec ce compte.`)) return
    setSupprId(famille.id); setRenvoiMsg(null)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setRenvoiMsg({ ok: false, msg: 'Session expirée' }); setSupprId(null); return }
    const res = await fetch('/api/admin/supprimer-compte-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ profileId: compte.id, ecoleId: ecole.id }),
    })
    const json = await res.json()
    setRenvoiMsg({ ok: res.ok, msg: res.ok ? `✓ Compte supprimé pour ${famille.nom}` : `Erreur : ${json.error || 'inconnue'}` })
    setSupprId(null)
    await load()
    setTimeout(() => setRenvoiMsg(null), 5000)
  }

  async function renvoyerLien(famille: any) {
    if (!famille.parent1_email) {
      setRenvoiMsg({ ok: false, msg: `Pas d'email pour ${famille.nom}` })
      setTimeout(() => setRenvoiMsg(null), 4000)
      return
    }
    if (!confirm(`Renvoyer le lien d'activation à ${famille.parent1_email} ?`)) return
    setRenvoyantId(famille.id); setRenvoiMsg(null)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setRenvoiMsg({ ok: false, msg: 'Session expirée' }); setRenvoyantId(null); return }
    const res = await fetch('/api/admin/renvoyer-lien-magique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: famille.parent1_email, familleId: famille.id, ecoleId: ecole.id }),
    })
    const json = await res.json()
    setRenvoiMsg({ ok: res.ok, msg: res.ok ? `✓ ${json.message}` : `Erreur : ${json.error || 'inconnue'}` })
    setRenvoyantId(null)
    setTimeout(() => setRenvoiMsg(null), 5000)
  }

  useEffect(() => { load() }, [ecole.id])

  async function load() {
    setLoading(true)
    const s = createClient()

    // Récupérer familles + leurs comptes parents
    const { data: fams } = await s
      .from('familles')
      .select('id, nom, numero, parent1_prenom, parent1_nom, parent1_email, parent2_prenom, parent2_nom, parent2_email')
      .eq('ecole_id', ecole.id)
      .order('nom')

    // Récupérer les profiles parents liés
    const { data: parentProfiles } = await s
      .from('profiles')
      .select('id, famille_id, ecole_id')
      .eq('role', 'parent')
      .eq('ecole_id', ecole.id)

    // Récupérer les emails des parents (via auth — on a juste les IDs)
    // On fait un join manuel
    const familleMap = new Map()
    parentProfiles?.forEach(p => {
      if (!familleMap.has(p.famille_id)) familleMap.set(p.famille_id, [])
      familleMap.get(p.famille_id).push(p)
    })

    const enriched = (fams ?? []).map(f => ({
      ...f,
      comptes: familleMap.get(f.id) || [],
    }))

    setFamilles(enriched)
    setLoading(false)
  }

  function openModal(famille: any) {
    setModal({ famille })
    // Pré-remplir avec email parent1 si disponible
    setForm({
      email: famille.parent1_email || '',
      parentSlot: 'parent1',
    })
    setResult(null)
  }

  async function creerCompte() {
    if (!form.email) { setResult({ ok: false, msg: 'Email requis' }); return }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) { setResult({ ok: false, msg: 'Adresse email invalide' }); return }

    setCreating(true); setResult(null)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setResult({ ok: false, msg: 'Session expirée' }); setCreating(false); return }

    const res = await fetch('/api/admin/creer-parent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: form.email,
        familleId: modal.famille.id,
        ecoleId: ecole.id,
        parentSlot: form.parentSlot,
      }),
    })

    const json = await res.json()
    if (res.ok) {
      const emailStatus = json.email?.envoye
        ? ' Un email d\'activation a été envoyé au parent.'
        : json.email?.erreur
          ? ` ⚠️ Email d'activation non envoyé : ${json.email.erreur}`
          : ''
      setResult({ ok: true, msg: (json.existed ? `Compte existant lié à ${modal.famille.nom} ✓` : `Compte créé pour ${form.email} ✓`) + emailStatus })
      await load()
      setTimeout(() => { setModal(null); setResult(null) }, 3500)
    } else {
      setResult({ ok: false, msg: json.error || 'Erreur' })
    }
    setCreating(false)
  }

  async function inviterToutes() {
    const sansCompteCount = familles.filter(f => f.comptes.length === 0).length
    if (sansCompteCount === 0) { setInviteMsg('Toutes les familles ont deja un compte parent.'); return }
    if (!confirm(`Creer un compte et envoyer l'email de bienvenue a ${sansCompteCount} famille(s) sans compte ?`)) return
    setInviteRunning(true); setInviteMsg('Invitation en cours...')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    let totalInvited = 0
    const allErrors: string[] = []
    try {
      for (let i = 0; i < 300; i++) {
        const res = await fetch('/api/admin/inviter-familles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ ecoleId: ecole.id, batchSize: 8 }),
        })
        const data = await res.json()
        if (!res.ok) { allErrors.push(data.error || 'Erreur serveur'); break }
        totalInvited += data.invited || 0
        if (data.erreurs?.length) allErrors.push(...data.erreurs)
        setInviteMsg(`${totalInvited} compte(s) cree(s)... ${data.restant} restant(s)`)
        if (data.done) break
      }
    } catch (e: any) {
      allErrors.push('Erreur reseau : ' + (e?.message || ''))
    }
    setInviteRunning(false)
    setInviteMsg(`${totalInvited} compte(s) cree(s) et email(s) de bienvenue envoye(s).` + (allErrors.length ? ` ${allErrors.length} echec(s) (voir console).` : ''))
    if (allErrors.length) console.warn('Invitations en echec :', allErrors)
    await load()
  }

  const filtered = familles.filter(f => {
    if (!search) return true
    const q = search.toLowerCase()
    return f.nom?.toLowerCase().includes(q) ||
      f.parent1_nom?.toLowerCase().includes(q) ||
      f.parent1_prenom?.toLowerCase().includes(q) ||
      f.parent1_email?.toLowerCase().includes(q)
  })

  const avecCompte = familles.filter(f => f.comptes.length > 0).length
  const sansCompte = familles.filter(f => f.comptes.length === 0).length

  const inp = {
    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
    padding: '9px 12px', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Comptes parents</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
            Créez les accès portail pour chaque famille
          </p>
        </div>
        <button onClick={inviterToutes} disabled={inviteRunning} className="btn-primary">
          {inviteRunning ? 'Invitation en cours…' : '✉️ Inviter toutes les familles sans compte'}
        </button>
      </div>
      {inviteMsg && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', color: '#1E40AF', fontSize: 13 }}>
          {inviteMsg}
        </div>
      )}

      {renvoiMsg && (
        <div style={{ background: renvoiMsg.ok ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${renvoiMsg.ok ? '#A7F3D0' : '#FECACA'}`, borderRadius: 10, padding: '10px 14px', color: renvoiMsg.ok ? '#065F46' : '#991B1B', fontSize: 13 }}>
          {renvoiMsg.msg}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Total familles', value: familles.length, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Avec compte portail', value: avecCompte, color: '#10B981', bg: '#ECFDF5' },
          { label: 'Sans compte', value: sansCompte, color: '#F59E0B', bg: '#FFFBEB' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{loading ? '—' : s.value}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Barre recherche */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>🔍</span>
        <input style={{ ...inp, paddingLeft: 36 }} value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une famille..." />
      </div>

      {/* Tableau */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            {search ? `Aucun résultat pour « ${search} »` : 'Aucune famille'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Famille', 'Responsable 1', 'Email', 'Portail', ''].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const aCompte = f.comptes.length > 0
                return (
                  <tr key={f.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>{f.nom}</div>
                      {f.numero && <div style={{ fontSize: 11, color: '#94A3B8' }}>N° {f.numero}</div>}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: '#475569' }}>
                      {[f.parent1_prenom, f.parent1_nom].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B' }}>
                      {f.parent1_email || '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {aCompte ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, padding: '3px 12px' }}>
                          ✓ Actif ({f.comptes.length})
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '3px 12px' }}>
                          Aucun compte
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {aCompte && (
                          <button onClick={() => renvoyerLien(f)} disabled={renvoyantId === f.id}
                            title="Renvoyer un email avec un nouveau lien d'activation"
                            style={{
                              fontSize: 12, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 500,
                              background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A',
                            }}>
                            {renvoyantId === f.id ? '...' : '📧 Renvoyer lien'}
                          </button>
                        )}
                        {aCompte && (
                          <button onClick={() => supprimerCompte(f)} disabled={supprId === f.id}
                            title="Supprimer le compte portail (la famille reste)"
                            style={{
                              fontSize: 12, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 500,
                              background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA',
                            }}>
                            {supprId === f.id ? '...' : '🗑 Supprimer compte'}
                          </button>
                        )}
                        <button onClick={() => openModal(f)}
                          style={{
                            fontSize: 12, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 500,
                            background: aCompte ? '#F1F5F9' : '#2563EB',
                            color: aCompte ? '#475569' : '#fff',
                            border: aCompte ? '1px solid #E2E8F0' : 'none',
                          }}>
                          {aCompte ? '+ Ajouter compte' : 'Créer accès'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal création compte */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>
                Créer un accès portail
              </h2>
              <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                Famille <strong>{modal.famille.nom}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pour quel parent
                </label>
                <select style={inp} value={form.parentSlot} onChange={e => {
                  const slot = e.target.value
                  const em = slot === 'parent2' ? (modal.famille.parent2_email || '') : (modal.famille.parent1_email || '')
                  setForm(p => ({ ...p, parentSlot: slot, email: em }))
                }}>
                  <option value="parent1">Parent 1 — {[modal.famille.parent1_prenom, modal.famille.parent1_nom].filter(Boolean).join(' ') || 'Parent 1'}</option>
                  <option value="parent2">Parent 2 — {[modal.famille.parent2_prenom, modal.famille.parent2_nom].filter(Boolean).join(' ') || 'Parent 2'}</option>
                </select>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Pour les familles séparées, créez un accès distinct pour chaque parent.</div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Adresse email
                </label>
                <input style={inp} type="email" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="parent@email.fr" />
                {modal.famille.parent1_email && form.email !== modal.famille.parent1_email && (
                  <button onClick={() => setForm(p => ({ ...p, email: modal.famille.parent1_email }))}
                    style={{ fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>
                    Utiliser {modal.famille.parent1_email}
                  </button>
                )}
              </div>

              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '12px 14px', fontSize: 12, color: '#1E40AF', lineHeight: 1.6 }}>
                <strong>📧 Activation par email</strong><br/>
                Le parent recevra un email avec un lien sécurisé pour activer son compte et choisir son propre mot de passe. Vous n'avez pas besoin de lui transmettre d'identifiants.
              </div>

              {result && (
                <div style={{
                  background: result.ok ? 'rgba(16,185,129,0.1)' : '#FEF2F2',
                  border: `1px solid ${result.ok ? 'rgba(16,185,129,0.3)' : '#FECACA'}`,
                  borderRadius: 8, padding: '10px 14px',
                  color: result.ok ? '#059669' : '#DC2626', fontSize: 13,
                }}>
                  {result.msg}
                </div>
              )}

              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748B' }}>
                💡 Le parent se connectera sur{' '}
                <strong>talmidapp.fr/{ecole.slug}/login</strong>{' '}
                → Espace Parents
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(null)}
                style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={creerCompte} disabled={creating}
                style={{ background: '#2563EB', border: 'none', borderRadius: 9, padding: '10px 22px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
                {creating ? 'Création...' : '✓ Créer l\'accès'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
