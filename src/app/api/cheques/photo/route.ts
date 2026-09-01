import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * kkkk5 (01/09/2026) — Photos de chèques (réception avant remise en banque).
 *  POST multipart { chequeId, face: 'recto' | 'verso', fichier } -> upload dans le
 *       bucket privé 'cheques', chemin stocké sur cheques_prevus, URL signée renvoyée
 *  GET  ?chequeId=<uuid> -> URLs signées (1 h) des deux faces
 * Autorisé aux comptes back-office (admin / agent / super_admin) de l'école du chèque.
 */

const MAX_OCTETS = 12 * 1024 * 1024

async function contexte(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { err: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: { user } } = await sb.auth.getUser(token)
  if (!user) return { err: NextResponse.json({ error: 'Token invalide' }, { status: 401 }) }
  const { data: profil } = await sb.from('profiles').select('role, ecole_id').eq('id', user.id).single()
  if (!profil || !['admin', 'agent', 'super_admin'].includes(profil.role)) {
    return { err: NextResponse.json({ error: 'Accès réservé au back-office' }, { status: 403 }) }
  }
  return { sb, user, profil }
}

async function chequeAutorise(sb: any, profil: any, chequeId: string) {
  const { data: chq } = await sb.from('cheques_prevus')
    .select('id, ecole_id, photo_recto_path, photo_verso_path').eq('id', chequeId).maybeSingle()
  if (!chq) return null
  if (profil.role !== 'super_admin' && chq.ecole_id !== profil.ecole_id) return null
  return chq
}

async function urlsSignees(sb: any, chq: any) {
  const out: { recto: string | null; verso: string | null } = { recto: null, verso: null }
  for (const face of ['recto', 'verso'] as const) {
    const path = chq[`photo_${face}_path`]
    if (path) {
      const { data } = await sb.storage.from('cheques').createSignedUrl(path, 3600)
      out[face] = data?.signedUrl || null
    }
  }
  return out
}

export async function GET(req: NextRequest) {
  const ctx = await contexte(req)
  if ('err' in ctx) return ctx.err
  const chequeId = req.nextUrl.searchParams.get('chequeId') || ''
  const chq = await chequeAutorise(ctx.sb, ctx.profil, chequeId)
  if (!chq) return NextResponse.json({ error: 'Chèque introuvable' }, { status: 404 })
  return NextResponse.json({ ok: true, photos: await urlsSignees(ctx.sb, chq) })
}

export async function POST(req: NextRequest) {
  const ctx = await contexte(req)
  if ('err' in ctx) return ctx.err
  const { sb, profil } = ctx
  const form = await req.formData()
  const chequeId = String(form.get('chequeId') || '')
  const face = String(form.get('face') || '')
  const file = form.get('fichier') as File | null
  if (!chequeId || !['recto', 'verso'].includes(face) || !file) {
    return NextResponse.json({ error: 'Paramètres manquants (chequeId, face, fichier)' }, { status: 400 })
  }
  if (file.size > MAX_OCTETS) return NextResponse.json({ error: 'Photo trop lourde (12 Mo max)' }, { status: 400 })
  if (!(file.type || '').startsWith('image/')) return NextResponse.json({ error: 'Le fichier doit être une image' }, { status: 400 })

  const chq = await chequeAutorise(sb, profil, chequeId)
  if (!chq) return NextResponse.json({ error: 'Chèque introuvable' }, { status: 404 })

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${chq.ecole_id}/${chq.id}-${face}-${Date.now()}.${ext}`
  const buffer = await file.arrayBuffer()
  const { error: upErr } = await sb.storage.from('cheques')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: 'Envoi échoué : ' + upErr.message }, { status: 500 })

  // Remplace l'ancienne photo de cette face
  const ancien = chq[`photo_${face}_path`]
  if (ancien) await sb.storage.from('cheques').remove([ancien])
  const { error: majErr } = await sb.from('cheques_prevus')
    .update({ [`photo_${face}_path`]: path }).eq('id', chq.id)
  if (majErr) return NextResponse.json({ error: majErr.message }, { status: 500 })

  const maj = { ...chq, [`photo_${face}_path`]: path }
  return NextResponse.json({ ok: true, photos: await urlsSignees(sb, maj) })
}
