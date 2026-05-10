'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { ANNEE_COURANTE } from '@/lib/inscriptions'

type Tab = 'classes' | 'secteurs' | 'tarifs' | 'reductions_fn' | 'modes_reglement' | 'config_reduction' | 'config_paiement' | 'commission' | 'sepa' | 'notifications' | 'frais_inscription' | 'documents_ecole' | 'services'

export default function ParametresPage() {
  const ecole = useEcole()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initTab = tabParam === 'inscriptions' ? 'secteurs'
    : tabParam === 'sepa' ? 'sepa'
    : tabParam === 'notifications' ? 'notifications'
    : 'classes'
  const [tab, setTab] = useState<Tab>(initTab as Tab)
  const [annee, setAnnee] = useState(ANNEE_COURANTE)

  const TABS: { id: Tab; label: string; icon: string; group?: string }[] = [
    { id: 'classes', label: 'Classes', icon: '🏫', group: 'École' },
    { id: 'secteurs', label: 'Secteurs', icon: '🗂️', group: 'École' },
    { id: 'tarifs', label: 'Tarifs', icon: '💶', group: 'Inscriptions' },
    { id: 'reductions_fn', label: 'Réd. famille', icon: '👨‍👩‍👧', group: 'Inscriptions' },
    { id: 'modes_reglement', label: 'Règlement', icon: '💳', group: 'Inscriptions' },
    { id: 'config_reduction', label: 'Dossier réduction', icon: '📋', group: 'Inscriptions' },
    { id: 'config_paiement', label: 'Config paiement', icon: '📅', group: 'Inscriptions' },
    { id: 'commission', label: 'Commission', icon: '⚖️', group: 'Inscriptions' },
    { id: 'sepa', label: 'SEPA / Banque', icon: '🏦', group: 'Inscriptions' },
    { id: 'frais_inscription', label: 'Frais inscription', icon: '🧾', group: 'Inscriptions' },
    { id: 'documents_ecole', label: 'Documents N+1', icon: '📂', group: 'Inscriptions' },
    { id: 'notifications', label: 'Notifications', icon: '🔔', group: 'École' },
    { id: 'services', label: 'Services / Messagerie', icon: '💬', group: 'École' },
  ]

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Paramètres</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{ecole.nom}</p>
        </div>
        {['tarifs', 'reductions_fn', 'config_reduction', 'config_paiement', 'frais_inscription', 'documents_ecole'].includes(tab) && (
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            style={{ ...inp, width: 'auto', fontWeight: 600, color: '#1E293B' }}>
            <option value="2026-2027">2026-2027</option>
            <option value="2027-2028">2027-2028</option>
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#1E293B' : '#64748B',
              fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, minHeight: 300 }}>
        {tab === 'secteurs' && <SecteursTab ecoleId={ecole.id} />}
        {tab === 'tarifs' && <TarifsTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'reductions_fn' && <ReductionsFNTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'modes_reglement' && <ModesReglementTab ecoleId={ecole.id} />}
        {tab === 'classes' && <ClassesTab ecoleId={ecole.id} />}
        {tab === 'config_reduction' && <ConfigReductionTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'config_paiement' && <ConfigPaiementTab ecoleId={ecole.id} />}
        {tab === 'commission' && <CommissionTab ecoleId={ecole.id} />}
        {tab === 'sepa' && <SEPATab ecoleId={ecole.id} />}
        {tab === 'frais_inscription' && <FraisInscriptionTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'documents_ecole' && <DocumentsEcoleTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'services' && <ServicesTab ecoleId={ecole.id} />}
        {tab === 'notifications' && <NotificationsTab ecoleId={ecole.id} />}
      </div>
    </div>
  )
}

