'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Allergie = { nom: string; severite: 'legere' | 'moyenne' | 'severe'; traitement?: string }
type NiveauKodech = 'aucun' | 'debut' | 'fluide' | 'expert'

type FicheMedicale = {
  allergies: Allergie[]
  pai_actif: boolean
  pai_motif: string
  pai_protocole: string
  pai_date_signature: string
  vaccinations: { dtp_a_jour?: boolean; dernier_rappel?: string; ror?: boolean; autres?: string }
  medecin_nom: string
  medecin_telephone: string
  medecin_adresse: string
  medecin_ecole_nom: string
  medecin_ecole_telephone: string
  autorisation_urgence: boolean
  autorisation_hospitalisation: boolean
  autorisation_transport_samu: boolean
  autorisation_anesthesie: boolean
  notes_medicales: string
  groupe_sanguin: string
}

type FicheCommunautaire = {
  niveau_kodech: {
    lecture_hebreu?: NiveauKodech
    ecriture?: NiveauKodech
    priere?: NiveauKodech
    brakhot?: NiveauKodech
  }
  langue_maison: string[]
  langue_autre_precision: string
  kacherout: 'oui_strict' | 'oui_partiel' | 'non' | 'non_renseigne'
  presence_chabbat: 'regulier' | 'occasionnel' | 'jamais' | 'non_renseigne'
  shomer_shabbat: boolean | null
  notes_communaute: string
}

const EMPTY_MED: FicheMedicale = {
  allergies: [],
  pai_actif: false, pai_motif: '', pai_protocole: '', pai_date_signature: '',
  vaccinations: {},
  medecin_nom: '', medecin_telephone: '', medecin_adresse: '',
  medecin_ecole_nom: '', medecin_ecole_telephone: '',
  autorisation_urgence: true, autorisation_hospitalisation: true,
  autorisation_transport_samu: true, autorisation_anesthesie: false,
  notes_medicales: '', groupe_sanguin: '',
}

const EMPTY_COMM: FicheCommunautaire = {
  niveau_kodech: {},
  langue_maison: [],
  langue_autre_precision: '',
  kacherout: 'non_renseigne',
  presence_chabbat: 'non_renseigne',
  shomer_shabbat: null,
  notes_communaute: '',
}

