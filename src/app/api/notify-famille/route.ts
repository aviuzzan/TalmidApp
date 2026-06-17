import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Notification email aux parents lors d'événements clés :
 * - 'ddr_decision'  : la commission a rendu sa décision sur la DDR (accepte/refuse)
 * - 'contrat_valide': l'admin a validé le contrat de scolarisation (facture émise)
 *
 * Body POST :
 *   {
 *     ecole_id: string
 *     famille_id: string
 *     type: 'ddr_decision' | 'contrat_valide'
 *     // pour ddr_decision :
 *     statut?: 'accepte' | 'refuse'
 *     tarif_accorde?: number | null
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ecole_id, famille_id, type, statut, tarif_accorde, motif } = body

    if (!ecole_id || !famille_id || !type) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'Configuration SMTP manquante' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const [{ data: ecole }, { data: famille }] = await Promise.all([
      supabase.from('ecoles').select('nom, slug, email_contact').eq('id', ecole_id).single(),
      supabase
        .from('familles')
        .select('nom, parent1_prenom, parent1_nom, parent1_email, parent2_prenom, parent2_nom, parent2_email')
        .eq('id', famille_id)
        .single(),
    ])

    if (!ecole) return NextResponse.json({ error: 'École introuvable' }, { status: 404 })
    if (!famille) return NextResponse.json({ error: 'Famille introuvable' }, { status: 404 })

    const dests: { email: string; name?: string }[] = []
    if (famille.parent1_email) {
      dests.push({
        email: famille.parent1_email,
        name: `${famille.parent1_prenom ?? ''} ${famille.parent1_nom ?? ''}`.trim(),
      })
    }
    if (famille.parent2_email && famille.parent2_email !== famille.parent1_email) {
      dests.push({
        email: famille.parent2_email,
        name: `${famille.parent2_prenom ?? ''} ${famille.parent2_nom ?? ''}`.trim(),
      })
    }
    if (!dests.length) {
      return NextResponse.json({ skipped: true, reason: 'Aucun email famille' })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const lienPortail = `${baseUrl}/portail/inscriptions`

    let subject = ''
    let html = ''
    const greeting = `Bonjour ${famille.parent1_prenom ?? ''}`.trim() + ',' || 'Bonjour,'

    if (type === 'ddr_decision') {
      const accepte = statut === 'accepte'
      const couleur = accepte ? '#10B981' : '#EF4444'
      const icone = accepte ? '✓' : '✗'
      const titre = accepte ? 'Demande de réduction acceptée' : 'Demande de réduction refusée'

      subject = `[${ecole.nom}] ${icone} ${titre}`

      const messageCorps = accepte
        ? `<p style="margin:0 0 14px;">Bonne nouvelle ! La commission de l'établissement a étudié votre dossier et accepté votre demande de réduction des frais de scolarité pour l'année à venir.</p>
           <div style="background:#ECFDF5;border:1px solid #10B981;border-radius:10px;padding:16px 20px;margin:0 0 18px;">
             <div style="font-size:12px;color:#059669;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Tarif annuel accordé</div>
             <div style="font-size:28px;font-weight:800;color:#059669;margin-top:4px;">${Number(tarif_accorde || 0).toLocaleString('fr-FR')} €</div>
           </div>
           <p style="margin:0 0 18px;">Vous pouvez à présent finaliser votre inscription en signant le contrat de scolarisation depuis votre espace famille.</p>`
        : `<p style="margin:0 0 14px;">Après étude de votre dossier, la commission n'a pas retenu votre demande de réduction des frais de scolarité.</p>
           <p style="margin:0 0 18px;">Vous pouvez toutefois finaliser l'inscription au tarif standard depuis votre espace famille, ou contacter le secrétariat${ecole.email_contact ? ` (${ecole.email_contact})` : ''} pour toute question.</p>`

      html = emailTemplate(ecole.nom, titre, couleur, icone, greeting, messageCorps, lienPortail, accepte ? 'Signer le contrat →' : 'Voir mon espace inscription →')
    } else if (type === 'contrat_valide') {
      const couleur = '#2563EB'
      const titre = 'Contrat de scolarisation validé'
      subject = `[${ecole.nom}] ✓ ${titre}`
      const lienFactures = `${baseUrl}/portail/factures`
      const messageCorps = `<p style="margin:0 0 14px;">Votre contrat de scolarisation a été validé par l'établissement. La facture annuelle correspondante est désormais disponible dans votre espace famille.</p>
        <p style="margin:0 0 18px;">Vous pouvez consulter le détail et le solde restant à régler en cliquant ci-dessous.</p>`
      html = emailTemplate(ecole.nom, titre, couleur, '✓', greeting, messageCorps, lienFactures, 'Consulter ma facture →')
    } else if (type === 'contrat_annule') {
      const couleur = '#EF4444'
      const titre = 'Contrat de scolarisation annulé'
      subject = `[${ecole.nom}] ✕ ${titre}`
      const motifTxt = motif && motif.trim() ? motif.trim() : 'Non précisé'
      const messageCorps = `<p style="margin:0 0 14px;">Nous vous informons que votre contrat de scolarisation a été annulé par l'établissement.</p>
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 18px;margin:0 0 18px;">
          <div style="font-size:12px;color:#991B1B;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Motif de l'annulation</div>
          <div style="font-size:14px;color:#7F1D1D;line-height:1.5;">${motifTxt.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>
        </div>
        <p style="margin:0 0 14px;">La facture liée à ce contrat a été marquée comme annulée. Si vous avez déjà effectué des paiements, ils seront étudiés par le secrétariat${ecole.email_contact ? ` (${ecole.email_contact})` : ''} pour remboursement ou réaffectation.</p>
        <p style="margin:0 0 18px;">Pour toute question ou pour signer un nouveau contrat, contactez directement l'école.</p>`
      html = emailTemplate(ecole.nom, titre, couleur, '✕', greeting, messageCorps, lienPortail, 'Voir mon espace famille →')
    } else {
      return NextResponse.json({ error: 'Type invalide' }, { status: 400 })
    }

    const result = await sendEmail({ to: dests, subject, html, fromName: ecole?.nom || 'TalmidApp' })

    // Log best-effort
    try {
      await supabase.from('email_logs').insert({
        famille_id,
        destinataire: dests.map(d => d.email).join(', '),
        sujet: subject,
        statut: result.ok ? 'envoye' : 'erreur',
        erreur: result.ok ? null : result.error,
      })
    } catch {}

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Erreur SMTP' }, { status: 502 })
    }

    return NextResponse.json({ success: true, destinataires: dests.length, messageId: result.messageId })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}

function emailTemplate(
  ecoleNom: string,
  titre: string,
  couleur: string,
  icone: string,
  greeting: string,
  bodyHtml: string,
  lienHref: string,
  lienLabel: string
): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F8FAFC;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;">
    <div style="background:${couleur};color:#fff;padding:22px 28px;">
      <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.85;margin-bottom:6px;">${ecoleNom}</div>
      <div style="font-size:20px;font-weight:700;">${icone} ${titre}</div>
    </div>
    <div style="padding:24px 28px;color:#1E293B;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 14px;">${greeting}</p>
      ${bodyHtml}
      <a href="${lienHref}"
         style="display:inline-block;background:${couleur};color:#fff;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">
        ${lienLabel}
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;">
        Email envoyé automatiquement par ${ecoleNom} via TalmidApp.
      </p>
    </div>
  </div>
</body></html>`
}
