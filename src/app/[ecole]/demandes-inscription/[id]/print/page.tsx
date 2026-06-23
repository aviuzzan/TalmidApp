'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Page imprimable d'une demande d'inscription (1 page A4).
 * L'admin l'ouvre depuis le modal de detail puis fait Ctrl+P (ou clique
 * "Imprimer / PDF") -> "Enregistrer en PDF" dans le dialogue navigateur.
 */

type Demande = {
  id: string; statut: string; email_invite: string; annee_scolaire: string
  exercice_id: string | null; created_at: string; envoye_le: string | null
  soumis_le: string | null; traite_le: string | null; motif_refus: string | null
  nom_famille: string | null; situation_maritale: string | null
  parent1_prenom: string | null; parent1_nom: string | null; parent1_email: string | null
  parent1_telephone: string | null; parent1_emploi: string | null; parent1_adresse: string | null
  parent1_code_postal: string | null; parent1_ville: string | null
  parent2_prenom: string | null; parent2_nom: string | null; parent2_email: string | null
  parent2_telephone: string | null; parent2_emploi: string | null; parent2_adresse: string | null
  parent2_code_postal: string | null; parent2_ville: string | null
  enfant_prenom: string | null; enfant_deuxieme_prenom: string | null; enfant_nom: string | null
  enfant_genre: string | null; enfant_date_naissance: string | null; enfant_lieu_naissance: string | null
  classe_souhaitee: string | null; date_entree_souhaitee: string | null
  deja_scolarise: boolean | null; etablissement_precedent: string | null
  transport: boolean | null; instruction_religieuse: boolean | null; etude_garderie: boolean | null
  signes_particuliers: string | null; medecin_nom: string | null; medecin_telephone: string | null
  urgence_1_nom: string | null; urgence_1_tel: string | null; urgence_1_lien: string | null
  urgence_2_nom: string | null; urgence_2_tel: string | null; urgence_2_lien: string | null
}

const STATUT_LABEL: Record<string, string> = {
  envoye: 'Lien envoyé',
  en_attente: 'À traiter',
  accepte: 'Acceptée',
  refuse: 'Refusée',
}

