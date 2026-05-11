'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Enfant = { id: string; prenom: string; nom: string }
type FicheMed = any
type FicheComm = any

export default function PortailSantePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enfants, setEnfants] = useState<Enfant[]>([])
  const [selId, setSelId] = useState<string>('')
  const [med, setMed] = useState<FicheMed>(null)
  const [comm, setComm] = useState<FicheComm>(null)
  const [tab, setTab] = useState<'medical' | 'communautaire'>('medical')
  const [msg, setMsg] = useState('')

  useEffect(() => { loadEnfants() }, [])
  useEffect(() => { if (selId) loadFiches(selId) }, [selId])

  async function loadEnfants() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) return
    const { data: profile } = await s.from('profiles').select('famille_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    const { data: list } = await s.from('enfants').select('id, prenom, nom').eq('famille_id', profile.famille_id).order('prenom')
    setEnfants(list || [])
    if (list && list.length > 0) setSelId(list[0].id)
    setLoading(false)
  }

  async function loadFiches(enfantId: string) {
    const s = createClient()
    const { data: m } = await s.from('fiches_medicales').select('*').eq('enfant_id', enfantId).maybeSingle()
    setMed(m || null)
    const { data: c } = await s.from('fiches_communautaires').select('*').eq('enfant_id', enfantId).maybeSingle()
    setComm(c || null)
  }

  async function saveAllergies(allergies: any[]) {
    setSaving(true); setMsg('')
    const s = createClient()
    const { error } = await s.from('fiches_medicales').upsert({
      enfant_id: selId,
      allergies,
      ...(med || {}),
      allergies: allergies,
    }, { onConflict: 'enfant_id' })
    if (error) setMsg('❌ ' + error.message)
    else { setMsg('✓ Enregistré'); loadFiches(selId) }
    setSaving(false)
    setTimeout(() => setMsg(''), 2500)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (enfants.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Aucun enfant rattaché à votre compte.</div>

  const box: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, marginBottom: 14 }
  const title: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: 0.3 }
  const value: React.CSSProperties = { fontSize: 13, color: '#1E293B', marginTop: 2, marginBottom: 8 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🏥 Santé & Communauté</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>Informations médicales et communautaires de vos enfants</p>
      </div>

      {enfants.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {enfants.map(e => (
            <button key={e.id} onClick={() => setSelId(e.id)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid',
                borderColor: selId === e.id ? '#2563EB' : '#E2E8F0',
                background: selId === e.id ? '#EFF6FF' : '#fff',
                color: selId === e.id ? '#1E40AF' : '#475569',
                fontSize: 13, fontWeight: selId === e.id ? 600 : 400, cursor: 'pointer',
              }}>{e.prenom} {e.nom}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
        {[{ k: 'medical', l: '🏥 Médicale' }, { k: 'communautaire', l: '🕯️ Communautaire' }].map(t => (
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
          <div style={box}>
            <div style={title}>Allergies</div>
            {!med?.allergies || med.allergies.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>Aucune allergie déclarée. Contactez l'école pour les renseigner.</div>
            ) : (
              med.allergies.map((a: any, i: number) => (
                <div key={i} style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                  <strong>{a.nom}</strong> — sévérité : <em>{a.severite}</em>
                  {a.traitement && <div style={{ fontSize: 12, color: '#92400E', marginTop: 3 }}>Traitement : {a.traitement}</div>}
                </div>
              ))
            )}
          </div>

          <div style={box}>
            <div style={title}>PAI (Projet d'Accueil Individualisé)</div>
            {med?.pai_actif ? (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: '#1E40AF', fontWeight: 600, marginBottom: 4 }}>✓ PAI actif</div>
                {med.pai_motif && <div style={{ ...label }}>Motif</div>}{med.pai_motif && <div style={value}>{med.pai_motif}</div>}
                {med.pai_protocole && <div style={{ ...label }}>Protocole</div>}{med.pai_protocole && <div style={value}>{med.pai_protocole}</div>}
              </div>
            ) : (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>Aucun PAI actif</div>
            )}
          </div>

          <div style={box}>
            <div style={title}>Médecin traitant</div>
            {med?.medecin_nom ? (
              <>
                <div style={label}>Nom</div><div style={value}>{med.medecin_nom}</div>
                {med.medecin_telephone && <><div style={label}>Téléphone</div><div style={value}>{med.medecin_telephone}</div></>}
                {med.medecin_adresse && <><div style={label}>Adresse</div><div style={value}>{med.medecin_adresse}</div></>}
              </>
            ) : (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>Non renseigné</div>
            )}
          </div>

          <div style={box}>
            <div style={title}>Vaccinations & infos</div>
            <div style={label}>Groupe sanguin</div><div style={value}>{med?.groupe_sanguin || '—'}</div>
            <div style={label}>DTP à jour</div><div style={value}>{med?.vaccinations?.dtp_a_jour ? '✓ Oui' : '— Non renseigné'}</div>
            <div style={label}>ROR à jour</div><div style={value}>{med?.vaccinations?.ror ? '✓ Oui' : '— Non renseigné'}</div>
            {med?.vaccinations?.dernier_rappel && (<><div style={label}>Dernier rappel</div><div style={value}>{new Date(med.vaccinations.dernier_rappel).toLocaleDateString('fr-FR')}</div></>)}
          </div>

          <div style={{ ...box, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <div style={{ ...title, color: '#92400E', borderBottomColor: '#FDE68A' }}>ℹ️ Comment modifier ces informations ?</div>
            <p style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5, margin: 0 }}>
              Les informations médicales sont saisies et modifiées par l'école. Pour toute mise à jour
              (allergies, PAI, vaccinations, médecin traitant…), contactez directement le secrétariat.
            </p>
          </div>
        </div>
      )}

      {tab === 'communautaire' && (
        <div>
          <div style={box}>
            <div style={title}>Niveau Kodech (יהדות)</div>
            {comm?.niveau_kodech && Object.keys(comm.niveau_kodech).length > 0 ? (
              <>
                {comm.niveau_kodech.lecture_hebreu && (<><div style={label}>Lecture hébreu</div><div style={value}>{comm.niveau_kodech.lecture_hebreu}</div></>)}
                {comm.niveau_kodech.ecriture && (<><div style={label}>Écriture</div><div style={value}>{comm.niveau_kodech.ecriture}</div></>)}
                {comm.niveau_kodech.priere && (<><div style={label}>Prière (Tefilot)</div><div style={value}>{comm.niveau_kodech.priere}</div></>)}
                {comm.niveau_kodech.brakhot && (<><div style={label}>Brakhot</div><div style={value}>{comm.niveau_kodech.brakhot}</div></>)}
              </>
            ) : (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>Non renseigné</div>
            )}
          </div>

          <div style={box}>
            <div style={title}>Langue & pratiques</div>
            <div style={label}>Langue parlée à la maison</div>
            <div style={value}>{comm?.langue_maison?.length ? comm.langue_maison.join(', ') : '—'}</div>
            <div style={label}>Kacherout</div>
            <div style={value}>{comm?.kacherout === 'oui_strict' ? 'Oui (strict)' : comm?.kacherout === 'oui_partiel' ? 'Oui (partiel)' : comm?.kacherout === 'non' ? 'Non' : '— Non renseigné'}</div>
            <div style={label}>Présence Chabbat</div>
            <div style={value}>{comm?.presence_chabbat === 'regulier' ? 'Régulier' : comm?.presence_chabbat === 'occasionnel' ? 'Occasionnel' : comm?.presence_chabbat === 'jamais' ? 'Jamais' : '— Non renseigné'}</div>
            <div style={label}>Shomer Shabbat</div>
            <div style={value}>{comm?.shomer_shabbat === true ? '✓ Oui' : comm?.shomer_shabbat === false ? 'Non' : '— Non renseigné'}</div>
          </div>

          <div style={{ ...box, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <div style={{ ...title, color: '#92400E', borderBottomColor: '#FDE68A' }}>ℹ️ Mise à jour</div>
            <p style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5, margin: 0 }}>
              Ces informations sont gérées par l'école. Contactez le secrétariat pour toute modification.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
