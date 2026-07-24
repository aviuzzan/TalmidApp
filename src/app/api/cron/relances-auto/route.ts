import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { calcDuADateBatch } from '@/lib/du-a-date'

/**
 * Cron quotidien Vercel : envoie automatiquement les relances impayés.
 * Schedule dans vercel.json : tous les jours à 08:00 UTC.
 *
 * REFONTE audit 24/07/2026 pt 15 : le retard est desormais defini par le
 * DU-A-DATE (echeancier), comme la page manuelle /finances/relances — et non
 * plus par factures.date_echeance (souvent NULL -> jamais relance, et une
 * famille a jour selon son echeancier pouvait etre mise en demeure).
 * Escalade par historique : N1 (rappel) si aucun envoi, puis N2 (relance)
 * apres (delai_relance - delai_rappel) jours, puis N3 (demeure) apres
 * (delai_demeure - delai_relance) jours. relances_log.niveau est ecrit en
 * numerique ('1'/'2'/'3') compatible avec le parseInt de la page manuelle.
 *
 * Sécurité : header Authorization doit contenir CRON_SECRET.
 */

const NIVEAU_LABEL: Record<number, 'rappel' | 'relance' | 'demeure'> = { 1: 'rappel', 2: 'relance', 3: 'demeure' }
function niveauNumFromLog(n: string | null): number {
  if (!n) return 0
  const parsed = parseInt(n)
  if (!isNaN(parsed)) return parsed
  if (n === 'rappel') return 1
  if (n === 'relance') return 2
  if (n === 'demeure') return 3
  return 0
}

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
      .select('id, numero, total_facture, solde_restant, date_echeance, statut, famille_id, familles!inner(ecole_id, parent1_prenom, parent1_email, parent2_prenom, parent2_email, situation_maritale, part_pere, part_mere)')
      .gt('solde_restant', 0)
      .neq('statut', 'annule')
      .eq('familles.ecole_id', ecoleId)

    // Du-a-date en batch : seules les factures avec des echeances ECHUES non
    // couvertes sont en retard (une famille a jour sur son echeancier n'est
    // jamais relancee meme si son solde annuel est > 0).
    const factureIds = ((factures || []) as any[]).map(f => f.id)
    const duMap = factureIds.length ? await calcDuADateBatch(supabaseAdmin as any, factureIds) : {}

    for (const f of (factures || []) as any[]) {
      result.processed++

      const du = (duMap as any)[f.id]
      if (!du || !du.enRetard || du.duAdate <= 0) { ecoleSkipped++; continue }

      // Escalade par historique de relances (logs succes=true)
      const { data: logs } = await supabaseAdmin
        .from('relances_log').select('niveau, created_at, envoye_le')
        .eq('facture_id', f.id).eq('succes', true)
      const dernierNiveau = Math.max(0, ...((logs || []) as any[]).map((l: any) => niveauNumFromLog(l.niveau)))
      const derniereDate = ((logs || []) as any[])
        .map((l: any) => l.envoye_le || l.created_at)
        .filter(Boolean).sort().pop()
      const joursDepuisDerniere = derniereDate
        ? Math.floor((today.getTime() - new Date(derniereDate).setHours(0, 0, 0, 0)) / 86400000)
        : Infinity

      let niveauNum = 0
      if (dernierNiveau === 0) niveauNum = 1
      else if (dernierNiveau === 1 && joursDepuisDerniere >= Math.max(1, (cfg.delai_relance || 15) - (cfg.delai_rappel || 7))) niveauNum = 2
      else if (dernierNiveau === 2 && joursDepuisDerniere >= Math.max(1, (cfg.delai_demeure || 30) - (cfg.delai_relance || 15))) niveauNum = 3
      if (niveauNum === 0) { ecoleSkipped++; continue }
      const niveau = NIVEAU_LABEL[niveauNum]
      const joursRetard = joursDepuisDerniere === Infinity ? 0 : joursDepuisDerniere

      const fam = f.familles || {}
      const estSeparee = fam.situation_maritale === 'divorce' || fam.situation_maritale === 'separe'
      const cibles: { email: string; prenom: string; montantDu: number }[] = []

      if (estSeparee) {
        const total = Number(f.total_facture)
        const { data: regs } = await supabaseAdmin.from('reglements').select('montant, paye_par').eq('facture_id', f.id)
        const regleP1 = (regs || []).filter((r: any) => r.paye_par === 'parent1').reduce((s: number, r: any) => s + Number(r.montant), 0)
        const regleP2 = (regs || []).filter((r: any) => r.paye_par === 'parent2').reduce((s: number, r: any) => s + Number(r.montant), 0)
        const soldeP1 = total * Number(fam.part_pere ?? 100) / 100 - regleP1
        const soldeP2 = total * Number(fam.part_mere ?? 0) / 100 - regleP2
        if (soldeP1 > 0.005 && fam.parent1_email) cibles.push({ email: fam.parent1_email, prenom: fam.parent1_prenom || 'Madame, Monsieur', montantDu: soldeP1 })
        if (soldeP2 > 0.005 && fam.parent2_email) cibles.push({ email: fam.parent2_email, prenom: fam.parent2_prenom || 'Madame, Monsieur', montantDu: soldeP2 })
      } else if (fam.parent1_email) {
        // Montant relance = du-a-date (echeances echues non couvertes), pas le solde annuel entier
        cibles.push({ email: fam.parent1_email, prenom: fam.parent1_prenom || 'Madame, Monsieur', montantDu: Number(du.duAdate) })
      }

      if (cibles.length === 0) {
        await supabaseAdmin.from('relances_log').insert({
          facture_id: f.id, famille_id: f.famille_id, ecole_id: ecoleId,
          niveau: String(niveauNum), envoye_a: '(aucun email)', jours_apres_echeance: joursRetard,
          succes: false, erreur: estSeparee ? 'Aucune part de parent impayee' : "Pas d'email parent1",
        })
        result.errors.push({ facture: f.numero, error: 'no email' })
        continue
      }

      const emailsOk: string[] = []
      let factureSent = false
      for (const c of cibles) {
        const vars = {
          prenom_parent: c.prenom,
          numero_facture: f.numero,
          montant_du: fmtMontant(c.montantDu),
          date_echeance: fmtDate(f.date_echeance),
          nom_ecole: ecoleNom,
        }
        const sujet = fillTemplate(cfg[`sujet_${niveau}`] || '', vars)
        const corps = fillTemplate(cfg[`corps_${niveau}`] || '', vars)
        const res = await sendEmail({
          to: { email: c.email, name: c.prenom },
          subject: sujet,
          html: toHtml(corps),
          fromName: ecoleNom,
        })
        if (res.ok) { factureSent = true; emailsOk.push(c.email) }
        else result.errors.push({ facture: f.numero, error: res.error })
      }

      await supabaseAdmin.from('relances_log').insert({
        facture_id: f.id, famille_id: f.famille_id, ecole_id: ecoleId,
        niveau: String(niveauNum), envoye_a: emailsOk.join(', ') || '(echec)', jours_apres_echeance: joursRetard,
        succes: factureSent, erreur: factureSent ? null : 'envoi echoue',
      })

      if (factureSent) { ecoleSent++; result.sent++ }
    }

    result.skipped += ecoleSkipped
    result.parEcole.push({ ecole: ecoleNom, envoyes: ecoleSent, ignores: ecoleSkipped })
  }

  return NextResponse.json({ ok: true, today: todayIso, ...result })
}
