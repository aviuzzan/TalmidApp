import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

/**
 * iiii5 — Fiche de bienvenue PUBLIQUE (le token secret du lien fait office
 * d'authentification, comme le lien magique d'inscription).
 *  GET  : état de la fiche (nom, produit, statut, données, fichiers sans chemins)
 *  POST JSON      { donnees, action: 'brouillon' | 'soumettre' }
 *  POST multipart { fichier, champ: logo | familles | grille | document }
 * Une fiche validée par TalmidApp n'est plus modifiable.
 */

const sbAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const CHAMPS_FICHIER = ['logo', 'familles', 'grille', 'document'] as const
const MAX_OCTETS = 10 * 1024 * 1024
const EXT_OK = /\.(png|jpe?g|webp|svg|csv|xlsx|xls|pdf|docx?|odt)$/i

async function charger(token: string) {
  const sb = sbAdmin()
  const { data } = await sb.from('onboarding_ecoles').select('*').eq('token', token).maybeSingle()
  return { sb, fiche: data }
}

function fichiersPublics(fiche: any) {
  return ((fiche.fichiers || []) as any[]).map(f => ({ champ: f.champ, nom: f.nom, taille: f.taille }))
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { fiche } = await charger(params.token)
  if (!fiche) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
  return NextResponse.json({
    ok: true,
    nom_ecole: fiche.nom_ecole,
    produit: fiche.produit,
    statut: fiche.statut,
    donnees: fiche.donnees || {},
    fichiers: fichiersPublics(fiche),
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { sb, fiche } = await charger(params.token)
  if (!fiche) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
  if (fiche.statut === 'valide') {
    return NextResponse.json({ error: 'Cette fiche a été validée par TalmidApp et n\'est plus modifiable. Contactez-nous pour toute correction.' }, { status: 403 })
  }

  const contentType = req.headers.get('content-type') || ''

  // ---- Upload de fichier ----
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('fichier') as File | null
    const champ = String(form.get('champ') || '')
    if (!file || !CHAMPS_FICHIER.includes(champ as any)) {
      return NextResponse.json({ error: 'Fichier ou champ manquant' }, { status: 400 })
    }
    if (file.size > MAX_OCTETS) return NextResponse.json({ error: 'Fichier trop volumineux (10 Mo maximum)' }, { status: 400 })
    if (!EXT_OK.test(file.name)) return NextResponse.json({ error: 'Type de fichier non accepté (images, PDF, Word, Excel/CSV)' }, { status: 400 })

    const nomSur = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
    const path = `${fiche.token}/${champ}-${Date.now()}-${nomSur}`
    const buffer = await file.arrayBuffer()
    const { error: upErr } = await sb.storage.from('onboarding')
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) return NextResponse.json({ error: 'Envoi du fichier échoué : ' + upErr.message }, { status: 500 })

    // logo / familles / grille : un seul fichier, le nouveau remplace l'ancien ; document : cumulable
    let fichiers = (fiche.fichiers || []) as any[]
    if (champ !== 'document') {
      const ancien = fichiers.find(f => f.champ === champ)
      if (ancien?.path) await sb.storage.from('onboarding').remove([ancien.path])
      fichiers = fichiers.filter(f => f.champ !== champ)
    }
    fichiers.push({ champ, nom: file.name, path, taille: file.size, type: file.type || null })
    const { error: majErr } = await sb.from('onboarding_ecoles').update({ fichiers }).eq('id', fiche.id)
    if (majErr) return NextResponse.json({ error: majErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, fichiers: fichiersPublics({ fichiers }) })
  }

  // ---- Sauvegarde / soumission JSON ----
  const body = await req.json()
  const donnees = body?.donnees
  if (!donnees || typeof donnees !== 'object') return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })
  const soumettre = body.action === 'soumettre'
  const patch: Record<string, any> = { donnees }
  if (soumettre) { patch.statut = 'soumis'; patch.soumis_le = new Date().toISOString() }
  const { error } = await sb.from('onboarding_ecoles').update(patch).eq('id', fiche.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (soumettre) {
    try {
      const nb = ((fiche.fichiers || []) as any[]).length
      await sendEmail({
        to: 'admin@talmidapp.fr',
        subject: `Fiche de bienvenue soumise — ${fiche.nom_ecole}`,
        html: `<p>La fiche de bienvenue de <b>${fiche.nom_ecole}</b> (${fiche.produit}) vient d'être soumise.</p>`
          + `<p>${nb} fichier(s) joint(s). À examiner et valider dans le portail super admin &gt; Fiches de bienvenue.</p>`,
        replyTo: (donnees?.etab?.email_contact || undefined),
      })
    } catch (e) { console.error('[onboarding] email notification:', (e as any)?.message) }
  }
  return NextResponse.json({ ok: true, statut: soumettre ? 'soumis' : fiche.statut })
}
