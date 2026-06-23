import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/admin/envoyer-engagement
 * Body: { familleId, exerciceId, ecoleId }
 *
 * Calcule l'engagement financier annuel d'une famille pour un exercice
 * et l'envoie par email aux parents (parent1 + parent2 si renseignés).
 */
export async function POST(req: NextRequest) {
  try {
    const { familleId, exerciceId, ecoleId } = await req.json()
    if (!familleId || !exerciceId || !ecoleId) {
      return NextResponse.json({ ok: false, error: 'familleId, exerciceId, ecoleId requis' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const [{ data: famille }, { data: ex }, { data: ecole }] = await Promise.all([
      sb.from('familles').select('id, nom, parent1_prenom, parent1_email, parent2_prenom, parent2_email').eq('id', familleId).single(),
      sb.from('exercices').select('id, code, libelle').eq('id', exerciceId).single(),
      sb.from('ecoles').select('nom, email_contact, telephone, adresse').eq('id', ecoleId).single(),
    ])
    if (!famille || !ex) return NextResponse.json({ ok: false, error: 'Famille ou exercice introuvable' }, { status: 404 })

    const destinataires: { email: string; name?: string }[] = []
    if ((famille as any).parent1_email) destinataires.push({ email: (famille as any).parent1_email, name: `${(famille as any).parent1_prenom || ''} ${(famille as any).nom}`.trim() })
    if ((famille as any).parent2_email && (famille as any).parent2_email !== (famille as any).parent1_email) {
      destinataires.push({ email: (famille as any).parent2_email, name: `${(famille as any).parent2_prenom || ''} ${(famille as any).nom}`.trim() })
    }
    if (destinataires.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucune adresse e-mail famille renseignée' }, { status: 400 })
    }

    // ── Recalcul de l'engagement financier ──
    const { data: enfRows } = await sb.from('enfants').select('id, prenom, nom').eq('famille_id', familleId)
    const enfantIds = (enfRows ?? []).map((e: any) => e.id)
    const { count: anciensCount } = await sb.from('scolarites').select('*', { count: 'exact', head: true })
      .in('enfant_id', enfantIds.length > 0 ? enfantIds : ['00000000-0000-0000-0000-000000000000'])
      .neq('exercice_id', exerciceId)
    const isReinscription = (anciensCount ?? 0) > 0

    const [{ data: contrat }, { data: fraisCfg }, { data: cant }, { data: trsp }, { data: factures }] = await Promise.all([
      sb.from('contrats_scolarisation').select('montant_total, assurance_montant_total, mode_reglement, nb_echeances, statut').eq('famille_id', familleId).eq('exercice_id', exerciceId).maybeSingle(),
      sb.from('frais_inscription_config').select('inscription_par_enfant, inscription_par_famille, reinscription_par_enfant, reinscription_par_famille').eq('ecole_id', ecoleId).eq('exercice_id', exerciceId).maybeSingle(),
      enfantIds.length > 0
        ? sb.from('cantine_inscriptions').select('cantine_forfaits(nom, prix)').eq('exercice_id', exerciceId).in('enfant_id', enfantIds)
        : Promise.resolve({ data: [] as any }),
      enfantIds.length > 0
        ? sb.from('transport_inscriptions').select('transport_forfaits(nom, prix)').eq('exercice_id', exerciceId).in('enfant_id', enfantIds)
        : Promise.resolve({ data: [] as any }),
      sb.from('factures_solde').select('total_facture, total_regle, solde_restant, statut').eq('famille_id', familleId).eq('exercice_id', exerciceId),
    ])

    const montantContrat = Number((contrat as any)?.montant_total ?? 0)
    const montantAssurance = Number((contrat as any)?.assurance_montant_total ?? 0)
    const fraisParEnfant = isReinscription ? Number((fraisCfg as any)?.reinscription_par_enfant ?? 0) : Number((fraisCfg as any)?.inscription_par_enfant ?? 0)
    const fraisFamille = isReinscription ? Number((fraisCfg as any)?.reinscription_par_famille ?? 0) : Number((fraisCfg as any)?.inscription_par_famille ?? 0)
    const totalFraisInsc = fraisParEnfant * enfantIds.length + fraisFamille
    const totalCantine = (cant ?? []).reduce((s: number, c: any) => s + Number(c.cantine_forfaits?.prix ?? 0), 0)
    const totalTransport = (trsp ?? []).reduce((s: number, t: any) => s + Number(t.transport_forfaits?.prix ?? 0), 0)
    const totalEngage = montantContrat + montantAssurance + totalFraisInsc + totalCantine + totalTransport

    // NOTE : `total_regle` exclut désormais les avoirs imputés. On utilise `solde_restant`
    // pour le reste à régler (mathématiquement correct, inchangé).
    const facturesActives = ((factures ?? []) as any[]).filter(f => f.statut !== 'annule')
    const totalFacture = facturesActives.reduce((s, f) => s + Number(f.total_facture), 0)
    const totalRegle = facturesActives.reduce((s, f) => s + Number(f.total_regle), 0)
    const resteARegler = facturesActives.reduce((s, f) => s + Number(f.solde_restant || 0), 0)

    const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    const exLabel = (ex as any).libelle || (ex as any).code
    const ecoleNom = (ecole as any)?.nom || 'École'

    const row = (label: string, detail: string, montant: number) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569">${detail}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">${fmt(montant)}</td></tr>`

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#1E293B">
        <h1 style="color:#2563EB;margin-bottom:8px">Engagement financier — ${exLabel}</h1>
        <p style="color:#64748B;margin-top:0">Famille ${(famille as any).nom} · ${ecoleNom}</p>
        <h2 style="font-size:14px;margin-top:24px">Détail par poste</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b">Poste</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b">Détail</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b">Montant</th>
          </tr></thead>
          <tbody>
            ${contrat ? row('Scolarité', `Contrat ${(contrat as any).statut === 'valide' ? 'validé' : (contrat as any).statut} · ${(contrat as any).mode_reglement || '—'} · ${(contrat as any).nb_echeances || 1} échéances`, montantContrat) : ''}
            ${montantAssurance > 0 ? row("Assurance scolaire", "Souscrite via l'école", montantAssurance) : ''}
            ${totalFraisInsc > 0 ? row(isReinscription ? 'Réinscription' : 'Inscription', `${fraisParEnfant > 0 ? fmt(fraisParEnfant) + ' × ' + enfantIds.length + ' enfant(s)' : ''}${fraisFamille > 0 ? (fraisParEnfant > 0 ? ' + ' : '') + fmt(fraisFamille) + ' (famille)' : ''}`, totalFraisInsc) : ''}
            ${totalCantine > 0 ? row('Cantine', `${(cant ?? []).length} inscription(s)`, totalCantine) : ''}
            ${totalTransport > 0 ? row('Transport', `${(trsp ?? []).length} inscription(s)`, totalTransport) : ''}
          </tbody>
          <tfoot><tr style="background:#f8fafc;border-top:2px solid #2563EB">
            <td colspan="2" style="padding:12px;font-weight:800">Total engagé pour l'année</td>
            <td style="padding:12px;text-align:right;font-weight:800;color:#2563EB;font-size:16px">${fmt(totalEngage)}</td>
          </tr></tfoot>
        </table>

        <h2 style="font-size:14px;margin-top:24px">Suivi de la facturation</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Total facturé à ce jour</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">${fmt(totalFacture)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Total réglé</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#065F46">${fmt(totalRegle)}</td></tr>
          <tr><td style="padding:8px 12px">Reste à régler</td><td style="padding:8px 12px;text-align:right;font-weight:800;color:${resteARegler > 0 ? '#991B1B' : '#065F46'}">${fmt(resteARegler)}</td></tr>
        </table>

        <p style="color:#94A3B8;font-size:12px;margin-top:24px">Cette synthèse vous est envoyée à titre d'information. Pour toute question, contactez l'administration de ${ecoleNom}.</p>
      </div>
    `

    const res = await sendEmail({
      fromName: ecole?.nom || 'TalmidApp',
      to: destinataires,
      subject: `Engagement financier ${exLabel} — Famille ${(famille as any).nom}`,
      html,
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error || 'Erreur envoi' }, { status: 500 })
    }
    // Audit log (non bloquant)
    try {
      await sb.from('admin_logs').insert({
        admin_id: null,
        ecole_id: ecoleId,
        action: 'envoi_engagement',
        details: { famille_id: familleId, exercice_id: exerciceId, destinataires: destinataires.length },
      })
    } catch {}
    return NextResponse.json({ ok: true, sent: destinataires.length, canal: res.canal })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur' }, { status: 500 })
  }
}