// ── CONFIG DOSSIER RÉDUCTION ──
function ConfigReductionTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [docs, setDocs] = useState<any[]>([])
  const [questions, setQuestions] = useState<any[]>([])
  const [newDoc, setNewDoc] = useState({ label: '', obligatoire: true })
  const [newQ, setNewQ] = useState({ section: 'revenus', label: '', type: 'number', obligatoire: true, cle: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [ecoleId, annee])

  async function load() {
    const s = createClient()
    const [{ data: d }, { data: q }] = await Promise.all([
      s.from('reduction_documents_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre'),
      s.from('reduction_questions_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('section').order('ordre'),
    ])
    setDocs(d ?? []); setQuestions(q ?? [])
  }

  async function ajouterDoc() {
    if (!newDoc.label.trim()) return
    setSaving(true)
    await createClient().from('reduction_documents_config').insert({ ecole_id: ecoleId, annee_scolaire: annee, ...newDoc, ordre: docs.length })
    setNewDoc({ label: '', obligatoire: true }); await load(); setSaving(false)
  }

  async function toggleDoc(id: string, actif: boolean) {
    await createClient().from('reduction_documents_config').update({ actif: !actif }).eq('id', id); await load()
  }

  async function supprimerDoc(id: string) {
    await createClient().from('reduction_documents_config').delete().eq('id', id); await load()
  }

  async function ajouterQuestion() {
    if (!newQ.label.trim()) return
    setSaving(true)
    const cle = newQ.cle || newQ.label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)
    await createClient().from('reduction_questions_config').insert({ ecole_id: ecoleId, annee_scolaire: annee, ...newQ, cle, ordre: questions.length })
    setNewQ({ section: 'revenus', label: '', type: 'number', obligatoire: true, cle: '' }); await load(); setSaving(false)
  }

  async function toggleQuestion(id: string, actif: boolean) {
    await createClient().from('reduction_questions_config').update({ actif: !actif }).eq('id', id); await load()
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }
  const SECTIONS = ['logement', 'revenus', 'allocations', 'autres']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Documents */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Pièces justificatives requises</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input style={{ ...inp, flex: 1 }} value={newDoc.label} onChange={e => setNewDoc(p => ({ ...p, label: e.target.value }))}
            placeholder="Ex: Avis d'imposition 2025" onKeyDown={e => e.key === 'Enter' && ajouterDoc()} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={newDoc.obligatoire} onChange={e => setNewDoc(p => ({ ...p, obligatoire: e.target.checked }))} />
            Obligatoire
          </label>
          <button onClick={ajouterDoc} disabled={saving}
            style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Ajouter
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', opacity: d.actif ? 1 : 0.5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.actif ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: '#1E293B' }}>{d.label}</span>
              {d.obligatoire && <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 600 }}>OBLIGATOIRE</span>}
              <button onClick={() => toggleDoc(d.id, d.actif)} style={{ fontSize: 11, color: d.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                {d.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button onClick={() => supprimerDoc(d.id)} style={{ fontSize: 13, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Questions */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Questions du formulaire</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto auto', gap: 8, marginBottom: 14, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>SECTION</div>
            <select style={{ ...inp, width: '100%' }} value={newQ.section} onChange={e => setNewQ(p => ({ ...p, section: e.target.value }))}>
              {SECTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>LIBELLÉ</div>
            <input style={{ ...inp, width: '100%' }} value={newQ.label} onChange={e => setNewQ(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Quotient familial CAF" />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>TYPE</div>
            <select style={{ ...inp, width: '100%' }} value={newQ.type} onChange={e => setNewQ(p => ({ ...p, type: e.target.value }))}>
              <option value="number">Nombre</option>
              <option value="text">Texte</option>
              <option value="textarea">Paragraphe</option>
              <option value="select">Liste</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={newQ.obligatoire} onChange={e => setNewQ(p => ({ ...p, obligatoire: e.target.checked }))} />
            Obligatoire
          </label>
          <button onClick={ajouterQuestion} disabled={saving}
            style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Ajouter
          </button>
        </div>

        {SECTIONS.map(section => {
          const qs = questions.filter(q => q.section === section)
          if (qs.length === 0) return null
          return (
            <div key={section} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{section}</div>
              {qs.map(q => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', marginBottom: 6, opacity: q.actif ? 1 : 0.5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: q.actif ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#1E293B' }}>{q.label}</span>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>{q.type}</span>
                  {q.obligatoire && <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 600 }}>OBLIGATOIRE</span>}
                  <button onClick={() => toggleQuestion(q.id, q.actif)} style={{ fontSize: 11, color: q.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                    {q.actif ? 'Masquer' : 'Afficher'}
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── CONFIG PAIEMENT ──
function ConfigPaiementTab({ ecoleId }: { ecoleId: string }) {
  const [config, setConfig] = useState<any>(null)
  const [dates, setDates] = useState<any[]>([])
  const [newJour, setNewJour] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [ecoleId])

  async function load() {
    const s = createClient()
    const [{ data: cfg }, { data: d }] = await Promise.all([
      s.from('contrat_paiement_config').select('*').eq('ecole_id', ecoleId).single(),
      s.from('dates_encaissement').select('*').eq('ecole_id', ecoleId).order('ordre'),
    ])
    setConfig(cfg); setDates(d ?? [])
  }

  async function sauvegarderConfig() {
    setSaving(true)
    const s = createClient()
    if (config?.id) await s.from('contrat_paiement_config').update({ nb_echeances_min: config.nb_echeances_min, nb_echeances_max: config.nb_echeances_max }).eq('id', config.id)
    else await s.from('contrat_paiement_config').insert({ ecole_id: ecoleId, nb_echeances_min: config?.nb_echeances_min || 1, nb_echeances_max: config?.nb_echeances_max || 12 })
    await load(); setSaving(false)
  }

  async function ajouterDate() {
    const jour = parseInt(newJour)
    if (!jour || jour < 1 || jour > 28) { alert('Jour entre 1 et 28'); return }
    await createClient().from('dates_encaissement').insert({ ecole_id: ecoleId, jour_du_mois: jour, label: newLabel || `${jour === 1 ? '1er' : jour + 'e'} du mois`, ordre: dates.length })
    setNewJour(''); setNewLabel(''); await load()
  }

  async function toggleDate(id: string, actif: boolean) {
    await createClient().from('dates_encaissement').update({ actif: !actif }).eq('id', id); await load()
  }

  async function supprimerDate(id: string) {
    await createClient().from('dates_encaissement').delete().eq('id', id); await load()
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Nombre d'échéances */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Nombre d'échéances autorisées</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 360 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 }}>MINIMUM</label>
            <input style={inp} type="number" min="1" max="12" value={config?.nb_echeances_min || 1}
              onChange={e => setConfig((p: any) => ({ ...p, nb_echeances_min: parseInt(e.target.value) || 1 }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 }}>MAXIMUM</label>
            <input style={inp} type="number" min="1" max="12" value={config?.nb_echeances_max || 12}
              onChange={e => setConfig((p: any) => ({ ...p, nb_echeances_max: parseInt(e.target.value) || 12 }))} />
          </div>
        </div>
        <button onClick={sauvegarderConfig} disabled={saving}
          style={{ marginTop: 12, background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {config?.nb_echeances_min && config?.nb_echeances_max && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748B' }}>
            Les parents pourront choisir de {config.nb_echeances_min} à {config.nb_echeances_max} échéances.
          </div>
        )}
      </div>

      {/* Dates d'encaissement */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>Dates d'encaissement disponibles</div>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 14px' }}>Les parents choisissent parmi ces dates pour leurs prélèvements/chèques. Maximum 28 (pour compatibilité tous mois).</p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 80 }}>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>JOUR</div>
            <input style={{ ...inp }} type="number" min="1" max="28" value={newJour} onChange={e => setNewJour(e.target.value)} placeholder="1" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>LIBELLÉ (optionnel)</div>
            <input style={{ ...inp }} value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ex: 1er du mois" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={ajouterDate} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              + Ajouter
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {dates.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: d.actif ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${d.actif ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, padding: '8px 12px', opacity: d.actif ? 1 : 0.6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: d.actif ? '#2563EB' : '#94A3B8' }}>{d.jour_du_mois}</span>
              <span style={{ fontSize: 12, color: '#64748B' }}>{d.label}</span>
              <button onClick={() => toggleDate(d.id, d.actif)} style={{ fontSize: 10, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>
                {d.actif ? '⏸' : '▶'}
              </button>
              <button onClick={() => supprimerDate(d.id)} style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── SECTEURS (inchangé, copié depuis v1) ──
function SecteursTab({ ecoleId }: { ecoleId: string }) {
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [newNom, setNewNom] = useState('')
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', flex: 1, boxSizing: 'border-box' as const }
  useEffect(() => { load() }, [ecoleId])
  async function load() {
    const { data } = await createClient().from('secteurs').select('*, classes(id, nom)').eq('ecole_id', ecoleId).order('ordre')
    setSecteurs(data ?? [])
  }
  async function ajouter() {
    if (!newNom.trim()) return
    await createClient().from('secteurs').insert({ ecole_id: ecoleId, nom: newNom.trim(), ordre: secteurs.length })
    setNewNom(''); await load()
  }
  async function supprimer(id: string) { if (!confirm('Supprimer ?')) return; await createClient().from('secteurs').delete().eq('id', id); await load() }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input style={inp} value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nom du secteur..." onKeyDown={e => e.key === 'Enter' && ajouter()} />
        <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
      </div>
      {secteurs.map(s => (
        <div key={s.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: '#F8FAFC', gap: 12 }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{s.nom}</span>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{s.classes?.length || 0} classe(s)</span>
            <button onClick={() => supprimer(s.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Supprimer</button>
          </div>
          {(s.classes?.length || 0) > 0 && (
            <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {s.classes.map((c: any) => <span key={c.id} style={{ fontSize: 12, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px' }}>{c.nom}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── TARIFS (inchangé) ──
function TarifsTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [newT, setNewT] = useState({ secteur_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '' })
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  useEffect(() => {
    const s = createClient()
    Promise.all([
      s.from('secteurs').select('id, nom').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
      s.from('tarifs_secteur').select('*, secteurs(nom)').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre'),
    ]).then(([{ data: sec }, { data: tar }]) => { setSecteurs(sec ?? []); setTarifs(tar ?? []) })
  }, [ecoleId, annee])
  async function ajouter() {
    if (!newT.nom_poste || !newT.montant) return
    await createClient().from('tarifs_secteur').insert({ ecole_id: ecoleId, annee_scolaire: annee, secteur_id: newT.secteur_id || null, nom_poste: newT.nom_poste, montant: parseFloat(newT.montant), obligatoire: newT.obligatoire, code_comptable: newT.code_comptable || null, ordre: tarifs.length })
    const { data } = await createClient().from('tarifs_secteur').select('*, secteurs(nom)').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre')
    setTarifs(data ?? []); setNewT({ secteur_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '' })
  }
  async function supprimer(id: string) { await createClient().from('tarifs_secteur').delete().eq('id', id); setTarifs(p => p.filter(t => t.id !== id)) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>AJOUTER UN POSTE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 1.5fr auto', gap: 10, alignItems: 'end' }}>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>SECTEUR</div><select style={{ ...inp }} value={newT.secteur_id} onChange={e => setNewT(p => ({ ...p, secteur_id: e.target.value }))}><option value="">Tous</option>{secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>POSTE</div><input style={inp} value={newT.nom_poste} onChange={e => setNewT(p => ({ ...p, nom_poste: e.target.value }))} placeholder="Scolarité..." /></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>MONTANT €</div><input style={inp} type="number" value={newT.montant} onChange={e => setNewT(p => ({ ...p, montant: e.target.value }))} /></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CODE COMPTA</div><input style={inp} value={newT.code_comptable} onChange={e => setNewT(p => ({ ...p, code_comptable: e.target.value }))} placeholder="706xxx" /></div>
          <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
          <input type="checkbox" checked={newT.obligatoire} onChange={e => setNewT(p => ({ ...p, obligatoire: e.target.checked }))} />
          Poste obligatoire (inclus automatiquement)
        </label>
      </div>
      {tarifs.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun tarif pour {annee}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Secteur', 'Poste', 'Montant', 'Code', 'Obligatoire', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {tarifs.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < tarifs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, background: '#EFF6FF', color: '#2563EB', borderRadius: 5, padding: '2px 8px' }}>{t.secteurs?.nom || 'Tous'}</span></td>
                <td style={{ padding: '11px 14px', fontWeight: 500 }}>{t.nom_poste}</td>
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#059669' }}>{t.montant?.toLocaleString('fr-FR')}€</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{t.code_comptable || '—'}</td>
                <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, background: t.obligatoire ? 'rgba(16,185,129,0.1)' : '#F1F5F9', color: t.obligatoire ? '#10B981' : '#94A3B8', borderRadius: 5, padding: '2px 8px' }}>{t.obligatoire ? '✓ Oui' : 'Non'}</span></td>
                <td style={{ padding: '11px 14px' }}><button onClick={() => supprimer(t.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── RÉDUCTIONS FAMILLE NOMBREUSE ──
function ReductionsFNTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [reductions, setReductions] = useState<any[]>([])
  const [newItem, setNewItem] = useState({ nb_enfants: '', montant_reduction: '' })
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  useEffect(() => { createClient().from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants').then(({ data }) => setReductions(data ?? [])) }, [ecoleId, annee])
  async function ajouter() {
    if (!newItem.nb_enfants || !newItem.montant_reduction) return
    await createClient().from('reductions_famille_nombreuse').upsert({ ecole_id: ecoleId, annee_scolaire: annee, nb_enfants: parseInt(newItem.nb_enfants), montant_reduction: parseFloat(newItem.montant_reduction) })
    const { data } = await createClient().from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants')
    setReductions(data ?? []); setNewItem({ nb_enfants: '', montant_reduction: '' })
  }
  async function supprimer(id: string) { await createClient().from('reductions_famille_nombreuse').delete().eq('id', id); setReductions(p => p.filter(r => r.id !== id)) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>À PARTIR DE N ENFANTS</div><input style={inp} type="number" min="2" value={newItem.nb_enfants} onChange={e => setNewItem(p => ({ ...p, nb_enfants: e.target.value }))} placeholder="2" /></div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>RÉDUCTION (€)</div><input style={inp} type="number" value={newItem.montant_reduction} onChange={e => setNewItem(p => ({ ...p, montant_reduction: e.target.value }))} placeholder="960" /></div>
        <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
      </div>
      {reductions.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '11px 16px' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.nb_enfants} enfants et +</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>- {r.montant_reduction?.toLocaleString('fr-FR')} €</span>
          <button onClick={() => supprimer(r.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ── MODES RÈGLEMENT ──
function ModesReglementTab({ ecoleId }: { ecoleId: string }) {
  const [modes, setModes] = useState<any[]>([])
  const TYPES = [
    { value: 'cheque', label: 'Chèque', desc: 'Chèques remis à la comptabilité' },
    { value: 'sepa', label: 'Prélèvement SEPA', desc: 'Export XML SEPA / Sage Direct' },
    { value: 'gocardless', label: 'GoCardless', desc: 'Prélèvement en ligne (bientôt)' },
    { value: 'stripe', label: 'Carte bancaire', desc: 'Paiement Stripe (bientôt)' },
  ]
  useEffect(() => { createClient().from('modes_reglement_ecole').select('*').eq('ecole_id', ecoleId).order('ordre').then(({ data }) => setModes(data ?? [])) }, [ecoleId])
  async function toggle(id: string, actif: boolean) { await createClient().from('modes_reglement_ecole').update({ actif: !actif }).eq('id', id); setModes(p => p.map(m => m.id === id ? { ...m, actif: !actif } : m)) }
  async function ajouter(type: string, label: string) { if (modes.find(m => m.type === type)) return; const { data } = await createClient().from('modes_reglement_ecole').insert({ ecole_id: ecoleId, type, label, actif: true, ordre: modes.length }).select().single(); if (data) setModes(p => [...p, data]) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {TYPES.map(t => {
        const existing = modes.find(m => m.type === t.value)
        const comingSoon = t.value === 'gocardless' || t.value === 'stripe'
        return (
          <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', opacity: comingSoon ? 0.6 : 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>{t.label}{comingSoon && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#D97706', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>Bientôt</span>}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{t.desc}</div>
            </div>
            {!comingSoon && (existing ? (
              <button onClick={() => toggle(existing.id, existing.actif)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: existing.actif ? '#2563EB' : '#CBD5E1', position: 'relative', transition: 'all 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: existing.actif ? 23 : 3, transition: 'all 0.2s' }} />
              </button>
            ) : (
              <button onClick={() => ajouter(t.value, t.label)} style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>Activer</button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── CLASSES ──
function ClassesTab({ ecoleId }: { ecoleId: string }) {
  const [classes, setClasses] = useState<any[]>([])
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [newNom, setNewNom] = useState('')
  const [newSecteur, setNewSecteur] = useState('')
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
  useEffect(() => {
    const s = createClient()
    Promise.all([
      s.from('classes').select('id, nom, secteur_id, secteurs(nom)').eq('ecole_id', ecoleId).order('nom'),
      s.from('secteurs').select('id, nom').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
    ]).then(([{ data: cl }, { data: sec }]) => { setClasses(cl ?? []); setSecteurs(sec ?? []) })
  }, [ecoleId])
  async function ajouter() {
    if (!newNom.trim()) return
    await createClient().from('classes').insert({ ecole_id: ecoleId, nom: newNom.trim(), secteur_id: newSecteur || null })
    const { data } = await createClient().from('classes').select('id, nom, secteur_id, secteurs(nom)').eq('ecole_id', ecoleId).order('nom')
    setClasses(data ?? []); setNewNom('')
  }
  async function supprimer(id: string) { await createClient().from('classes').delete().eq('id', id); setClasses(p => p.filter(c => c.id !== id)) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input style={{ ...inp, flex: 1 }} value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nom de la classe" onKeyDown={e => e.key === 'Enter' && ajouter()} />
        <select style={{ ...inp, width: 'auto' }} value={newSecteur} onChange={e => setNewSecteur(e.target.value)}>
          <option value="">Secteur (optionnel)</option>
          {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {classes.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 500, color: '#1E293B' }}>
            {c.nom}
            {c.secteurs && <span style={{ fontSize: 10, color: '#94A3B8' }}>({c.secteurs.nom})</span>}
            <button onClick={() => supprimer(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── COMMISSION ──
function CommissionTab({ ecoleId }: { ecoleId: string }) {
  const [membres, setMembres] = useState<any[]>([])
  const [newM, setNewM] = useState({ prenom: '', nom: '', role_label: '', email: '' })
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  useEffect(() => { load() }, [ecoleId])

  async function load() {
    const { data } = await createClient().from('commission_membres').select('*').eq('ecole_id', ecoleId).order('ordre')
    setMembres(data ?? [])
  }

  async function ajouter() {
    if (!newM.nom.trim()) return
    await createClient().from('commission_membres').insert({ ecole_id: ecoleId, ...newM, ordre: membres.length })
    setNewM({ prenom: '', nom: '', role_label: '', email: '' }); await load()
  }

  async function toggle(id: string, actif: boolean) {
    await createClient().from('commission_membres').update({ actif: !actif }).eq('id', id); await load()
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer ce membre ?')) return
    await createClient().from('commission_membres').delete().eq('id', id); await load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
        Membres de la commission qui étudient les dossiers de réduction. Chaque membre peut saisir son avis et un tarif proposé.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>PRÉNOM</div><input style={inp} value={newM.prenom} onChange={e => setNewM(p => ({ ...p, prenom: e.target.value }))} placeholder="Avi" /></div>
        <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>NOM</div><input style={inp} value={newM.nom} onChange={e => setNewM(p => ({ ...p, nom: e.target.value }))} placeholder="Cohen" /></div>
        <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>RÔLE</div><input style={inp} value={newM.role_label} onChange={e => setNewM(p => ({ ...p, role_label: e.target.value }))} placeholder="Directeur, Comptable..." /></div>
        <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>EMAIL</div><input style={inp} type="email" value={newM.email} onChange={e => setNewM(p => ({ ...p, email: e.target.value }))} placeholder="email@ecole.fr" /></div>
        <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Ajouter</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {membres.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px', opacity: m.actif ? 1 : 0.5 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {(m.prenom || m.nom)[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{m.prenom} {m.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{m.role_label}{m.email ? ` · ${m.email}` : ''}</div>
            </div>
            <button onClick={() => toggle(m.id, m.actif)} style={{ fontSize: 11, color: m.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              {m.actif ? 'Désactiver' : 'Activer'}
            </button>
            <button onClick={() => supprimer(m.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SEPA / BANQUE ──
function SEPATab({ ecoleId }: { ecoleId: string }) {
  const [form, setForm] = useState<any>({ iban_ecole: '', bic_ecole: '', ics_sepa: '', nom_creancier: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  useEffect(() => {
    createClient().from('ecoles').select('iban_ecole, bic_ecole, ics_sepa, nom_creancier').eq('id', ecoleId).single()
      .then(({ data }) => {
        setForm({
          iban_ecole: data?.iban_ecole || '',
          bic_ecole: data?.bic_ecole || '',
          ics_sepa: data?.ics_sepa || '',
          nom_creancier: data?.nom_creancier || '',
        })
        setLoading(false)
      })
  }, [ecoleId])

  async function save() {
    setSaving(true)
    setSaved(false)
    setSaveErr(null)
    const { data, error } = await createClient().from('ecoles').update({
      iban_ecole: form.iban_ecole || null,
      bic_ecole: form.bic_ecole || null,
      ics_sepa: form.ics_sepa || null,
      nom_creancier: form.nom_creancier || null,
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

  const inp = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const help = { fontSize: 11, color: '#94A3B8', marginTop: 4 }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const allFilled = form.iban_ecole && form.bic_ecole && form.ics_sepa && form.nom_creancier

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>🏦 Coordonnées bancaires (SEPA)</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Ces informations sont utilisées pour générer le fichier d'export SEPA (PAIN.008.001.02) à transmettre à votre banque.
        </p>
      </div>

      {!allFilled && (
        <div style={{ background: '#FEF9EC', border: '1px solid #F59E0B', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E' }}>
          ⚠️ Tant que les 4 champs ne sont pas remplis, l'export SEPA est désactivé.
        </div>
      )}
      {allFilled && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#059669' }}>
          ✓ Configuration complète — l'export SEPA est opérationnel.
        </div>
      )}

      <div>
        <label style={lbl}>Nom du créancier *</label>
        <input style={inp} value={form.nom_creancier} onChange={e => setForm((p: any) => ({ ...p, nom_creancier: e.target.value }))} placeholder="Ex : BETH LOUBAVITCH" />
        <div style={help}>Nom légal qui apparaît sur les prélèvements bancaires.</div>
      </div>

      <div>
        <label style={lbl}>Identifiant Créancier SEPA (ICS) *</label>
        <input style={{ ...inp, fontFamily: 'monospace' }} value={form.ics_sepa} onChange={e => setForm((p: any) => ({ ...p, ics_sepa: e.target.value.toUpperCase() }))} placeholder="Ex : FR70ZZZ408187" />
        <div style={help}>Identifiant unique délivré par la Banque de France (commence par 2 lettres pays + 3 chiffres + 4-7 caractères).</div>
      </div>

      <div>
        <label style={lbl}>IBAN école *</label>
        <input style={{ ...inp, fontFamily: 'monospace' }} value={form.iban_ecole} onChange={e => setForm((p: any) => ({ ...p, iban_ecole: e.target.value.toUpperCase().replace(/\s+/g, '') }))} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
        <div style={help}>IBAN du compte sur lequel les prélèvements seront crédités.</div>
      </div>

      <div>
        <label style={lbl}>BIC *</label>
        <input style={{ ...inp, fontFamily: 'monospace' }} value={form.bic_ecole} onChange={e => setForm((p: any) => ({ ...p, bic_ecole: e.target.value.toUpperCase() }))} placeholder="Ex : BNPAFRPPXXX" />
        <div style={help}>Code BIC/SWIFT de la banque (8 ou 11 caractères).</div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ minHeight: 44, padding: '10px 22px' }}>
          {saving ? 'Enregistrement…' : '💾 Enregistrer'}
        </button>
        {saved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Enregistré</span>}
      </div>
      {saveErr && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#DC2626' }}>
          ⚠️ {saveErr}
        </div>
      )}
    </div>
  )
}

// ── NOTIFICATIONS ──
function NotificationsTab({ ecoleId }: { ecoleId: string }) {
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
    if (!isValidEmail(e)) { alert('Email invalide'); return }
    if (emails.includes(e)) { alert('Cet email est déjà dans la liste'); return }
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
    if (!emails.length) { alert('Ajoutez au moins un email avant de tester.'); return }
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


// ── FRAIS INSCRIPTION / RÉINSCRIPTION ──
function FraisInscriptionTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [form, setForm] = useState<any>({ inscription_par_enfant: '', inscription_par_famille: '', reinscription_par_enfant: '', reinscription_par_famille: '' })
  const [recordId, setRecordId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    createClient().from('frais_inscription_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRecordId(data.id)
          setForm({
            inscription_par_enfant: data.inscription_par_enfant?.toString() || '',
            inscription_par_famille: data.inscription_par_famille?.toString() || '',
            reinscription_par_enfant: data.reinscription_par_enfant?.toString() || '',
            reinscription_par_famille: data.reinscription_par_famille?.toString() || '',
          })
        } else {
          setRecordId(null)
          setForm({ inscription_par_enfant: '', inscription_par_famille: '', reinscription_par_enfant: '', reinscription_par_famille: '' })
        }
        setLoading(false)
      })
  }, [ecoleId, annee])

  async function save() {
    setSaving(true); setSaved(false); setSaveErr(null)
    const payload = {
      ecole_id: ecoleId, annee_scolaire: annee,
      inscription_par_enfant: parseFloat(form.inscription_par_enfant) || 0,
      inscription_par_famille: parseFloat(form.inscription_par_famille) || 0,
      reinscription_par_enfant: parseFloat(form.reinscription_par_enfant) || 0,
      reinscription_par_famille: parseFloat(form.reinscription_par_famille) || 0,
      updated_at: new Date().toISOString(),
    }
    const s = createClient()
    let error
    if (recordId) {
      ;({ error } = await s.from('frais_inscription_config').update(payload).eq('id', recordId))
    } else {
      const res = await s.from('frais_inscription_config').insert(payload).select().single()
      error = res.error
      if (res.data) setRecordId(res.data.id)
    }
    setSaving(false)
    if (error) { setSaveErr('Erreur : ' + error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inp = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const help = { fontSize: 11, color: '#94A3B8', marginTop: 4 }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>🧾 Frais d'inscription / réinscription — {annee}</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Ces montants sont ajoutés automatiquement à la facture quand un contrat est validé. "Par enfant" est multiplié par le nombre d'enfants ; "par famille" est compté une seule fois.
        </p>
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1D4ED8', margin: '0 0 12px' }}>Inscription (nouvel enfant)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={lbl}>Par enfant (€)</label>
            <input style={inp} type="number" step="0.01" value={form.inscription_par_enfant}
              onChange={e => setForm((p: any) => ({ ...p, inscription_par_enfant: e.target.value }))} />
            <div style={help}>Pour chaque nouvel enfant ajouté via la fiche pédagogique.</div>
          </div>
          <div>
            <label style={lbl}>Par famille (€)</label>
            <input style={inp} type="number" step="0.01" value={form.inscription_par_famille}
              onChange={e => setForm((p: any) => ({ ...p, inscription_par_famille: e.target.value }))} />
            <div style={help}>Forfait famille appliqué une fois si au moins 1 nouvel enfant.</div>
          </div>
        </div>
      </div>

      <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#92400E', margin: '0 0 12px' }}>Réinscription (enfant existant)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={lbl}>Par enfant (€)</label>
            <input style={inp} type="number" step="0.01" value={form.reinscription_par_enfant}
              onChange={e => setForm((p: any) => ({ ...p, reinscription_par_enfant: e.target.value }))} />
            <div style={help}>Pour chaque enfant déjà inscrit qui reconduit.</div>
          </div>
          <div>
            <label style={lbl}>Par famille (€)</label>
            <input style={inp} type="number" step="0.01" value={form.reinscription_par_famille}
              onChange={e => setForm((p: any) => ({ ...p, reinscription_par_famille: e.target.value }))} />
            <div style={help}>Forfait famille appliqué une fois si au moins 1 réinscription.</div>
          </div>
        </div>
      </div>

      {saveErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#DC2626' }}>⚠️ {saveErr}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ minHeight: 44, padding: '10px 22px' }}>
          {saving ? 'Enregistrement…' : '💾 Enregistrer'}
        </button>
        {saved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Enregistré</span>}
      </div>
    </div>
  )
}

// ── DOCUMENTS ÉCOLE PUBLICS (circulaire, liste affaires, etc.) ──
function DocumentsEcoleTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<any>({ titre: '', description: '', type_doc: 'circulaire' })
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await createClient()
      .from('documents_ecole_publics').select('*')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', annee)
      .order('ordre').order('created_at', { ascending: false })
    setDocs(data ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [ecoleId, annee])

  async function uploadAndCreate() {
    if (!pendingFile || !form.titre) { setErrMsg('Titre + fichier requis'); return }
    setErrMsg(null); setUploading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const fd = new FormData()
    fd.append('file', pendingFile)
    fd.append('familleId', 'doc-ecole-' + ecoleId)
    fd.append('label', 'Document école')
    fd.append('configId', annee)
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` }, body: fd })
    const json = await res.json()
    if (!json.success) { setErrMsg('Erreur upload : ' + (json.error || 'inconnue')); setUploading(false); return }
    const { error } = await s.from('documents_ecole_publics').insert({
      ecole_id: ecoleId, annee_scolaire: annee, titre: form.titre,
      description: form.description || null, fichier_url: json.url,
      nom_fichier: json.nom, taille_ko: json.taille_ko, type_doc: form.type_doc,
      created_by: session?.user.id,
    })
    setUploading(false)
    if (error) { setErrMsg('Erreur enregistrement : ' + error.message); return }
    setForm({ titre: '', description: '', type_doc: 'circulaire' })
    setPendingFile(null)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  async function toggleActif(id: string, actif: boolean) {
    await createClient().from('documents_ecole_publics').update({ actif: !actif }).eq('id', id); load()
  }
  async function supprimer(id: string) {
    if (!confirm('Supprimer ce document ?')) return
    await createClient().from('documents_ecole_publics').delete().eq('id', id); load()
  }

  const inp = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const TYPES: Record<string, { label: string; icon: string }> = {
    circulaire: { label: 'Circulaire', icon: '📢' },
    liste_affaires: { label: "Liste d'affaires", icon: '📝' },
    calendrier: { label: 'Calendrier', icon: '📅' },
    reglement: { label: 'Règlement', icon: '📜' },
    autre: { label: 'Autre', icon: '📄' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>📂 Documents partagés aux familles — {annee}</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Ces documents sont visibles dans l'espace famille › Année N+1 › Documents école. Idéal pour la circulaire de rentrée, la liste d'affaires scolaires, le calendrier annuel, etc.
        </p>
      </div>

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 12px' }}>Ajouter un document</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Titre *</label>
            <input style={inp} value={form.titre} onChange={e => setForm((p: any) => ({ ...p, titre: e.target.value }))} placeholder="Ex: Circulaire de rentrée 2026-2027" />
          </div>
          <div>
            <label style={lbl}>Description</label>
            <input style={inp} value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} placeholder="Description courte (optionnel)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={lbl}>Type</label>
              <select style={inp} value={form.type_doc} onChange={e => setForm((p: any) => ({ ...p, type_doc: e.target.value }))}>
                {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Fichier (PDF, image, max 10 Mo)</label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                onChange={e => setPendingFile(e.target.files?.[0] || null)}
                style={{ ...inp, padding: '7px 12px' }} />
            </div>
          </div>
          {errMsg && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#DC2626' }}>⚠️ {errMsg}</div>}
          <button onClick={uploadAndCreate} disabled={uploading || !pendingFile || !form.titre}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading || !pendingFile || !form.titre ? 0.5 : 1, alignSelf: 'flex-start', minHeight: 44 }}>
            {uploading ? 'Upload…' : '+ Ajouter le document'}
          </button>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 10px' }}>Documents existants ({docs.length})</h3>
        {loading ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Chargement...</div>
          : docs.length === 0 ? <div style={{ color: '#94A3B8', fontSize: 13, fontStyle: 'italic' }}>Aucun document pour cette année.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(d => {
                const t = TYPES[d.type_doc] || TYPES.autre
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, opacity: d.actif ? 1 : 0.55 }}>
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.titre}</div>
                      {d.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{d.description}</div>}
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                        {t.label} · {d.nom_fichier} {d.taille_ko && `(${d.taille_ko} Ko)`}
                      </div>
                    </div>
                    <a href={d.fichier_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: '5px 12px', textDecoration: 'none' }}>Voir</a>
                    <button onClick={() => toggleActif(d.id, d.actif)}
                      style={{ fontSize: 12, color: d.actif ? '#64748B' : '#10B981', background: '#F1F5F9', border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
                      {d.actif ? '👁️ Cacher' : '👁️ Activer'}
                    </button>
                    <button onClick={() => supprimer(d.id)}
                      style={{ fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>🗑️</button>
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}
// ── SERVICES & MESSAGERIE ──
function ServicesTab({ ecoleId }: { ecoleId: string }) {
  const [services, setServices] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [newSvc, setNewSvc] = useState({ nom: '', description: '' })

  useEffect(() => { load() }, [ecoleId])

  async function load() {
    setLoading(true)
    const s = createClient()
    const [{ data: svc }, { data: prof }, { data: sa }] = await Promise.all([
      s.from('services').select('*').eq('ecole_id', ecoleId).order('ordre'),
      s.from('profiles').select('id, prenom, nom, role').in('role', ['admin', 'super_admin']),
      s.from('service_agents').select('service_id, profile_id'),
    ])
    setServices(svc ?? [])
    setAgents(prof ?? [])
    const map: Record<string, string[]> = {}
    for (const a of sa ?? []) {
      if (!map[a.service_id]) map[a.service_id] = []
      map[a.service_id].push(a.profile_id)
    }
    setAssignments(map)
    setLoading(false)
  }

  async function createService(e: React.FormEvent) {
    e.preventDefault()
    if (!newSvc.nom.trim()) return
    const ordre = (services.length || 0) + 1
    await createClient().from('services').insert({ ecole_id: ecoleId, nom: newSvc.nom.trim(), description: newSvc.description.trim() || null, ordre, actif: true })
    setNewSvc({ nom: '', description: '' })
    await load()
  }

  async function updateService(id: string, patch: any) {
    await createClient().from('services').update(patch).eq('id', id)
    await load()
  }

  async function toggleAgent(serviceId: string, profileId: string) {
    const s = createClient()
    const isAssigned = (assignments[serviceId] || []).includes(profileId)
    if (isAssigned) {
      await s.from('service_agents').delete().eq('service_id', serviceId).eq('profile_id', profileId)
    } else {
      await s.from('service_agents').insert({ service_id: serviceId, profile_id: profileId })
    }
    await load()
  }

  async function moveService(id: string, direction: 'up' | 'down') {
    const idx = services.findIndex(x => x.id === id)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= services.length) return
    const a = services[idx], b = services[swapIdx]
    const s = createClient()
    await s.from('services').update({ ordre: b.ordre }).eq('id', a.id)
    await s.from('services').update({ ordre: a.ordre }).eq('id', b.id)
    await load()
  }

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div>
      <p style={{ fontSize: 12, color: '#64748B', marginTop: 0 }}>Configurez les services destinataires de la messagerie + les agents qui reçoivent les messages.</p>
      <form onSubmit={createService} style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Nouveau service</label>
          <input type="text" value={newSvc.nom} onChange={e => setNewSvc(p => ({ ...p, nom: e.target.value }))} placeholder="Ex : Prof Mendel" required style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Description (opt.)</label>
          <input type="text" value={newSvc.description} onChange={e => setNewSvc(p => ({ ...p, description: e.target.value }))} placeholder="Quand contacter ce service…" style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <button type="submit" style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {services.map((svc, i) => {
          const assigned = assignments[svc.id] || []
          const isEditing = editId === svc.id
          return (
            <div key={svc.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, background: svc.actif ? '#fff' : '#F8FAFC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input type="text" defaultValue={svc.nom} onBlur={e => updateService(svc.id, { nom: e.target.value })} style={{ padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, fontWeight: 600 }} />
                      <input type="text" defaultValue={svc.description || ''} onBlur={e => updateService(svc.id, { description: e.target.value || null })} style={{ padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12 }} />
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: svc.actif ? '#1E293B' : '#94A3B8' }}>{svc.nom}{!svc.actif && ' (inactif)'}</div>
                      {svc.description && <div style={{ fontSize: 11, color: '#64748B' }}>{svc.description}</div>}
                      {assigned.length === 0 && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>⚠️ Aucun agent assigné — messages invisibles</div>}
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => moveService(svc.id, 'up')} disabled={i === 0} style={{ background: '#F1F5F9', border: 'none', borderRadius: 5, padding: '5px 8px', fontSize: 11, cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => moveService(svc.id, 'down')} disabled={i === services.length - 1} style={{ background: '#F1F5F9', border: 'none', borderRadius: 5, padding: '5px 8px', fontSize: 11, cursor: i === services.length - 1 ? 'not-allowed' : 'pointer', opacity: i === services.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button onClick={() => setEditId(isEditing ? null : svc.id)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 5, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}>{isEditing ? '✓' : '✎'}</button>
                  <button onClick={() => updateService(svc.id, { actif: !svc.actif })} style={{ background: svc.actif ? '#FEF2F2' : '#ECFDF5', color: svc.actif ? '#991B1B' : '#065F46', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{svc.actif ? 'Désactiver' : 'Activer'}</button>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Agents assignés ({assigned.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {agents.map(a => {
                    const on = assigned.includes(a.id)
                    const nom = `${a.prenom ?? ''} ${a.nom ?? ''}`.trim() || a.id.substring(0, 8)
                    return (
                      <button key={a.id} onClick={() => toggleAgent(svc.id, a.id)} style={{ background: on ? '#2563EB' : '#F1F5F9', color: on ? '#fff' : '#475569', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>{on ? '✓' : '+'} {nom}{a.role === 'super_admin' && ' (super)'}</button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
