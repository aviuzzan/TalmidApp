import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/recherche-ecole?q=...  (aaaa2 — public, sans auth)
 * Suggestions du bouton « Se connecter » des vitrines (style Jotform).
 * N'expose VOLONTAIREMENT que nom/slug/ville des écoles ACTIVES, 8 résultats
 * max, et seulement à partir de 2 caractères — pas de listing complet possible
 * en une requête, et aucune donnée sensible (pas d'emails, pas d'effectifs).
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2 || q.length > 80) return NextResponse.json({ ecoles: [] })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Echappement des jokers ilike pour que « % » ou « _ » tapés soient litteraux
  const motif = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'
  const { data, error } = await sb
    .from('ecoles')
    .select('nom, slug, ville')
    .eq('actif', true)
    .ilike('nom', motif)
    .order('nom')
    .limit(8)
  if (error) return NextResponse.json({ ecoles: [] })
  return NextResponse.json({ ecoles: data || [] })
}
