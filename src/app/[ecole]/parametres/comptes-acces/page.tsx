'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { Niveau, NIVEAUX, NIVEAU_LABEL, NIVEAU_COLOR, TEMPLATES, loadPermissions } from '@/lib/permissions'

type Module = { code: string; nom: string; description: string | null; icone: string; ordre: number }
type Admin = { id: string; prenom: string | null; nom: string | null; email: string; role: string }

export default function ComptesAccesPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [admins, setAdmins] = useState<Admin[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [perms, setPerms] = useState<Record<string, Record<string, Niveau>>>({}) // profile_id -> module_code -> niveau
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [auditLog, setAuditLog] = useState<any[]>([])
  const [showAudit, setShowAudit] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ prenom: '', nom: '', email: '', template: 'admin_principal' })
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteOk, setInviteOk] = useState('')

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }
    // Check admin principal
    const mine = await loadPermissions(s, session.user.id, ecole.id)
    if (!mine.isAdminPrincipal) {
      setAuthorized(false); setLoading(false); return
    }
    setAuthorized(true)

    // Lister admins de l'école (role admin ou super_admin)
    const { data: profs } = await s.from('profiles_with_email')
      .select('id, prenom, nom, email, role')
      .eq('ecole_id', ecole.id)
      .in('role', ['admin', 'super_admin'])
      .order('nom')
    const adminsList = (profs ?? []) as Admin[]
    setAdmins(adminsList)
    if (adminsList.length > 0 && !selectedProfile) setSelectedProfile(adminsList[0].id)

    // Modules
    const { data: mods } = await s.from('modules').select('*').eq('actif', true).order('ordre')
    setModules((mods ?? []) as Module[])

    // Permissions
    const { data: pms } = await s.from('permissions_modules')
      .select('profile_id, module_code, niveau')
      .eq('ecole_id', ecole.id)
    const map: Record<string, Record<string, Niveau>> = {}
    for (const p of pms ?? []) {
      if (!map[p.profile_id]) map[p.profile_id] = {}
      map[p.profile_id][p.module_code] = p.niveau as Niveau
    }
    setPerms(map)

    // Audit log (last 30)
    const { data: au } = await s.from('permissions_audit')
      .select('*, acteur:acteur_id(prenom, nom), cible:cible_profile_id(prenom, nom)')
      .eq('ecole_id', ecole.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setAuditLog(au ?? [])

    setLoading(false)
  }

  async function setNiveau(profileId: string, moduleCode: string, niveau: Niveau) {
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const ancien = perms[profileId]?.[moduleCode] || 'aucun'
    await s.from('permissions_modules').upsert({
      profile_id: profileId, ecole_id: ecole.id, module_code: moduleCode, niveau,
      updated_by: session?.user.id, updated_at: new Date().toISOString(),
    })
    await s.from('permissions_audit').insert({
      acteur_id: session?.user.id, cible_profile_id: profileId, ecole_id: ecole.id,
      action: 'change_niveau',
      details: { module: moduleCode, ancien, nouveau: niveau },
    })
    setPerms(prev => ({ ...prev, [profileId]: { ...prev[profileId], [moduleCode]: niveau } }))
    setSaving(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteLoading(true); setInviteError(''); setInviteOk('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    try {
      const res = await fetch('/api/admin/creer-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          prenom: inviteForm.prenom,
          nom: inviteForm.nom,
          email: inviteForm.email,
          ecoleId: ecole.id,
          template: inviteForm.template,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setInviteOk(data.message || 'Invitation envoyée')
      setInviteForm({ prenom: '', nom: '', email: '', template: 'admin_principal' })
      await load()
      setTimeout(() => { setShowInvite(false); setInviteOk('') }, 2500)
    } catch (err: any) {
      setInviteError(err.message || 'Erreur')
    } finally {
      setInviteLoading(false)
    }
  }

  async function applyTemplate(profileId: string, templateKey: string) {
    if (!confirm(`Appliquer le template "${TEMPLATES[templateKey].label}" ? Toutes les permissions seront remplacées.`)) return
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const tpl = TEMPLATES[templateKey].permissions
    const rows = Object.entries(tpl).map(([code, niveau]) => ({
      profile_id: profileId, ecole_id: ecole.id, module_code: code, niveau,
      updated_by: session?.user.id, updated_at: new Date().toISOString(),
    }))
    await s.from('permissions_modules').upsert(rows)
    await s.from('permissions_audit').insert({
      acteur_id: session?.user.id, cible_profile_id: profileId, ecole_id: ecole.id,
      action: 'apply_template',
      details: { template: templateKey },
    })
    await load()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!authorized) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 22, marginBottom: 10 }}>🔒</div>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>Accès refusé</h2>
      <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Cette page est réservée aux admins principaux (permission "admin" sur le module Paramètres).</p>
    </div>
  )

  const selectedAdmin = admins.find(a => a.id === selectedProfile)
  const selectedPerms = selectedProfile ? perms[selectedProfile] || {} : {}

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#1E293B' }}>🔐 Comptes & accès</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowInvite(true)} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Inviter admin
          </button>
          <button onClick={() => setShowAudit(!showAudit)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {showAudit ? '← Permissions' : '📜 Historique'}
          </button>
        </div>
      </div>

      {showAudit ? (
        <div className="card" style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          {auditLog.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Aucune modification enregistrée</div>
          ) : auditLog.map(a => (
            <div key={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>{a.acteur ? `${a.acteur.prenom || ''} ${a.acteur.nom || ''}`.trim() : 'Système'}</strong>
                  {' → '}
                  <strong>{a.cible ? `${a.cible.prenom || ''} ${a.cible.nom || ''}`.trim() : '?'}</strong>
                  {a.action === 'change_niveau' && <> : module <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 3 }}>{a.details?.module}</code> passé de <em>{a.details?.ancien}</em> à <em>{a.details?.nouveau}</em></>}
                  {a.action === 'apply_template' && <> : template <strong>{a.details?.template}</strong></>}
                </div>
                <div style={{ color: '#94A3B8' }}>{new Date(a.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
          {/* Liste admins */}
          <div className="card" style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', padding: 8, height: 'fit-content' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', padding: '8px 10px' }}>Admins ({admins.length})</div>
            {admins.map(a => {
              const isSelected = a.id === selectedProfile
              return (
                <button key={a.id} onClick={() => setSelectedProfile(a.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: isSelected ? '#EFF6FF' : 'transparent', border: 'none', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', marginBottom: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#1E40AF' : '#1E293B' }}>
                    {`${a.prenom || ''} ${a.nom || ''}`.trim() || a.email.split('@')[0]}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>{a.email}</div>
                </button>
              )
            })}
          </div>

          {/* Détail permissions */}
          {selectedAdmin && (
            <div className="card" style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{`${selectedAdmin.prenom || ''} ${selectedAdmin.nom || ''}`.trim() || selectedAdmin.email}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{selectedAdmin.email} · {selectedAdmin.role}</div>
              </div>

              {/* Templates */}
              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>Appliquer un template</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(TEMPLATES).map(([key, t]) => (
                    <button key={key} onClick={() => applyTemplate(selectedAdmin.id, key)} title={t.description}
                      style={{ background: '#fff', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '5px 11px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tableau modules */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Module</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Niveau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map(m => {
                      const niveau = selectedPerms[m.code] || 'aucun'
                      const c = NIVEAU_COLOR[niveau]
                      return (
                        <tr key={m.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 16 }}>{m.icone}</span>
                              <div>
                                <div style={{ fontWeight: 600, color: '#1E293B' }}>{m.nom}</div>
                                {m.description && <div style={{ fontSize: 10, color: '#94A3B8' }}>{m.description}</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {NIVEAUX.map(n => {
                                const active = niveau === n
                                const col = NIVEAU_COLOR[n]
                                return (
                                  <button key={n} disabled={saving} onClick={() => setNiveau(selectedAdmin.id, m.code, n)}
                                    style={{ background: active ? col.bg : 'transparent', color: active ? col.fg : '#94A3B8', border: `1px solid ${active ? col.bg : '#E2E8F0'}`, borderRadius: 5, padding: '4px 9px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                    {NIVEAU_LABEL[n]}
                                  </button>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal inviter admin */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>+ Inviter un admin</h2>
              <button onClick={() => { setShowInvite(false); setInviteError(''); setInviteOk('') }} style={{ background: '#F1F5F9', border: 'none', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', fontSize: 13, color: '#64748B' }}>✕</button>
            </div>

            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Prénom *</label>
                  <input required value={inviteForm.prenom} onChange={e => setInviteForm(f => ({ ...f, prenom: e.target.value }))}
                    style={{ width: '100%', padding: '8px 11px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: '#1E293B', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Nom *</label>
                  <input required value={inviteForm.nom} onChange={e => setInviteForm(f => ({ ...f, nom: e.target.value }))}
                    style={{ width: '100%', padding: '8px 11px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: '#1E293B', outline: 'none' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Email *</label>
                <input required type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="prenom.nom@exemple.fr"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: '#1E293B', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Profil de permissions</label>
                <select value={inviteForm.template} onChange={e => setInviteForm(f => ({ ...f, template: e.target.value }))}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: '#1E293B', outline: 'none', background: '#fff' }}>
                  {Object.entries(TEMPLATES).map(([k, t]) => (
                    <option key={k} value={k}>{t.label} — {t.description}</option>
                  ))}
                </select>
              </div>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: '9px 11px', fontSize: 11, color: '#1E40AF' }}>
                💡 Un email sera envoyé à <strong>{inviteForm.email || 'l\'adresse'}</strong> avec un lien pour définir un mot de passe.
              </div>

              {inviteError && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 9, borderRadius: 7, fontSize: 12 }}>{inviteError}</div>}
              {inviteOk && <div style={{ background: '#ECFDF5', color: '#065F46', padding: 9, borderRadius: 7, fontSize: 12 }}>✓ {inviteOk}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowInvite(false)}
                  style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={inviteLoading}
                  style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: inviteLoading ? 'wait' : 'pointer', opacity: inviteLoading ? 0.6 : 1 }}>
                  {inviteLoading ? 'Envoi…' : '📧 Envoyer l\'invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
