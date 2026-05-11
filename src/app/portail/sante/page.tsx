'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Enfant = { id: string; prenom: string; nom: string }

export default function PortailSantePage() {
  const [loading, setLoading] = useState(true)
  const [enfants, setEnfants] = useState<Enfant[]>([])
  const [selId, setSelId] = useState<string>('')
  const [med, setMed] = useState<any>(null)

  useEffect(() => { loadEnfants() }, [])
  useEffect(() => { if (selId) loadFiche(selId) }, [selId])

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

  async function loadFiche(enfantId: string) {
    const s = createClient()
    const { data: m } = await s.from('fiches_medicales').select('*').eq('enfant_id', enfantId).maybeSingle()
    setMed(m || null)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>
  if (enfants.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Aucun enfant rattache a votre compte.</div>

  const box: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, marginBottom: 14 }
  const title: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: 0.3 }
  const value: React.CSSProperties = { fontSize: 13, color: '#1E293B', marginTop: 2, marginBottom: 8 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Fiche sante</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>Informations medicales de vos enfants</p>
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

      <div style={box}>
        <div style={title}>Allergies</div>
        {!med?.allergies || med.allergies.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Aucune allergie declaree. Contactez l'ecole pour les renseigner.</div>
        ) : (
          med.allergies.map((a: any, i: number) => (
            <div key={i} style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
              <strong>{a.nom}</strong> - severite : <em>{a.severite}</em>
              {a.traitement && <div style={{ fontSize: 12, color: '#92400E', marginTop: 3 }}>Traitement : {a.traitement}</div>}
            </div>
          ))
         )}
      </div>

      <div style={box}>
        <div style={title}>PAI (Projet d'Accueil Individualise)</div>
        {med?.pai_actif ? (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: '#1E40AF', fontWeight: 600, marginBottom: 4 }}>PAI actif</div>
            {med.pai_motif && <><div style={label}>Motif</div><div style={value}>{med.pai_motif}</div></>}
            {med.pai_protocole && <><div style={label}>Protocole</div><div style={value}>{med.pai_protocole}</div></>}
          </div>
        ) : (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Aucun PAI actif</div>
        )}
      </div>

      <div style={box}>
        <div style={title}>Medecin traitant</div>
        {med?.medecin_nom ? (
          <>
            <div style={label}>Nom</div><div style={value}>{med.medecin_nom}</div>
            {med.medecin_telephone && <><div style={label}>Telephone</div><div style={value}>{med.medecin_telephone}</div></>}
            {med.medecin_adresse && <><div style={label}>Adresse</div><div style={value}>{med.medecin_adresse}</div></>}
          </>
        ) : (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Non renseigne</div>
        )}
      </div>

      <div style={box}>
        <div style={title}>Vaccinations et infos</div>
        <div style={label}>Groupe sanguin</div><div style={value}>{med?.groupe_sanguin || '-'}</div>
        <div style={label}>DTP a jour</div><div style={value}>{med?.vaccinations?.dtp_a_jour ? 'Oui' : 'Non renseigne'}</div>
        <div style={label}>ROR a jour</div><div style={value}>{med?.vaccinations?.ror ? 'Oui' : 'Non renseigne'}</div>
        {med?.vaccinations?.dernier_rappel && (<><div style={label}>Dernier rappel</div><div style={value}>{new Date(med.vaccinations.dernier_rappel).toLocaleDateString('fr-FR')}</div></>)}
      </div>

      <div style={{ ...box, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <div style={{ ...title, color: '#92400E', borderBottomColor: '#FDE68A' }}>Comment modifier ces informations ?</div>
        <p style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5, margin: 0 }}>
          Les informations medicales sont saisies et modifiees par l'ecole. Pour toute mise a jour (allergies, PAI, vaccinations, medecin traitant), contactez directement le secretariat.
        </p>
      </div>
    </div>
  )
}
