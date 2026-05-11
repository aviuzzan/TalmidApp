import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { factureId, niveau, ecoleId } = await req.json()
    if (!factureId || !niveau || !ecoleId) {
      return NextResponse.json({ error: 'factureId, niveau, ecoleId requis' }, { status: 400 })
    }
    if (![1, 2, 3].includes(niveau)) {
      return NextResponse.json({ error: 'niveau doit etre 1, 2 ou 3' }, { status: 400 })
    }

    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const { data: { user: caller } } = await supa.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: profile } = await supa.from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { data: config } = await supa
      .from('relances_config').select('*')
      .eq('ecole_id', ecoleId).maybeSingle()

    const { data: ecole } = await supa
      .from('ecoles').select('nom, slug').eq('id', ecoleId).single()

    const { data: facture, error: factErr } = await supa
      .from('factures')
      .select('id, numero, famille_id, total_ttc, solde_du, date_echeance')
      .eq('id', factureId).single()
    if (factErr || !facture) {
      return NextResponse.json({ error: factErr?.message || 'Facture introuvable' }, { status: 404 })
    }

    const { data: parent } = await supa
      .from('profiles').select('prenom, nom, email')
      .eq('famille_id', facture.famille_id)
      .eq('role', 'parent')
      .limit(1).maybeSingle()
    if (!parent?.email) {
      return NextResponse.json({ error: 'Aucun email parent trouve' }, { status: 400 })
    }

    const { data: existing } = await supa
      .from('relances_log').select('id')
      .eq('facture_id', factureId).eq('niveau', niveau).maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Relance deja envoyee pour ce niveau' }, { status: 409 })
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

    const vars: Record<string, string> = {
      prenom_parent: parent.prenom || '',
      nom_parent: parent.nom || '',
      numero_facture: facture.numero,
      montant_du: Number(facture.solde_du).toFixed(2) + ' EUR',
      total_facture: Number(facture.total_ttc).toFixed(2) + ' EUR',
      date_echeance: new Date(facture.date_echeance).toLocaleDateString('fr-FR'),
      nom_ecole: ecole?.nom || '',
    }

    let html = corps[niveau]
    let sujet = subjects[niveau]
    for (const [k, v] of Object.entries(vars)) {
      const re = new RegExp('{{\\s*' + k + '\\s*}}', 'g')
      html = html.replace(re, v)
      sujet = sujet.replace(re, v)
    }

    const sendResult = await sendEmail({
      to: { email: parent.email, name: ((parent.prenom || '') + ' ' + (parent.nom || '')).trim() || undefined },
      subject: sujet,
      html,
    })
    if (!sendResult.ok) {
      return NextResponse.json({ error: 'Erreur envoi email : ' + sendResult.error }, { status: 500 })
    }

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

    return NextResponse.json({ success: true, message: 'Relance N' + niveau + ' envoyee a ' + parent.email })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}

function defaultCorps(niveau: 1 | 2 | 3): string {
  if (niveau === 1) {
    return '<p>Bonjour {{prenom_parent}},</p><p>Nous nous permettons de vous rappeler que la facture <strong>{{numero_facture}}</strong> d\'un montant de <strong>{{montant_du}}</strong>, dont l\'echeance etait fixee au {{date_echeance}}, n\'a pas encore ete reglee.</p><p>Cordialement,<br>{{nom_ecole}}</p>'
  }
  if (niveau === 2) {
    return '<p>Bonjour {{prenom_parent}},</p><p>Malgre notre precedent rappel, la facture <strong>{{numero_facture}}</strong> (echeance : {{date_echeance}}) demeure impayee. Merci de regulariser sous 15 jours.</p><p>Cordialement,<br>{{nom_ecole}}</p>'
  }
  return '<p>Bonjour {{prenom_parent}},</p><p><strong>MISE EN DEMEURE</strong></p><p>La facture <strong>{{numero_facture}}</strong> reste impayee. Nous vous mettons en demeure de regler sous 8 jours.</p><p>Cordialement,<br>{{nom_ecole}}</p>'
}
