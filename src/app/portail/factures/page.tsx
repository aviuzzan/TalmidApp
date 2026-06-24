'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { labelModePaiement } from '@/lib/statuts'
import { useI18n } from '@/lib/i18n'

export default function PortailFacturesPage() {
  const { anneeInscription } = useAnneeInscription()
  const { t } = useI18n()
  const parent = useParentCtx()
  const [facture, setFacture] = useState<any>(null)
  const [lignes, setLignes] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [avoirs, setAvoirs] = useState<any[]>([])
  const [imputations, setImputations] = useState<any[]>([])
  const [echeances, setEcheances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stripeActif, setStripeActif] = useState(false)
  const [gocardlessActif, setGocardlessActif] = useState(false)
  const [paypalActif, setPaypalActif] = useState(false)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase
        .from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
      if (!profile?.famille_id) { setLoading(false); return }

      // Avoirs : tous exercices confondus (un avoir peut etre emis sur N et utilise sur N+1)
      const { data: avs } = await supabase
        .from('avoirs_solde').select('*')
        .eq('famille_id', profile.famille_id)
        .order('date_emission', { ascending: false })
      setAvoirs((avs as any[]) || [])

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
          supabase.from('parametres_integrations_public').select('provider, actif').eq('ecole_id', fact.ecole_id).in('provider', ['stripe', 'gocardless', 'paypal']),
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
      }
      setLoading(false)
    }
    load()
  }, [])

  async function payerEnLigne(provider: 'stripe' | 'gocardless' | 'paypal') {
    if (!facture) return
    setPaying(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { alert('Session expirée'); setPaying(false); return }
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
        alert(data.error || 'Erreur lors de la création du paiement')
        setPaying(false)
        return
      }
      window.location.href = data.url
    } catch (e: any) {
      alert(e?.message || 'Erreur paiement')
      setPaying(false)
    }
  }

  if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: 40 }}>{t('portail.common.loading')}</div>

  // Si la facture est annulee, rien n'est du ni a regler
  const isAnnulee = facture?.statut === 'annule'
  // Avoirs imputes sur cette facture (deduction du facture).
  // NOTE : depuis la refonte de la vue `factures_solde`, le champ `total_avoirs_imputes`
  // est aussi exposé directement (somme des reglements WHERE mode_paiement='avoir').
  // On garde ici le recalcul depuis `avoirs_imputations` car on a déjà besoin du detail
  // des imputations (numero/motif) pour l'affichage du bloc "Avoirs disponibles".
  // Les deux sources sont mathematiquement equivalentes.
  const totalAvoirsImputes = isAnnulee ? 0 : imputations.reduce((s, i) => s + Number(i.montant), 0)
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
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#475569' }}>{new Date(a.date_emission).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#475569' }}>{a.motif || '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{Number(a.montant).toLocaleString('fr-FR')} €</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: Number(a.montant_disponible) > 0 ? '#10B981' : '#94A3B8' }}>{Number(a.montant_disponible).toLocaleString('fr-FR')} €</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                        background: a.statut === 'actif' ? '#ECFDF5' : a.statut === 'utilise' ? '#F1F5F9' : a.statut === 'partiellement_utilise' ? '#FEF3C7' : '#FEF2F2',
                        color: a.statut === 'actif' ? '#065F46' : a.statut === 'utilise' ? '#475569' : a.statut === 'partiellement_utilise' ? '#92400E' : '#991B1B',
                        textTransform: 'uppercase' }}>{a.statut.replace(/_/g, ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 10 }}>{t('portail.factures.issued_on', { date: new Date(facture.date_emission).toLocaleDateString('fr-FR') })}</span>
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

          {/* Echeancier */}
          {echeances.length > 0 && !isAnnulee && (() => {
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const reglees = echeances.filter(e => ['encaisse', 'paye'].includes(e.statut))
            const aRegler = echeances.filter(e => !['encaisse', 'paye', 'rejete'].includes(e.statut))
            const prochaine = aRegler.find(e => new Date(e.date_echeance) >= today) || aRegler[0]
            const totalRegle = reglees.reduce((s, e) => s + Number(e.montant), 0)
            const totalRestant = aRegler.reduce((s, e) => s + Number(e.montant), 0)
            const modeLabel = (m: string) => {
              if (m === 'cheque') return 'Chèque'
              if (m === 'sepa' || m === 'prelevement') return 'Prélèvement'
              if (m === 'virement') return 'Virement'
              if (m === 'especes') return 'Espèces'
              if (m === 'carte') return 'Carte'
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
              if (e.statut === 'encaisse') return { label: 'Encaissé', bg: '#ECFDF5', color: '#065F46' }
              if (e.statut === 'paye') return { label: 'Payé', bg: '#ECFDF5', color: '#065F46' }
              if (e.statut === 'rejete') return { label: 'Rejeté', bg: '#FEF2F2', color: '#991B1B' }
              if (e.statut === 'recu') return { label: 'Reçu', bg: '#EEF2FF', color: '#3730A3' }
              if (enRetard) return { label: 'En retard', bg: '#FEF2F2', color: '#991B1B' }
              if (prochaine && prochaine.id === e.id) return { label: 'Prochaine', bg: '#DBEAFE', color: '#1E40AF' }
              return { label: 'À venir', bg: '#F1F5F9', color: '#475569' }
            }
            const joursAvant = prochaine ? Math.ceil((new Date(prochaine.date_echeance).getTime() - today.getTime()) / 86400000) : 0
            return (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📅 Mon échéancier
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    {echeances.length} échéance{echeances.length > 1 ? 's' : ''} · {echeances[0] ? modeLabel(echeances[0].mode_paiement) : ''}
                  </div>
                </div>
                {/* KPI strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: '14px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>Échéances réglées</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{reglees.length} / {echeances.length}</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{totalRegle.toLocaleString('fr-FR')} € encaissés</div>
                  </div>
                  {prochaine && (
                    <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>Prochaine échéance</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{new Date(prochaine.date_echeance).toLocaleDateString('fr-FR')}</div>
                      <div style={{ fontSize: 11, color: joursAvant < 0 ? '#DC2626' : '#64748B', marginTop: 1 }}>
                        {joursAvant < 0 ? `en retard de ${Math.abs(joursAvant)} j` : joursAvant === 0 ? "aujourd'hui" : `dans ${joursAvant} jour${joursAvant > 1 ? 's' : ''}`}
                      </div>
                    </div>
                  )}
                  <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>Reste à régler</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{totalRestant.toLocaleString('fr-FR')} €</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>sur {(totalRegle + totalRestant).toLocaleString('fr-FR')} €</div>
                  </div>
                </div>
                {/* Tableau desktop */}
                <div className="echeancier-desktop" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        {['N°', 'Date prévue', 'Montant', 'Mode', 'Statut'].map((h, i) => (
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
                            <td style={{ padding: '11px 16px', fontSize: 13, color: '#1E293B', fontWeight: isProchaine ? 700 : 500 }}>{new Date(e.date_echeance).toLocaleDateString('fr-FR')}</td>
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
                            #{e.numero_cheque} · {new Date(e.date_echeance).toLocaleDateString('fr-FR')}
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
                  <div>Les dates indiquées sont les dates prévues d'encaissement. En cas de difficulté, contactez l'école <strong>avant</strong> la date d'échéance.</div>
                </div>
                <style jsx>{`
                  @media (max-width: 640px) {
                    .echeancier-desktop { display: none; }
                    .echeancier-mobile { display: flex !important; }
                  }
                `}</style>
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
                        <td style={{ padding: '12px 16px', color: '#475569' }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
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
