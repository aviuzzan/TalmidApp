import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Cron quotidien Vercel : envoie automatiquement les relances impayés.
 * Schedule dans vercel.json : tous les jours à 08:00 UTC.
 *
 * Pour chaque école avec relances_config.actif=true, parcourt les factures
 * impayées dont l'échéance est passée, calcule le niveau (rappel/relance/demeure)
 * selon les délais configurés, envoie l'email custom rempli avec les variables,
 * log dans relances_log.
 *
 * Sécurité : header Authorization doit contenir CRON_SECRET.
 */

function fmtMontant(n: number): string {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fmtDate(d: string | null): string {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('fr-FR') } catch { return d }
}
function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}
function toHtml(text: string): string {
  const escaped = text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
  const body = escaped.split('\n').map(l => `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#334155;">${l || '&nbsp;'}</p>`).join('')
  return '<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:24px;background:#F0F4FA;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">'
       + '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 28px;">' + body + '</div></body></html>'
}

export async function GET(req: NextRequest)  { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (cronSecret && !authHeader.includes(cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'SMTP non configuré' }, { status: 500 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString().split('T')[0]

  const { data: configs } = await supabaseAdmin
    .from('relances_config').select('*, ecoles(nom)').eq('actif', true)

  const result = {
    processed: 0, sent: 0, skipped: 0,
    errors: [] as any[], parEcole: [] as any[],
  }

  for (const cfg of configs || []) {
    const ecoleId = cfg.ecole_id
    const ecoleNom = (cfg as any).ecoles?.nom || 'Votre école'
    let ecoleSent = 0, ecoleSkipped = 0

    const { data: factures } = await supabaseAdmin
      .from('factures_solde')
      .select('id, numero, total_facture, solde_restant, date_echeance, statut, famille_id, familles!inner(ecole_id, parent1_prenom, parent1_email)')
      .gt('solde_restant', 0)
      .neq('statut', 'annule')
      .not('date_echeance', 'is', null)
      .lte('date_echeance', todayIso)
      .eq('familles.ecole_id', ecoleId)

    for (const f of (factures || []) as any[]) {
      result.processed++

      const echeance = new Date(f.date_echeance)
      echeance.setHours(0, 0, 0, 0)
      const joursRetard = Math.floor((today.getTime() - echeance.getTime()) / 86400000)

      let niveau: 'rappel' | 'relance' | 'demeure' | null = null
      if (joursRetard >= cfg.delai_demeure) niveau = 'demeure'
      else if (joursRetard >= cfg.delai_relance) niveau = 'relance'
      else if (joursRetard >= cfg.delai_rappel) niveau = 'rappel'
      if (!niveau) { ecoleSkipped++; continue }

      const { data: logExist } = await supabaseAdmin
        .from('relances_log').select('id')
        .eq('facture_id', f.id).eq('niveau', niveau).eq('succes', true).limit(1)
      if (logExist && logExist.length > 0) { ecoleSkipped++; continue }

      const parentEmail: string | null = f.familles?.parent1_email
      const parentPrenom: string = f.familles?.parent1_prenom || 'Madame, Monsieur'

      if (!parentEmail) {
        await supabaseAdmin.from('relances_log').insert({
          facture_id: f.id, famille_id: f.famille_id, ecole_id: ecoleId,
          niveau, envoye_a: '(aucun email)', jours_apres_echeance: joursRetard,
          succes: false, erreur: 'Pas d\'email parent1',
        })
        result.errors.push({ facture: f.numero, error: 'no email' })
        continue
      }

      const vars = {
        prenom_parent: parentPrenom,
        numero_facture: f.numero,
        montant_du: fmtMontant(f.solde_restant),
        date_echeance: fmtDate(f.date_echeance),
        nom_ecole: ecoleNom,
      }
      const sujet = fillTemplate(cfg[`sujet_${niveau}`] || '', vars)
      const corps = fillTemplate(cfg[`corps_${niveau}`] || '', vars)

      const res = await sendEmail({
        to: { email: parentEmail, name: parentPrenom },
        subject: sujet,
        html: toHtml(corps),
      })

      await supabaseAdmin.from('relances_log').insert({
        facture_id: f.id, famille_id: f.famille_id, ecole_id: ecoleId,
        niveau, envoye_a: parentEmail, jours_apres_echeance: joursRetard,
        succes: res.ok, erreur: res.ok ? null : (res.error || 'inconnu'),
      })

      if (res.ok) { ecoleSent++; result.sent++ }
      else result.errors.push({ facture: f.numero, error: res.error })
    }

    result.skipped += ecoleSkipped
    result.parEcole.push({ ecole: ecoleNom, envoyes: ecoleSent, ignores: ecoleSkipped })
  }

  return NextResponse.json({ ok: true, today: todayIso, ...result })
}
