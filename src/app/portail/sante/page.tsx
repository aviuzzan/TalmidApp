'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

type Enfant = { id: string; prenom: string; nom: string }

export default function PortailSantePage() {
  const { t } = useI18n()
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>{t('portail.common.loading')}</div>
  if (enfants.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>{t('portail.sante.no_child')}</div>

  const box: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, marginBottom: 14 }
  const title: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: 0.3 }
  const value: React.CSSProperties = { fontSize: 13, color: '#1E293B', marginTop: 2, marginBottom: 8 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <a href="/portail/enfants" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: 13, textDecoration: 'none', width: 'fit-content' }}>{t('portail.sante.back')}</a>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('portail.sante.title')}</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>{t('portail.sante.subtitle')}</p>
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
        <div style={title}>{t('portail.sante.allergies.title')}</div>
        {!med?.allergies || med.allergies.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>{t('portail.sante.allergies.empty')}</div>
        ) : (
          med.allergies.map((a: any, i: number) => (
            <div key={i} style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
              <strong>{a.nom}</strong> — {t('portail.sante.allergies.severity')} : <em>{a.severite}</em>
              {a.traitement && <div style={{ fontSize: 12, color: '#92400E', marginTop: 3 }}>{t('portail.sante.allergies.treatment')} : {a.traitement}</div>}
            </div>
          ))
         )}
      </div>

      <div style={box}>
        <div style={title}>{t('portail.sante.pai.title')}</div>
        {med?.pai_actif ? (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: '#1E40AF', fontWeight: 600, marginBottom: 4 }}>{t('portail.sante.pai.active')}</div>
            {med.pai_motif && <><div style={label}>{t('portail.sante.pai.motif')}</div><div style={value}>{med.pai_motif}</div></>}
            {med.pai_protocole && <><div style={label}>{t('portail.sante.pai.protocole')}</div><div style={value}>{med.pai_protocole}</div></>}
          </div>
        ) : (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>{t('portail.sante.pai.empty')}</div>
        )}
      </div>

      <div style={box}>
        <div style={title}>{t('portail.sante.medecin.title')}</div>
        {med?.medecin_nom ? (
          <>
            <div style={label}>{t('portail.sante.medecin.nom')}</div><div style={value}>{med.medecin_nom}</div>
            {med.medecin_telephone && <><div style={label}>{t('portail.sante.medecin.tel')}</div><div style={value}>{med.medecin_telephone}</div></>}
            {med.medecin_adresse && <><div style={label}>{t('portail.sante.medecin.adresse')}</div><div style={value}>{med.medecin_adresse}</div></>}
          </>
        ) : (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>{t('portail.sante.medecin.empty')}</div>
        )}
      </div>

      <div style={box}>
        <div style={title}>{t('portail.sante.vaccins.title')}</div>
        <div style={label}>{t('portail.sante.vaccins.groupe')}</div><div style={value}>{med?.groupe_sanguin || '—'}</div>
        <div style={label}>{t('portail.sante.vaccins.dtp')}</div><div style={value}>{med?.vaccinations?.dtp_a_jour ? t('portail.sante.vaccins.yes') : t('portail.sante.vaccins.unknown')}</div>
        <div style={label}>{t('portail.sante.vaccins.ror')}</div><div style={value}>{med?.vaccinations?.ror ? t('portail.sante.vaccins.yes') : t('portail.sante.vaccins.unknown')}</div>
        {med?.vaccinations?.dernier_rappel && (<><div style={label}>{t('portail.sante.vaccins.dernier_rappel')}</div><div style={value}>{new Date(med.vaccinations.dernier_rappel).toLocaleDateString('fr-FR')}</div></>)}
      </div>

      <div style={{ ...box, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <div style={{ ...title, color: '#92400E', borderBottomColor: '#FDE68A' }}>{t('portail.sante.howto.title')}</div>
        <p style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5, margin: 0 }}>
          {t('portail.sante.howto.body')}
        </p>
      </div>
    </div>
  )
}
