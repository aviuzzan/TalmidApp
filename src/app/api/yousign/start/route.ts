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
    const isAdmin = ['admin', 'super_admin'].includes(caller?.role)
    if (!isAdmin && caller?.ecole_id !== ecoleId) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
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
