'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { labelModePaiement } from '@/lib/statuts'
import { useI18n } from '@/lib/i18n'
import { fmtDate } from '@/lib/format-date'
import { chargerReportActif, type ReportSoldeActif } from '@/lib/report-solde'
import { appAlert, appConfirm } from '@/components/ui/ConfirmDialog'

// Libelles propres des statuts d'avoir (codes BDD -> affichage FR)
const LABEL_STATUT_AVOIR: Record<string, string> = {
  actif: 'Actif',
  utilise: 'Utilisé',
  partiellement_utilise: 'Partiellement utilisé',
  annule: 'Annulé',
}

export default function PortailFacturesPage() {
  const { anneeInscription } = useAnneeInscription()
  const { t, lang } = useI18n()
  const parent = useParentCtx()
  const [facture, setFacture] = useState<any>(null)
  const [lignes, setLignes] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [avoirs, setAvoirs] = useState<any[]>([])
  const [imputations, setImputations] = useState<any[]>([])
  const [echeances, setEcheances] = useState<any[]>([])
  // Report de solde de l'année précédente repris sur l'année affichée.
  // Information seule : ce montant n'est PAS refacturé (il figure déjà au
  // compte de la famille au titre de l'année d'origine).
  const [report, setReport] = useState<ReportSoldeActif | null>(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(false)
  const [stripeActif, setStripeActif] = useState(false)
  const [gocardlessActif, setGocardlessActif] = useState(false)
  const [paypalActif, setPaypalActif] = useState(false)
  const [paying, setPaying] = useState(false)
  // yyyy3 : mandat de prélèvement automatique par carte
  const [mandatCb, setMandatCb] = useState<any>(null)
  const [mandatBusy, setMandatBusy] = useState(false)
  // jjjj1 : mandat de prélèvement SEPA (GoCardless)
  const [mandatSepa, setMandatSepa] = useState<any>(null)
  const [mandatSepaBusy, setMandatSepaBusy] = useState(false)
  // kkkk1 : confirmation immédiate au retour de la signature GoCardless
  // (le webhook met quelques secondes — sans ce flash, le bouton « Signer »
  // réapparaissait et les parents recommençaient la signature)
  const [mandatSepaFlash, setMandatSepaFlash] = useState<'ok' | 'annule' | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErreur(false)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase
        .from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
      if (!profile?.famille_id) return

      // Avoirs : tous exercices confondus (un avoir peut etre emis sur N et utilise sur N+1)
      // Mandat de prélèvement automatique CB (RLS : le parent lit le sien)
      const { data: mnd } = await supabase
        .from('mandats_cb')
        .select('statut, carte_marque, carte_last4, carte_exp_mois, carte_exp_annee')
        .eq('famille_id', profile.famille_id)
        .maybeSingle()
      setMandatCb(mnd ?? null)

      // jjjj1 : mandat SEPA GoCardless (le plus récent de la famille)
      const { data: mndGc } = await supabase
        .from('mandats_gocardless')
        .select('id, statut, gocardless_mandate_id, derniere_erreur, iban_last4, bank_name')
        .eq('famille_id', profile.famille_id)
        .order('created_at', { ascending: false })
        .limit(1)
      setMandatSepa((mndGc && mndGc[0]) ?? null)

      const { data: avs } = await supabase
        .from('avoirs_solde').select('*')
        .eq('famille_id', profile.famille_id)
        .order('date_emission', { ascending: false })
      setAvoirs((avs as any[]) || [])

      // Report de solde validé pour l'exercice affiché (résolu par son code).
      // Lecture indépendante de la facture : un report peut exister alors
      // qu'aucune facture n'a encore été émise pour l'année.
      let exerciceCibleId: string | null = null
      if (profile.ecole_id) {
        const { data: ex } = await supabase
          .from('exercices').select('id')
          .eq('ecole_id', profile.ecole_id)
          .eq('code', anneeInscription)
          .maybeSingle()
        exerciceCibleId = ex?.id ?? null
      }
      if (exerciceCibleId) {
        const { report: rep } = await chargerReportActif(supabase, profile.famille_id, exerciceCibleId)
        setReport(rep)
      } else {
        setReport(null)
      }

      const { data: fact } = await supabase
        .from('factures_solde').select('*')
        .eq('famille_id', profile.famille_id)
        .eq('annee_scolaire', anneeInscription)
        .maybeSingle()

      if (fact) {
        setFacture(fact)
        const [{ data: lig }, { data: regl }, { data: imp }, { data: integrationsActives }, { data: ech }] = await Promise.all([
          supabase.from('facture_lignes').select('*, enfants(prenom, nom)').eq('facture_id', fact.id),
          supabase.from('reglements').select('*').eq('facture_id', fact.id).order('date_reglement', { ascending: false }),
          supabase.from('avoirs_imputations').select('*, avoirs(numero, motif)').eq('facture_id', fact.id),
          // FIX 05/08 : factures_solde n'a PAS de colonne ecole_id -> fact.ecole_id etait
          // undefined et la requete ne renvoyait jamais rien : le bouton "Payer par carte"
          // ne pouvait apparaitre pour PERSONNE meme avec Stripe actif. On passe par le profil.
          supabase.from('parametres_integrations_public').select('provider, actif').eq('ecole_id', profile.ecole_id).in('provider', ['stripe', 'gocardless', 'paypal']),
          // Echeances : on masque les cheques en attente_reception (l'admin n'a pas encore confirme reception)
          supabase.from('cheques_prevus').select('*').eq('facture_id', fact.id).neq('statut', 'attente_reception').order('date_echeance', { ascending: true }),
        ])
        setLignes(lig ?? [])
        setImputations(imp ?? [])
        setEcheances(ech ?? [])
        // Filtrer les reglements de mode_paiement=avoir (deja comptes dans imputations)
        const reglementsReels = (regl ?? []).filter((r: any) => r.mode_paiement !== 'avoir')
        setReglements(parent.estSeparee ? reglementsReels.filter((r: any) => r.paye_par === parent.parentSlot) : reglementsReels)
        setStripeActif(Boolean(integrationsActives?.find((i: any) => i.provider === 'stripe' && i.actif)))
        setGocardlessActif(Boolean(integrationsActives?.find((i: any) => i.provider === 'gocardless' && i.actif)))
        setPaypalActif(Boolean(integrationsActives?.find((i: any) => i.provider === 'paypal' && i.actif)))
      } else {
        setFacture(null)
      }
    } catch (e) {
      console.error('[portail] Erreur chargement factures :', e)
      setErreur(true)
    } finally {
      setLoading(false)
    }
  }, [anneeInscription, parent.estSeparee, parent.parentSlot])

  useEffect(() => { load() }, [load])

  // kkkk1 : lecture du retour de signature (?mandat_sepa=ok|annule) puis nettoyage de l'URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('mandat_sepa')
    if (flag === 'ok' || flag === 'annule') {
      setMandatSepaFlash(flag as 'ok' | 'annule')
      params.delete('mandat_sepa')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [])

  async function payerEnLigne(provider: 'stripe' | 'gocardless' | 'paypal') {
    if (!facture) return
    // vvvv1 (24/08) : deux parents ont confondu ce paiement one-off du solde TOTAL
    // avec la signature du mandat mensuel (ecran bancaire de 3 020 EUR recu en
    // pensant signer un mandat). Confirmation explicite avant de partir chez
    // GoCardless, avec renvoi vers le bouton « Signer mon mandat ».
    if (provider === 'gocardless') {
      const ok = await appConfirm(t('portail.factures.gc_oneoff_warn', { montant: Number(facture.solde_restant).toLocaleString('fr-FR') }))
      if (!ok) return
    }
    setPaying(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { await appAlert('Session expirée'); setPaying(false); return }
      const endpoint = provider === 'stripe' ? '/api/stripe/checkout' : provider === 'paypal' ? '/api/paypal/checkout' : '/api/gocardless/checkout'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ factureId: facture.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        await appAlert(data.error || 'Erreur lors de la création du paiement')
        setPaying(false)
        return
      }
      window.location.href = data.url
    } catch (e: any) {
      await appAlert(e?.message || 'Erreur paiement')
      setPaying(false)
    }
  }

  async function gererMandat(action: 'activer' | 'revoquer') {
    if (action === 'revoquer' && !await appConfirm('Désactiver le prélèvement automatique ? Vous devrez régler vos échéances manuellement.')) return
    setMandatBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { await appAlert('Session expirée'); return }
      const res = await fetch('/api/stripe/mandat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) { await appAlert(data.error || 'Erreur'); return }
      if (action === 'activer' && data.url) { window.location.href = data.url; return }
      await load()
    } finally {
      setMandatBusy(false)
    }
  }

  // jjjj1 : mandat de prélèvement SEPA (GoCardless)
  async function gererMandatSepa(action: 'activer' | 'revoquer') {
    if (action === 'revoquer' && !await appConfirm('Désactiver le prélèvement SEPA automatique ? Vous devrez régler vos échéances manuellement.')) return
    setMandatSepaBusy(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { await appAlert('Session expirée'); return }
      const res = await fetch('/api/gocardless/mandat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) { await appAlert(data.error || 'Erreur'); return }
      if (action === 'activer' && data.url) { window.location.href = data.url; return }
      await load()
    } finally {
      setMandatSepaBusy(false)
    }
  }

  if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: 40 }}>{t('portail.common.loading')}</div>

  if (erreur) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>Une erreur est survenue</h2>
      <p style={{ color: '#64748B', fontSize: 13, marginBottom: 18 }}>Le chargement de vos factures a &eacute;chou&eacute;. V&eacute;rifiez votre connexion puis r&eacute;essayez.</p>
      <button onClick={() => load()}
        style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
        Réessayer
      </button>
    </div>
  )

  // Si la facture est annulee, rien n'est du ni a regler
  const isAnnulee = facture?.statut === 'annule'
  // Avoirs imputes sur cette facture (deduction du facture).
  // NOTE : depuis la refonte de la vue `factures_solde`, le champ `total_avoirs_imputes`
  // est aussi exposé directement (somme des reglements WHERE mode_paiement='avoir').
  // On garde ici le recalcul depuis `avoirs_imputations` car on a déjà besoin du detail
  // des imputations (numero/motif) pour l'affichage du bloc "Avoirs disponibles".
  // Les deux sources sont mathematiquement equivalentes.
  const totalAvoirsImputes = isAnnulee ? 0 : imputations.reduce((s, i) => s + Number(i.montant), 0)
  // Les échéances qui reprennent un report de solde portent `report_solde_id`.
  // On les liste à part : elles ne concernent pas la scolarité de l'année.
  const echeancesAnnee = echeances.filter((e: any) => !e.report_solde_id)
  const echeancesReport = echeances.filter((e: any) => !!e.report_solde_id)
  // Net a regler par la famille apres deduction avoirs (= "facture nette")
  const totalFactureNet = facture && !isAnnulee ? Number(facture.total_facture) - totalAvoirsImputes : 0
  const maPart = facture && !isAnnulee ? totalFactureNet * parent.partPct / 100 : 0
  const regleMoi = isAnnulee ? 0 : reglements.reduce((s, r) => s + Number(r.montant), 0)
  const monSolde = maPart - regleMoi

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>{t('portail.factures.title')}</h1>
          {facture && <a href={`/factures/${facture.id}/print?auto=true`} target="_blank" rel="noopener noreferrer" style={{ background: '#2563EB', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{t('portail.factures.download_pdf')}</a>}
        </div>
        <p style={{ color: '#64748B', fontSize: 13 }}>{t('portail.factures.school_year_line', { annee: anneeInscription })}</p>
      </div>

      {parent.estSeparee && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#7C2D12', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16 }}>👥</span>
          <div dangerouslySetInnerHTML={{ __html: t('portail.factures.separated_notice', { pct: parent.partPct }) }} />
        </div>
      )}

      {/* Avoirs visibles meme si pas de facture pour l'annee selectionnee (un avoir peut etre emis sur N et applique sur N+1) */}
      {avoirs.length > 0 && !parent.estSeparee && (
        <div style={{ background: '#fff', border: '1px solid #BBF7D0', borderRadius: 12, overflow: 'auto' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #DCFCE7', background: '#F0FDF4', fontWeight: 600, fontSize: 14, color: '#065F46' }}>
            {t('portail.factures.credits.heading')}
          </div>
          <div style={{ padding: '12px 20px', fontSize: 12, color: '#475569' }}>
            {t('portail.factures.credits.intro')}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr>
                  {[
                    t('portail.factures.credits.col.number'),
                    t('portail.factures.credits.col.issued_on'),
                    t('portail.factures.credits.col.reason'),
                    t('portail.factures.credits.col.amount'),
                    t('portail.factures.credits.col.available'),
                    t('portail.factures.credits.col.status'),
                  ].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {avoirs.map((a: any) => (
                  <tr key={a.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{a.numero || a.id.substring(0, 8)}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#475569' }}>{fmtDate(a.date_emission, lang)}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#475569' }}>{a.motif || '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{Number(a.montant).toLocaleString('fr-FR')} €</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: Number(a.montant_disponible) > 0 ? '#10B981' : '#94A3B8' }}>{Number(a.montant_disponible).toLocaleString('fr-FR')} €</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                        background: a.statut === 'actif' ? '#ECFDF5' : a.statut === 'utilise' ? '#F1F5F9' : a.statut === 'partiellement_utilise' ? '#FEF3C7' : '#FEF2F2',
                        color: a.statut === 'actif' ? '#065F46' : a.statut === 'utilise' ? '#475569' : a.statut === 'partiellement_utilise' ? '#92400E' : '#991B1B',
                        textTransform: 'uppercase' }}>{LABEL_STATUT_AVOIR[a.statut] || String(a.statut).replace(/_/g, ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report de solde de l'année précédente — information, pas une facture.
          Ton volontairement factuel : on décrit un montant et son traitement,
          on ne met pas la famille en cause. */}
      {report && Number(report.montant) !== 0 && (() => {
        const montantReport = Number(report.montant) || 0
        // Si le code d'exercice manque, on reste compréhensible : « l'année précédente ».
        const anneeOrigine = report.exercice_origine_code || t('portail.factures.report.previous_year', {}, 'précédente')
        const dejaRepris = Number(report.montant_echeance) || 0
        const debiteur = montantReport > 0
        const c = debiteur
          ? { bg: '#fff', border: '#FDE68A', head: '#FFFBEB', fg: '#92400E' }
          : { bg: '#fff', border: '#BBF7D0', head: '#F0FDF4', fg: '#065F46' }
        return (
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, background: c.head, fontWeight: 600, fontSize: 14, color: c.fg }}>
              {debiteur
                ? t('portail.factures.report.title_debit', { annee: anneeOrigine }, 'Solde restant de l\'année {annee}')
                : t('portail.factures.report.title_credit', { annee: anneeOrigine }, 'Trop-perçu de l\'année {annee}')}
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#475569' }}>
                  {debiteur
                    ? t('portail.factures.report.amount_debit', {}, 'Montant restant de l\'année précédente')
                    : t('portail.factures.report.amount_credit', {}, 'Montant en votre faveur')}
                </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: debiteur ? '#B45309' : '#059669' }}>
                  {Math.abs(montantReport).toLocaleString('fr-FR')} €
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.55 }}>
                {debiteur
                  ? t('portail.factures.report.note_debit', {},
                    'Ce montant provient de l\'année précédente. Il n\'est pas refacturé : il figure ici pour information et il est repris, le cas échéant, dans les échéances signalées « report de solde » ci-dessous.')
                  : t('portail.factures.report.note_credit', {},
                    'Ce montant vous reste acquis. Il vient en déduction des échéances de l\'année en cours.')}
              </div>
              {debiteur && dejaRepris > 0 && (
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  {t('portail.factures.report.scheduled', { montant: dejaRepris.toLocaleString('fr-FR') }, 'Déjà réparti sur vos échéances : {montant} €')}
                </div>
              )}
              {report.note && (
                <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>{report.note}</div>
              )}
            </div>
          </div>
        )
      })()}

      {!facture ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
          {t('portail.factures.empty', { annee: anneeInscription.replace('-', '/') })}
        </div>
      ) : (
        <>
          {/* Solde - mode comptable: facture inchangee + avoirs en deduction separee */}
          {parent.estSeparee ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { label: t('portail.factures.sep.my_share'), value: `${maPart.toLocaleString('fr-FR')} €`, color: '#2563EB', bg: '#EFF6FF' },
                { label: t('portail.factures.sep.paid_by_me'), value: `${regleMoi.toLocaleString('fr-FR')} €`, color: '#059669', bg: '#ECFDF5' },
                { label: t('portail.factures.sep.my_balance'), value: `${monSolde.toLocaleString('fr-FR')} €`, color: monSolde > 0 ? '#DC2626' : '#059669', bg: monSolde > 0 ? '#FEF2F2' : '#ECFDF5' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '18px 22px' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 22px' }}>
              {[
                { label: t('portail.factures.total_invoiced'), value: isAnnulee ? 0 : Number(facture.total_facture), color: '#1E293B', bold: true },
                ...(totalAvoirsImputes > 0 ? [{ label: t('portail.factures.credits_deduction'), value: -totalAvoirsImputes, color: '#059669', bold: false }] : []),
                ...(totalAvoirsImputes > 0 ? [{ label: t('portail.factures.net_to_pay'), value: isAnnulee ? 0 : totalFactureNet, color: '#1E293B', bold: true, separator: true }] : []),
                { label: t('portail.factures.total_paid'), value: isAnnulee ? 0 : Number(facture.total_regle), color: '#059669', bold: false },
                { label: t('portail.factures.remaining_to_pay'), value: isAnnulee ? 0 : Number(facture.solde_restant), color: !isAnnulee && Number(facture.solde_restant) > 0 ? '#DC2626' : '#059669', bold: true, highlight: true },
              ].map((row: any, idx: number) => (
                <div key={idx} className="portail-recap-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: row.separator ? '1px solid #E2E8F0' : 'none', marginTop: row.separator ? 6 : 0, paddingTop: row.separator ? 12 : 8 }}>
                  <div style={{ fontSize: row.highlight ? 15 : 13, fontWeight: row.bold ? 700 : 500, color: row.highlight ? '#1E293B' : '#475569' }}>{row.label}</div>
                  <div style={{ fontSize: row.highlight ? 22 : 16, fontWeight: row.bold ? 800 : 600, color: row.color }}>{Number(row.value).toLocaleString('fr-FR')} €</div>
                </div>
              ))}
            </div>
          )}

          {/* Statut */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{t('portail.factures.invoice_no', { numero: facture.numero })}</span>
              <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 10 }}>{t('portail.factures.issued_on', { date: fmtDate(facture.date_emission, lang) })}</span>
            </div>
            {(() => {
              const map: any = {
                en_attente: { label: t('portail.factures.status.waiting'), color: '#D97706', bg: '#FFFBEB' },
                partiel: { label: t('portail.factures.status.partial'), color: '#2563EB', bg: '#EFF6FF' },
                paye: { label: t('portail.factures.status.paid'), color: '#059669', bg: '#ECFDF5' },
                payee: { label: t('portail.factures.status.paid'), color: '#059669', bg: '#ECFDF5' },
                solde: { label: t('portail.factures.status.settled'), color: '#059669', bg: '#ECFDF5' },
                annule: { label: t('portail.factures.status.cancelled'), color: '#64748B', bg: '#F1F5F9' },
                annulee: { label: t('portail.factures.status.cancelled'), color: '#64748B', bg: '#F1F5F9' },
              }
              const s = map[String(facture.statut || '').toLowerCase()] || { label: facture.statut, color: '#64748B', bg: '#F1F5F9' }
              return <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600 }}>{s.label}</span>
            })()}
          </div>

          {facture.statut === 'en_attente' && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>💡</span>
              <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t('portail.factures.banner_waiting') }} />
            </div>
          )}

          {!parent.estSeparee && (stripeActif || gocardlessActif || paypalActif) && Number(facture.solde_restant) > 0 && facture.statut !== 'annule' && (
            <div style={{ background: '#fff', border: '1px solid #BFDBFE', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1E40AF', marginBottom: 4 }}>
                  {t('portail.factures.pay_online.title', { montant: Number(facture.solde_restant).toLocaleString('fr-FR') })}
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  {t('portail.factures.pay_online.subtitle')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {stripeActif && (
                  <button onClick={() => payerEnLigne('stripe')} disabled={paying} className="btn-primary" style={{ minHeight: 44, fontSize: 13, fontWeight: 700, flex: '1 1 200px' }}>
                    {paying ? t('portail.factures.pay_online.redirecting') : t('portail.factures.pay_online.card')}
                  </button>
                )}
                {gocardlessActif && (
                  <button onClick={() => payerEnLigne('gocardless')} disabled={paying} style={{
                    background: '#fff', color: '#1E40AF', border: '1px solid #1E40AF',
                    borderRadius: 8, padding: '11px 18px', minHeight: 44, fontSize: 13, fontWeight: 700,
                    cursor: paying ? 'not-allowed' : 'pointer', flex: '1 1 200px',
                  }}>
                    {paying ? t('portail.factures.pay_online.redirecting') : t('portail.factures.pay_online.sepa')}
                  </button>
                )}
                {paypalActif && (
                  <button onClick={() => payerEnLigne('paypal')} disabled={paying} style={{
                    background: '#FFC439', color: '#003087', border: 'none',
                    borderRadius: 8, padding: '11px 18px', minHeight: 44, fontSize: 13, fontWeight: 800,
                    cursor: paying ? 'not-allowed' : 'pointer', flex: '1 1 200px',
                  }}>
                    {paying ? t('portail.factures.pay_online.redirecting') : 'PayPal'}
                  </button>
                )}
              </div>
            </div>
          )}
          {/* yyyy3 : prélèvement automatique par carte (mandat) */}
          {!parent.estSeparee && stripeActif && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>🔁 Prélèvement automatique par carte</div>
              {mandatCb?.statut === 'actif' ? (
                <>
                  <div style={{ fontSize: 13, color: '#065F46', background: '#ECFDF5', borderRadius: 8, padding: '8px 12px' }}>
                    ✓ Activé — carte {mandatCb.carte_marque || ''} •••• {mandatCb.carte_last4}
                    {mandatCb.carte_exp_mois ? ` (exp. ${String(mandatCb.carte_exp_mois).padStart(2, '0')}/${mandatCb.carte_exp_annee})` : ''}.
                    Vos échéances sont prélevées automatiquement à leur date.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => gererMandat('activer')} disabled={mandatBusy}
                      style={{ background: '#fff', color: '#1E40AF', border: '1px solid #1E40AF', borderRadius: 8, padding: '9px 16px', minHeight: 40, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Changer de carte
                    </button>
                    <button onClick={() => gererMandat('revoquer')} disabled={mandatBusy}
                      style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 16px', minHeight: 40, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Désactiver
                    </button>
                  </div>
                </>
              ) : mandatCb?.statut === 'suspendu' ? (
                <>
                  <div style={{ fontSize: 13, color: '#991B1B', background: '#FEF2F2', borderRadius: 8, padding: '8px 12px' }}>
                    ⚠️ Suspendu après plusieurs échecs de prélèvement{mandatCb.derniere_erreur ? ` (${mandatCb.derniere_erreur})` : ''}. Mettez à jour votre carte pour le réactiver.
                  </div>
                  <button onClick={() => gererMandat('activer')} disabled={mandatBusy} className="btn-primary"
                    style={{ minHeight: 44, fontSize: 13, fontWeight: 700, alignSelf: 'flex-start' }}>
                    {mandatBusy ? 'Redirection…' : 'Mettre à jour ma carte'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                    Enregistrez votre carte une seule fois (page sécurisée Stripe) : chaque mensualité de votre échéancier
                    sera ensuite prélevée automatiquement à sa date. Plus rien à penser, ni chèques ni virements.
                  </div>
                  <button onClick={() => gererMandat('activer')} disabled={mandatBusy} className="btn-primary"
                    style={{ minHeight: 44, fontSize: 13, fontWeight: 700, alignSelf: 'flex-start' }}>
                    {mandatBusy ? 'Redirection…' : 'Activer le prélèvement automatique'}
                  </button>
                </>
              )}
            </div>
          )}
          {/* jjjj1 : prélèvement automatique SEPA (mandat GoCardless) */}
          {!parent.estSeparee && gocardlessActif && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>🏦 Prélèvement automatique SEPA</div>
              {mandatSepa?.statut === 'active' ? (
                <>
                  <div style={{ fontSize: 13, color: '#065F46', background: '#ECFDF5', borderRadius: 8, padding: '8px 12px' }}>
                    ✓ Mandat actif{mandatSepa.iban_last4 ? ` — compte •••• ${mandatSepa.iban_last4}` : ''}.
                    Vos échéances sont prélevées automatiquement sur votre compte bancaire à leur date.
                  </div>
                  <button onClick={() => gererMandatSepa('revoquer')} disabled={mandatSepaBusy}
                    style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 16px', minHeight: 40, fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>
                    Désactiver
                  </button>
                </>
              ) : mandatSepa?.statut === 'suspendu' ? (
                <>
                  <div style={{ fontSize: 13, color: '#991B1B', background: '#FEF2F2', borderRadius: 8, padding: '8px 12px' }}>
                    ⚠️ Suspendu après plusieurs échecs de prélèvement{mandatSepa.derniere_erreur ? ` (${mandatSepa.derniere_erreur})` : ''}. Signez un nouveau mandat pour le réactiver.
                  </div>
                  <button onClick={() => gererMandatSepa('activer')} disabled={mandatSepaBusy} className="btn-primary"
                    style={{ minHeight: 44, fontSize: 13, fontWeight: 700, alignSelf: 'flex-start' }}>
                    {mandatSepaBusy ? 'Redirection…' : 'Signer un nouveau mandat'}
                  </button>
                </>
              ) : mandatSepaFlash === 'ok' ? (
                <div style={{ fontSize: 13, color: '#065F46', background: '#ECFDF5', borderRadius: 8, padding: '8px 12px' }}>
                  ✓ Votre mandat a bien été signé — c'est enregistré ! Votre banque l'active sous 2 à 3 jours ouvrés,
                  puis vos échéances seront prélevées automatiquement à leur date.
                  <strong> Vous n'avez plus rien à faire — inutile de recommencer la signature.</strong>
                </div>
              ) : (mandatSepa?.statut === 'signe' || mandatSepa?.statut === 'pending') && mandatSepa?.gocardless_mandate_id ? (
                <div style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', borderRadius: 8, padding: '8px 12px' }}>
                  ⏳ Mandat signé — activation par la banque en cours (2 à 3 jours ouvrés). Rien à faire de votre côté.
                </div>
              ) : mandatSepaFlash === 'annule' ? (
                <>
                  <div style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', borderRadius: 8, padding: '8px 12px' }}>
                    Signature annulée — aucun mandat n'a été créé. Vous pouvez recommencer quand vous le souhaitez.
                  </div>
                  <button onClick={() => gererMandatSepa('activer')} disabled={mandatSepaBusy} className="btn-primary"
                    style={{ minHeight: 44, fontSize: 13, fontWeight: 700, alignSelf: 'flex-start' }}>
                    {mandatSepaBusy ? 'Redirection…' : 'Signer mon mandat de prélèvement'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
                    Signez votre mandat de prélèvement en 2 minutes (page sécurisée GoCardless, sans papier) :
                    chaque mensualité de votre échéancier sera ensuite prélevée automatiquement sur votre compte bancaire à sa date.
                  </div>
                  <button onClick={() => gererMandatSepa('activer')} disabled={mandatSepaBusy} className="btn-primary"
                    style={{ minHeight: 44, fontSize: 13, fontWeight: 700, alignSelf: 'flex-start' }}>
                    {mandatSepaBusy ? 'Redirection…' : 'Signer mon mandat de prélèvement'}
                  </button>
                </>
              )}
            </div>
          )}
          {facture.statut === 'partiel' && Number(facture.solde_restant) > 0 && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>ℹ️</span>
              <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t('portail.factures.banner_partial', { montant: Number(facture.solde_restant).toLocaleString('fr-FR') }) }} />
            </div>
          )}
          {facture.statut === 'annule' && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t('portail.factures.banner_cancelled') }} />
            </div>
          )}

          {/* Détail */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>{t('portail.factures.detail_per_student')}</div>
            {lignes.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>{t('portail.factures.no_line')}</div>
            ) : (
              <div className="portail-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#F8FAFC' }}>
                    <tr>
                      {[
                        t('portail.factures.col.student'),
                        t('portail.factures.col.description'),
                        t('portail.factures.col.amount'),
                      ].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, i) => (
                      <tr key={l.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>{l.enfants ? `${l.enfants.prenom || ''} ${l.enfants.nom || ''}`.trim() : t('portail.factures.line.family')}</td>
                        <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13 }}>{l.description}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E293B' }}>{Number(l.montant).toLocaleString('fr-FR')} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Echeancier de l'annee en cours (les echeances de report sont listees a part) */}
          {echeancesAnnee.length > 0 && !isAnnulee && ((echeances: any[]) => {
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const reglees = echeances.filter(e => ['encaisse', 'paye'].includes(e.statut))
            const aRegler = echeances.filter(e => !['encaisse', 'paye', 'rejete'].includes(e.statut))
            const prochaine = aRegler.find(e => new Date(e.date_echeance) >= today) || aRegler[0]
            const totalRegle = reglees.reduce((s, e) => s + Number(e.montant), 0)
            const totalRestant = aRegler.reduce((s, e) => s + Number(e.montant), 0)
            const modeLabel = (m: string) => {
              if (m === 'cheque') return t('portail.factures.mode.cheque')
              if (m === 'sepa' || m === 'prelevement') return t('portail.factures.mode.sepa')
              if (m === 'virement') return t('portail.factures.mode.virement')
              if (m === 'especes') return t('portail.factures.mode.especes')
              if (m === 'carte') return t('portail.factures.mode.carte')
              return labelModePaiement(m)
            }
            const modeIcon = (m: string) => {
              if (m === 'cheque') return '📝'
              if (m === 'sepa' || m === 'prelevement') return '🏦'
              if (m === 'virement') return '↪️'
              if (m === 'especes') return '💶'
              if (m === 'carte') return '💳'
              return '•'
            }
            function badge(e: any) {
              const dateEch = new Date(e.date_echeance); dateEch.setHours(0, 0, 0, 0)
              const enRetard = !['encaisse', 'paye', 'rejete', 'recu'].includes(e.statut) && dateEch < today
              if (e.statut === 'encaisse') return { label: t('portail.factures.sched.status.encaisse'), bg: '#ECFDF5', color: '#065F46' }
              if (e.statut === 'paye') return { label: t('portail.factures.sched.status.paye'), bg: '#ECFDF5', color: '#065F46' }
              if (e.statut === 'rejete') return { label: t('portail.factures.sched.status.rejete'), bg: '#FEF2F2', color: '#991B1B' }
              if (e.statut === 'recu') return { label: t('portail.factures.sched.status.recu'), bg: '#EEF2FF', color: '#3730A3' }
              if (enRetard) return { label: t('portail.factures.sched.status.late'), bg: '#FEF2F2', color: '#991B1B' }
              if (prochaine && prochaine.id === e.id) return { label: t('portail.factures.sched.status.next'), bg: '#DBEAFE', color: '#1E40AF' }
              return { label: t('portail.factures.sched.status.upcoming'), bg: '#F1F5F9', color: '#475569' }
            }
            const joursAvant = prochaine ? Math.ceil((new Date(prochaine.date_echeance).getTime() - today.getTime()) / 86400000) : 0
            return (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t('portail.factures.sched.title')}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    {t('portail.factures.sched.count', { n: echeances.length, s: echeances.length > 1 ? 's' : '' })} · {echeances[0] ? modeLabel(echeances[0].mode_paiement) : ''}
                  </div>
                </div>
                {/* KPI strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: '14px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>{t('portail.factures.sched.paid_label')}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{reglees.length} / {echeances.length}</div>
                    {/* FIX P2-4 (audit portail parent 06/08) : afficher le total réglé RÉEL de la
                        facture (factures_solde.total_regle) et non la somme des seules échéances
                        encaissées — un règlement hors échéancier (ex. 500 € en espèces) affichait
                        « 0 € encaissés » alors que la famille avait bien payé. */}
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{t('portail.factures.sched.total_regle_facture', { montant: Number(facture.total_regle).toLocaleString('fr-FR') })}</div>
                  </div>
                  {prochaine && (
                    <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>{t('portail.factures.sched.next_label')}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{fmtDate(prochaine.date_echeance, lang)}</div>
                      <div style={{ fontSize: 11, color: joursAvant < 0 ? '#DC2626' : '#64748B', marginTop: 1 }}>
                        {joursAvant < 0 ? t('portail.factures.sched.late_by', { n: Math.abs(joursAvant) }) : joursAvant === 0 ? t('portail.factures.sched.today') : t('portail.factures.sched.in_days', { n: joursAvant, s: joursAvant > 1 ? 's' : '' })}
                      </div>
                    </div>
                  )}
                  <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>{t('portail.factures.remaining_to_pay')}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{totalRestant.toLocaleString('fr-FR')} €</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{t('portail.factures.sched.out_of', { montant: (totalRegle + totalRestant).toLocaleString('fr-FR') })}</div>
                  </div>
                </div>
                {/* Tableau desktop */}
                <div className="echeancier-desktop" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        {[t('portail.factures.credits.col.number'), t('portail.factures.sched.col.due_date'), t('portail.factures.col.amount'), t('portail.factures.col.mode'), t('portail.factures.credits.col.status')].map((h, i) => (
                          <th key={h} style={{ textAlign: i === 2 ? 'right' : 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {echeances.map(e => {
                        const b = badge(e)
                        const isProchaine = prochaine && prochaine.id === e.id
                        return (
                          <tr key={e.id} style={{ borderTop: '1px solid #F1F5F9', background: isProchaine ? '#EFF6FF' : 'transparent' }}>
                            <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', color: '#64748B', fontWeight: isProchaine ? 700 : 500 }}>{e.numero_cheque}</td>
                            <td style={{ padding: '11px 16px', fontSize: 13, color: '#1E293B', fontWeight: isProchaine ? 700 : 500 }}>{fmtDate(e.date_echeance, lang)}</td>
                            <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B', textAlign: 'right' }}>{Number(e.montant).toLocaleString('fr-FR')} €</td>
                            <td style={{ padding: '11px 16px', fontSize: 12, color: '#475569' }}>
                              <span style={{ marginRight: 4 }}>{modeIcon(e.mode_paiement)}</span>{modeLabel(e.mode_paiement)}
                            </td>
                            <td style={{ padding: '11px 16px' }}>
                              <span style={{ background: b.bg, color: b.color, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{b.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Cards mobile */}
                <div className="echeancier-mobile" style={{ display: 'none', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
                  {echeances.map(e => {
                    const b = badge(e)
                    const isProchaine = prochaine && prochaine.id === e.id
                    return (
                      <div key={e.id} style={{ border: `1px solid ${isProchaine ? '#BFDBFE' : '#E2E8F0'}`, background: isProchaine ? '#EFF6FF' : '#fff', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
                            #{e.numero_cheque} · {fmtDate(e.date_echeance, lang)}
                          </div>
                          <span style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{b.label}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#475569' }}>
                          <span>{modeIcon(e.mode_paiement)} {modeLabel(e.mode_paiement)}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{Number(e.montant).toLocaleString('fr-FR')} €</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ padding: '10px 16px', borderTop: '1px solid #E2E8F0', background: '#FFFBEB', fontSize: 11, color: '#92400E', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span>💡</span>
                  <div dangerouslySetInnerHTML={{ __html: t('portail.factures.sched.note') }} />
                </div>
                <style jsx>{`
                  @media (max-width: 640px) {
                    .echeancier-desktop { display: none; }
                    .echeancier-mobile { display: flex !important; }
                  }
                `}</style>
              </div>
            )
          })(echeancesAnnee)}

          {/* Echeances reprenant le report de solde de l'annee precedente.
              Bloc distinct : ces echeances ne correspondent pas a la scolarite
              de l'annee en cours, et aucune facture n'a ete emise pour elles. */}
          {echeancesReport.length > 0 && !isAnnulee && (() => {
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const total = echeancesReport.reduce((s: number, e: any) => s + Number(e.montant), 0)
            const anneeOrigine = report?.exercice_origine_code || t('portail.factures.report.previous_year', {}, 'précédente')
            return (
              <div style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #FDE68A', background: '#FFFBEB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#92400E' }}>
                    {t('portail.factures.report.sched_title', { annee: anneeOrigine }, 'Échéances du solde de l\'année {annee}')}
                  </div>
                  <div style={{ fontSize: 12, color: '#92400E' }}>
                    {total.toLocaleString('fr-FR')} € · {echeancesReport.length}
                  </div>
                </div>
                <div style={{ padding: '12px 20px', fontSize: 12, color: '#475569', lineHeight: 1.55 }}>
                  {t('portail.factures.report.sched_intro', {},
                    'Ces échéances concernent le solde de l\'année précédente, distinctes de celles de l\'année en cours.')}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        {[t('portail.factures.sched.col.due_date'), t('portail.factures.col.amount'), t('portail.factures.col.mode'), t('portail.factures.credits.col.status')].map((h, i) => (
                          <th key={h} style={{ textAlign: i === 1 ? 'right' : 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {echeancesReport.map((e: any) => {
                        const dateEch = new Date(e.date_echeance); dateEch.setHours(0, 0, 0, 0)
                        const reglee = ['encaisse', 'paye'].includes(e.statut)
                        const enRetard = !['encaisse', 'paye', 'rejete', 'recu'].includes(e.statut) && dateEch < today
                        const b = reglee
                          ? { label: t('portail.factures.sched.status.encaisse'), bg: '#ECFDF5', color: '#065F46' }
                          : enRetard
                            ? { label: t('portail.factures.sched.status.late'), bg: '#FEF2F2', color: '#991B1B' }
                            : { label: t('portail.factures.sched.status.upcoming'), bg: '#F1F5F9', color: '#475569' }
                        return (
                          <tr key={e.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '11px 16px', fontSize: 13, color: '#1E293B' }}>{fmtDate(e.date_echeance, lang)}</td>
                            <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B', textAlign: 'right' }}>{Number(e.montant).toLocaleString('fr-FR')} €</td>
                            <td style={{ padding: '11px 16px', fontSize: 12, color: '#475569' }}>{labelModePaiement(e.mode_paiement)}</td>
                            <td style={{ padding: '11px 16px' }}>
                              <span style={{ background: b.bg, color: b.color, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{b.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* Règlements */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>{parent.estSeparee ? t('portail.factures.payments.my') : t('portail.factures.payments.history')}</div>
            {reglements.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>{t('portail.factures.payments.empty')}</div>
            ) : (
              <div className="portail-table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#F8FAFC' }}>
                    <tr>
                      {[
                        t('portail.factures.col.date'),
                        t('portail.factures.col.mode'),
                        t('portail.factures.col.reference'),
                        t('portail.factures.col.amount'),
                      ].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reglements.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', color: '#475569' }}>{fmtDate(r.date_reglement, lang)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{labelModePaiement(r.mode_paiement)}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 13 }}>{r.reference || '—'}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
