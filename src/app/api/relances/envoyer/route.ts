import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/email'

/**
 * POST /api/relances/envoyer
 * Body: { factureId, niveau (1|2|3), ecoleId }
 * - Vérif admin
 * - Récupère config relances + facture + parent
 * - Rend le template selon niveau
 * - Envoie l'email + log dans relances_log
 */
export async function POST(req: NextRequest) {
  try {
    const { factureId, niveau, ecoleId } = await req.json()
    if (!factureId || !niveau || !ecoleId) {
      return NextResponse.json({ error: 'factureId, niveau, ecoleId requis' }, { status: 400 })
    }
    if (![1, 2, 3].includes(niveau)) {
      return NextResponse.json({ error: 'niveau doit être 1, 2 ou 3' }, { status: 400 })
    }

    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérif appelant admin
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await supa.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: profile } = await supa.from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Récupérer config
    const { data: config } = await supa
      .from('relances_config').select('*')
      .eq('ecole_id', ecoleId).maybeSingle()

    // Récupérer école pour le nom
    const { data: ecole } = await supa
      .from('ecoles').select('nom, slug').eq('id', ecoleId).single()

    // Récupérer facture
    const { data: facture, error: factErr } = await supa
      .from('factures')
      .select('id, numero, famille_id, total_ttc, solde_du, date_echeance')
      .eq('id', factureId).single()
    if (factErr || !facture) {
      return NextResponse.json({ error: factErr?.message || 'Facture introuvable' }, { status: 404 })
    }

    // Récupérer parent
    const { data: parent } = await supa
      .from('profiles').select('prenom, nom, email')
      .eq('famille_id', facture.famille_id)
      .eq('role', 'parent')
      .limit(1).maybeSingle()
    if (!parent?.email) {
      return NextResponse.json({ error: 'Aucun email parent trouvé pour cette famille' }, { status: 400 })
    }

    // Idempotence : a-t-on déjà envoyé ce niveau ?
    const { data: existing } = await supa
      .from('relances_log').select('id')
      .eq('facture_id', factureId).eq('niveau', niveau).maybeSingle()
    if (existing) {
      return NextResponse.json({ error: `Relance niveau ${niveau} déjà envoyée pour cette facture` }, { status: 409 })
    }

    // Templates par défaut si config absente
    const subjects: Record<number, string> = {
      1: config?.sujet_rappel || `Rappel : facture ${facture.numero} en attente`,
      2: config?.sujet_relance || `Relance : facture ${facture.numero} impayée`,
      3: config?.sujet_demeure || `Mise en demeure : facture ${facture.numero}`,
    }
    const corps: Record<number, string> = {
      1: config?.corps_rappel || defaultCorps(1),
      2: config?.corps_relance || defaultCorps(2),
      3: config?.corps_demeure || defaultCorps(3),
    }

    // Variables de templating
    const vars: Record<string, string> = {
      prenom_parent: parent.prenom || '',
      nom_parent: parent.nom || '',
      numero_facture: facture.numero,
      montant_du: Number(facture.solde_du).toFixed(2) + ' €',
      total_facture: Number(facture.total_ttc).toFixed(2) + ' €',
      date_echeance: new Date(facture.date_echeance).toLocaleDateString('fr-FR'),
      nom_ecole: ecole?.nom || '',
    }

    let html = corps[niveau]
    let sujet = subjects[niveau]
    for (const [k, v] of Object.entries(vars)) {
      const re = new RegExp(`{{\\s*${k}\\s*}}`, 'g')
      html = html.replace(re, v)
      sujet = sujet.replace(re, v)
    }

    // Envoi email
    try {
      await sendMail({
        to: parent.email,
        subject: sujet,
        html,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Erreur envoi email : ${e.message}` }, { status: 500 })
    }

    // Log
    await supa.from('relances_log').insert({
      facture_id: factureId,
      ecole_id: ecoleId,
      famille_id: facture.famille_id,
      niveau,
      destinataire_email: parent.email,
      envoyee_le: new Date().toISOString(),
      envoyee_par: caller.id,
      mode: 'manuel',
    })

    return NextResponse.json({ success: true, message: `Relance N${niveau} envoyée à ${parent.email}` })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}

function defaultCorps(niveau: 1 | 2 | 3): string {
  if (niveau === 1) {
    return `<p>Bonjour {{prenom_parent}},</p>
<p>Nous nous permettons de vous rappeler que la facture <strong>{{numero_facture}}</strong> d'un montant de <strong>{{montant_du}}</strong>, dont l'échéance était fixée au {{date_echeance}}, n'a pas encore été réglée.</p>
<p>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais. Si le règlement a été effectué récemment, veuillez ne pas tenir compte de ce message.</p>
<p>Pour toute question, n'hésitez pas à contacter le secrétariat.</p>
<p>Cordialement,<br>{{nom_ecole}}</p>`
  }
  if (niveau === 2) {
    return `<p>Bonjour {{prenom_parent}},</p>
<p>Malgré notre précédent rappel, la facture <strong>{{numero_facture}}</strong> d'un montant de <strong>{{montant_du}}</strong> (échéance : {{date_echeance}}) demeure impayée.</p>
<p>Nous vous demandons de bien vouloir régulariser votre situation sous 15 jours. À défaut, nous serons contraints d'engager une procédure de recouvrement.</p>
<p>Pour toute difficulté ou demande d'échelonnement, contactez le secrétariat dès que possible.</p>
<p>Cordialement,<br>{{nom_ecole}}</p>`
  }
  return `<p>Bonjour {{prenom_parent}},</p>
<p><strong>MISE EN DEMEURE</strong></p>
<p>Malgré nos précédents courriers, la facture <strong>{{numero_facture}}</strong> d'un montant de <strong>{{montant_du}}</strong> (échéance : {{date_echeance}}) reste impayée à ce jour.</p>
<p>Nous vous mettons en demeure de procéder au règlement intégral de cette somme sous huit (8) jours à compter de la réception du présent courrier.</p>
<p>À défaut de règlement dans le délai imparti, nous nous réservons le droit d'engager toutes procédures de recouvrement.</p>
<p>Cordialement,<br>{{nom_ecole}}</p>`
}
