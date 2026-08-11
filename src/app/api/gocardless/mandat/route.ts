import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createMandateOnlyFlow, cancelMandate } from '@/lib/gocardless'
import { getIntegration } from '@/lib/integrations'

export const runtime = 'nodejs'

/**
 * POST /api/gocardless/mandat  (jjjj1 — prélèvement SEPA automatique)
 * Body: { action: 'activer' }  -> URL du flow hébergé GoCardless (signature du mandat, sans paiement)
 *       { action: 'revoquer' } -> annule le mandat chez GoCardless + statut revoque
 * Auth : parent connecté (Bearer token).
 * Le rattachement définitif se fait par le webhook :
 *   billing_requests.fulfilled -> gocardless_mandate_id ; mandates.active -> statut active.
 */
export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json()
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: profile } = await sb
      .from('profiles').select('id, famille_id, ecole_id').eq('id', user.id).single()
    if (!profile?.famille_id || !profile?.ecole_id) {
      return NextResponse.json({ error: 'Famille introuvable' }, { status: 403 })
    }

    const integration = await getIntegration(profile.ecole_id, 'gocardless')
    const accessToken = integration?.secrets?.access_token
    if (!integration || !accessToken) {
      return NextResponse.json({ error: "Le prélèvement SEPA n'est pas activé pour cette école" }, { status: 400 })
    }

    const { data: mandat } = await sb.from('mandats_gocardless')
      .select('id, statut, gocardless_mandate_id')
      .eq('ecole_id', profile.ecole_id).eq('famille_id', profile.famille_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (action === 'revoquer') {
      if (!mandat?.gocardless_mandate_id) return NextResponse.json({ error: 'Aucun mandat à révoquer' }, { status: 404 })
      try { await cancelMandate(accessToken, integration.mode, mandat.gocardless_mandate_id) } catch { /* déjà annulé côté GoCardless : non bloquant */ }
      const { error } = await sb.from('mandats_gocardless')
        .update({ statut: 'revoque', updated_at: new Date().toISOString() })
        .eq('id', mandat.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action !== 'activer') {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }

    const { data: ecole } = await sb.from('ecoles').select('nom').eq('id', profile.ecole_id).single()
    const { data: fam } = await sb.from('familles').select('nom').eq('id', profile.famille_id).single()

    const flow = await createMandateOnlyFlow({
      accessToken,
      mode: integration.mode,
      ecoleNom: ecole?.nom || 'École',
      email: user.email || '',
      nomFamille: fam?.nom || '',
      metadata: { ecole_id: profile.ecole_id, famille_id: profile.famille_id },
    })

    // Purge des tentatives abandonnées (flow relancé sans avoir été signé)
    await sb.from('mandats_gocardless')
      .delete()
      .eq('famille_id', profile.famille_id)
      .eq('statut', 'pending')
      .is('gocardless_mandate_id', null)

    // Trace pending : le webhook la complètera (mandate_id à la signature, statut active ensuite)
    const { error: insErr } = await sb.from('mandats_gocardless').insert({
      ecole_id: profile.ecole_id,
      famille_id: profile.famille_id,
      gocardless_billing_request_id: flow.billingRequestId,
      statut: 'pending',
    })
    if (insErr) {
      return NextResponse.json({ error: 'Enregistrement du mandat impossible : ' + insErr.message }, { status: 500 })
    }

    return NextResponse.json({ url: flow.redirectUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur mandat SEPA' }, { status: 500 })
  }
}
