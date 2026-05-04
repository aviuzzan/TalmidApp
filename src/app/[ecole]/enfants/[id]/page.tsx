'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function EnfantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const enfantId = params.id as string

  const [enfant, setEnfant] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [inscriptions, setInscriptions] = useState<any[]>([])
  const [contrats, setContrats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<any>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [enfantId])

  async function load() {
    const s = createClient()
    const [{ data: e }, { data: cls }] = await Promise.all([
      s.from('enfants')
        .select('*, familles(*), classes(id, nom)')
        .eq('id', enfantId)
        .single(),
      s.from('classes').select('id, nom').order('nom'),
    ])

    if (e) {
      setEnfant(e)
      setFamille(e.familles)
      setForm({ ...e })
    }
    setClasses(cls ?? [])

    // Inscriptions N+1
    const [{ data: inscr }, { data: cont }] = await Promise.all([
      s.from('inscriptions_pedagogiques')
        .select('*, secteurs(nom)')
        .eq('enfant_id', enfantId)
        .order('annee_scolaire', { ascending: false }),
      s.from('contrat_enfants')
        .select('*, contrats_scolarisation(annee_scolaire, statut, montant_total, mode_reglement)')
        .eq('enfant_id', enfantId),
    ])
    setInscriptions(inscr ?? [])
    setContrats(cont ?? [])
    setLoading(false)
  }

  async function sauvegarder() {
    setSaving(true)
    await createClient().from('enfants').update({
      prenom: form.prenom, nom: form.nom,
      date_naissance: form.date_naissance || null,
      classe_id: form.classe_id || null,
      transport: form.transport,
      instruction_religieuse: form.instruction_religieuse,
      etude_garderie: form.etude_garderie,
    }).eq('id', enfantId)
    await load()
    setEditMode(false)
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>
  if (!enfant) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Élève introuvable</div>

  const STATUT_COLOR: Record<string, string> = {
    brouillon: '#94A3B8', soumis: '#F59E0B', accepte: '#10B981', refuse: '#EF4444', valide: '#10B981',
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => router.push(`/${ecole.slug}/enfants`)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>
          ← Retour
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {enfant.prenom?.[0]?.toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>
              {enfant.prenom} {enfant.nom}
            </h1>
            <button
              onClick={() => router.push(`/${ecole.slug}/familles/${enfant.famille_id}`)}
              style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
              Famille {famille?.nom} →
            </button>
          </div>
        </div>
        <button
          onClick={() => editMode ? sauvegarder() : setEditMode(true)}
          disabled={saving}
          style={{ background: editMode ? '#2563EB' : '#F1F5F9', border: `1px solid ${editMode ? '#2563EB' : '#E2E8F0'}`, borderRadius: 9, padding: '9px 18px', fontSize: 13, color: editMode ? '#fff' : '#475569', cursor: 'pointer', fontWeight: editMode ? 600 : 400 }}>
          {saving ? 'Enregistrement...' : editMode ? '✓ Enregistrer' : '✏️ Modifier'}
        </button>
        {editMode && (
          <button onClick={() => { setEditMode(false); setForm({ ...enfant }) }}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '9px 14px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
            Annuler
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Infos élève */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>
            Informations élève
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Prénom</label>
              {editMode
                ? <input style={inp} value={form.prenom || ''} onChange={e => setForm((p: any) => ({ ...p, prenom: e.target.value }))} />
                : <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{enfant.prenom}</div>
              }
            </div>
            <div>
              <label style={lbl}>Nom</label>
              {editMode
                ? <input style={inp} value={form.nom || ''} onChange={e => setForm((p: any) => ({ ...p, nom: e.target.value }))} />
                : <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{enfant.nom}</div>
              }
            </div>
          </div>
          <div>
            <label style={lbl}>Date de naissance</label>
            {editMode
              ? <input style={inp} type="date" value={form.date_naissance || ''} onChange={e => setForm((p: any) => ({ ...p, date_naissance: e.target.value }))} />
              : <div style={{ fontSize: 13, color: '#1E293B' }}>{enfant.date_naissance ? new Date(enfant.date_naissance).toLocaleDateString('fr-FR') : '—'}</div>
            }
          </div>
          <div>
            <label style={lbl}>Classe actuelle</label>
            {editMode
              ? <select style={inp} value={form.classe_id || ''} onChange={e => setForm((p: any) => ({ ...p, classe_id: e.target.value || null }))} >
                  <option value="">Non affecté</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              : <div style={{ fontSize: 13, color: '#1E293B' }}>
                  {enfant.classes?.nom
                    ? <span style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{enfant.classes.nom}</span>
                    : '—'}
                </div>
            }
          </div>
          <div>
            <label style={lbl}>Options</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'transport', label: '🚌 Transport' },
                { key: 'instruction_religieuse', label: '✡️ Instruction religieuse' },
                { key: 'etude_garderie', label: '📚 Étude / Garderie' },
              ].map(opt => (
                <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E293B', cursor: editMode ? 'pointer' : 'default' }}>
                  <input type="checkbox"
                    checked={editMode ? !!form[opt.key] : !!enfant[opt.key]}
                    disabled={!editMode}
                    onChange={e => editMode && setForm((p: any) => ({ ...p, [opt.key]: e.target.checked }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Famille */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Famille
            <button onClick={() => router.push(`/${ecole.slug}/familles/${enfant.famille_id}`)}
              style={{ fontSize: 11, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              Voir la fiche →
            </button>
          </div>
          {[
            { label: 'Nom de famille', value: famille?.nom },
            { label: 'Email', value: famille?.email_parent1 },
            { label: 'Téléphone', value: famille?.telephone_parent1 },
            { label: 'Adresse', value: famille?.adresse_parent1 },
            { label: 'Situation', value: famille?.situation_familiale },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
              <div style={{ fontSize: 13, color: f.value ? '#1E293B' : '#CBD5E1' }}>{f.value || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Inscriptions N+1 */}
      {inscriptions.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
            Inscriptions N+1
          </div>
          {inscriptions.map((insc, i) => (
            <div key={insc.id} style={{ padding: '12px 20px', borderBottom: i < inscriptions.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{insc.annee_scolaire}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Secteur : {insc.secteurs?.nom || '—'} · Classe : {insc.classe_souhaitee || '—'}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                color: STATUT_COLOR[insc.statut] || '#94A3B8',
                background: `${STATUT_COLOR[insc.statut]}18` || 'rgba(148,163,184,0.1)',
              }}>
                {insc.statut.charAt(0).toUpperCase() + insc.statut.slice(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Contrats */}
      {contrats.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
            Contrats de scolarisation
          </div>
          {contrats.map((c, i) => (
            <div key={c.id} style={{ padding: '12px 20px', borderBottom: i < contrats.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{c.contrats_scolarisation?.annee_scolaire}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  {c.classe_prevue || '—'} · {c.contrats_scolarisation?.mode_reglement || '—'}
                  {c.sous_total ? ` · ${c.sous_total.toLocaleString('fr-FR')} €` : ''}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                color: STATUT_COLOR[c.contrats_scolarisation?.statut] || '#94A3B8',
                background: `${STATUT_COLOR[c.contrats_scolarisation?.statut]}18`,
              }}>
                {c.contrats_scolarisation?.statut || '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
