'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Page imprimable d'une demande d'inscription.
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

const PRINT_CSS = `
@page { size: A4; margin: 18mm; }
@media print {
  .no-print { display: none !important; }
  body { margin: 0; padding: 0; background: #fff !important; }
  .print-page { padding: 0 !important; max-width: none !important; border: none !important; box-shadow: none !important; margin: 0 !important; }
  .print-section { break-inside: avoid; page-break-inside: avoid; }
}
`

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

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
  if (!demande) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Demande introuvable.</div>

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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => window.history.back()} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Retour</button>
        <button onClick={() => window.print()} className="btn-primary">🖨 Imprimer / PDF</button>
      </div>

      <div className="print-page" style={{
        maxWidth: 820, margin: '0 auto', background: '#fff', padding: 36,
        border: '1px solid #E2E8F0', borderRadius: 12,
        fontFamily: 'Georgia, serif', color: '#1E293B', lineHeight: 1.55,
      }}>
        {/* En-tete */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1E293B', paddingBottom: 14, marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {ecoleInfo?.logo_url && <img src={ecoleInfo.logo_url} alt="" style={{ maxHeight: 60 }} />}
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{ecoleInfo?.nom || ecole.nom}</div>
              {ecoleInfo?.adresse && <div style={{ fontSize: 11, color: '#475569' }}>{ecoleInfo.adresse}</div>}
              {(ecoleInfo?.code_postal || ecoleInfo?.ville) && (
                <div style={{ fontSize: 11, color: '#475569' }}>{[ecoleInfo?.code_postal, ecoleInfo?.ville].filter(Boolean).join(' ')}</div>
              )}
              {ecoleInfo?.telephone && <div style={{ fontSize: 11, color: '#475569' }}>Tél : {ecoleInfo.telephone}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#64748B' }}>
            <div>Demande N° <strong>{idCourt}</strong></div>
            <div>Soumise le : {fmtDate(demande.soumis_le || demande.created_at)}</div>
            <div>Année : {demande.annee_scolaire}</div>
            <div style={{ marginTop: 4 }}>Statut : <strong>{statutLabel}</strong></div>
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', marginTop: 0, marginBottom: 22, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Demande d&apos;inscription
        </h2>

        <Section titre="Informations de l'enfant">
          <Row label="Prénom" value={val(demande.enfant_prenom)} />
          <Row label="Deuxième prénom" value={val(demande.enfant_deuxieme_prenom)} />
          <Row label="Nom" value={val(demande.enfant_nom)} />
          <Row label="Genre" value={genreLabel} />
          <Row label="Date de naissance" value={fmtDate(demande.enfant_date_naissance)} />
          <Row label="Lieu de naissance" value={val(demande.enfant_lieu_naissance)} />
        </Section>

        <Section titre="Scolarité demandée">
          <Row label="Classe souhaitée" value={val(demande.classe_souhaitee)} />
          <Row label="Date d'entrée souhaitée" value={fmtDate(demande.date_entree_souhaitee)} />
          <Row label="Déjà scolarisé" value={fmtBool(demande.deja_scolarise)} />
          <Row label="Établissement précédent" value={val(demande.etablissement_precedent)} />
        </Section>

        <Section titre="Famille">
          <Row label="Nom de famille" value={val(demande.nom_famille)} />
          <Row label="Situation maritale" value={val(demande.situation_maritale)} />
          <Row label="Email de contact (invité)" value={val(demande.email_invite)} />
        </Section>

        <Section titre="Responsable 1">
          <Row label="Prénom" value={val(demande.parent1_prenom)} />
          <Row label="Nom" value={val(demande.parent1_nom)} />
          <Row label="Email" value={val(demande.parent1_email)} />
          <Row label="Téléphone" value={val(demande.parent1_telephone)} />
          <Row label="Profession / emploi" value={val(demande.parent1_emploi)} />
          <Row label="Adresse" value={val(adresseParent1)} />
        </Section>

        {hasParent2 && (
          <Section titre="Responsable 2">
            <Row label="Prénom" value={val(demande.parent2_prenom)} />
            <Row label="Nom" value={val(demande.parent2_nom)} />
            <Row label="Email" value={val(demande.parent2_email)} />
            <Row label="Téléphone" value={val(demande.parent2_telephone)} />
            <Row label="Profession / emploi" value={val(demande.parent2_emploi)} />
            <Row label="Adresse" value={val(adresseParent2)} />
          </Section>
        )}

        <Section titre="Options">
          <Row label="Transport scolaire" value={fmtBool(demande.transport)} />
          <Row label="Instruction religieuse" value={fmtBool(demande.instruction_religieuse)} />
          <Row label="Étude / garderie" value={fmtBool(demande.etude_garderie)} />
        </Section>

        <Section titre="Santé et signes particuliers">
          <Row label="Signes particuliers" value={val(demande.signes_particuliers)} />
          <Row label="Médecin" value={val(demande.medecin_nom)} />
          <Row label="Téléphone du médecin" value={val(demande.medecin_telephone)} />
        </Section>

        <Section titre="Contacts d'urgence">
          <Row label="Contact 1 — Nom" value={val(demande.urgence_1_nom)} />
          <Row label="Contact 1 — Téléphone" value={val(demande.urgence_1_tel)} />
          <Row label="Contact 1 — Lien de parenté" value={val(demande.urgence_1_lien)} />
          <Row label="Contact 2 — Nom" value={val(demande.urgence_2_nom)} />
          <Row label="Contact 2 — Téléphone" value={val(demande.urgence_2_tel)} />
          <Row label="Contact 2 — Lien de parenté" value={val(demande.urgence_2_lien)} />
        </Section>

        {demande.statut === 'refuse' && demande.motif_refus && (
          <div className="print-section" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: 12, borderRadius: 8, fontSize: 12, marginTop: 14 }}>
            <strong>Motif du refus :</strong> {demande.motif_refus}
          </div>
        )}

        {/* Signature parent */}
        <div className="print-section" style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ fontSize: 11, color: '#64748B', maxWidth: 360 }}>
            Je certifie l&apos;exactitude des informations renseignées dans la présente demande
            d&apos;inscription et accepte que celles-ci soient utilisées par l&apos;établissement
            dans le cadre de l&apos;instruction du dossier.
          </div>
          <div style={{ textAlign: 'center', minWidth: 220 }}>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>Signature du responsable légal</div>
            <div style={{ height: 60, borderBottom: '1px solid #94A3B8' }} />
            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>Date et signature</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 36, paddingTop: 12, borderTop: '1px solid #E2E8F0', fontSize: 10, color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
          <div>Document généré le {today} via TalmidApp</div>
          <div>Demande N° {idCourt}</div>
        </div>
      </div>
    </>
  )
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="print-section" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, borderLeft: '3px solid #1E293B', paddingLeft: 8 }}>
        {titre}
      </div>
      <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, rowGap: 4 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', fontSize: 12, lineHeight: 1.5, breakInside: 'avoid' }}>
      <div style={{ width: 150, color: '#94A3B8', flexShrink: 0 }}>{label}</div>
      <div style={{ color: '#1E293B', fontWeight: 500, flex: 1, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}
