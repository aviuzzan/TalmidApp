import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession } from '@/lib/stripe'
import { getIntegration } from '@/lib/integrations'

/**
 * POST /api/stripe/checkout
 * Body: { factureId: string, montantCentimes?: number }
 *
 * Lit les clés Stripe propres à l'école de la facture (BDD chiffrée),
 * puis crée une session checkout sur le COMPTE STRIPE de l'école (pas TalmidApp).
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

    // Facture + solde
    // FIX 05/08 : factures_solde n'a PAS de colonne ecole_id -> la demander faisait
    // planter la requete PostgREST et l'API repondait "Facture introuvable" pour TOUT
    // le monde. On lit la facture sans ecole_id, puis l'ecole via la famille.
    const { data: facture, error: factErr } = await supabaseAdmin
      .from('factures_solde')
      .select('id, numero, famille_id, total_facture, total_regle, solde_restant, statut')
      .eq('id', factureId)
      .maybeSingle()

    if (factErr) {
      console.error('[stripe checkout] lecture factures_solde failed:', factErr.message)
      return NextResponse.json({ error: 'Erreur lecture facture' }, { status: 500 })
    }
    if (!facture) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

    const { data: famEcole } = await supabaseAdmin
      .from('familles').select('ecole_id').eq('id', facture.famille_id).single()
    const ecoleId = famEcole?.ecole_id
    if (!ecoleId) return NextResponse.json({ error: 'École de la facture introuvable' }, { status: 500 })
    if (facture.famille_id !== profile.famille_id) {
      return NextResponse.json({ error: 'Facture non rattachée à votre famille' }, { status: 403 })
    }
    // FIX audit 27/07 : le statut ecrit en BDD est 'paye' (jamais 'solde')
    if (facture.statut === 'paye' || facture.statut === 'annule') {
      return NextResponse.json({ error: 'Facture déjà soldée ou annulée' }, { status: 400 })
    }

    const solde = Number(facture.solde_restant) || 0
    if (solde <= 0) return NextResponse.json({ error: 'Aucun solde à régler' }, { status: 400 })

    const montant = Number.isFinite(montantCentimes) && montantCentimes > 0
      ? Math.min(Math.round(montantCentimes), Math.round(solde * 100))
      : Math.round(solde * 100)

    if (montant < 50) return NextResponse.json({ error: 'Montant minimum 0,50 €' }, { status: 400 })

    // Récupère la config Stripe de l'école (BDD chiffrée → déchiffrée par getIntegration)
    const integration = await getIntegration(ecoleId, 'stripe')
    if (!integration) {
      return NextResponse.json({ error: 'Le paiement en ligne Stripe n\'est pas activé pour cette école' }, { status: 400 })
    }
    const secretKey = integration.secrets.secret_key
    if (!secretKey) {
      return NextResponse.json({ error: 'Clé secrète Stripe manquante. L\'école doit la configurer dans Paramètres → Intégrations.' }, { status: 400 })
    }

    const { data: ecole } = await supabaseAdmin
      .from('ecoles')
      .select('nom, slug')
      .eq('id', ecoleId)
      .single()

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const successUrl = `${baseUrl}/portail/factures/paiement-success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/portail/factures/paiement-cancel`

    const session = await createCheckoutSession({
      secretKey,
      factureId: facture.id,
      ecoleNom: ecole?.nom || 'École',
      factureNumero: facture.numero,
      montantCentimes: montant,
      email: user.email || '',
      successUrl,
      cancelUrl,
      metadata: {
        ecole_id: ecoleId,
        ecole_slug: ecole?.slug || '',
        famille_id: profile.famille_id,
        profile_id: profile.id,
      },
    })

    await supabaseAdmin.from('paiements_en_ligne').insert({
      ecole_id: ecoleId,
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