export default function PrintDemandeInscriptionPage() {
  const params = useParams()
  const ecole = useEcole()
  const demandeId = params.id as string

  const [loading, setLoading] = useState(true)
  const [demande, setDemande] = useState<Demande | null>(null)
  const [ecoleInfo, setEcoleInfo] = useState<any>(null)
  const [autoPrinted, setAutoPrinted] = useState(false)

  useEffect(() => {
    if (!demandeId || !ecole?.id) return
    let cancelled = false
    ;(async () => {
      const s = createClient()
      const [{ data: e }, { data: d }] = await Promise.all([
        s.from('ecoles').select('*').eq('id', ecole.id).single(),
        s.from('demandes_inscription').select('*').eq('id', demandeId).single(),
      ])
      if (cancelled) return
      setEcoleInfo(e)
      setDemande((d as Demande) || null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [demandeId, ecole?.id])

  // Auto-print une fois la demande chargee
  useEffect(() => {
    if (demande && !autoPrinted) {
      setAutoPrinted(true)
      const t = setTimeout(() => window.print(), 500)
      return () => clearTimeout(t)
    }
  }, [demande, autoPrinted])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', fontFamily: 'Inter, sans-serif' }}>Chargement...</div>
  if (!demande) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', fontFamily: 'Inter, sans-serif' }}>Demande introuvable.</div>

  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const idCourt = demande.id.slice(0, 8).toUpperCase()
  const statutLabel = STATUT_LABEL[demande.statut] || demande.statut

  const fmtDate = (s: string | null) => {
    if (!s) return '—'
    try { return new Date(s).toLocaleDateString('fr-FR') } catch { return s }
  }
  const fmtBool = (v: boolean | null) => v === true ? 'Oui' : v === false ? 'Non' : '—'
  const val = (v: string | null | undefined) => v && String(v).trim() !== '' ? String(v) : '—'
  const genreLabel = demande.enfant_genre === 'M' ? 'Garçon' : demande.enfant_genre === 'F' ? 'Fille' : val(demande.enfant_genre)

  const adresseParent1 = [demande.parent1_adresse, [demande.parent1_code_postal, demande.parent1_ville].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')
  const adresseParent2 = [demande.parent2_adresse, [demande.parent2_code_postal, demande.parent2_ville].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')

  const hasParent2 = !!(demande.parent2_prenom || demande.parent2_nom || demande.parent2_email || demande.parent2_telephone)

  const prenomComplet = [demande.enfant_prenom, demande.enfant_deuxieme_prenom].filter(Boolean).join(' ') || '—'
  const ecoleAdr = [ecoleInfo?.adresse, [ecoleInfo?.code_postal, ecoleInfo?.ville].filter(Boolean).join(' ')].filter(Boolean).join(' — ')

  return (
    <>
      <style jsx global>{`
        @page { size: A4; margin: 12mm 14mm }
        body { background: #F1F5F9; margin: 0; font-family: 'Inter', -apple-system, system-ui, sans-serif; color: #1E293B }
        .wrap { max-width: 800px; margin: 18px auto; background: #fff; padding: 24px 30px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border-radius: 4px }
        .toolbar { max-width: 800px; margin: 0 auto 8px; display: flex; gap: 10px; padding: 0 8px }
        .toolbar button { background: #2563EB; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer }
        .toolbar a { color: #64748B; text-decoration: none; padding: 8px 16px; font-size: 13px; align-self: center }
        h1 { margin: 0; font-size: 18px; letter-spacing: 0.04em; text-transform: uppercase }
        h2 { font-size: 10px; font-weight: 700; color: #94A3B8; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 4px }
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
        {/* En-tête compact : logo + école à gauche, titre + meta à droite */}
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
            <h1>Demande d&apos;inscription</h1>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 4, lineHeight: 1.4 }}>
              <div>N° <strong style={{ fontFamily: 'monospace' }}>{idCourt}</strong> · Année {demande.annee_scolaire}</div>
              <div>Soumise le {fmtDate(demande.soumis_le || demande.created_at)} · Statut : <strong>{statutLabel}</strong></div>
            </div>
          </div>
        </div>

        {/* Enfant + Scolarité côte à côte */}
        <div className="grid2 section">
          <div>
            <h2>Informations de l&apos;enfant</h2>
            <div className="grid2" style={{ gap: 6 }}>
              <div className="field"><div className="lbl">Prénom</div><div className="vl">{prenomComplet}</div></div>
              <div className="field"><div className="lbl">Nom</div><div className="vl">{val(demande.enfant_nom)}</div></div>
              <div className="field"><div className="lbl">Genre</div><div className="vl">{genreLabel}</div></div>
              <div className="field"><div className="lbl">Date de naissance</div><div className="vl">{fmtDate(demande.enfant_date_naissance)}</div></div>
            </div>
          </div>
          <div>
            <h2>Scolarité demandée</h2>
            <div className="grid2" style={{ gap: 6 }}>
              <div className="field"><div className="lbl">Classe souhaitée</div><div className="vl">{val(demande.classe_souhaitee)}</div></div>
              <div className="field"><div className="lbl">Date d&apos;entrée</div><div className="vl">{fmtDate(demande.date_entree_souhaitee)}</div></div>
              <div className="field"><div className="lbl">Déjà scolarisé</div><div className="vl">{fmtBool(demande.deja_scolarise)}</div></div>
              <div className="field"><div className="lbl">Établissement précédent</div><div className="vl">{val(demande.etablissement_precedent)}</div></div>
            </div>
          </div>
        </div>

        {/* Famille - 1 ligne compacte */}
        <div className="section">
          <h2>Famille</h2>
          <div className="grid3" style={{ gap: 6 }}>
            <div className="field"><div className="lbl">Nom de famille</div><div className="vl">{val(demande.nom_famille)}</div></div>
            <div className="field"><div className="lbl">Situation maritale</div><div className="vl">{val(demande.situation_maritale)}</div></div>
            <div className="field"><div className="lbl">Email de contact</div><div className="vl">{val(demande.email_invite)}</div></div>
          </div>
        </div>

        {/* Responsables 1 et 2 côte à côte */}
        <div className="grid2 section">
          <div>
            <h2>Responsable 1</h2>
            <div className="field-inline"><div className="lbl">Nom complet</div><div className="vl">{val([demande.parent1_prenom, demande.parent1_nom].filter(Boolean).join(' ') || null)}</div></div>
            <div className="field-inline"><div className="lbl">Email</div><div className="vl">{val(demande.parent1_email)}</div></div>
            <div className="field-inline"><div className="lbl">Téléphone</div><div className="vl">{val(demande.parent1_telephone)}</div></div>
            <div className="field-inline"><div className="lbl">Profession</div><div className="vl">{val(demande.parent1_emploi)}</div></div>
            <div className="field-inline"><div className="lbl">Adresse</div><div className="vl">{val(adresseParent1)}</div></div>
          </div>
          <div>
            <h2>Responsable 2</h2>
            {hasParent2 ? (
              <>
                <div className="field-inline"><div className="lbl">Nom complet</div><div className="vl">{val([demande.parent2_prenom, demande.parent2_nom].filter(Boolean).join(' ') || null)}</div></div>
                <div className="field-inline"><div className="lbl">Email</div><div className="vl">{val(demande.parent2_email)}</div></div>
                <div className="field-inline"><div className="lbl">Téléphone</div><div className="vl">{val(demande.parent2_telephone)}</div></div>
                <div className="field-inline"><div className="lbl">Profession</div><div className="vl">{val(demande.parent2_emploi)}</div></div>
                <div className="field-inline"><div className="lbl">Adresse</div><div className="vl">{val(adresseParent2)}</div></div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>Non renseigné</div>
            )}
          </div>
        </div>

        {/* Options + Santé + Urgences en 3 colonnes */}
        <div className="grid3 section">
          <div>
            <h2>Options</h2>
            <div className="field-inline"><div className="lbl">Transport</div><div className="vl">{fmtBool(demande.transport)}</div></div>
            <div className="field-inline"><div className="lbl">Instr. relig.</div><div className="vl">{fmtBool(demande.instruction_religieuse)}</div></div>
            <div className="field-inline"><div className="lbl">Étude/garderie</div><div className="vl">{fmtBool(demande.etude_garderie)}</div></div>
          </div>
          <div>
            <h2>Santé</h2>
            <div className="field-inline"><div className="lbl">Signes part.</div><div className="vl">{val(demande.signes_particuliers)}</div></div>
            <div className="field-inline"><div className="lbl">Médecin</div><div className="vl">{val(demande.medecin_nom)}</div></div>
            <div className="field-inline"><div className="lbl">Tél. médecin</div><div className="vl">{val(demande.medecin_telephone)}</div></div>
          </div>
          <div>
            <h2>Contacts d&apos;urgence</h2>
            <div className="field-inline"><div className="lbl">Contact 1</div><div className="vl">{val(demande.urgence_1_nom)}{demande.urgence_1_lien ? ` (${demande.urgence_1_lien})` : ''}{demande.urgence_1_tel ? ` — ${demande.urgence_1_tel}` : ''}</div></div>
            <div className="field-inline"><div className="lbl">Contact 2</div><div className="vl">{val(demande.urgence_2_nom)}{demande.urgence_2_lien ? ` (${demande.urgence_2_lien})` : ''}{demande.urgence_2_tel ? ` — ${demande.urgence_2_tel}` : ''}</div></div>
          </div>
        </div>

        {/* Motif refus (si applicable) */}
        {demande.statut === 'refuse' && demande.motif_refus && (
          <div style={{ marginTop: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '6px 10px', borderRadius: 6, fontSize: 10 }}>
            <strong>Motif du refus :</strong> {demande.motif_refus}
          </div>
        )}

        {/* Ligne signature compacte */}
        <div style={{ marginTop: 14, paddingTop: 8, borderTop: '1px solid #E2E8F0', fontSize: 10, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div>Fait à <span style={{ display: 'inline-block', borderBottom: '1px solid #94A3B8', minWidth: 100 }}>&nbsp;</span>, le <span style={{ display: 'inline-block', borderBottom: '1px solid #94A3B8', minWidth: 80 }}>&nbsp;</span></div>
          <div>Signature du responsable : <span style={{ display: 'inline-block', borderBottom: '1px solid #94A3B8', minWidth: 160 }}>&nbsp;</span></div>
        </div>

        {/* Footer minuscule */}
        <div style={{ marginTop: 8, fontSize: 8, color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
          <div>Généré le {today} via TalmidApp</div>
          <div>Demande N° {idCourt}</div>
        </div>
      </div>
    </>
  )
}
