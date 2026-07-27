import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    const demandeId = formData.get('demandeId') as string
    const familleId = formData.get('familleId') as string
    const configId = formData.get('configId') as string | null
    const label = formData.get('label') as string
    const target = formData.get('target') as string | null
    const enfantId = formData.get('enfantId') as string | null

    if (!file || !familleId) {
      return NextResponse.json({ error: 'Fichier et familleId requis' }, { status: 400 })
    }

    // FIX secu 27/07 : vérifier que l'appelant a le droit d'uploader pour cette famille
    // - parent : uniquement sa propre famille
    // - admin/agent : uniquement une famille de son école
    // - super_admin : ok
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role, ecole_id, famille_id').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 })
    // FIX secu 27/07 : cas "document école" — familleId synthétique 'doc-ecole-<ecoleId>'
    // (voir DocumentsEcoleTab) : pas de famille à vérifier, réservé aux admins de l'école ciblée
    const isDocEcole = typeof familleId === 'string' && familleId.startsWith('doc-ecole-')
    if (isDocEcole) {
      const ecoleCibleId = familleId.slice('doc-ecole-'.length)
      if (!['admin', 'super_admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
      if (profile.role !== 'super_admin' && profile.ecole_id !== ecoleCibleId) {
        return NextResponse.json({ error: 'Accès refusé à cette école' }, { status: 403 })
      }
    } else if (profile.role === 'parent') {
      if (profile.famille_id !== familleId) {
        return NextResponse.json({ error: 'Accès refusé à cette famille' }, { status: 403 })
      }
    } else if (profile.role !== 'super_admin') {
      const { data: fam } = await supabaseAdmin
        .from('familles').select('ecole_id').eq('id', familleId).single()
      if (!fam || fam.ecole_id !== profile.ecole_id) {
        return NextResponse.json({ error: 'Accès refusé à cette famille' }, { status: 403 })
      }
    }

    // FIX secu 27/07 : taille max 10 Mo
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, { status: 413 })
    }
    // FIX secu 27/07 : whitelist MIME (pdf, jpeg, png, webp, heic)
    const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
    // FIX secu 27/07 : les documents école (upload admin) acceptent aussi le .docx,
    // aligné sur l'accept de l'UI DocumentsEcoleTab (.pdf,.jpg,.jpeg,.png,.webp,.docx)
    if (isDocEcole) {
      ALLOWED_MIME.push('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ error: 'Type de fichier non autorisé (PDF, JPEG, PNG, WebP, HEIC uniquement)' }, { status: 415 })
    }
    // FIX secu 27/07 : sanitisation du nom de fichier (évite path traversal / caractères spéciaux)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)

    // Upload dans le bucket
    const path = `${familleId}/${demandeId || enfantId || 'temp'}/${Date.now()}_${safeName}`
    const buffer = await file.arrayBuffer()

    const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
      .from('dossiers')
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

    // URL signée valable 1 an
    const signedUrlResult = await supabaseAdmin.storage
      .from('dossiers')
      .createSignedUrl(path, 365 * 24 * 3600)
    const signedUrl = signedUrlResult.data?.signedUrl || ''

    // Enregistrer en base selon la cible
    if (target === 'inscription' && enfantId) {
      await supabaseAdmin.from('inscription_documents_uploaded').insert({
        enfant_id: enfantId,
        famille_id: familleId,
        config_id: configId || null,
        label: label || file.name,
        nom_fichier: file.name,
        url: signedUrl || '',
        taille_ko: Math.round(file.size / 1024),
      })
    } else if (demandeId) {
      await supabaseAdmin.from('reduction_documents_uploaded').insert({
        demande_id: demandeId,
        famille_id: familleId,
        config_id: configId || null,
        label: label || file.name,
        nom_fichier: file.name,
        url: signedUrl || '',
        taille_ko: Math.round(file.size / 1024),
      })
    }

    return NextResponse.json({
      success: true,
      path,
      url: signedUrl,
      nom: file.name,
      taille_ko: Math.round(file.size / 1024),
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
