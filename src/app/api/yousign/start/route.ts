import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createSignatureRequest } from '@/lib/yousign'
import { getIntegration } from '@/lib/integrations'

export const runtime = 'nodejs'

/**
 * POST /api/yousign/start
 * Body: { ecoleId, documentType: 'contrat_scolarisation'|'autre', documentId?, contratId?, signerEmail, signerFirstName, signerLastName, pdfBase64 }
 *
 * Démarre une demande de signature électronique YouSign pour un document (PDF en base64).
 * Retourne signature URL (mode none) ou notification email (mode default).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ecoleId, documentType, documentId, contratId, signerEmail, signerFirstName, signerLastName, pdfBase64, deliveryEmail } = body
    if (!ecoleId || !documentType || !signerEmail || !pdfBase64) {
      return NextResponse.json({ error: 'ecoleId, documentType, signerEmail, pdfBase64 requis' }, { status: 400 })
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
    const { data: caller } = await sb.from('profiles').select('role, ecole_id, famille_id').eq('id', user.id).single()
    // FIX secu 27/07 : seul un super_admin peut agir hors de son école — un admin d'une autre
    // école passait la garde précédente (if (!isAdmin && ...)) alors qu'il n'est pas de ce tenant
    if (caller?.role !== 'super_admin' && caller?.ecole_id !== ecoleId) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    // FIX secu cccc4 (C6) : le test de role manquait. Tout compte de l'ecole,
    // parent compris, pouvait lancer une signature electronique juridiquement
    // engageante sur le contrat d'une AUTRE famille, en se designant signataire
    // (signerEmail / contratId / documentId venaient du body sans controle).
    if (!['admin', 'super_admin'].includes(caller?.role || '')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    // FIX secu cccc4 (C6, suite) : IDOR. On verifie que le document vise
    // appartient bien a l'ecole passee en parametre.
    if (contratId) {
      const { data: c } = await sb.from('contrats_scolarisation')
        .select('id, ecole_id').eq('id', contratId).maybeSingle()
      if (!c) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
      if (c.ecole_id !== ecoleId) {
        return NextResponse.json({ error: 'Contrat hors de cette école' }, { status: 403 })
      }
    }
    if (documentId) {
      const { data: d } = await sb.from('documents_famille')
        .select('id, ecole_id').eq('id', documentId).maybeSingle()
      if (d && d.ecole_id !== ecoleId) {
        return NextResponse.json({ error: 'Document hors de cette école' }, { status: 403 })
      }
    }

    const integration = await getIntegration(ecoleId, 'yousign')
    if (!integration) return NextResponse.json({ error: 'YouSign non activé' }, { status: 400 })
    const apiKey = integration.secrets.api_key
    if (!apiKey) return NextResponse.json({ error: 'Clé API YouSign manquante' }, { status: 400 })

    const pdfBytes = Buffer.from(pdfBase64, 'base64')

    const result = await createSignatureRequest({
      apiKey,
      mode: integration.mode,
      documentPdfBytes: new Uint8Array(pdfBytes),
      documentFilename: `${documentType}_${(contratId || documentId || 'doc').slice(0, 8)}.pdf`,
      signerEmail,
      signerFirstName: signerFirstName || '',
      signerLastName: signerLastName || '',
      delivery: deliveryEmail === false ? 'none' : 'email',
      externalId: contratId || documentId,
    })

    const { data: row } = await sb.from('signatures_electroniques').insert({
      ecole_id: ecoleId,
      document_type: documentType,
      document_id: documentId || null,
      contrat_id: contratId || null,
      famille_id: caller?.famille_id || null,
      profile_id: user.id,
      signataire_email: signerEmail,
      signataire_nom: [signerFirstName, signerLastName].filter(Boolean).join(' ') || null,
      provider: 'yousign',
      provider_request_id: result.requestId,
      provider_signer_id: result.signerId,
      provider_signature_url: result.signatureUrl || null,
      statut: 'sent',
      metadata: { delivery: deliveryEmail === false ? 'none' : 'email' },
    }).select('id').single()

    return NextResponse.json({
      success: true,
      signatureId: row?.id,
      requestId: result.requestId,
      signatureUrl: result.signatureUrl,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur signature' }, { status: 500 })
  }
}
