import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createCustomer, createSetupCheckoutSession, detachPaymentMethod } from '@/lib/stripe'
import { getIntegration } from '@/lib/integrations'

/**
 * POST /api/stripe/mandat  (yyyy3 — prélèvement automatique par carte)
 * Body: { action: 'activer' } -> renvoie l'URL d'une session Checkout mode=setup
 *       { action: 'revoquer' } -> révoque le mandat (détache la carte chez Stripe)
 * Auth : parent connecté (Bearer token). L'enregistrement du mandat lui-même se
 * fait dans le webhook (checkout.session.completed, mode=setup) — source Stripe.
 */
export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json()
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
      .from('profiles').select('id, famille_id, ecole_id').eq('id', user.id).single()
    if (!profile?.famille_id || !profile?.ecole_id) {
      return NextResponse.json({ error: 'Famille introuvable' }, { status: 403 })
    }

    const integration = await getIntegration(profile.ecole_id, 'stripe')
    const secretKey = integration?.secrets?.secret_key
    if (!secretKey) {
      return NextResponse.json({ error: "Le paiement en ligne n'est pas activé pour cette école" }, { status: 400 })
    }

    const { data: mandat } = await supabaseAdmin
      .from('mandats_cb').select('*')
      .eq('ecole_id', profile.ecole_id).eq('famille_id', profile.famille_id)
      .maybeSingle()

    if (action === 'revoquer') {
      if (!mandat) return NextResponse.json({ error: 'Aucun mandat à révoquer' }, { status: 404 })
      try { await detachPaymentMethod(secretKey, mandat.stripe_payment_method_id) } catch { /* déjà détachée : non bloquant */ }
      const { error } = await supabaseAdmin.from('mandats_cb')
        .update({ statut: 'revoque', updated_at: new Date().toISOString() })
        .eq('id', mandat.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action !== 'activer') {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }

    // Réutilise le customer Stripe existant (changement de carte) ou en crée un.
    const { data: fam } = await supabaseAdmin.from('familles').select('nom, numero').eq('id', profile.famille_id).single()
    let customerId = mandat?.stripe_customer_id
    if (!customerId) {
      const customer = await createCustomer(secretKey, {
        email: user.email || '',
        name: `Famille ${fam?.nom || ''} (${fam?.numero || profile.famille_id})`.trim(),
        metadata: { famille_id: profile.famille_id, ecole_id: profile.ecole_id },
      })
      customerId = customer.id
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const session = await createSetupCheckoutSession({
      secretKey,
      customerId,
      successUrl: `${baseUrl}/portail/factures?mandat=ok`,
      cancelUrl: `${baseUrl}/portail/factures?mandat=annule`,
      metadata: {
        mandat_setup: '1',
        famille_id: profile.famille_id,
        ecole_id: profile.ecole_id,
        profile_id: profile.id,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur mandat' }, { status: 500 })
  }
}
