import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/creer-ecole
 * Super-admin uniquement.
 * Body: { nom, slug, adminEmail, adminPrenom, adminNom, adminTelephone?, codeUai?, siren? }
 *
 * Crée :
 *  1. L'école (table ecoles)
 *  2. Un exercice par défaut (année courante)
 *  3. L'admin principal (auth.users + profiles + permissions_modules)
 *  4. Envoie un email d'invitation à l'admin
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nom, slug, adminEmail, adminPrenom, adminNom, adminTelephone, codeUai, siren, adresse, codePostal, ville,
            couleurPrimaire, emailContact, telephone, plan, notesAdmin } = body
    if (!nom || !slug || !adminEmail || !adminPrenom || !adminNom) {
      return NextResponse.json({ error: 'nom, slug, adminEmail, adminPrenom, adminNom requis' }, { status: 400 })
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: 'Le slug doit contenir uniquement minuscules, chiffres et tirets' }, { status: 400 })
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
    const { data: caller } = await sb.from('profiles').select('role').eq('id', user.id).single()
    if (caller?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Super-admin uniquement' }, { status: 403 })
    }

    // Vérif unicité slug
    const { data: dejaExistant } = await sb.from('ecoles').select('id').eq('slug', slug).maybeSingle()
    if (dejaExistant) return NextResponse.json({ error: `Slug ${slug} déjà utilisé` }, { status: 400 })

    // 1. Création école
    const { data: ecole, error: ecoleErr } = await sb.from('ecoles').insert({
      nom, slug,
      code_uai: codeUai || null,
      siren: siren || null,
      adresse: adresse || null,
      code_postal: codePostal || null,
      ville: ville || null,
      couleur_primaire: couleurPrimaire || '#2563EB',
      email_contact: emailContact || adminEmail || null,
      telephone: telephone || null,
      plan: plan || 'pro',
      notes_admin: notesAdmin || null,
      actif: true,
      date_debut_abonnement: new Date().toISOString().slice(0, 10),
    }).select().single()
    if (ecoleErr || !ecole) {
      return NextResponse.json({ error: ecoleErr?.message || 'Erreur création école' }, { status: 500 })
    }

    // 2. Exercice par défaut (année courante)
    const now = new Date()
    const yStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
    const exerciceCode = `${yStart}-${yStart + 1}`
    await sb.from('exercices').insert({
      ecole_id: ecole.id,
      code: exerciceCode,
      libelle: `Année scolaire ${exerciceCode}`,
      date_debut: `${yStart}-09-01`,
      date_fin: `${yStart + 1}-08-31`,
      actif: true,
    })

    // 3. Création admin via inviteUserByEmail
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const { data: invited, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(adminEmail, {
      redirectTo: `${baseUrl}/auth/set-password?invited=1&ecole=${slug}`,
      data: { role: 'admin', ecole_id: ecole.id, prenom: adminPrenom, nom: adminNom },
    })

    let adminUserId: string | null = null
    if (inviteErr) {
      // Si l'user existe déjà, on le trouve
      const { data: existingList } = await sb.auth.admin.listUsers()
      const existing = existingList?.users?.find((u: any) => u.email?.toLowerCase() === adminEmail.toLowerCase())
      if (existing) adminUserId = existing.id
    } else if (invited?.user) {
      adminUserId = invited.user.id
    }

    if (!adminUserId) {
      return NextResponse.json({
        error: 'École créée mais admin non invité : ' + (inviteErr?.message || 'erreur inconnue'),
        ecoleId: ecole.id,
      }, { status: 500 })
    }

    // 4. Profile admin
    await sb.from('profiles').upsert({
      id: adminUserId,
      role: 'admin',
      ecole_id: ecole.id,
      prenom: adminPrenom,
      nom: adminNom,
      telephone: adminTelephone || null,
      email: adminEmail,
    })

    // 5. Permissions admin principal (toutes au max)
    const modules = ['administratif', 'inscriptions', 'facturation', 'compta', 'paye', 'pedagogie', 'professeurs', 'emplois_du_temps', 'transport', 'cantine', 'messagerie', 'documents', 'parametres']
    const rows = modules.map(code => ({
      profile_id: adminUserId,
      ecole_id: ecole.id,
      module_code: code,
      niveau: 'admin',
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }))
    await sb.from('permissions_modules').upsert(rows)

    return NextResponse.json({
      success: true,
      ecole: { id: ecole.id, nom: ecole.nom, slug: ecole.slug },
      adminId: adminUserId,
      message: `École ${nom} créée. Email d'invitation envoyé à ${adminEmail}.`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}
