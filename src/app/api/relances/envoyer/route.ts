import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { calcDuADate } from '@/lib/du-a-date'

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

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await supa.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: profile } = await supa.from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { data: config } = await supa
      .from('relances_config').select('*')
      .eq('ecole_id', ecoleId).maybeSingle()

    const { data: ecole } = await supa
      .from('ecoles').select('nom, slug').eq('id', ecoleId).single()

    // Lecture facture via la VUE factures_solde (qui expose les bons noms total_facture / solde_restant / date_echeance)
    const { data: facture, error: factErr } = await supa
      .from('factures_solde')
      .select('id, numero, famille_id, annee_scolaire, total_facture, solde_restant, date_emission, date_echeance')
      .eq('id', factureId).single()
    if (factErr || !facture) {
      return NextResponse.json({ error: factErr?.message || 'Facture introuvable' }, { status: 404 })
    }

    // Récupère email parent depuis familles (pas profiles.email qui n'existe pas)
    const { data: famille } = await supa
      .from('familles')
      .select('parent1_prenom, parent1_nom, parent1_email, parent2_prenom, parent2_nom, parent2_email, nom, situation_maritale, part_pere, part_mere')
      .eq('id', facture.famille_id).single()
    if (!famille?.parent1_email) {
      return NextResponse.json({ error: 'Aucun email parent enregistré' }, { status: 400 })
    }

    const { data: existing } = await supa
      .from('relances_log').select('id')
      .eq('facture_id', factureId).eq('niveau', niveau).maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Relance déjà envoyée pour ce niveau' }, { status: 409 })
    }

    const subjects: Record<number, string> = {
      1: config?.sujet_rappel || 'Rappel : facture ' + facture.numero,
      2: config?.sujet_relance || 'Relance : facture ' + facture.numero,
      3: config?.sujet_demeure || 'Mise en demeure : facture ' + facture.numero,
    }
    const corps: Record<number, string> = {
      1: config?.corps_rappel || defaultCorps(1),
      2: config?.corps_relance || defaultCorps(2),
      3: config?.corps_demeure || defaultCorps(3),
    }

    // FIX audit coherence 27/07/2026 : le montant reclame etait facture.solde_restant
    // (solde ANNUEL entier) alors que l'ecran Relances affiche le du a date, et que le
    // cron auto envoie le du a date -> deux montants differents pour la meme facture.
    // Desormais : montant reclame = du a date ; le solde annuel est affiche en petit dessous.
    const du = await calcDuADate(supa, factureId)
    const montantDuADate = du ? du.duAdate : Number(facture.solde_restant)
    const soldeAnnuel = du ? du.soldeAnnuel : Number(facture.solde_restant)
    if (montantDuADate <= 0) {
      return NextResponse.json({ error: "Rien n'est dû à ce jour : aucune échéance échue non couverte (le solde annuel n'est pas un retard)" }, { status: 400 })
    }

    // Date d'echeance affichee = derniere echeance ECHUE (celle qui est en retard).
    // Plus jamais le fallback "date_emission + 30 jours" (logique fausse pour une
    // facture annuelle avec echeancier demarrant en septembre).
    let dateEch: Date | null = facture.date_echeance ? new Date(facture.date_echeance) : null
    if (du && du.echeancierExiste) {
      const { data: contrat } = await supa
        .from('contrats_scolarisation').select('id')
        .eq('famille_id', facture.famille_id)
        .eq('annee_scolaire', (facture as any).annee_scolaire || '')
        .eq('statut', 'valide').maybeSingle()
      const contratId = contrat?.id
      if (contratId) {
        const today = new Date().toISOString().split('T')[0]
        const { data: derniereEchue } = await supa
          .from('cheques_prevus').select('date_echeance')
          .eq('contrat_id', contratId).neq('statut', 'annule')
          .lte('date_echeance', today)
          .order('date_echeance', { ascending: false }).limit(1).maybeSingle()
        if (derniereEchue?.date_echeance) dateEch = new Date(derniereEchue.date_echeance)
      }
    }

    const fmtEur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

    const buildHtml = (montantDu: number, prenomParent: string, nomParent: string, mentionPart = false) => {
      const vars: Record<string, string> = {
        prenom_parent: prenomParent,
        nom_parent: nomParent,
        numero_facture: facture.numero,
        montant_du: montantDu.toFixed(2) + ' EUR',
        solde_a_ce_jour: montantDu.toFixed(2) + ' EUR',
        solde_annuel: soldeAnnuel.toFixed(2) + ' EUR',
        total_facture: Number(facture.total_facture).toFixed(2) + ' EUR',
        date_echeance: (dateEch || new Date()).toLocaleDateString('fr-FR'),
        nom_ecole: ecole?.nom || '',
      }
      let html = corps[niveau]
      let sujet = subjects[niveau]
      for (const [k, v] of Object.entries(vars)) {
        const re = new RegExp('{{\\s*' + k + '\\s*}}', 'g')
        html = html.replace(re, v)
        sujet = sujet.replace(re, v)
      }
      // Bloc recapitulatif : solde a ce jour en gros, solde annuel en petit dessous.
      html += `
        <div style="margin-top:16px;padding:12px 16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;">
          <div style="font-size:16px;font-weight:700;color:#991B1B;">${mentionPart ? 'Votre part due à ce jour' : 'Solde dû à ce jour'} : ${fmtEur(montantDu)}</div>
          <div style="font-size:12px;color:#64748B;margin-top:4px;">Solde restant à la fin de l'année scolaire : ${fmtEur(soldeAnnuel)}</div>
        </div>`
      return { html, sujet }
    }

    const estSeparee = famille.situation_maritale === 'divorce' || famille.situation_maritale === 'separe'

    // Famille separee : un email personnalise au(x) parent(s) qui ont une part impayee.
    // Base de calcul = echeances ECHUES (du a date), plus le total annuel.
    if (estSeparee) {
      const base = (du && du.echeancierExiste) ? du.totalEcheancesEchues : Number(facture.total_facture)
      const { data: regs } = await supa.from('reglements').select('montant, paye_par').eq('facture_id', factureId)
      const regleP1 = (regs || []).filter((r: any) => r.paye_par === 'parent1').reduce((s: number, r: any) => s + Number(r.montant), 0)
      const regleP2 = (regs || []).filter((r: any) => r.paye_par === 'parent2').reduce((s: number, r: any) => s + Number(r.montant), 0)
      const soldeP1 = base * Number(famille.part_pere ?? 100) / 100 - regleP1
      const soldeP2 = base * Number(famille.part_mere ?? 0) / 100 - regleP2
      const cibles: { email: string; prenom: string; nom: string; montantDu: number }[] = []
      if (soldeP1 > 0.005 && famille.parent1_email) cibles.push({ email: famille.parent1_email, prenom: famille.parent1_prenom || '', nom: famille.parent1_nom || '', montantDu: soldeP1 })
      if (soldeP2 > 0.005 && famille.parent2_email) cibles.push({ email: famille.parent2_email, prenom: famille.parent2_prenom || '', nom: famille.parent2_nom || '', montantDu: soldeP2 })
      if (cibles.length === 0) {
        return NextResponse.json({ error: 'Aucune part de parent en retard à ce jour pour cette facture' }, { status: 400 })
      }
      const sentEmails: string[] = []
      for (const c of cibles) {
        const { html, sujet } = buildHtml(c.montantDu, c.prenom, c.nom, true)
        const r = await sendEmail({ fromName: ecole?.nom || 'TalmidApp', to: [{ email: c.email, name: `${c.prenom} ${c.nom}`.trim() || undefined }], subject: sujet, html })
        if (r.ok) sentEmails.push(c.email)
      }
      if (sentEmails.length === 0) {
        return NextResponse.json({ error: 'Erreur envoi email' }, { status: 500 })
      }
      await supa.from('relances_log').insert({
        facture_id: factureId, ecole_id: ecoleId, famille_id: facture.famille_id, niveau,
        envoye_a: sentEmails.join(', '), envoye_at: new Date().toISOString(), succes: true,
      })
      return NextResponse.json({ success: true, message: 'Relance N' + niveau + ' envoyée à ' + sentEmails.join(', ') })
    }

    // Famille non separee : un seul email aux deux parents — montant = DU A DATE
    const { html, sujet } = buildHtml(montantDuADate, famille.parent1_prenom || '', famille.parent1_nom || '')
    const dests: { email: string; name?: string }[] = [
      { email: famille.parent1_email, name: `${famille.parent1_prenom ?? ''} ${famille.parent1_nom ?? ''}`.trim() || undefined },
    ]
    if (famille.parent2_email && famille.parent2_email !== famille.parent1_email) {
      dests.push({ email: famille.parent2_email, name: `${famille.parent2_prenom ?? ''} ${famille.parent2_nom ?? ''}`.trim() || undefined })
    }

    const sendResult = await sendEmail({ fromName: ecole?.nom || 'TalmidApp', to: dests, subject: sujet, html })
    if (!sendResult.ok) {
      return NextResponse.json({ error: 'Erreur envoi email : ' + sendResult.error }, { status: 500 })
    }

    await supa.from('relances_log').insert({
      facture_id: factureId,
      ecole_id: ecoleId,
      famille_id: facture.famille_id,
      niveau,
      envoye_a: dests.map(d => d.email).join(', '),
      envoye_at: new Date().toISOString(),
      succes: true,
    })

    return NextResponse.json({ success: true, message: 'Relance N' + niveau + ' envoyée à ' + dests.map(d => d.email).join(', ') })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}

function defaultCorps(niveau: 1 | 2 | 3): string {
  if (niveau === 1) {
    return '<p>Bonjour {{prenom_parent}},</p><p>Nous nous permettons de vous rappeler que la facture <strong>{{numero_facture}}</strong> d&apos;un montant de <strong>{{montant_du}}</strong>, dont l&apos;échéance était fixée au {{date_echeance}}, n&apos;a pas encore été réglée.</p><p>Cordialement,<br>{{nom_ecole}}</p>'
  }
  if (niveau === 2) {
    return '<p>Bonjour {{prenom_parent}},</p><p>Malgré notre précédent rappel, la facture <strong>{{numero_facture}}</strong> (échéance : {{date_echeance}}) demeure impayée. Merci de régulariser sous 15 jours.</p><p>Cordialement,<br>{{nom_ecole}}</p>'
  }
  return '<p>Bonjour {{prenom_parent}},</p><p><strong>MISE EN DEMEURE</strong></p><p>La facture <strong>{{numero_facture}}</strong> reste impayée. Nous vous mettons en demeure de régler sous 8 jours.</p><p>Cordialement,<br>{{nom_ecole}}</p>'
}
