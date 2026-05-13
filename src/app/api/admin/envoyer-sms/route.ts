import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendSms, fillTemplate, normalizePhoneFR } from '@/lib/brevo'
import { getIntegration } from '@/lib/integrations'

/**
 * POST /api/admin/envoyer-sms
 * Body: {
 *   ecoleId: string,
 *   cibleType: 'unitaire' | 'classe' | 'famille' | 'liste' | 'tous',
 *   cibleId?: string,           // classe_id ou famille_id selon cibleType
 *   telephones?: string[],      // si cibleType=liste
 *   message: string,            // peut contenir {prenom}, {nom}, ...
 *   sender?: string,
 *   tag?: string,
 * }
 * Réponse: { envoyes: number, echecs: number, details: [...] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ecoleId, cibleType, cibleId, telephones, message, sender, tag } = body
    if (!ecoleId || !cibleType || !message) {
      return NextResponse.json({ error: 'ecoleId, cibleType, message requis' }, { status: 400 })
    }
    if (message.length > 800) {
      return NextResponse.json({ error: 'Message trop long (max 800 caractères)' }, { status: 400 })
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

    const { data: caller } = await supabaseAdmin
      .from('profiles').select('role, ecole_id').eq('id', user.id).single()
    if (!['admin', 'super_admin'].includes(caller?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Charge l'intégration Brevo SMS (apiKey chiffrée + config publique)
    const integration = await getIntegration(ecoleId, 'brevo_sms')
    if (!integration) {
      return NextResponse.json({ error: 'Envoi SMS désactivé pour cette école' }, { status: 400 })
    }
    const apiKey = integration.secrets.api_key
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API Brevo manquante. L\'école doit la configurer dans Paramètres → Intégrations.' }, { status: 400 })
    }
    const expediteurDefaut = integration.public.expediteur || 'TalmidApp'
    const signature = integration.public.signature || null
    const senderFinal = sender || expediteurDefaut

    // Construit la liste des destinataires
    interface Destinataire { telephone: string; profile_id?: string; prenom?: string; nom?: string }
    let destinataires: Destinataire[] = []

    if (cibleType === 'liste') {
      if (!Array.isArray(telephones)) {
        return NextResponse.json({ error: 'telephones[] requis pour cibleType=liste' }, { status: 400 })
      }
      destinataires = telephones.map(t => ({ telephone: t }))
    } else if (cibleType === 'unitaire') {
      // cibleId = profile_id
      if (!cibleId) return NextResponse.json({ error: 'cibleId requis' }, { status: 400 })
      const { data: p } = await supabaseAdmin
        .from('profiles').select('id, prenom, nom, telephone').eq('id', cibleId).maybeSingle()
      if (p?.telephone) destinataires.push({ telephone: p.telephone, profile_id: p.id, prenom: p.prenom, nom: p.nom })
    } else if (cibleType === 'famille') {
      if (!cibleId) return NextResponse.json({ error: 'cibleId requis' }, { status: 400 })
      const { data: ps } = await supabaseAdmin
        .from('profiles').select('id, prenom, nom, telephone').eq('famille_id', cibleId).eq('ecole_id', ecoleId)
      for (const p of ps || []) {
        if (p.telephone) destinataires.push({ telephone: p.telephone, profile_id: p.id, prenom: p.prenom, nom: p.nom })
      }
    } else if (cibleType === 'classe') {
      if (!cibleId) return NextResponse.json({ error: 'cibleId requis' }, { status: 400 })
      // récupère enfants de la classe → familles → parents
      const { data: enfants } = await supabaseAdmin
        .from('enfants').select('famille_id').eq('classe_id', cibleId).eq('ecole_id', ecoleId)
      const famIds = Array.from(new Set((enfants || []).map((e: any) => e.famille_id).filter(Boolean)))
      if (famIds.length > 0) {
        const { data: ps } = await supabaseAdmin
          .from('profiles').select('id, prenom, nom, telephone, famille_id').in('famille_id', famIds).eq('ecole_id', ecoleId)
        for (const p of ps || []) {
          if (p.telephone) destinataires.push({ telephone: p.telephone, profile_id: p.id, prenom: p.prenom, nom: p.nom })
        }
      }
    } else if (cibleType === 'tous') {
      const { data: ps } = await supabaseAdmin
        .from('profiles').select('id, prenom, nom, telephone').eq('ecole_id', ecoleId)
      for (const p of ps || []) {
        if (p.telephone) destinataires.push({ telephone: p.telephone, profile_id: p.id, prenom: p.prenom, nom: p.nom })
      }
    } else {
      return NextResponse.json({ error: `cibleType inconnu : ${cibleType}` }, { status: 400 })
    }

    if (destinataires.length === 0) {
      return NextResponse.json({ error: 'Aucun destinataire avec téléphone trouvé' }, { status: 400 })
    }

    let envoyes = 0
    let echecs = 0
    const details: any[] = []

    for (const dest of destinataires) {
      const tel = normalizePhoneFR(dest.telephone)
      if (!tel) { echecs++; details.push({ telephone: dest.telephone, ok: false, error: 'Numéro invalide' }); continue }

      const msgFinal = fillTemplate(message, {
        prenom: dest.prenom || '',
        nom: dest.nom || '',
      }) + (signature ? `\n${signature}` : '')

      const res = await sendSms({ apiKey, to: tel, message: msgFinal, sender: senderFinal, tag: tag || 'talmidapp' })

      await supabaseAdmin.from('sms_envoyes').insert({
        ecole_id: ecoleId,
        envoye_par: user.id,
        destinataire_profile: dest.profile_id || null,
        destinataire_telephone: tel,
        destinataire_nom: [dest.prenom, dest.nom].filter(Boolean).join(' ') || null,
        expediteur: senderFinal,
        message: msgFinal,
        statut: res.ok ? 'sent' : 'failed',
        brevo_message_id: res.brevoMessageId || null,
        cout_credits: res.costCredits || null,
        erreur: res.error || null,
      })

      if (res.ok) envoyes++
      else echecs++
      details.push({ telephone: tel, ok: res.ok, error: res.error })
    }

    return NextResponse.json({ envoyes, echecs, total: destinataires.length, details })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur envoi SMS' }, { status: 500 })
  }
}
