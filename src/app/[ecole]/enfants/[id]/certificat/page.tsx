'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive } from '@/lib/exercice-context'

const PRINT_CSS = '@media print { .no-print { display: none !important; } body { margin: 0; padding: 0; background: #fff !important; } .print-page { padding: 30mm 25mm !important; max-width: none !important; border: none !important; box-shadow: none !important; } }'

export default function CertificatScolaritePage() {
  const params = useParams()
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const enfantId = params.id as string
  const [loading, setLoading] = useState(true)
  const [enfant, setEnfant] = useState<any>(null)
  const [classe, setClasse] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [ecoleInfo, setEcoleInfo] = useState<any>(null)

  useEffect(() => { if (enfantId && ecole?.id) load() }, [enfantId, ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    const [{ data: e }, { data: env }] = await Promise.all([
      s.from('ecoles').select('*').eq('id', ecole.id).single(),
      s.from('enfants').select('*, familles(*)').eq('id', enfantId).single(),
    ])
    setEcoleInfo(e)
    setEnfant(env)
    setFamille(env?.familles)
    if (env?.classe_id) {
      const { data: cl } = await s.from('classes').select('*').eq('id', env.classe_id).single()
      setClasse(cl)
    } else if (env?.classe) {
      setClasse({ nom: env.classe })
    }
    setLoading(false)
  }

  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
  if (!enfant) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Élève introuvable.</div>

  function dateNaissance(): string {
    if (!enfant.date_naissance) return '—'
    try { return new Date(enfant.date_naissance).toLocaleDateString('fr-FR') } catch { return enfant.date_naissance }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => window.history.back()} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Retour</button>
        <button onClick={() => window.print()} className="btn-primary">🖨 Imprimer / PDF</button>
      </div>

      <div className="print-page" style={{
        maxWidth: 800, margin: '0 auto', background: '#fff', padding: 40,
        border: '1px solid #E2E8F0', borderRadius: 12,
        fontFamily: 'Georgia, serif', color: '#1E293B', lineHeight: 1.6,
      }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #1E293B', paddingBottom: 16, marginBottom: 28 }}>
          {ecoleInfo?.logo_url && <img src={ecoleInfo.logo_url} alt="" style={{ maxHeight: 70, marginBottom: 8 }} />}
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>{ecoleInfo?.nom || ecole.nom}</h1>
          {ecoleInfo?.adresse && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{ecoleInfo.adresse}</div>}
          {ecoleInfo?.telephone && <div style={{ fontSize: 12, color: '#475569' }}>Tél : {ecoleInfo.telephone}</div>}
          {ecoleInfo?.email && <div style={{ fontSize: 12, color: '#475569' }}>{ecoleInfo.email}</div>}
        </div>

        <h2 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', marginBottom: 36, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Certificat de scolarité
        </h2>

        <p style={{ fontSize: 15, marginBottom: 18 }}>
          Je soussigné(e), Directeur(trice) de l&apos;établissement <strong>{ecoleInfo?.nom || ecole.nom}</strong>, certifie que :
        </p>

        <div style={{ background: '#F8FAFC', borderLeft: '4px solid #1E293B', padding: '14px 20px', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{enfant.prenom} {enfant.nom}</div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            Né(e) le {dateNaissance()}
            {enfant.lieu_naissance ? ' à ' + enfant.lieu_naissance : ''}
          </div>
          {famille?.nom && (
            <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
              Famille {famille.nom} ({famille.numero})
            </div>
          )}
        </div>

        <p style={{ fontSize: 15, marginBottom: 18 }}>
          est régulièrement inscrit(e) et fréquente notre établissement pour l&apos;année scolaire <strong>{annee}</strong>
          {classe ? <>, en classe de <strong>{classe.nom}</strong>.</> : '.'}
        </p>

        <p style={{ fontSize: 15, marginBottom: 36 }}>
          Le présent certificat est délivré à la demande de l&apos;intéressé(e) ou de son représentant légal, pour servir et valoir ce que de droit.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 60 }}>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Fait à <strong>{ecoleInfo?.ville || '………………'}</strong>,<br />
            le <strong>{today}</strong>
          </div>
          <div style={{ textAlign: 'center', minWidth: 220 }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>Signature et cachet</div>
            <div style={{ height: 70, borderBottom: '1px solid #94A3B8' }} />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Direction</div>
          </div>
        </div>

        <div style={{ marginTop: 60, paddingTop: 16, borderTop: '1px solid #E2E8F0', fontSize: 10, color: '#94A3B8', textAlign: 'center' }}>
          Document généré le {today} via TalmidApp
        </div>
      </div>
    </>
  )
}
