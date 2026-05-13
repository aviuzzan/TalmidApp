import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession } from '@/lib/stripe'

/**
 * POST /api/stripe/checkout
 * Body: { factureId: string, montantCentimes?: number }
 * - Famille connectée uniquement
 * - Si montantCentimes absent : utilise solde restant facture
 * - Crée session Stripe + ligne paiements_en_ligne
 * - Retourne url checkout
 */
export async function POST(req: NextRequest) {
  try {
    const { factureId, montantCentimes } = await req.json()
    if (!factureId) {
      return NextResponse.json({ error: 'factureId requis' }, { status: 400 })
    }

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, famille_id, prenom, nom')
      .eq('id', user.id)
      .single()

    if (!profile?.famille_id) {
      return NextResponse.json({ error: 'Famille introuvable' }, { status: 403 })
    }

    // Récupère la facture + solde
    const { data: facture } = await supabaseAdmin
      .from('factures_solde')
      .select('id, numero, famille_id, ecole_id, total_facture, total_regle, solde_restant, statut')
      .eq('id', factureId)
      .maybeSingle()

    if (!facture) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    if (facture.famille_id !== profile.famille_id) {
      return NextResponse.json({ error: 'Facture non rattachée à votre famille' }, { status: 403 })
    }
    if (facture.statut === 'solde' || facture.statut === 'annule') {
      return NextResponse.json({ error: 'Facture déjà soldée ou annulée' }, { status: 400 })
    }

    const solde = Number(facture.solde_restant) || 0
    if (solde <= 0) return NextResponse.json({ error: 'Aucun solde à régler' }, { status: 400 })

    const montant = Number.isFinite(montantCentimes) && montantCentimes > 0
      ? Math.min(Math.round(montantCentimes), Math.round(solde * 100))
      : Math.round(solde * 100)

    if (montant < 50) {
      return NextResponse.json({ error: 'Montant minimum 0,50 €' }, { status: 400 })
    }

    // Vérifie Stripe actif pour cette école
    const { data: parametre } = await supabaseAdmin
      .from('parametres_stripe')
      .select('actif')
      .eq('ecole_id', facture.ecole_id)
      .maybeSingle()

    if (!parametre?.actif) {
      return NextResponse.json({ error: 'Le paiement en ligne n\'est pas activé pour cette école' }, { status: 400 })
    }

    const { data: ecole } = await supabaseAdmin
      .from('ecoles')
      .select('nom, slug')
      .eq('id', facture.ecole_id)
      .single()

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const successUrl = `${baseUrl}/portail/factures/paiement-success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/portail/factures/paiement-cancel`

    const session = await createCheckoutSession({
      factureId: facture.id,
      ecoleNom: ecole?.nom || 'École',
      factureNumero: facture.numero,
      montantCentimes: montant,
      email: user.email || '',
      successUrl,
      cancelUrl,
      metadata: {
        ecole_id: facture.ecole_id,
        famille_id: profile.famille_id,
        profile_id: profile.id,
      },
    })

    // Trace côté BDD
    await supabaseAdmin.from('paiements_en_ligne').insert({
      ecole_id: facture.ecole_id,
      facture_id: facture.id,
      famille_id: profile.famille_id,
      profile_id: profile.id,
      montant_centimes: montant,
      devise: 'eur',
      provider: 'stripe',
      stripe_session_id: session.id,
      statut: 'created',
      metadata: { user_email: user.email },
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur Stripe checkout' }, { status: 500 })
  }
}