export default function FicheSantePage() {
  const params = useParams()
  const router = useRouter()
  const ecole = useEcole()
  const enfantId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enfantNom, setEnfantNom] = useState('')
  const [med, setMed] = useState<FicheMedicale>(EMPTY_MED)
  const [comm, setComm] = useState<FicheCommunautaire>(EMPTY_COMM)
  const [tab, setTab] = useState<'medical' | 'communautaire'>('medical')
  const [msg, setMsg] = useState('')

  useEffect(() => { if (enfantId && ecole?.id) load() }, [enfantId, ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    // Enfant info
    const { data: enfant } = await s.from('enfants')
      .select('prenom, nom')
      .eq('id', enfantId)
      .single()
    if (enfant) setEnfantNom(`${enfant.prenom || ''} ${enfant.nom || ''}`.trim())

    // Fiche médicale
    const { data: medRow } = await s.from('fiches_medicales')
      .select('*').eq('enfant_id', enfantId).maybeSingle()
    if (medRow) {
      setMed({
        allergies: medRow.allergies || [],
        pai_actif: medRow.pai_actif || false,
        pai_motif: medRow.pai_motif || '',
        pai_protocole: medRow.pai_protocole || '',
        pai_date_signature: medRow.pai_date_signature || '',
        vaccinations: medRow.vaccinations || {},
        medecin_nom: medRow.medecin_nom || '',
        medecin_telephone: medRow.medecin_telephone || '',
        medecin_adresse: medRow.medecin_adresse || '',
        medecin_ecole_nom: medRow.medecin_ecole_nom || '',
        medecin_ecole_telephone: medRow.medecin_ecole_telephone || '',
        autorisation_urgence: medRow.autorisation_urgence ?? true,
        autorisation_hospitalisation: medRow.autorisation_hospitalisation ?? true,
        autorisation_transport_samu: medRow.autorisation_transport_samu ?? true,
        autorisation_anesthesie: medRow.autorisation_anesthesie ?? false,
        notes_medicales: medRow.notes_medicales || '',
        groupe_sanguin: medRow.groupe_sanguin || '',
      })
    }

    // Fiche communautaire
    const { data: commRow } = await s.from('fiches_communautaires')
      .select('*').eq('enfant_id', enfantId).maybeSingle()
    if (commRow) {
      setComm({
        niveau_kodech: commRow.niveau_kodech || {},
        langue_maison: commRow.langue_maison || [],
        langue_autre_precision: commRow.langue_autre_precision || '',
        kacherout: commRow.kacherout || 'non_renseigne',
        presence_chabbat: commRow.presence_chabbat || 'non_renseigne',
        shomer_shabbat: commRow.shomer_shabbat,
        notes_communaute: commRow.notes_communaute || '',
      })
    }
    setLoading(false)
  }

  async function saveMedical() {
    setSaving(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const { error } = await s.from('fiches_medicales').upsert({
      enfant_id: enfantId, ecole_id: ecole.id,
      ...med,
      updated_by: session?.user.id,
    }, { onConflict: 'enfant_id' })
    if (error) setMsg('❌ ' + error.message)
    else setMsg('✓ Fiche médicale enregistrée')
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function saveComm() {
    setSaving(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const { error } = await s.from('fiches_communautaires').upsert({
      enfant_id: enfantId, ecole_id: ecole.id,
      ...comm,
      updated_by: session?.user.id,
    }, { onConflict: 'enfant_id' })
    if (error) setMsg('❌ ' + error.message)
    else setMsg('✓ Fiche communautaire enregistrée')
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 11px', border: '1px solid #E2E8F0',
    borderRadius: 7, fontSize: 13, color: '#1E293B', outline: 'none', background: '#fff', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 5 }
  const section: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, marginBottom: 14 }
  const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: 12, cursor: 'pointer', marginBottom: 6 }}>← Retour</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🏥 Santé & Communauté</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>{enfantNom}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
        {[{ k: 'medical', l: '🏥 Fiche médicale' }, { k: 'communautaire', l: '🕯️ Fiche communautaire' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.k ? '#fff' : 'transparent',
              color: tab === t.k ? '#1E293B' : '#64748B',
              fontSize: 12, fontWeight: tab === t.k ? 600 : 400,
              boxShadow: tab === t.k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>{t.l}</button>
        ))}
      </div>

      {msg && (
        <div style={{
          background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2',
          color: msg.startsWith('✓') ? '#065F46' : '#991B1B',
          padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
        }}>{msg}</div>
      )}

      {tab === 'medical' && (
        <div>
          {/* Allergies */}
          <div style={section}>
            <div style={sectionTitle}>Allergies</div>
            {med.allergies.length === 0 && <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 10 }}>Aucune allergie déclarée</div>}
            {med.allergies.map((a, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 8, marginBottom: 8 }}>
                <input style={inp} placeholder="Allergène (ex: arachide)" value={a.nom}
                  onChange={e => setMed({ ...med, allergies: med.allergies.map((x, j) => j === i ? { ...x, nom: e.target.value } : x) })} />
                <select style={inp} value={a.severite}
                  onChange={e => setMed({ ...med, allergies: med.allergies.map((x, j) => j === i ? { ...x, severite: e.target.value as any } : x) })}>
                  <option value="legere">Légère</option>
                  <option value="moyenne">Moyenne</option>
                  <option value="severe">Sévère</option>
                </select>
                <input style={inp} placeholder="Traitement / EpiPen…" value={a.traitement || ''}
                  onChange={e => setMed({ ...med, allergies: med.allergies.map((x, j) => j === i ? { ...x, traitement: e.target.value } : x) })} />
                <button onClick={() => setMed({ ...med, allergies: med.allergies.filter((_, j) => j !== i) })}
                  style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 7, padding: '0 10px', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ))}
            <button onClick={() => setMed({ ...med, allergies: [...med.allergies, { nom: '', severite: 'legere', traitement: '' }] })}
              style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter une allergie</button>
          </div>

          {/* PAI */}
          <div style={section}>
            <div style={sectionTitle}>PAI (Projet d'Accueil Individualisé)</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
              <input type="checkbox" checked={med.pai_actif} onChange={e => setMed({ ...med, pai_actif: e.target.checked })} />
              <span>PAI actif pour cet enfant</span>
            </label>
            {med.pai_actif && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={label}>Motif</label>
                  <input style={inp} value={med.pai_motif} onChange={e => setMed({ ...med, pai_motif: e.target.value })} placeholder="Ex: asthme sévère" />
                </div>
                <div>
                  <label style={label}>Date signature</label>
                  <input type="date" style={inp} value={med.pai_date_signature} onChange={e => setMed({ ...med, pai_date_signature: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={label}>Protocole / consignes</label>
                  <textarea style={{ ...inp, minHeight: 80 }} value={med.pai_protocole} onChange={e => setMed({ ...med, pai_protocole: e.target.value })} placeholder="Procédure d'urgence, médicaments à administrer…" />
                </div>
              </div>
            )}
          </div>

          {/* Vaccinations */}
          <div style={section}>
            <div style={sectionTitle}>Vaccinations</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={med.vaccinations.dtp_a_jour || false} onChange={e => setMed({ ...med, vaccinations: { ...med.vaccinations, dtp_a_jour: e.target.checked } })} />
                <span>DTP à jour</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={med.vaccinations.ror || false} onChange={e => setMed({ ...med, vaccinations: { ...med.vaccinations, ror: e.target.checked } })} />
                <span>ROR à jour</span>
              </label>
              <div>
                <label style={label}>Date dernier rappel</label>
                <input type="date" style={inp} value={med.vaccinations.dernier_rappel || ''} onChange={e => setMed({ ...med, vaccinations: { ...med.vaccinations, dernier_rappel: e.target.value } })} />
              </div>
              <div>
                <label style={label}>Groupe sanguin</label>
                <select style={inp} value={med.groupe_sanguin} onChange={e => setMed({ ...med, groupe_sanguin: e.target.value })}>
                  <option value="">Non renseigné</option>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <label style={label}>Autres vaccins / remarques</label>
            <textarea style={{ ...inp, minHeight: 60 }} value={med.vaccinations.autres || ''} onChange={e => setMed({ ...med, vaccinations: { ...med.vaccinations, autres: e.target.value } })} />
          </div>

          {/* Médecins */}
          <div style={section}>
            <div style={sectionTitle}>Médecin traitant</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={label}>Nom</label><input style={inp} value={med.medecin_nom} onChange={e => setMed({ ...med, medecin_nom: e.target.value })} /></div>
              <div><label style={label}>Téléphone</label><input style={inp} value={med.medecin_telephone} onChange={e => setMed({ ...med, medecin_telephone: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={label}>Adresse cabinet</label><input style={inp} value={med.medecin_adresse} onChange={e => setMed({ ...med, medecin_adresse: e.target.value })} /></div>
            </div>
            <div style={sectionTitle}>Médecin référent école (optionnel)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={label}>Nom</label><input style={inp} value={med.medecin_ecole_nom} onChange={e => setMed({ ...med, medecin_ecole_nom: e.target.value })} /></div>
              <div><label style={label}>Téléphone</label><input style={inp} value={med.medecin_ecole_telephone} onChange={e => setMed({ ...med, medecin_ecole_telephone: e.target.value })} /></div>
            </div>
          </div>

          {/* Autorisations parentales */}
          <div style={section}>
            <div style={sectionTitle}>Autorisations parentales</div>
            {[
              { key: 'autorisation_urgence', label: "Autorise l'administration des soins d'urgence" },
              { key: 'autorisation_hospitalisation', label: "Autorise l'hospitalisation si nécessaire" },
              { key: 'autorisation_transport_samu', label: 'Autorise le transport SAMU / pompiers' },
              { key: 'autorisation_anesthesie', label: 'Autorise une anesthésie (intervention urgente)' },
            ].map(a => (
              <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
                <input type="checkbox" checked={(med as any)[a.key]} onChange={e => setMed({ ...med, [a.key]: e.target.checked } as any)} />
                <span>{a.label}</span>
              </label>
            ))}
          </div>

          {/* Notes libres */}
          <div style={section}>
            <div style={sectionTitle}>Notes médicales libres</div>
            <textarea style={{ ...inp, minHeight: 100 }} value={med.notes_medicales} onChange={e => setMed({ ...med, notes_medicales: e.target.value })}
              placeholder="Antécédents, traitements en cours, observations particulières…" />
          </div>

          <button onClick={saveMedical} disabled={saving}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Enregistrement…' : '💾 Enregistrer la fiche médicale'}
          </button>
        </div>
      )}

      {tab === 'communautaire' && (
        <div>
          {/* Niveau Kodech */}
          <div style={section}>
            <div style={sectionTitle}>Niveau Kodech (יהדות)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { k: 'lecture_hebreu', l: "Lecture de l'hébreu" },
                { k: 'ecriture', l: 'Écriture' },
                { k: 'priere', l: 'Prière (Tefilot)' },
                { k: 'brakhot', l: 'Brakhot' },
              ].map(item => (
                <div key={item.k}>
                  <label style={label}>{item.l}</label>
                  <select style={inp} value={(comm.niveau_kodech as any)[item.k] || ''}
                    onChange={e => setComm({ ...comm, niveau_kodech: { ...comm.niveau_kodech, [item.k]: e.target.value || undefined } as any })}>
                    <option value="">Non renseigné</option>
                    <option value="aucun">Aucun</option>
                    <option value="debut">Débutant</option>
                    <option value="fluide">Fluide</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Langue maison */}
          <div style={section}>
            <div style={sectionTitle}>Langue parlée à la maison</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {[
                { v: 'fr', l: 'Français' },
                { v: 'he', l: 'Hébreu' },
                { v: 'yi', l: 'Yiddish' },
                { v: 'en', l: 'Anglais' },
                { v: 'autre', l: 'Autre' },
              ].map(opt => {
                const active = comm.langue_maison.includes(opt.v)
                return (
                  <button key={opt.v} onClick={() => setComm({
                    ...comm,
                    langue_maison: active ? comm.langue_maison.filter(x => x !== opt.v) : [...comm.langue_maison, opt.v]
                  })}
                    style={{
                      padding: '6px 12px', borderRadius: 16, border: '1px solid',
                      borderColor: active ? '#2563EB' : '#E2E8F0',
                      background: active ? '#EFF6FF' : '#fff',
                      color: active ? '#1E40AF' : '#475569',
                      fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
                    }}>{opt.l}</button>
                )
              })}
            </div>
            {comm.langue_maison.includes('autre') && (
              <input style={inp} placeholder="Précisez la/les autre(s) langue(s)"
                value={comm.langue_autre_precision}
                onChange={e => setComm({ ...comm, langue_autre_precision: e.target.value })} />
            )}
          </div>

          {/* Pratiques */}
          <div style={section}>
            <div style={sectionTitle}>Pratiques familiales</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Kacherout</label>
                <select style={inp} value={comm.kacherout} onChange={e => setComm({ ...comm, kacherout: e.target.value as any })}>
                  <option value="non_renseigne">Non renseigné</option>
                  <option value="oui_strict">Oui (strict)</option>
                  <option value="oui_partiel">Oui (partiel)</option>
                  <option value="non">Non</option>
                </select>
              </div>
              <div>
                <label style={label}>Présence Chabbat</label>
                <select style={inp} value={comm.presence_chabbat} onChange={e => setComm({ ...comm, presence_chabbat: e.target.value as any })}>
                  <option value="non_renseigne">Non renseigné</option>
                  <option value="regulier">Régulier</option>
                  <option value="occasionnel">Occasionnel</option>
                  <option value="jamais">Jamais</option>
                </select>
              </div>
              <div>
                <label style={label}>Shomer Shabbat</label>
                <select style={inp}
                  value={comm.shomer_shabbat === null ? '' : (comm.shomer_shabbat ? 'oui' : 'non')}
                  onChange={e => setComm({ ...comm, shomer_shabbat: e.target.value === '' ? null : e.target.value === 'oui' })}>
                  <option value="">Non renseigné</option>
                  <option value="oui">Oui</option>
                  <option value="non">Non</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={section}>
       page.tsx     <div style={sectionTitle}>Notes communauté</div>
            <textarea style={{ ...inp, minHeight: 100 }} value={comm.notes_communaute} onChange={e => setComm({ ...comm, notes_communaute: e.target.value })}
              placeholder="Particularités, attaches communautaires, intérêts religieux…" />
          </div>

          <button onClick={saveComm} disabled={saving}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Enregistrement…' : '💾 Enregistrer la fiche communautaire'}
          </button>
        </div>
      )}
    </div>
  )
}
