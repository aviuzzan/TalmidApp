import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { plafondPlan, estYeter } from '@/lib/etablissement'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/depassement-plan  (zzzz1 — quotidien 6h45 UTC, cf. vercel.json)
 *
 * ALERTE SOUPLE de depassement de plan (consigne Avi) : on ne bloque JAMAIS
 * une inscription. Le cron compte les enfants inscrits (date_sortie NULL) de
 * chaque ecole active et, si l'effectif depasse le plafond du plan
 * (plafondPlan : TalmidApp 99/250, Yeter 49/99, Enterprise illimite), envoie
 * UN email a admin@talmidapp.fr.
 *
 * Anti-spam : ecoles.alerte_depassement_plan memorise le plan pour lequel
 * l'alerte est deja partie. Tant que l'ecole reste en depassement sur le meme
 * plan, aucun nouvel email. Si elle repasse sous le plafond ou change de plan
 * (upgrade), la colonne est remise a NULL et une future traversee re-alertera.
 *
 * Securite : fail-closed sur CRON_SECRET (meme regle que les autres crons).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET non configure' }, { status: 500 })
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: ecoles, error } = await sb
    .from('ecoles')
    .select('id, nom, slug, plan, type_etablissement, alerte_depassement_plan')
    .eq('actif', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let alertes = 0
  let resets = 0
  const erreurs: string[] = []

  for (const ecole of ecoles || []) {
    const plafond = plafondPlan(ecole.plan, ecole.type_etablissement)

    // Enterprise / plan inconnu : illimite. On nettoie une eventuelle alerte residuelle.
    if (plafond === null) {
      if (ecole.alerte_depassement_plan) {
        await sb.from('ecoles').update({ alerte_depassement_plan: null }).eq('id', ecole.id)
        resets++
      }
      continue
    }

    const { count, error: cntErr } = await sb
      .from('enfants')
      .select('*', { count: 'exact', head: true })
      .eq('ecole_id', ecole.id)
      .eq('statut_inscription', 'inscrit')
      .is('date_sortie', null)
    if (cntErr) { erreurs.push(`${ecole.slug}: ${cntErr.message}`); continue }
    const effectif = count ?? 0

    if (effectif > plafond) {
      // Deja alerte pour ce meme plan -> silence (anti-spam).
      if (ecole.alerte_depassement_plan === ecole.plan) continue

      const produit = estYeter(ecole.type_etablissement) ? 'Yeter' : 'TalmidApp'
      const res = await sendEmail({
        to: { email: 'admin@talmidapp.fr', name: 'TalmidApp' },
        subject: `Depassement de plan — ${ecole.nom} (${effectif}/${plafond})`,
        html: [
          '<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1E293B; line-height: 1.6;">',
          '  <h2 style="color: #C2410C;">Depassement de plan</h2>',
          `  <p><strong>${ecole.nom}</strong> (${produit}, /${ecole.slug}) depasse son plan <strong>${ecole.plan}</strong> :</p>`,
          `  <p style="font-size: 22px; font-weight: bold; margin: 16px 0;">${effectif} enfants inscrits <span style="color: #64748B; font-weight: normal;">/ plafond ${plafond}</span></p>`,
          '  <p>Rien n\'est bloque pour l\'ecole (alerte souple). C\'est le bon moment pour proposer le plan superieur.</p>',
          `  <p><a href="https://talmidapp.fr/admin/ecoles/${ecole.id}" style="background: #2563EB; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Voir la fiche ecole</a></p>`,
          '  <p style="font-size: 12px; color: #94A3B8;">Email automatique (cron quotidien depassement-plan). Un seul envoi par depassement : vous ne serez re-alerte que si l\'ecole change de plan ou repasse sous le plafond puis le depasse a nouveau.</p>',
          '</div>',
        ].join('\n'),
      })
      if (!res.ok) { erreurs.push(`${ecole.slug}: email KO (${res.error})`); continue }

      await sb.from('ecoles').update({ alerte_depassement_plan: ecole.plan }).eq('id', ecole.id)
      alertes++
    } else if (ecole.alerte_depassement_plan) {
      // Repassee sous le plafond : on rearme l'alerte.
      await sb.from('ecoles').update({ alerte_depassement_plan: null }).eq('id', ecole.id)
      resets++
    }
  }

  return NextResponse.json({ ok: true, ecoles: (ecoles || []).length, alertes, resets, erreurs })
}
