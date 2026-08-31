import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * iiii5 — Fiches de bienvenue (onboarding des nouvelles écoles).
 * Super-admin uniquement.
 *  GET            : liste des fiches (avec token pour recopier le lien)
 *  GET ?id=<uuid> : détail d'une fiche + URLs signées des fichiers (1 h)
 *  POST           : { nomEcole, produit, emailDestinataire? } -> crée la fiche, retourne l'URL publique
 *  PATCH          : { id, action: 'valider' | 'rouvrir' } ou { id, notesAdmin }
 */

async function superAdmin(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { err: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: { user } } = await sb.auth.getUser(token)
  if (!user) return { err: NextResponse.json({ error: 'Token invalide' }, { status: 401 }) }
  const { data: caller } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'super_admin') return { err: NextResponse.json({ error: 'Super-admin uniquement' }, { status: 403 }) }
  return { sb, user }
}

export async function GET(req: NextRequest) {
  const ctx = await superAdmin(req)
  if ('err' in ctx) return ctx.err
  const { sb } = ctx
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const { data: fiche, error } = await sb.from('onboarding_ecoles').select('*').eq('id', id).single()
    if (error || !fiche) return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })
    const fichiers = []
    for (const f of (fiche.fichiers || []) as any[]) {
      const { data: signed } = await sb.storage.from('onboarding').createSignedUrl(f.path, 3600)
      fichiers.push({ ...f, url: signed?.signedUrl || null })
    }
    return NextResponse.json({ ok: true, fiche: { ...fiche, fichiers } })
  }
  const { data, error } = await sb.from('onboarding_ecoles')
    .select('id, token, nom_ecole, produit, email_destinataire, statut, created_at, soumis_le, valide_le')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, fiches: data || [] })
}

export async function POST(req: NextRequest) {
  const ctx = await superAdmin(req)
  if ('err' in ctx) return ctx.err
  const { sb, user } = ctx
  const body = await req.json()
  const nomEcole = (body.nomEcole || '').trim()
  const produit = body.produit === 'yeter' ? 'yeter' : 'talmidapp'
  if (!nomEcole) return NextResponse.json({ error: 'Nom de l\'établissement requis' }, { status: 400 })
  const token = crypto.randomBytes(24).toString('base64url')
  const { data, error } = await sb.from('onboarding_ecoles').insert({
    token,
    nom_ecole: nomEcole,
    produit,
    email_destinataire: (body.emailDestinataire || '').trim() || null,
    cree_par: user.id,
  }).select('id, token').single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Création échouée' }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id, url: `https://www.talmidapp.fr/bienvenue/${data.token}` })
}

export async function PATCH(req: NextRequest) {
  const ctx = await superAdmin(req)
  if ('err' in ctx) return ctx.err
  const { sb } = ctx
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const patch: Record<string, any> = {}
  if (body.action === 'valider') { patch.statut = 'valide'; patch.valide_le = new Date().toISOString() }
  else if (body.action === 'rouvrir') { patch.statut = 'soumis'; patch.valide_le = null }
  if (typeof body.notesAdmin === 'string') patch.notes_admin = body.notesAdmin
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  const { error } = await sb.from('onboarding_ecoles').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
