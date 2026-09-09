import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getIntegration } from '@/lib/integrations'
import { cancelMandate } from '@/lib/gocardless'
import { logActionServer } from '@/lib/audit-log'

/**
 * uuuu5 (09/09/2026) — ARCHIVAGE d'une famille partie (eleve jamais venu, depart
 * en cours d'annee, fin de scolarite). Demande d'Avi : « ils ne doivent plus
 * polluer les listes, on doit les retrouver seulement dans un historique ».
 *
 * POST /api/admin/archiver-famille
 * Body: { familleId, action: 'archiver' | 'reactiver', motif?, dateSortie? }
 *
 * archiver :
 *  1. annule le(s) mandat(s) GoCardless encore vivants chez GoCardless (sinon un
 *     prelevement resterait possible hors de l'app) ;
 *  2. RPC archiver_famille : garde-fous (solde du, echeances actives, prelevement
 *     en cours), sortie de tous les enfants (statut sorti, date, motif, classe
 *     legacy retiree), mandats SEPA/CB -> revoque, familles.archivee_le.
 * reactiver : RPC desarchiver_famille (enfants -> en attente d'affectation).
 *
 * Securite : Bearer d'un admin/super_admin de l'ecole (les agents ne peuvent pas
 * archiver — c'est une decision de direction/secretariat).
 */
export async function POST(req: NextRequest) {
  try {
    const { familleId, action, motif, dateSortie } = await req.json()
    if (!familleId || !['archiver', 'reactiver'].includes(action)) {
      return NextResponse.json({ error: 'familleId et action (archiver|reactiver) requis' }, { status: 400 })
    }
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: profile } = await sb.from('profiles').select('role, ecole_id').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 })
    }
    const { data: famille } = await sb.from('familles').select('id, ecole_id, nom, archivee_le').eq('id', familleId).single()
    if (!famille) return NextResponse.json({ error: 'Famille introuvable' }, { status: 404 })
    if (profile.role === 'admin' && profile.ecole_id !== famille.ecole_id) {
      return NextResponse.json({ error: 'Famille hors de votre école' }, { status: 403 })
    }

    // Client "en tant que l'utilisateur" pour les RPC (auth.uid() = l'admin, is_staff_ecole verifie)
    const sbUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (action === 'reactiver') {
      const { data, error } = await sbUser.rpc('desarchiver_famille', { p_famille_id: familleId })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await logActionServer(sb, famille.ecole_id, user.id, 'famille_reactivee', { famille_id: familleId, nom: famille.nom })
      return NextResponse.json({ ok: true, ...(data as object) })
    }

    const motifTxt = String(motif || '').trim()
    if (motifTxt.length < 3) return NextResponse.json({ error: 'Le motif est obligatoire (3 caractères minimum)' }, { status: 400 })

    // 1. GoCardless : annuler les mandats vivants AVANT de marquer en base
    const avertissements: string[] = []
    const { data: mandats } = await sb.from('mandats_gocardless')
      .select('id, gocardless_mandate_id, statut').eq('famille_id', familleId).in('statut', ['active', 'signe'])
    if (mandats && mandats.length > 0) {
      const integration = await getIntegration(famille.ecole_id, 'gocardless')
      const accessToken = integration?.secrets?.access_token
      for (const m of mandats) {
        if (!m.gocardless_mandate_id) continue
        if (!accessToken) { avertissements.push(`Mandat SEPA ${m.gocardless_mandate_id} : intégration GoCardless inactive, annulez-le dans le dashboard GoCardless.`); continue }
        try { await cancelMandate(accessToken, integration!.mode, m.gocardless_mandate_id) }
        catch (e: any) { avertissements.push(`Mandat SEPA ${m.gocardless_mandate_id} : annulation GoCardless à vérifier (${e?.message || 'erreur'}).`) }
      }
    }

    // 2. Base (garde-fous + sortie des enfants + archivage)
    const { data, error } = await sbUser.rpc('archiver_famille', {
      p_famille_id: familleId, p_motif: motifTxt, p_date_sortie: dateSortie || new Date().toISOString().slice(0, 10),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await logActionServer(sb, famille.ecole_id, user.id, 'famille_archivee', { famille_id: familleId, nom: famille.nom, motif: motifTxt, date_sortie: dateSortie || null })
    return NextResponse.json({ ok: true, ...(data as object), avertissements })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
