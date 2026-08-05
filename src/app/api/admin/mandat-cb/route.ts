import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/admin/mandat-cb  (yyyy3)
 * Body: { familleId, action: 'inviter' | 'suspendre' | 'reactiver' }
 *  - inviter    : email aux parents avec le lien portail pour enregistrer leur carte
 *  - suspendre  : stoppe les prélèvements (mandat conservé)
 *  - reactiver  : relance un mandat suspendu (remet les échecs à zéro)
 * Auth : admin de l'école de la famille (accès finances).
 */
export async function POST(req: NextRequest) {
  try {
    const { familleId, action } = await req.json()
    if (!familleId || !action) return NextResponse.json({ error: 'familleId et action requis' }, { status: 400 })

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: profile } = await sb.from('profiles')
      .select('role, ecole_id, acces_finances').eq('id', user.id).single()
    const { data: famille } = await sb.from('familles')
      .select('id, nom, ecole_id, parent1_email, parent2_email').eq('id', familleId).single()
    if (!famille) return NextResponse.json({ error: 'Famille introuvable' }, { status: 404 })

    const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)
      && (profile.role === 'super_admin' || profile.ecole_id === famille.ecole_id)
      && profile.acces_finances !== false
    if (!isAdmin) return NextResponse.json({ error: 'Accès réservé aux admins finances' }, { status: 403 })

    if (action === 'inviter') {
      const destinataires = [famille.parent1_email, famille.parent2_email]
        .filter(Boolean).map((email: any) => ({ email }))
      if (destinataires.length === 0) {
        return NextResponse.json({ error: 'Aucun email parent renseigné sur cette famille' }, { status: 400 })
      }
      const { data: ecole } = await sb.from('ecoles').select('nom').eq('id', famille.ecole_id).single()
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
      const r = await sendEmail({
        to: destinataires,
        fromName: ecole?.nom || 'TalmidApp',
        subject: `${ecole?.nom || 'Votre école'} — activez le prélèvement automatique par carte`,
        html: `<p>Bonjour,</p>
<p>${ecole?.nom || 'Votre école'} vous propose de régler la scolarité par <strong>prélèvement automatique sur carte bancaire</strong> :
vous enregistrez votre carte une seule fois (page sécurisée Stripe), puis chaque mensualité de votre échéancier est prélevée automatiquement à sa date.</p>
<p>Pour l'activer, connectez-vous à votre espace puis cliquez sur « Activer le prélèvement automatique » :</p>
<p><a href="${baseUrl}/portail/factures">Accéder à mes factures</a></p>
<p>Vous pouvez le désactiver à tout moment depuis votre espace.</p>
<p>${ecole?.nom || ''}</p>`,
      })
      if (!r.ok) return NextResponse.json({ error: 'Envoi email : ' + r.error }, { status: 500 })
      return NextResponse.json({ ok: true, envoyes: destinataires.length })
    }

    if (action === 'suspendre' || action === 'reactiver') {
      const { data: mandat } = await sb.from('mandats_cb')
        .select('id, statut').eq('famille_id', familleId).eq('ecole_id', famille.ecole_id).maybeSingle()
      if (!mandat) return NextResponse.json({ error: 'Aucun mandat pour cette famille' }, { status: 404 })
      const { error } = await sb.from('mandats_cb').update(
        action === 'suspendre'
          ? { statut: 'suspendu', updated_at: new Date().toISOString() }
          : { statut: 'actif', echecs_consecutifs: 0, derniere_erreur: null, updated_at: new Date().toISOString() }
      ).eq('id', mandat.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur mandat admin' }, { status: 500 })
  }
}
