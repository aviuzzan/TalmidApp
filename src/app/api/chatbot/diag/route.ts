/**
 * Route diagnostic chatbot : liste les modeles disponibles pour la cle Google AI.
 * GET /api/chatbot/diag
 * Header: Authorization: Bearer <token>  (super_admin uniquement)
 *
 * FIX secu cccc4 (M13) : l'endpoint etait public. Il consomme le quota
 * GOOGLE_AI_API_KEY et expose la liste des modeles accessibles a la cle, ce qui
 * n'a rien a faire en production sans authentification. Il est desormais
 * reserve au super_admin, comme un outil d'exploitation.
 */
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: { user } } = await sb.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_AI_API_KEY manquante' }, { status: 500 })

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (!resp.ok) {
      const txt = await resp.text()
      return NextResponse.json({ status: resp.status, raw: txt }, { status: resp.status })
    }
    const data = await resp.json()
    // Filtre uniquement ceux qui supportent generateContent
    const generateModels = (data?.models || [])
      .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => ({
        name: m.name,
        displayName: m.displayName,
        version: m.version,
        inputTokenLimit: m.inputTokenLimit,
      }))
    return NextResponse.json({
      total: data?.models?.length || 0,
      generateContentModels: generateModels,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
