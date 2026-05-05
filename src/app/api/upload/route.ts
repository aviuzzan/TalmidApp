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

    if (!file || !familleId) {
      return NextResponse.json({ error: 'Fichier et familleId requis' }, { status: 400 })
    }

    // Upload dans le bucket
    const ext = file.name.split('.').pop()
    const path = `${familleId}/${demandeId || 'temp'}/${Date.now()}_${file.name}`
    const buffer = await file.arrayBuffer()

    const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
      .from('dossiers')
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

    // URL signée valable 1 an
    const { data: { signedUrl } } = await supabaseAdmin.storage
      .from('dossiers')
      .createSignedUrl(path, 365 * 24 * 3600)

    // Enregistrer en base si demandeId fourni
    if (demandeId) {
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
