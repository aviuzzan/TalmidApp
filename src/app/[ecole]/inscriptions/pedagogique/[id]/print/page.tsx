'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Page imprimable d'une fiche pédagogique (1 page A4).
 * Pattern aligné sur /demandes-inscription/[id]/print/page.tsx.
 * L'admin l'ouvre depuis la liste "Fiches pédagogiques" puis Ctrl+P -> PDF.
 */

type FichePedagogique = {
  id: string
  ecole_id: string
  famille_id: string | null
  enfant_id: string | null
  annee_scolaire: string
  statut: string | null
  secteur_souhaite_id: string | null
  classe_souhaitee: string | null
  date_entree_souhaitee: string | null
  deja_scolarise: boolean | null
  etablissement_precedent: string | null
  transport: boolean | null
  instruction_religieuse: boolean | null
  etude_garderie: boolean | null
  options_choisies: Record<string, any> | null
  signes_particuliers: string | null
  medecin_nom: string | null
  medecin_telephone: string | null
  urgence_1_nom: string | null
  urgence_1_tel: string | null
  urgence_1_lien: string | null
  urgence_2_nom: string | null
  urgence_2_tel: string | null
  urgence_2_lien: string | null
  note_admin: string | null
  soumis_le: string | null
  created_at: string | null
}

const STATUT_LABEL: Record<string, string> = {
  soumis: 'Soumise',
  en_attente: 'En attente',
  accepte: 'Acceptée',
  refuse: 'Refusée',
}

