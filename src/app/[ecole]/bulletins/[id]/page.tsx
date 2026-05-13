'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

const PRINT_CSS = '@media print{.no-print{display:none!important}body{margin:0;padding:0;background:#fff!important}.bul-page{padding:20mm 15mm!important;max-width:none!important;border:none!important;box-shadow:none!important}}'

type Ligne = {
  id: string; matiere_nom: string; moyenne_eleve: number | null;
  appreciation: string | null; coefficient: number | null;
  position: number; professeur_id: string | null;
}
type Bulletin = {
  id: string; enfant_id: string; classe_id: string; trimestre: number;
  moyenne_generale: number | null; rang: number | null;
  appreciation_generale: string | null; appreciation_chef_etablissement: string | null;
  effectif_classe: number | null; visible_famille: boolean;
}

const TRIMESTRES = ['', '1er trimestre', '2e trimestre', '3e trimestre']

export default function BulletinDetailPage() {
  const params = useParams()
  const router = useRouter()
  const ecole = useEcole()
  const bulletinId = params.id as string
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bulletin, setBulletin] = useState<Bulletin | null>(null)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [enfant, setEnfant] = useState<any>(null)
  const [classe, setClasse] = useState<any>(null)
  const [ecoleInfo, setEcoleInfo] = useState<any>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [showTemplates, setShowTemplates] = useState<string | null>(null)

  useEffect(() => { if (bulletinId && ecole?.id) load() }, [bulletinId, ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    const [{ data: bul }, { data: lig }, { data: e }, { data: tpl }] = await Promise.all([
      s.from('bulletins').select('*').eq('id', bulletinId).single(),
      s.from('bulletin_lignes').select('*').eq('bulletin_id', bulletinId).order('position'),
      s.from('ecoles').select('*').eq('id', ecole.id).single(),
      s.from('appreciations_templates').select('*').eq('ecole_id', ecole.id).order('ordre'),
    ])
    setBulletin(bul as Bulletin)
    setLignes((lig ?? []) as Ligne[])
    setEcoleInfo(e)
    setTemplates(tpl ?? [])
    if (bul?.enfant_id) {
      const { data: env } = await s.from('enfants').select('*, familles(nom, numero)').eq('id', bul.enfant_id).single()
      setEnfant(env)
    }
    if (bul?.classe_id) {
      const { data: cl } = await s.from('classes').select('*').eq('id', bul.classe_id).single()
      setClasse(cl)
    }
    setLoading(false)
  }

  async function updateLigne(id: string, field: 'appreciation' | 'moyenne_eleve', value: any) {
    setLignes(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
    await createClient().from('bulletin_lignes').update({ [field]: value }).eq('id', id)
  }

  async function updateBulletin(field: 'appreciation_generale' | 'appreciation_chef_etablissement', value: string) {
    setBulletin(prev => prev ? { ...prev, [field]: value } : prev)
    setSaving(true)
    await createClient().from('bulletins').update({ [field]: value }).eq('id', bulletinId)
    setSaving(false)
  }

  function applyTemplate(ligneId: string | 'gen' | 'chef', contenu: string) {
    if (ligneId === 'gen') updateBulletin('appreciation_generale', contenu)
    else if (ligneId === 'chef') updateBulletin('appreciation_chef_etablissement', contenu)
    else updateLigne(ligneId, 'appreciation', contenu)
    setShowTemplates(null)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
  if (!bulletin) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Bulletin introuvable</div>

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => router.back()} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>← Retour</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {saving && <span style={{ fontSize: 12, color: '#64748B', alignSelf: 'center' }}>💾 Enregistrement...</span>}
          <button onClick={() => window.print()} className="btn-primary">🖨 Imprimer / PDF</button>
        </div>
      </div>

      <div className="bul-page" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', padding: 32, border: '1px solid #E2E8F0', borderRadius: 8, fontFamily: 'Georgia, serif', color: '#1E293B' }}>
        {/* Header */}
        <div style={{ borderBottom: '2px solid #1E293B', paddingBottom: 12, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            {ecoleInfo?.logo_url && <img src={ecoleInfo.logo_url} alt="" style={{ maxHeight: 55 }} />}
            <div style={{ fontSize: 16, fontWeight: 700 }}>{ecoleInfo?.nom || ecole.nom}</div>
            {ecoleInfo?.adresse && <div style={{ fontSize: 10, color: '#475569' }}>{ecoleInfo.adresse}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bulletin scolaire</div>
            <div style={{ fontSize: 13, color: '#475569' }}>{TRIMESTRES[bulletin.trimestre] || ''}</div>
          </div>
        </div>

        {/* Info élève */}
        <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 6, marginBottom: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, fontSize: 12 }}>
          <div><strong>Élève :</strong> {enfant ? enfant.prenom + ' ' + enfant.nom : '—'}</div>
          <div><strong>Classe :</strong> {classe?.nom || '—'}</div>
          {enfant?.date_naissance && <div><strong>Né(e) le :</strong> {new Date(enfant.date_naissance).toLocaleDateString('fr-FR')}</div>}
          {bulletin.effectif_classe && <div><strong>Effectif :</strong> {bulletin.effectif_classe} élèves</div>}
        </div>

        {/* Tableau matières */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 18 }}>
          <thead>
            <tr style={{ background: '#F1F5F9' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #CBD5E1', fontSize: 11 }}>Matière</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid #CBD5E1', width: 80, fontSize: 11 }}>Moyenne /20</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #CBD5E1', fontSize: 11 }}>Appréciation du professeur</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#94A3B8', border: '1px solid #CBD5E1' }}>Aucune note pour ce trimestre</td></tr>
            ) : lignes.map(l => (
              <tr key={l.id}>
                <td style={{ padding: '8px 10px', border: '1px solid #CBD5E1', fontWeight: 600 }}>{l.matiere_nom}</td>
                <td style={{ padding: '8px 10px', border: '1px solid #CBD5E1', textAlign: 'center', fontWeight: 700, color: l.moyenne_eleve != null && l.moyenne_eleve >= 10 ? '#059669' : '#DC2626' }}>
                  {l.moyenne_eleve != null ? Number(l.moyenne_eleve).toFixed(2) : '—'}
                </td>
                <td style={{ padding: '6px 10px', border: '1px solid #CBD5E1', position: 'relative' }}>
                  <textarea className="no-print" value={l.appreciation || ''} onChange={e => updateLigne(l.id, 'appreciation', e.target.value)}
                    style={{ width: '100%', minHeight: 30, border: 'none', background: 'transparent', resize: 'vertical', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                    onFocus={() => setShowTemplates(l.id)} onBlur={() => setTimeout(() => setShowTemplates(null), 200)} />
                  <span style={{ display: 'none' }} className="print-only">{l.appreciation}</span>
                  {showTemplates === l.id && templates.length > 0 && (
                    <div className="no-print" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: 6, zIndex: 10, maxHeight: 200, overflow: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      {templates.map(t => (
                        <button key={t.id} onClick={() => applyTemplate(l.id, t.contenu)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '6px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', marginRight: 6 }}>{t.categorie}</span>{t.contenu}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Moyenne générale */}
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 12, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Moyenne générale</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: bulletin.moyenne_generale != null && bulletin.moyenne_generale >= 10 ? '#059669' : '#DC2626' }}>
            {bulletin.moyenne_generale != null ? Number(bulletin.moyenne_generale).toFixed(2) + ' / 20' : '—'}
          </div>
        </div>

        {/* Appréciations */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: 4 }}>Appréciation générale du conseil de classe</div>
          <textarea className="no-print" value={bulletin.appreciation_generale || ''} onChange={e => updateBulletin('appreciation_generale', e.target.value)}
            style={{ width: '100%', minHeight: 60, border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'none' }} className="print-only">{bulletin.appreciation_generale}</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: 4 }}>Avis du chef d&apos;établissement</div>
          <textarea className="no-print" value={bulletin.appreciation_chef_etablissement || ''} onChange={e => updateBulletin('appreciation_chef_etablissement', e.target.value)}
            style={{ width: '100%', minHeight: 50, border: '1px solid #E2E8F0', borderRadius: 6, padding: 8, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'none' }} className="print-only">{bulletin.appreciation_chef_etablissement}</div>
        </div>

        {/* Pied */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 12, borderTop: '1px solid #E2E8F0', fontSize: 11, color: '#64748B' }}>
          <div>Fait à {ecoleInfo?.ville || '………'}, le {new Date().toLocaleDateString('fr-FR')}</div>
          <div style={{ textAlign: 'right' }}>Signature et cachet de l&apos;établissement</div>
        </div>
      </div>
    </>
  )
}
