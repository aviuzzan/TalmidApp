'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Tab = 'envoyer' | 'templates' | 'historique'

const VARIABLES_DISPO = [
  { var: '{{nom_famille}}', desc: 'Nom de la famille' },
  { var: '{{prenom_parent1}}', desc: 'Prénom parent 1' },
  { var: '{{nom_parent1}}', desc: 'Nom parent 1' },
  { var: '{{prenom_parent2}}', desc: 'Prénom parent 2' },
  { var: '{{solde_restant}}', desc: 'Solde restant dû' },
  { var: '{{total_facture}}', desc: 'Total facturé' },
  { var: '{{total_regle}}', desc: 'Total réglé' },
  { var: '{{nb_enfants}}', desc: 'Nombre d\'enfants' },
  { var: '{{annee_scolaire}}', desc: 'Année scolaire' },
]

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('envoyer')
  const [templates, setTemplates] = useState<any[]>([])
  const [familles, setFamilles] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Formulaire envoi
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [sujet, setSujet] = useState('')
  const [contenu, setContenu] = useState('')
  const [destinataires, setDestinataires] = useState<'tous' | 'solde' | 'selection'>('tous')
  const [famillesSelectionnees, setFamillesSelectionnees] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<any>(null)

  // Formulaire template
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [editTemplate, setEditTemplate] = useState<any>(null)
  const [tplForm, setTplForm] = useState({ nom: '', sujet: '', contenu_html: '', description: '' })
  const [savingTpl, setSavingTpl] = useState(false)

  const supabase = createClient()

  const load = useCallback(async () => {
    const [{ data: tpl }, { data: fam }, { data: lg }] = await Promise.all([
      supabase.from('email_templates').select('*').eq('actif', true).order('date_creation'),
      supabase.from('familles').select('id, nom, numero, parent1_email').order('nom'),
      supabase.from('email_logs').select('*, familles(nom), email_templates(nom)').order('date_envoi', { ascending: false }).limit(50),
    ])
    setTemplates(tpl ?? [])
    setFamilles(fam ?? [])
    setLogs(lg ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function loadTemplate(tpl: any) {
    setSelectedTemplate(tpl)
    setSujet(tpl.sujet)
    setContenu(tpl.contenu_html)
  }

  function toggleFamille(id: string) {
    setFamillesSelectionnees(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  async function handleSend() {
    setSending(true); setSendResult(null)

    const { data: { session } } = await supabase.auth.getSession()

    let famille_ids: string[] = []
    if (destinataires === 'tous') {
      famille_ids = familles.map(f => f.id)
    } else if (destinataires === 'solde') {
      // Familles avec solde > 0
      const { data: facts } = await supabase
        .from('factures_solde')
        .select('famille_id, solde_restant')
        .gt('solde_restant', 0)
      famille_ids = facts?.map((f: any) => f.famille_id) ?? []
    } else {
      famille_ids = famillesSelectionnees
    }

    if (!famille_ids.length) {
      setSendResult({ error: 'Aucune famille sélectionnée' })
      setSending(false); return
    }

    const res = await fetch('/api/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        famille_ids,
        sujet,
        contenu_html: contenu,
        template_id: selectedTemplate?.id ?? null,
        admin_id: session?.user.id,
      }),
    })

    const data = await res.json()
    setSendResult(data)
    if (data.success) load()
    setSending(false)
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault(); setSavingTpl(true)
    if (editTemplate) {
      await supabase.from('email_templates').update({
        nom: tplForm.nom, sujet: tplForm.sujet,
        contenu_html: tplForm.contenu_html, description: tplForm.description,
        date_modif: new Date().toISOString(),
      }).eq('id', editTemplate.id)
    } else {
      await supabase.from('email_templates').insert({
        nom: tplForm.nom, sujet: tplForm.sujet,
        contenu_html: tplForm.contenu_html, description: tplForm.description,
      })
    }
    setShowTemplateForm(false); setEditTemplate(null)
    setTplForm({ nom: '', sujet: '', contenu_html: '', description: '' })
    load(); setSavingTpl(false)
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Supprimer ce template ?')) return
    await supabase.from('email_templates').update({ actif: false }).eq('id', id)
    load()
  }

  const inp = { width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none' }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'envoyer', label: '📤 Envoyer un email' },
    { id: 'templates', label: `📝 Templates (${templates.length})` },
    { id: 'historique', label: `📋 Historique (${logs.length})` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Notifications Email</h1>
        <p style={{ color: '#64748B', fontSize: 13 }}>Envoyez des emails personnalisés aux familles via Brevo</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #E2E8F0' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, background: 'transparent', color: tab === t.id ? '#2563EB' : '#64748B', borderBottom: tab === t.id ? '2px solid #2563EB' : '2px solid transparent', marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ONGLET ENVOYER ── */}
      {tab === 'envoyer' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Choisir un template */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>1. Choisir un template (optionnel)</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {templates.map(t => (
                  <button key={t.id} onClick={() => loadTemplate(t)}
                    style={{
                      padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                      background: selectedTemplate?.id === t.id ? '#EFF6FF' : '#F8FAFC',
                      color: selectedTemplate?.id === t.id ? '#2563EB' : '#475569',
                      border: `1px solid ${selectedTemplate?.id === t.id ? '#BFDBFE' : '#E2E8F0'}`,
                    }}>
                    {t.nom}
                  </button>
                ))}
              </div>
            </div>

            {/* Sujet */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>2. Sujet de l'email</h3>
              <input style={inp} value={sujet} onChange={e => setSujet(e.target.value)} placeholder="Ex: Rappel de solde — {{nom_famille}}" />
            </div>

            {/* Contenu */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>3. Contenu HTML</h3>
              <textarea
                style={{ ...inp, height: 280, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                value={contenu}
                onChange={e => setContenu(e.target.value)}
                placeholder="<h2>Bonjour {{prenom_parent1}},</h2>..."
              />
            </div>

            {/* Destinataires */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>4. Destinataires</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { val: 'tous', label: `📨 Toutes les familles (${familles.length})`, color: '#2563EB' },
                  { val: 'solde', label: '💰 Familles avec solde restant > 0', color: '#D97706' },
                  { val: 'selection', label: '🎯 Sélection manuelle', color: '#059669' },
                ].map(opt => (
                  <label key={opt.val} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', background: destinataires === opt.val ? '#F8FAFC' : 'transparent', border: `1px solid ${destinataires === opt.val ? '#E2E8F0' : 'transparent'}` }}>
                    <input type="radio" value={opt.val} checked={destinataires === opt.val} onChange={() => setDestinataires(opt.val as any)} style={{ accentColor: opt.color }} />
                    <span style={{ fontSize: 13, fontWeight: destinataires === opt.val ? 600 : 400, color: destinataires === opt.val ? opt.color : '#475569' }}>{opt.label}</span>
                  </label>
                ))}

                {destinataires === 'selection' && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, padding: 8 }}>
                    {familles.map(f => (
                      <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: famillesSelectionnees.includes(f.id) ? '#EFF6FF' : 'transparent' }}>
                        <input type="checkbox" checked={famillesSelectionnees.includes(f.id)} onChange={() => toggleFamille(f.id)} style={{ accentColor: '#2563EB' }} />
                        <span style={{ fontSize: 13 }}>{f.nom}</span>
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>{f.parent1_email}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Résultat */}
            {sendResult && (
              <div style={{
                background: sendResult.error ? '#FEF2F2' : '#ECFDF5',
                border: `1px solid ${sendResult.error ? '#FECACA' : '#A7F3D0'}`,
                borderRadius: 10, padding: '14px 18px',
                color: sendResult.error ? '#DC2626' : '#059669', fontSize: 13,
              }}>
                {sendResult.error ? `❌ ${sendResult.error}` : `✅ ${sendResult.nbEnvoyes} email(s) envoyé(s) avec succès${sendResult.nbErreurs > 0 ? ` — ${sendResult.nbErreurs} erreur(s)` : ''}`}
              </div>
            )}

            {/* Bouton envoyer */}
            <button onClick={handleSend} disabled={sending || !sujet || !contenu}
              style={{
                padding: '13px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700,
                background: sending || !sujet || !contenu ? '#E2E8F0' : 'linear-gradient(135deg, #2563EB, #3B82F6)',
                color: sending || !sujet || !contenu ? '#94A3B8' : '#fff',
                transition: 'all 0.15s',
              }}>
              {sending ? '⏳ Envoi en cours...' : '📤 Envoyer les emails'}
            </button>
          </div>

          {/* Sidebar variables */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card">
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#2563EB' }}>Variables disponibles</h3>
              <p style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12 }}>Cliquez pour copier</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {VARIABLES_DISPO.map(v => (
                  <div key={v.var}
                    onClick={() => navigator.clipboard.writeText(v.var)}
                    style={{ padding: '7px 10px', borderRadius: 6, background: '#F8FAFC', border: '1px solid #E2E8F0', cursor: 'pointer', transition: 'all 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#F8FAFC')}>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#2563EB', fontWeight: 600 }}>{v.var}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{v.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ONGLET TEMPLATES ── */}
      {tab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={() => { setTplForm({ nom: '', sujet: '', contenu_html: '', description: '' }); setEditTemplate(null); setShowTemplateForm(true) }}>
              + Nouveau template
            </button>
          </div>

          {templates.map(t => (
            <div key={t.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{t.nom}</h3>
                  {t.description && <p style={{ fontSize: 12, color: '#64748B' }}>{t.description}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                    onClick={() => { setTplForm({ nom: t.nom, sujet: t.sujet, contenu_html: t.contenu_html, description: t.description ?? '' }); setEditTemplate(t); setShowTemplateForm(true) }}>
                    ✏️ Modifier
                  </button>
                  <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                    onClick={() => { loadTemplate(t); setTab('envoyer') }}>
                    📤 Utiliser
                  </button>
                  <button className="btn-danger" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => deleteTemplate(t.id)}>🗑️</button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', background: '#F8FAFC', borderRadius: 6, padding: '8px 10px' }}>
                <strong>Sujet :</strong> {t.sujet}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ONGLET HISTORIQUE ── */}
      {tab === 'historique' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                {['Date', 'Famille', 'Template', 'Destinataire', 'Sujet', 'Statut'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#CBD5E1' }}>Aucun email envoyé</td></tr>
              ) : logs.map((l, i) => (
                <tr key={l.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '11px 16px', fontSize: 12, color: '#475569' }}>{new Date(l.date_envoi).toLocaleDateString('fr-FR')} {new Date(l.date_envoi).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '11px 16px', fontWeight: 500, fontSize: 13 }}>{l.familles?.nom ?? '—'}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748B' }}>{l.email_templates?.nom ?? 'Personnalisé'}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12, color: '#475569' }}>{l.destinataire}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12, color: '#475569', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.sujet}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ background: l.statut === 'envoye' ? '#ECFDF5' : '#FEF2F2', color: l.statut === 'envoye' ? '#059669' : '#DC2626', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                      {l.statut === 'envoye' ? '✓ Envoyé' : '✕ Erreur'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal template */}
      {showTemplateForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>{editTemplate ? '✏️ Modifier le template' : '📝 Nouveau template'}</h2>
              <button onClick={() => setShowTemplateForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#64748B' }}>✕</button>
            </div>
            <form onSubmit={saveTemplate} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Nom du template *</label><input style={inp} value={tplForm.nom} onChange={e => setTplForm(p => ({ ...p, nom: e.target.value }))} required placeholder="Ex: Rappel de solde" /></div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Description</label><input style={inp} value={tplForm.description} onChange={e => setTplForm(p => ({ ...p, description: e.target.value }))} placeholder="Usage de ce template..." /></div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Sujet *</label><input style={inp} value={tplForm.sujet} onChange={e => setTplForm(p => ({ ...p, sujet: e.target.value }))} required placeholder="{{nom_famille}} — Rappel scolarité" /></div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Contenu HTML *</label>
                <textarea style={{ ...inp, height: 240, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} value={tplForm.contenu_html} onChange={e => setTplForm(p => ({ ...p, contenu_html: e.target.value }))} required placeholder="<h2>Bonjour {{prenom_parent1}},</h2>..." />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowTemplateForm(false)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={savingTpl}>{savingTpl ? 'Enregistrement...' : '✓ Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