export default function PrintFichePedagogiquePage() {
  const params = useParams()
  const ecole = useEcole()
  const ficheId = params.id as string

  const [loading, setLoading] = useState(true)
  const [fiche, setFiche] = useState<FichePedagogique | null>(null)
  const [enfant, setEnfant] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [secteur, setSecteur] = useState<any>(null)
  const [ecoleInfo, setEcoleInfo] = useState<any>(null)
  const [autoPrinted, setAutoPrinted] = useState(false)

  useEffect(() => {
    if (!ficheId || !ecole?.id) return
    let cancelled = false
    ;(async () => {
      const s = createClient()
      // Chargement de la fiche + données liées en une grosse query
      const { data: f } = await s
        .from('inscriptions_pedagogiques')
        .select('*, enfants(prenom, nom, date_naissance, lieu_naissance, genre, statut_inscription), familles(numero, nom, parent1_prenom, parent1_nom, parent1_email, parent1_telephone, parent2_prenom, parent2_nom, parent2_email, parent2_telephone, situation_maritale), secteurs(nom)')
        .eq('id', ficheId)
        .single()

      const { data: e } = await s.from('ecoles').select('*').eq('id', ecole.id).single()

      if (cancelled) return
      setEcoleInfo(e)
      if (f) {
        const { enfants, familles, secteurs, ...rest } = f as any
        setFiche(rest as FichePedagogique)
        setEnfant(enfants || null)
        setFamille(familles || null)
        setSecteur(secteurs || null)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [ficheId, ecole?.id])

  // Auto-print une fois la fiche chargée
  useEffect(() => {
    if (fiche && !autoPrinted) {
      setAutoPrinted(true)
      const t = setTimeout(() => window.print(), 500)
      return () => clearTimeout(t)
    }
  }, [fiche, autoPrinted])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', fontFamily: 'Inter, sans-serif' }}>Chargement...</div>
  if (!fiche) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', fontFamily: 'Inter, sans-serif' }}>Fiche pédagogique introuvable.</div>

  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const idCourt = fiche.id.slice(0, 8).toUpperCase()
  const statutLabel = STATUT_LABEL[fiche.statut || ''] || (fiche.statut || '—')

  const fmtDate = (s: string | null | undefined) => {
    if (!s) return '—'
    try { return new Date(s).toLocaleDateString('fr-FR') } catch { return s }
  }
  const fmtBool = (v: boolean | null | undefined) => v === true ? 'Oui' : v === false ? 'Non' : '—'
  const val = (v: string | null | undefined) => v && String(v).trim() !== '' ? String(v) : '—'
  const genreLabel = enfant?.genre === 'M' ? 'Garçon' : enfant?.genre === 'F' ? 'Fille' : val(enfant?.genre)

  const hasParent2 = !!(famille?.parent2_prenom || famille?.parent2_nom || famille?.parent2_email || famille?.parent2_telephone)
  const ecoleAdr = [ecoleInfo?.adresse, [ecoleInfo?.code_postal, ecoleInfo?.ville].filter(Boolean).join(' ')].filter(Boolean).join(' — ')

  // Options additionnelles depuis le JSONB (hors transport/instruction_religieuse/etude_garderie déjà affichés)
  const optionsExtra: { code: string; valeur: any }[] = []
  if (fiche.options_choisies && typeof fiche.options_choisies === 'object') {
    const exclus = new Set(['transport', 'instruction_religieuse', 'etude_garderie'])
    for (const [k, v] of Object.entries(fiche.options_choisies)) {
      if (exclus.has(k)) continue
      // n'afficher que les options "vraies" ou avec valeur
      if (v === true || (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number')) {
        optionsExtra.push({ code: k, valeur: v })
      }
    }
  }
  const formatOptionValue = (v: any) => {
    if (v === true) return 'Oui'
    if (v === false) return 'Non'
    if (v === null || v === undefined) return '—'
    return String(v)
  }

  const hasUrgence1 = !!(fiche.urgence_1_nom || fiche.urgence_1_tel || fiche.urgence_1_lien)
  const hasUrgence2 = !!(fiche.urgence_2_nom || fiche.urgence_2_tel || fiche.urgence_2_lien)

  return (
    <>
      <style jsx global>{`
        @page { size: A4; margin: 10mm 12mm }
        body { background: #F1F5F9; margin: 0; font-family: 'Inter', -apple-system, system-ui, sans-serif; color: #1E293B }
        .wrap { max-width: 800px; margin: 18px auto; background: #fff; padding: 24px 30px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border-radius: 4px }
        .toolbar { max-width: 800px; margin: 0 auto 8px; display: flex; gap: 10px; padding: 0 8px }
        .toolbar button { background: #2563EB; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer }
        .toolbar a { color: #64748B; text-decoration: none; padding: 8px 16px; font-size: 13px; align-self: center }
        h1 { margin: 0; font-size: 16px; letter-spacing: 0.04em; text-transform: uppercase }
        h2 { font-size: 10px; font-weight: 700; color: #2563EB; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 4px }
        .section { margin-top: 10px; padding-top: 8px; border-top: 1px solid #F1F5F9 }
        .section:first-of-type { border-top: none; padding-top: 0; margin-top: 0 }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px }
        .field { font-size: 11px; line-height: 1.3 }
        .field .lbl { font-size: 9px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600 }
        .field .vl { color: #1E293B; font-weight: 500; word-break: break-word }
        .field-inline { display: flex; gap: 6px; font-size: 11px; line-height: 1.4 }
        .field-inline .lbl { color: #94A3B8; min-width: 78px; flex-shrink: 0 }
        .field-inline .vl { color: #1E293B; font-weight: 500; word-break: break-word }
        .pastel { background: #F8FAFC; border-radius: 6px; padding: 6px 10px }
        @media print {
          body { background: #fff }
          .wrap { box-shadow: none; padding: 0; max-width: 100%; margin: 0; border-radius: 0 }
          .toolbar { display: none }
        }
      `}</style>

      <div className="toolbar">
        <button onClick={() => window.print()}>🖨 Imprimer / PDF</button>
        <a href="javascript:history.back()">← Retour</a>
      </div>

      <div className="wrap">
        {/* En-tête : logo + école / titre + meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingBottom: 10, borderBottom: '2px solid #1E293B', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {ecoleInfo?.logo_url && <img src={ecoleInfo.logo_url} alt="" style={{ maxHeight: 44, maxWidth: 60, objectFit: 'contain' }} />}
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1E293B', lineHeight: 1.2 }}>{ecoleInfo?.nom || ecole.nom}</div>
              {ecoleAdr && <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{ecoleAdr}</div>}
              {ecoleInfo?.telephone && <div style={{ fontSize: 10, color: '#64748B' }}>Tél : {ecoleInfo.telephone}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h1>Fiche pédagogique</h1>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 4, lineHeight: 1.4 }}>
              <div>N° <strong style={{ fontFamily: 'monospace' }}>{idCourt}</strong> · Année {fiche.annee_scolaire}</div>
              <div>Soumise le {fmtDate(fiche.soumis_le || fiche.created_at)} · Statut : <strong>{statutLabel}</strong></div>
            </div>
          </div>
        </div>

        {/* Enfant + Scolarité côte à côte */}
        <div className="grid2 section">
          <div>
            <h2>Informations de l&apos;enfant</h2>
            <div className="grid2" style={{ gap: 6 }}>
              <div className="field"><div className="lbl">Prénom</div><div className="vl">{val(enfant?.prenom)}</div></div>
              <div className="field"><div className="lbl">Nom</div><div className="vl">{val(enfant?.nom)}</div></div>
              <div className="field"><div className="lbl">Date de naissance</div><div className="vl">{fmtDate(enfant?.date_naissance)}</div></div>
              <div className="field"><div className="lbl">Lieu de naissance</div><div className="vl">{val(enfant?.lieu_naissance)}</div></div>
              <div className="field"><div className="lbl">Genre</div><div className="vl">{genreLabel}</div></div>
              <div className="field"><div className="lbl">Statut</div><div className="vl">{val(enfant?.statut_inscription)}</div></div>
            </div>
          </div>
          <div>
            <h2>Scolarité demandée</h2>
            <div className="grid2" style={{ gap: 6 }}>
              <div className="field"><div className="lbl">Classe souhaitée</div><div className="vl">{val(fiche.classe_souhaitee)}</div></div>
              <div className="field"><div className="lbl">Secteur</div><div className="vl">{val(secteur?.nom)}</div></div>
              <div className="field"><div className="lbl">Date d&apos;entrée souhaitée</div><div className="vl">{fmtDate(fiche.date_entree_souhaitee)}</div></div>
              <div className="field"><div className="lbl">Déjà scolarisé</div><div className="vl">{fmtBool(fiche.deja_scolarise)}</div></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><div className="lbl">Établissement précédent</div><div className="vl">{val(fiche.etablissement_precedent)}</div></div>
            </div>
          </div>
        </div>

        {/* Famille */}
        <div className="section">
          <h2>Famille</h2>
          <div className="grid3" style={{ gap: 6 }}>
            <div className="field"><div className="lbl">Nom de famille</div><div className="vl">{val(famille?.nom)}</div></div>
            <div className="field"><div className="lbl">N° famille</div><div className="vl">{val(famille?.numero)}</div></div>
            <div className="field"><div className="lbl">Situation maritale</div><div className="vl">{val(famille?.situation_maritale)}</div></div>
          </div>
        </div>

        {/* Responsable 1 */}
        <div className="section">
          <h2>Responsable 1</h2>
          <div className="grid3" style={{ gap: 6 }}>
            <div className="field"><div className="lbl">Prénom</div><div className="vl">{val(famille?.parent1_prenom)}</div></div>
            <div className="field"><div className="lbl">Nom</div><div className="vl">{val(famille?.parent1_nom)}</div></div>
            <div className="field"><div className="lbl">Téléphone</div><div className="vl">{val(famille?.parent1_telephone)}</div></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><div className="lbl">Email</div><div className="vl">{val(famille?.parent1_email)}</div></div>
          </div>
        </div>

        {/* Responsable 2 */}
        {hasParent2 && (
          <div className="section">
            <h2>Responsable 2</h2>
            <div className="grid3" style={{ gap: 6 }}>
              <div className="field"><div className="lbl">Prénom</div><div className="vl">{val(famille?.parent2_prenom)}</div></div>
              <div className="field"><div className="lbl">Nom</div><div className="vl">{val(famille?.parent2_nom)}</div></div>
              <div className="field"><div className="lbl">Téléphone</div><div className="vl">{val(famille?.parent2_telephone)}</div></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><div className="lbl">Email</div><div className="vl">{val(famille?.parent2_email)}</div></div>
            </div>
          </div>
        )}

        {/* Options choisies */}
        <div className="section">
          <h2>Options choisies</h2>
          <div className="grid3" style={{ gap: 6 }}>
            <div className="field"><div className="lbl">Transport</div><div className="vl">{fmtBool(fiche.transport)}</div></div>
            <div className="field"><div className="lbl">Instruction religieuse</div><div className="vl">{fmtBool(fiche.instruction_religieuse)}</div></div>
            <div className="field"><div className="lbl">Étude / Garderie</div><div className="vl">{fmtBool(fiche.etude_garderie)}</div></div>
            {optionsExtra.map(o => (
              <div className="field" key={o.code}><div className="lbl">{o.code.replace(/_/g, ' ')}</div><div className="vl">{formatOptionValue(o.valeur)}</div></div>
            ))}
          </div>
        </div>

        {/* Santé */}
        <div className="section">
          <h2>Santé</h2>
          <div className="grid3" style={{ gap: 6 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}><div className="lbl">Signes particuliers</div><div className="vl">{val(fiche.signes_particuliers)}</div></div>
            <div className="field" style={{ gridColumn: 'span 2' }}><div className="lbl">Médecin</div><div className="vl">{val(fiche.medecin_nom)}</div></div>
            <div className="field"><div className="lbl">Tél. médecin</div><div className="vl">{val(fiche.medecin_telephone)}</div></div>
          </div>
        </div>

        {/* Contacts d'urgence */}
        {(hasUrgence1 || hasUrgence2) && (
          <div className="section">
            <h2>Contacts d&apos;urgence</h2>
            <div className="grid2" style={{ gap: 14 }}>
              <div className="pastel">
                <div style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 3 }}>Contact 1</div>
                {hasUrgence1 ? (
                  <>
                    <div className="field-inline"><div className="lbl">Nom</div><div className="vl">{val(fiche.urgence_1_nom)}</div></div>
                    <div className="field-inline"><div className="lbl">Lien</div><div className="vl">{val(fiche.urgence_1_lien)}</div></div>
                    <div className="field-inline"><div className="lbl">Téléphone</div><div className="vl">{val(fiche.urgence_1_tel)}</div></div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>Non renseigné</div>
                )}
              </div>
              <div className="pastel">
                <div style={{ fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 3 }}>Contact 2</div>
                {hasUrgence2 ? (
                  <>
                    <div className="field-inline"><div className="lbl">Nom</div><div className="vl">{val(fiche.urgence_2_nom)}</div></div>
                    <div className="field-inline"><div className="lbl">Lien</div><div className="vl">{val(fiche.urgence_2_lien)}</div></div>
                    <div className="field-inline"><div className="lbl">Téléphone</div><div className="vl">{val(fiche.urgence_2_tel)}</div></div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>Non renseigné</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Note admin */}
        {fiche.note_admin && (
          <div className="section">
            <h2>Note administrative</h2>
            <div style={{ fontSize: 11, color: '#1E293B', background: '#FEF9C3', border: '1px solid #FDE68A', padding: '6px 10px', borderRadius: 6, lineHeight: 1.4 }}>
              {fiche.note_admin}
            </div>
          </div>
        )}

        {/* Signature */}
        <div style={{ marginTop: 14, paddingTop: 8, borderTop: '1px solid #E2E8F0', fontSize: 10, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div>Fait à <span style={{ display: 'inline-block', borderBottom: '1px solid #94A3B8', minWidth: 100 }}>&nbsp;</span>, le <span style={{ display: 'inline-block', borderBottom: '1px solid #94A3B8', minWidth: 80 }}>&nbsp;</span></div>
          <div>Signature du responsable légal : <span style={{ display: 'inline-block', borderBottom: '1px solid #94A3B8', minWidth: 160 }}>&nbsp;</span></div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 8, fontSize: 8, color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
          <div>Document généré le {today} via TalmidApp</div>
          <div>Fiche N° {idCourt}</div>
        </div>
      </div>
    </>
  )
}
