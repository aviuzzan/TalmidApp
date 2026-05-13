import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { saveIntegration, getIntegrationMeta, deleteIntegration, type ProviderName } from '@/lib/integrations'

/**
 * GET  /api/admin/integrations?ecoleId=...&provider=stripe
 * POST /api/admin/integrations  body { ecoleId, provider, actif?, mode?, publicConfig?, secrets? }
 * DELETE /api/admin/integrations?ecoleId=...&provider=stripe
 *
 * Admin uniquement, scope sur l'école. Les secrets sont chiffrés avant stockage.
 */

async function checkAdmin(req: NextRequest, ecoleId: string): Promise<{ ok: boolean; userId?: string; error?: string; status?: number }> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { ok: false, error: 'Non autorisé', status: 401 }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: { user } } = await sb.auth.getUser(token)
  if (!user) return { ok: false, error: 'Token invalide', status: 401 }
  const { data: p } = await sb.from('profiles').select('role, ecole_id').eq('id', user.id).single()
  if (!['admin', 'super_admin'].includes(p?.role)) return { ok: false, error: 'Accès refusé', status: 403 }
  if (p?.role === 'admin' && p.ecole_id !== ecoleId) return { ok: false, error: 'Accès refusé à cette école', status: 403 }
  return { ok: true, userId: user.id }
}

const ALLOWED_PROVIDERS = ['stripe', 'gocardless', 'brevo_sms', 'brevo_email', 'twilio', 'yousign']

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const ecoleId = url.searchParams.get('ecoleId')
  const provider = url.searchParams.get('provider') as ProviderName | null
  if (!ecoleId || !provider) return NextResponse.json({ error: 'ecoleId et provider requis' }, { status: 400 })
  if (!ALLOWED_PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Provider inconnu' }, { status: 400 })

  const auth = await checkAdmin(req, ecoleId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const meta = await getIntegrationMeta(ecoleId, provider)
  return NextResponse.json({ integration: meta })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ecoleId, provider, actif, mode, publicConfig, secrets } = body
    if (!ecoleId || !provider) return NextResponse.json({ error: 'ecoleId et provider requis' }, { status: 400 })
    if (!ALLOWED_PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Provider inconnu' }, { status: 400 })

    const auth = await checkAdmin(req, ecoleId)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const res = await saveIntegration({
      ecoleId,
      provider: provider as ProviderName,
      actif,
      mode,
      publicConfig,
      secrets,
    })
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const ecoleId = url.searchParams.get('ecoleId')
  const provider = url.searchParams.get('provider') as ProviderName | null
  if (!ecoleId || !provider) return NextResponse.json({ error: 'ecoleId et provider requis' }, { status: 400 })
  if (!ALLOWED_PROVIDERS.includes(provider)) return NextResponse.json({ error: 'Provider inconnu' }, { status: 400 })

  const auth = await checkAdmin(req, ecoleId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  await deleteIntegration(ecoleId, provider)
  return NextResponse.json({ success: true })
}
