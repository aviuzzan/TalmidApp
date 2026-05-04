'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { ANNEE_COURANTE } from '@/lib/inscriptions'

type Tab = 'classes' | 'secteurs' | 'tarifs' | 'reductions_fn' | 'modes_reglement' | 'paiement' | 'transport'

export default function ParametresPage() {
  const ecole = useEcole()
  const searchParams = useSearchParams()
  const initTab = (searchParams.get('tab') === 'inscriptions' ? 'secteurs' : 'classes') as Tab
  const [tab, setTab] = useState<Tab>(initTab)
  const [annee, setAnnee] = useState(ANNEE_COURANTE)

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'classes', label: 'Classes', icon: '🏫' },
    { id: 'secteurs', label: 'Secteurs', icon: '🗂️' },
    { id: 'tarifs', label: 'Tarifs', icon: '💶' },
    { id: 'reductions_fn', label: 'Réd. famille', icon: '👨‍👩‍👧' },
    { id: 'modes_reglement', label: 'Modes règlement', icon: '💳' },
    { id: 'paiement', label: 'Paiement', icon: '📋' },
    { id: 'transport', label: 'Transport', icon: '🚌' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Paramètres</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{ecole.nom}</p>
        </div>
        {(tab === 'tarifs' || tab === 'reductions_fn') && (
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#1E293B', outline: 'none' }}>
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
        {tab === 'classes' && <ClassesLegacyTab ecoleId={ecole.id} />}
        {tab === 'paiement' && <PlaceholderTab label="Modes de paiement" />}
        {tab === 'transport' && <PlaceholderTab label="Transport" />}
      </div>
    </div>
  )
}

// ── SECTEURS ──
function SecteursTab({ ecoleId }: { ecoleId: string }) {
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [newNom, setNewNom] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [ecoleId])

  async function load() {
    const { data } = await createClient().from('secteurs').select('*, classes(id, nom)').eq('ecole_id', ecoleId).order('ordre')
    setSecteurs(data ?? [])
  }

  async function ajouter() {
    if (!newNom.trim()) return
    setSaving(true)
    await createClient().from('secteurs').insert({ ecole_id: ecoleId, nom: newNom.trim(), ordre: secteurs.length })
    setNewNom(''); await load(); setSaving(false)
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer ce secteur ?')) return
    await createClient().from('secteurs').delete().eq('id', id)
    await load()
  }

  async function toggleActif(id: string, actif: boolean) {
    await createClient().from('secteurs').update({ actif: !actif }).eq('id', id)
    await load()
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input style={{ ...inp, flex: 1 }} value={newNom} onChange={e => setNewNom(e.target.value)}
          placeholder="Nom du secteur (ex: Maternelle, Primaire...)"
          onKeyDown={e => e.key === 'Enter' && ajouter()} />
        <button onClick={ajouter} disabled={saving}
          style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Ajouter
        </button>
      </div>

      {secteurs.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun secteur — commencez par en créer un</div>
      ) : secteurs.map(s => (
        <div key={s.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: '#F8FAFC', gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.actif ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{s.nom}</span>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>{s.classes?.length || 0} classe(s)</span>
            <button onClick={() => toggleActif(s.id, s.actif)}
              style={{ fontSize: 11, color: s.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              {s.actif ? 'Désactiver' : 'Activer'}
            </button>
            <button onClick={() => supprimer(s.id)}
              style={{ fontSize: 11, color: '#EF4444', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              Supprimer
            </button>
          </div>
          {(s.classes?.length || 0) > 0 && (
            <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {s.classes.map((c: any) => (
                <span key={c.id} style={{ fontSize: 12, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px' }}>{c.nom}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── TARIFS ──
function TarifsTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [newTarif, setNewTarif] = useState({ secteur_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const s = createClient()
    Promise.all([
      s.from('secteurs').select('id, nom').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
      s.from('tarifs_secteur').select('*, secteurs(nom)').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('secteur_id').order('ordre'),
    ]).then(([{ data: sec }, { data: tar }]) => {
      setSecteurs(sec ?? [])
      setTarifs(tar ?? [])
    })
  }, [ecoleId, annee])

  async function ajouter() {
    if (!newTarif.nom_poste || !newTarif.montant) return
    setSaving(true)
    await createClient().from('tarifs_secteur').insert({
      ecole_id: ecoleId, annee_scolaire: annee,
      secteur_id: newTarif.secteur_id || null,
      nom_poste: newTarif.nom_poste, montant: parseFloat(newTarif.montant),
      obligatoire: newTarif.obligatoire, code_comptable: newTarif.code_comptable || null,
      ordre: tarifs.length,
    })
    const { data } = await createClient().from('tarifs_secteur').select('*, secteurs(nom)').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre')
    setTarifs(data ?? [])
    setNewTarif({ secteur_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '' })
    setSaving(false)
  }

  async function supprimer(id: string) {
    await createClient().from('tarifs_secteur').delete().eq('id', id)
    setTarifs(p => p.filter(t => t.id !== id))
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>AJOUTER UN POSTE DE TARIF</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 1.5fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>SECTEUR</div>
            <select style={{ ...inp, width: '100%' }} value={newTarif.secteur_id} onChange={e => setNewTarif(p => ({ ...p, secteur_id: e.target.value }))}>
              <option value="">Tous secteurs</option>
              {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>POSTE</div>
            <input style={{ ...inp, width: '100%' }} value={newTarif.nom_poste} onChange={e => setNewTarif(p => ({ ...p, nom_poste: e.target.value }))} placeholder="Ex: Scolarité, Demi-pension..." />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>MONTANT €</div>
            <input style={{ ...inp, width: '100%' }} type="number" value={newTarif.montant} onChange={e => setNewTarif(p => ({ ...p, montant: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>CODE COMPTABLE</div>
            <input style={{ ...inp, width: '100%' }} value={newTarif.code_comptable} onChange={e => setNewTarif(p => ({ ...p, code_comptable: e.target.value }))} placeholder="706xxx" />
          </div>
          <button onClick={ajouter} disabled={saving}
            style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Ajouter
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input type="checkbox" checked={newTarif.obligatoire} onChange={e => setNewTarif(p => ({ ...p, obligatoire: e.target.checked }))} id="obligatoire" />
          <label htmlFor="obligatoire" style={{ fontSize: 12, color: '#64748B', cursor: 'pointer' }}>Poste obligatoire (toujours inclus)</label>
        </div>
      </div>

      {tarifs.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun tarif configuré pour {annee}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              {['Secteur', 'Poste', 'Montant', 'Code compta', 'Obligatoire', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tarifs.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < tarifs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ fontSize: 11, background: '#EFF6FF', color: '#2563EB', borderRadius: 5, padding: '2px 8px' }}>{t.secteurs?.nom || 'Tous'}</span>
                </td>
                <td style={{ padding: '11px 14px', fontWeight: 500, color: '#1E293B' }}>{t.nom_poste}</td>
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#059669' }}>{t.montant.toLocaleString('fr-FR')}€</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{t.code_comptable || '—'}</td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ fontSize: 11, background: t.obligatoire ? 'rgba(16,185,129,0.1)' : '#F1F5F9', color: t.obligatoire ? '#10B981' : '#94A3B8', borderRadius: 5, padding: '2px 8px' }}>
                    {t.obligatoire ? '✓ Oui' : 'Non'}
                  </span>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <button onClick={() => supprimer(t.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </td>
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

  useEffect(() => {
    createClient().from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants')
      .then(({ data }) => setReductions(data ?? []))
  }, [ecoleId, annee])

  async function ajouter() {
    if (!newItem.nb_enfants || !newItem.montant_reduction) return
    await createClient().from('reductions_famille_nombreuse').upsert({
      ecole_id: ecoleId, annee_scolaire: annee,
      nb_enfants: parseInt(newItem.nb_enfants), montant_reduction: parseFloat(newItem.montant_reduction),
    })
    const { data } = await createClient().from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants')
    setReductions(data ?? [])
    setNewItem({ nb_enfants: '', montant_reduction: '' })
  }

  async function supprimer(id: string) {
    await createClient().from('reductions_famille_nombreuse').delete().eq('id', id)
    setReductions(p => p.filter(r => r.id !== id))
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
        Configurez les réductions accordées selon le nombre d'enfants scolarisés dans l'établissement.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>À PARTIR DE N ENFANTS</div>
          <input style={inp} type="number" min="2" value={newItem.nb_enfants} onChange={e => setNewItem(p => ({ ...p, nb_enfants: e.target.value }))} placeholder="2" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>RÉDUCTION (€)</div>
          <input style={inp} type="number" value={newItem.montant_reduction} onChange={e => setNewItem(p => ({ ...p, montant_reduction: e.target.value }))} placeholder="960" />
        </div>
        <button onClick={ajouter}
          style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Ajouter
        </button>
      </div>

      {reductions.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune réduction famille nombreuse configurée</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#F8FAFC', borderRadius: 10, overflow: 'hidden' }}>
          <thead><tr>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Nombre d'enfants</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Réduction</th>
            <th style={{ padding: '10px 16px' }}></th>
          </tr></thead>
          <tbody>
            {reductions.map((r, i) => (
              <tr key={r.id} style={{ borderTop: i > 0 ? '1px solid #E2E8F0' : 'none' }}>
                <td style={{ padding: '11px 16px', fontWeight: 600, color: '#1E293B' }}>{r.nb_enfants} enfants</td>
                <td style={{ padding: '11px 16px', fontWeight: 700, color: '#059669' }}>- {r.montant_reduction.toLocaleString('fr-FR')} €</td>
                <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                  <button onClick={() => supprimer(r.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── MODES DE RÈGLEMENT ──
function ModesReglementTab({ ecoleId }: { ecoleId: string }) {
  const [modes, setModes] = useState<any[]>([])
  const TYPES = [
    { value: 'cheque', label: 'Chèque', desc: 'Chèques remis à la comptabilité' },
    { value: 'sepa', label: 'Prélèvement SEPA', desc: 'Export XML SEPA / Sage Direct' },
    { value: 'gocardless', label: 'GoCardless', desc: 'Prélèvement en ligne (à venir)' },
    { value: 'stripe', label: 'Carte bancaire', desc: 'Paiement en ligne Stripe (à venir)' },
  ]

  useEffect(() => {
    createClient().from('modes_reglement_ecole').select('*').eq('ecole_id', ecoleId).order('ordre')
      .then(({ data }) => setModes(data ?? []))
  }, [ecoleId])

  async function toggle(id: string, actif: boolean) {
    await createClient().from('modes_reglement_ecole').update({ actif: !actif }).eq('id', id)
    setModes(p => p.map(m => m.id === id ? { ...m, actif: !actif } : m))
  }

  async function ajouter(type: string, label: string) {
    if (modes.find(m => m.type === type)) return
    const { data } = await createClient().from('modes_reglement_ecole').insert({ ecole_id: ecoleId, type, label, actif: true, ordre: modes.length }).select().single()
    if (data) setModes(p => [...p, data])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Activez les modes de règlement que vous souhaitez proposer aux familles.</p>
      {TYPES.map(t => {
        const existing = modes.find(m => m.type === t.value)
        const comingSoon = t.value === 'gocardless' || t.value === 'stripe'
        return (
          <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', opacity: comingSoon ? 0.6 : 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                {t.label}
                {comingSoon && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#D97706', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>Bientôt</span>}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{t.desc}</div>
            </div>
            {!comingSoon && (
              existing ? (
                <button onClick={() => toggle(existing.id, existing.actif)}
                  style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: existing.actif ? '#2563EB' : '#CBD5E1', position: 'relative', transition: 'all 0.2s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: existing.actif ? 23 : 3, transition: 'all 0.2s' }} />
                </button>
              ) : (
                <button onClick={() => ajouter(t.value, t.label)}
                  style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
                  Activer
                </button>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── CLASSES (legacy) ──
function ClassesLegacyTab({ ecoleId }: { ecoleId: string }) {
  const [classes, setClasses] = useState<any[]>([])
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [newNom, setNewNom] = useState('')
  const [newSecteur, setNewSecteur] = useState('')

  useEffect(() => {
    const s = createClient()
    Promise.all([
      s.from('classes').select('*, secteurs(nom)').eq('ecole_id', ecoleId).order('nom'),
      s.from('secteurs').select('id, nom').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
    ]).then(([{ data: cl }, { data: sec }]) => { setClasses(cl ?? []); setSecteurs(sec ?? []) })
  }, [ecoleId])

  async function ajouter() {
    if (!newNom.trim()) return
    await createClient().from('classes').insert({ ecole_id: ecoleId, nom: newNom.trim(), secteur_id: newSecteur || null })
    const { data } = await createClient().from('classes').select('*, secteurs(nom)').eq('ecole_id', ecoleId).order('nom')
    setClasses(data ?? []); setNewNom('')
  }

  async function supprimer(id: string) {
    await createClient().from('classes').delete().eq('id', id)
    setClasses(p => p.filter(c => c.id !== id))
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input style={{ ...inp, flex: 1 }} value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nom de la classe (ex: CE1, 6ème A...)" onKeyDown={e => e.key === 'Enter' && ajouter()} />
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

function PlaceholderTab({ label }: { label: string }) {
  return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>{label} — contenu existant</div>
}
