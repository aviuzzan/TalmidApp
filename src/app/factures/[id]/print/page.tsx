'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const MODES_LABEL: Record<string, string> = {
  cheque: 'Chèque', sepa: 'Prélèvement SEPA', virement: 'Virement', especes: 'Espèces', cb: 'Carte bancaire', manuel: 'Régularisation manuelle',
}

export default function FacturePrintPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const auto = searchParams.get('auto') === 'true'

  const [facture, setFacture] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [ecole, setEcole] = useState<any>(null)
  const [lignes, setLignes] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) { setError('Non connecté'); setLoading(false); return }

      const { data: f } = await s.from('factures_solde').select('*').eq('id', id).maybeSingle()
      if (!f) { setError('Facture introuvable'); setLoading(false); return }
      setFacture(f)

      const { data: fa } = await s.from('familles').select('*').eq('id', f.famille_id).single()
      setFamille(fa)
      const { data: ec } = await s.from('ecoles').select('*').eq('id', fa.ecole_id).single()
      setEcole(ec)
      const [{ data: lig }, { data: regl }] = await Promise.all([
        s.from('facture_lignes').select('*, enfants(prenom, nom)').eq('facture_id', id).order('date_creation'),
        s.from('reglements').select('*').eq('facture_id', id).order('date_reglement'),
      ])
      setLignes(lig ?? [])
      // Pour l'affichage on sépare les VRAIS paiements des avoirs imputés. Le total_regle
      // de la vue exclut désormais les avoirs (vrais paiements uniquement).
      setReglements(regl ?? [])
      setLoading(false)

      if (auto) setTimeout(() => window.print(), 600)
    }
    load()
  }, [id, auto])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B', fontFamily: 'Inter, sans-serif' }}>Chargement...</div>
  if (error || !facture) return <div style={{ padding: 60, textAlign: 'center', color: '#DC2626', fontFamily: 'Inter, sans-serif' }}>{error || 'Erreur'}</div>

  const total = Number(facture.total_facture)
  const totalRegle = Number(facture.total_regle)
  // Avoirs imputés (somme des reglements de type 'avoir' sur cette facture). Affichés
  // séparément du total réglé pour distinguer flux monétaire et imputations.
  const totalAvoirsImputes = reglements
    .filter(r => r.mode_paiement === 'avoir')
    .reduce((s, r) => s + Number(r.montant || 0), 0)
  const restant = Number(facture.solde_restant)
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const date = (d: string) => new Date(d).toLocaleDateString('fr-FR')
  // Pour la mention "Soldée le", on cherche le dernier vrai règlement (pas un avoir).
  const reglementsReels = reglements.filter(r => r.mode_paiement !== 'avoir')
  const lastRegl = reglementsReels[reglementsReels.length - 1] || reglements[reglements.length - 1]
  const estSeparee = famille?.situation_maritale === 'divorce' || famille?.situation_maritale === 'separe'
  const partP1 = Number(famille?.part_pere ?? 100)
  const partP2 = Number(famille?.part_mere ?? 0)
  const partP1Montant = total * partP1 / 100
  const partP2Montant = total * partP2 / 100
  // On exclut les avoirs imputés du "réglé par parent" (ce sont des imputations, pas
  // de l'argent versé par un parent).
  const regleP1 = reglementsReels.filter(r => r.paye_par === 'parent1').reduce((s, r) => s + Number(r.montant), 0)
  const regleP2 = reglementsReels.filter(r => r.paye_par === 'parent2').reduce((s, r) => s + Number(r.montant), 0)

  const titre = facture.statut === 'paye' ? 'FACTURE ACQUITTÉE' : facture.statut === 'partiel' ? 'RELEVÉ DE COMPTE' : facture.statut === 'annule' ? 'FACTURE ANNULÉE' : 'FACTURE'

  const ecoleAdr = [ecole?.adresse, ecole?.ville, ecole?.pays].filter(Boolean).join(' — ') || ''
  const familleAdr = [famille?.parent1_numero_rue, famille?.parent1_code_postal, famille?.parent1_ville].filter(Boolean).join(' ')
  const familleNom = famille?.parent1_prenom || famille?.parent1_nom ? `${famille?.parent1_prenom ?? ''} ${famille?.parent1_nom ?? ''}`.trim() : famille?.nom

  return (
    <>
      <style jsx global>{`
        @page { size: A4; margin: 14mm 16mm }
        body { background: #F1F5F9; margin: 0; font-family: 'Inter', -apple-system, system-ui, sans-serif; color: #1E293B }
        .wrap { max-width: 780px; margin: 24px auto; background: #fff; padding: 36px 44px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border-radius: 4px }
        .toolbar { max-width: 780px; margin: 0 auto 8px; display: flex; gap: 10px; padding: 0 8px }
        .toolbar button { background: #2563EB; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer }
        .toolbar a { color: #64748B; text-decoration: none; padding: 10px 18px; font-size: 13px; align-self: center }
        h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: 0.04em }
        h2 { font-size: 12px; font-weight: 700; color: #94A3B8; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 10px }
        table { width: 100%; border-collapse: collapse; font-size: 12px }
        th { text-align: left; padding: 10px 8px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; font-weight: 700; color: #64748B; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em }
        td { padding: 10px 8px; border-bottom: 1px solid #F1F5F9 }
        .stamp { display: inline-block; transform: rotate(-12deg); border: 4px solid #059669; color: #059669; padding: 8px 22px; font-size: 28px; font-weight: 800; letter-spacing: 0.1em; border-radius: 6px; opacity: 0.8 }
        @media print { body { background: #fff } .wrap { box-shadow: none; padding: 0; max-width: 100%; margin: 0 } .toolbar { display: none } .pagebreak { page-break-after: always } }
      `}</style>

      <div className="toolbar">
        <button onClick={() => window.print()}>📥 Télécharger PDF / Imprimer</button>
        <a href="javascript:history.back()">← Retour</a>
      </div>

      <div className="wrap">
        {/* Header école + meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 24 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {ecole?.logo_url && <img src={ecole.logo_url} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />}
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#1E293B' }}>{ecole?.nom}</div>
              {ecoleAdr && <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{ecoleAdr}</div>}
              {ecole?.email_contact && <div style={{ fontSize: 11, color: '#64748B' }}>{ecole.email_contact}</div>}
              {ecole?.telephone && <div style={{ fontSize: 11, color: '#64748B' }}>{ecole.telephone}</div>}
              {ecole?.ics_sepa && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>ICS : {ecole.ics_sepa}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h1>{titre}</h1>
            <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#475569', marginTop: 6 }}>{facture.numero}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Émise le {date(facture.date_emission)}</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>Année scolaire : {facture.annee_scolaire}</div>
          </div>
        </div>

        {/* Bandeau statut */}
        {facture.statut === 'paye' && (
          <div style={{ background: '#ECFDF5', border: '2px solid #10B981', borderRadius: 8, padding: '14px 18px', marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>✓ FACTURE TOTALEMENT RÉGLÉE</div>
              {lastRegl && <div style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>Soldée le {date(lastRegl.date_reglement)} — Justificatif fiscal</div>}
            </div>
            <span className="stamp">ACQUITTÉE</span>
          </div>
        )}
        {facture.statut === 'partiel' && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '14px 18px', marginBottom: 22 }}>
            <div style={{ fontWeight: 700, color: '#1D4ED8', fontSize: 13 }}>RELEVÉ INTERMÉDIAIRE</div>
            <div style={{ fontSize: 11, color: '#1E40AF', marginTop: 4 }}>Cette facture a déjà fait l&apos;objet de règlements partiels. Le solde restant figure ci-dessous.</div>
          </div>
        )}
        {facture.statut === 'en_attente' && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '14px 18px', marginBottom: 22 }}>
            <div style={{ fontWeight: 700, color: '#92400E', fontSize: 13 }}>⏳ À RÉGLER</div>
            <div style={{ fontSize: 11, color: '#78350F', marginTop: 4 }}>{ecole?.ics_sepa ? 'Règlement attendu par chèque, prélèvement SEPA ou virement bancaire selon les modalités convenues avec l\'école.' : 'Règlement attendu selon les modalités convenues avec l\'école.'}</div>
          </div>
        )}
        {facture.statut === 'annule' && (
          <div style={{ background: '#FEF2F2', border: '2px solid #DC2626', borderRadius: 8, padding: '14px 18px', marginBottom: 22 }}>
            <div style={{ fontWeight: 700, color: '#991B1B', fontSize: 14 }}>✕ FACTURE ANNULÉE — DOCUMENT SANS VALEUR</div>
            {facture.notes && <div style={{ fontSize: 11, color: '#991B1B', marginTop: 4 }}>Motif : {facture.notes}</div>}
          </div>
        )}

        {/* Destinataire */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginBottom: 24 }}>
          <div>
            <h2>Destinataire</h2>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{familleNom}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Famille n° {famille?.numero}</div>
            {familleAdr && <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{familleAdr}</div>}
            {famille?.parent1_email && <div style={{ fontSize: 11, color: '#64748B' }}>{famille.parent1_email}</div>}
            {famille?.parent1_telephone && <div style={{ fontSize: 11, color: '#64748B' }}>{famille.parent1_telephone}</div>}
          </div>
          <div>
            <h2>Récapitulatif</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Total facturé</span><strong>{fmt(total)}</strong></div>
            {totalAvoirsImputes > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: '#7C3AED' }}>
                <span>Avoirs imputés</span><strong>− {fmt(totalAvoirsImputes)}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: '#059669' }}><span>Total réglé</span><strong>{fmt(totalRegle)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 8, paddingTop: 8, borderTop: '2px solid #E2E8F0', color: restant > 0 ? '#DC2626' : '#059669' }}>
              <strong>{restant > 0 ? 'Solde restant' : 'Solde'}</strong><strong>{fmt(restant)}</strong>
            </div>
          </div>
        </div>

        {/* Tableau lignes */}
        <h2>Détail de la facture</h2>
        <table>
          <thead>
            <tr><th style={{ width: '40%' }}>Description</th><th style={{ width: '40%' }}>Élève</th><th style={{ width: '20%', textAlign: 'right' }}>Montant</th></tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94A3B8', padding: 20 }}>Aucune ligne</td></tr>
              : lignes.map(l => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td style={{ color: '#64748B' }}>{l.enfants ? `${l.enfants.prenom ?? ''} ${l.enfants.nom ?? ''}`.trim() : 'Famille'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(Number(l.montant))}</td>
                </tr>
              ))}
            <tr><td colSpan={2} style={{ textAlign: 'right', fontWeight: 700, paddingTop: 14, borderTop: '2px solid #1E293B' }}>TOTAL TTC</td><td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, paddingTop: 14, borderTop: '2px solid #1E293B' }}>{fmt(total)}</td></tr>
          </tbody>
        </table>

        {estSeparee && (
          <div style={{ marginTop: 26 }}>
            <h2>Répartition entre parents</h2>
            <table>
              <thead>
                <tr><th>Parent</th><th style={{ textAlign: 'right' }}>Part</th><th style={{ textAlign: 'right' }}>Réglé</th><th style={{ textAlign: 'right' }}>Solde</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Parent 1 — {`${famille?.parent1_prenom ?? ''} ${famille?.parent1_nom ?? ''}`.trim()}</td>
                  <td style={{ textAlign: 'right' }}>{partP1}% · {fmt(partP1Montant)}</td>
                  <td style={{ textAlign: 'right', color: '#059669' }}>{fmt(regleP1)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: partP1Montant - regleP1 > 0 ? '#DC2626' : '#059669' }}>{fmt(partP1Montant - regleP1)}</td>
                </tr>
                <tr>
                  <td>Parent 2 — {`${famille?.parent2_prenom ?? ''} ${famille?.parent2_nom ?? ''}`.trim()}</td>
                  <td style={{ textAlign: 'right' }}>{partP2}% · {fmt(partP2Montant)}</td>
                  <td style={{ textAlign: 'right', color: '#059669' }}>{fmt(regleP2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: partP2Montant - regleP2 > 0 ? '#DC2626' : '#059669' }}>{fmt(partP2Montant - regleP2)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6 }}>Facture émise au nom de la famille, répartie entre les deux parents selon l&apos;accord en vigueur.</div>
          </div>
        )}

        {/* Tableau règlements (si existants) */}
        {reglements.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <h2>Règlements reçus ({reglements.length})</h2>
            <table>
              <thead>
                <tr><th>Date</th><th>Mode</th><th>Référence</th><th style={{ textAlign: 'right' }}>Montant</th></tr>
              </thead>
              <tbody>
                {reglements.map(r => {
                  const isAvoir = r.mode_paiement === 'avoir'
                  return (
                  <tr key={r.id} style={{ background: isAvoir ? '#FAF5FF' : 'transparent' }}>
                    <td>{date(r.date_reglement)}</td>
                    <td style={{ color: isAvoir ? '#6B21A8' : undefined, fontWeight: isAvoir ? 600 : undefined }}>
                      {isAvoir ? 'Avoir imputé' : (MODES_LABEL[r.mode_paiement] || r.mode_paiement)}
                    </td>
                    <td style={{ color: '#64748B', fontSize: 11 }}>{r.reference || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: isAvoir ? '#7C3AED' : '#059669' }}>{fmt(Number(r.montant))}</td>
                  </tr>
                  )
                })}
                {totalAvoirsImputes > 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: '#7C3AED', paddingTop: 12 }}>Dont avoirs imputés</td><td style={{ textAlign: 'right', fontWeight: 800, color: '#7C3AED', paddingTop: 12 }}>{fmt(totalAvoirsImputes)}</td></tr>
                )}
                <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, paddingTop: 12 }}>Total réglé (paiements)</td><td style={{ textAlign: 'right', fontWeight: 800, color: '#059669', paddingTop: 12 }}>{fmt(totalRegle)}</td></tr>
                {restant > 0 && <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>Solde restant dû</td><td style={{ textAlign: 'right', fontWeight: 800, color: '#DC2626' }}>{fmt(restant)}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Coordonnées bancaires si en_attente ou partiel */}
        {(facture.statut === 'en_attente' || facture.statut === 'partiel') && (ecole?.iban_ecole || ecole?.bic_ecole || ecole?.nom_creancier) && (
          <div style={{ marginTop: 26, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <h2>Coordonnées bancaires de l&apos;école</h2>
            {ecole?.nom_creancier && <div style={{ fontSize: 11, marginBottom: 2 }}><strong>Bénéficiaire :</strong> {ecole.nom_creancier}</div>}
            {ecole?.iban_ecole && <div style={{ fontSize: 11, marginBottom: 2 }}><strong>IBAN :</strong> {ecole.iban_ecole}</div>}
            {ecole?.bic_ecole && <div style={{ fontSize: 11, marginBottom: 2 }}><strong>BIC :</strong> {ecole.bic_ecole}</div>}
            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6 }}>Indiquez la référence <strong>{facture.numero}</strong> dans votre virement.</div>
          </div>
        )}

        {/* Footer / mentions */}
        <div style={{ marginTop: 30, paddingTop: 14, borderTop: '1px solid #E2E8F0', fontSize: 10, color: '#94A3B8', lineHeight: 1.5 }}>
          <div>Document généré le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} via TalmidApp.</div>
          {facture.statut === 'paye' && <div style={{ marginTop: 4 }}>Cette facture acquittée vaut justificatif. À conserver.</div>}
          <div style={{ marginTop: 4 }}>En cas de question relative à cette facture, contactez l&apos;école {ecole?.email_contact ? `à ${ecole.email_contact}` : ''}.</div>
        </div>
      </div>
    </>
  )
}
