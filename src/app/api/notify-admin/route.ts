import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Notification email aux admins de l'école quand une famille soumet
 * une Demande de Réduction (DDR) ou un Contrat de scolarisation.
 *
 * Paramétrable depuis le portail admin :
 *   ecoles.notif_emails_admin (text[]) — destinataires
 *   ecoles.notif_ddr_active   (bool)   — activer/désactiver pour les DDR
 *   ecoles.notif_contrat_active (bool) — activer/désactiver pour les contrats
 *
 * Body POST :
 *   {
 *     ecole_id: string
 *     famille_id: string
 *     type: 'ddr_soumis' | 'contrat_soumis'
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const { ecole_id, famille_id, type, info } = await req.json()

    if (!ecole_id || !type) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }
    // 4 types supportés :
    //  - ddr_soumis             : parent a soumis une DDR depuis son portail
    //  - contrat_soumis         : parent a soumis un contrat depuis son portail
    //  - demande_inscription    : prospect a soumis le formulaire via lien token public
    //  - fiche_pedagogique      : parent existant a ajouté un nouvel enfant (fiche pédagogique)
    const typesSupp = ['ddr_soumis', 'contrat_soumis', 'demande_inscription', 'fiche_pedagogique']
    if (!typesSupp.includes(type)) {
      return NextResponse.json({ error: 'Type invalide' }, { status: 400 })
    }
    // famille_id est requis sauf pour demande_inscription (prospect = pas de famille)
    if (type !== 'demande_inscription' && !famille_id) {
      return NextResponse.json({ error: 'famille_id requis pour ce type' }, { status: 400 })
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'Configuration SMTP manquante (SMTP_HOST, SMTP_USER, SMTP_PASSWORD)' }, { status: 500 })
    }

    // Service role pour bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Récup config école + famille
    const [{ data: ecole }, { data: famille }] = await Promise.all([
      supabase
        .from('ecoles')
        .select('nom, slug, notif_emails_admin, notif_ddr_active, notif_contrat_active')
        .eq('id', ecole_id)
        .single(),
      famille_id
        ? supabase
            .from('familles')
            .select('nom, parent1_prenom, parent1_nom, parent1_email')
            .eq('id', famille_id)
            .single()
        : Promise.resolve({ data: null }),
    ])

    if (!ecole) return NextResponse.json({ error: 'École introuvable' }, { status: 404 })
    if (type !== 'demande_inscription' && !famille) {
      return NextResponse.json({ error: 'Famille introuvable' }, { status: 404 })
    }

    // Toutes ces notifs sont gouvernees par notif_contrat_active (inscription liee a la scolarisation)
    // sauf DDR qui a son propre toggle. On simplifie : si type !== 'ddr_soumis', on respecte notif_contrat_active.
    const actif = type === 'ddr_soumis' ? ecole.notif_ddr_active : ecole.notif_contrat_active
    if (!actif) {
      return NextResponse.json({ skipped: true, reason: 'Notification désactivée' })
    }

    const dests: string[] = (ecole.notif_emails_admin || []).filter(
      (e: string) => typeof e === 'string' && e.includes('@')
    )
    if (!dests.length) {
      return NextResponse.json({ skipped: true, reason: 'Aucun email admin configuré' })
    }

    // Variations par type
    let titreType = ''
    let couleur = '#2563EB'
    let icone = '📝'
    let lienPath = ''
    let corps = ''
    let identifiant = ''

    if (type === 'ddr_soumis') {
      titreType = 'Demande de réduction'
      couleur = '#7C3AED'
      icone = '📨'
      lienPath = `/${ecole.slug}/inscriptions?tab=reductions`
      identifiant = `Famille ${famille?.nom || ''}`
      corps = `La famille <strong>${famille?.nom || '?'}</strong> (${famille?.parent1_prenom ?? ''} ${famille?.parent1_nom ?? ''}) vient de soumettre une <strong>demande de réduction</strong> via le portail famille.`
    } else if (type === 'contrat_soumis') {
      titreType = 'Contrat de scolarisation'
      couleur = '#2563EB'
      icone = '📝'
      lienPath = `/${ecole.slug}/inscriptions?tab=contrats`
      identifiant = `Famille ${famille?.nom || ''}`
      corps = `La famille <strong>${famille?.nom || '?'}</strong> (${famille?.parent1_prenom ?? ''} ${famille?.parent1_nom ?? ''}) vient de soumettre un <strong>contrat de scolarisation</strong> via le portail famille.`
    } else if (type === 'fiche_pedagogique') {
      titreType = 'Fiche pédagogique'
      couleur = '#0891B2'
      icone = '👶'
      lienPath = `/${ecole.slug}/inscriptions?tab=pedagogique`
      const enfantNom = info?.enfant_prenom && info?.enfant_nom ? ` (${info.enfant_prenom} ${info.enfant_nom})` : ''
      identifiant = `Famille ${famille?.nom || ''}`
      corps = `La famille <strong>${famille?.nom || '?'}</strong> (${famille?.parent1_prenom ?? ''} ${famille?.parent1_nom ?? ''}) vient de soumettre une <strong>fiche pédagogique pour un nouvel enfant</strong>${enfantNom} via le portail famille.`
    } else if (type === 'demande_inscription') {
      titreType = "Demande d'inscription"
      couleur = '#10B981'
      icone = '🆕'
      lienPath = `/${ecole.slug}/demandes-inscription`
      const nomProspect = info?.nom_famille || info?.parent1_nom || 'prospect'
      const enfantNom = info?.enfant_prenom && info?.enfant_nom ? ` pour ${info.enfant_prenom} ${info.enfant_nom}` : ''
      identifiant = nomProspect
      corps = `Un parent (<strong>${nomProspect}</strong>) vient de soumettre une <strong>demande d'inscription</strong>${enfantNom} via le lien public que vous lui avez envoyé.`
    }

    const sujet = `[${ecole.nom}] ${icone} ${titreType} soumis(e) — ${identifiant}`
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const lienAdmin = `${baseUrl}${lienPath}`

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F8FAFC;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;">
    <div style="background:${couleur};color:#fff;padding:22px 28px;">
      <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.85;margin-bottom:6px;">${ecole.nom}</div>
      <div style="font-size:20px;font-weight:700;">${icone} Nouvelle ${titreType.toLowerCase()}</div>
    </div>
    <div style="padding:24px 28px;color:#1E293B;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 14px;">Bonjour,</p>
      <p style="margin:0 0 14px;">${corps}</p>
      <p style="margin:0 0 18px;">Le dossier est en attente de votre validation.</p>
      <a href="${lienAdmin}"
         style="display:inline-block;background:${couleur};color:#fff;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">
        Ouvrir le dossier →
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;">
        Email envoyé automatiquement par TalmidApp. Vous pouvez désactiver ces notifications dans Paramètres &rsaquo; Notifications.
      </p>
    </div>
  </div>
</body></html>`

    const result = await sendEmail({
      to: dests.map((email) => ({ email })),
      subject: sujet,
      html,
      fromName: ecole?.nom || 'TalmidApp',
    })

    // Log dans email_logs (best-effort)
    try {
      await supabase.from('email_logs').insert({
        famille_id,
        destinataire: dests.join(', '),
        sujet,
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
