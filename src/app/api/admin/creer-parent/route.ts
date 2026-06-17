import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

/**
 * Crée un compte parent et envoie un email de bienvenue avec lien magique.
 *
 * Workflow :
 *  1. Vérifie que le caller est admin/super_admin
 *  2. Crée le compte Supabase Auth (ou récupère l'existant)
 *  3. Crée/met à jour le profil parent
 *  4. Génère un lien magique Supabase (recovery / signup link) — valide 24h
 *  5. Charge le template "Bienvenue parent" depuis email_templates
 *  6. Remplace les variables ({{prenom_parent1}}, {{lien_magique}}, etc.)
 *  7. Envoie via sendEmail (Brevo si configuré, SMTP sinon)
 *  8. Log dans email_logs
 *
 * Body : { email, password, familleId, ecoleId, parentSlot, envoyerEmail? }
 * envoyerEmail = false permet de skipper l'envoi si l'admin ne veut pas (par défaut true).
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password, familleId, ecoleId, parentSlot, envoyerEmail } = await req.json()
    const slot = parentSlot === 'parent2' ? 'parent2' : 'parent1'
    const doSendEmail = envoyerEmail !== false // par défaut true

    if (!email || !password || !familleId || !ecoleId) {
      return NextResponse.json({ error: 'Tous les champs sont obligatoires' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérifier que l'appelant est admin/super_admin
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single()

    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Vérifier si un compte existe déjà avec cet email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(u => u.email === email)

    let userId: string
    let estNouveau = false

    if (existing) {
      // Le compte existe déjà — on met juste à jour le profil
      const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
        id: existing.id,
        role: 'parent',
        famille_id: familleId,
        ecole_id: ecoleId,
        parent_slot: slot,
      })
      if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })
      userId = existing.id
    } else {
      // Créer le compte
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 500 })
      }

      // Créer le profil parent lié à la famille
      const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
        id: newUser.user.id,
        role: 'parent',
        famille_id: familleId,
        ecole_id: ecoleId,
        parent_slot: slot,
      })
      if (profileErr) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return NextResponse.json({ error: profileErr.message }, { status: 500 })
      }
      userId = newUser.user.id
      estNouveau = true
    }

    // Log admin (toujours)
    await supabaseAdmin.from('admin_logs').insert({
      admin_id: caller.id,
      ecole_id: ecoleId,
      action: estNouveau ? 'parent_cree' : 'parent_relie',
      details: { email, famille_id: familleId },
    })

    // ─────────────────────────────────────────────
    // Envoi email de bienvenue (lien magique)
    // ─────────────────────────────────────────────
    let emailResult: { ok: boolean; canal?: string; error?: string } = { ok: false, error: 'non tenté' }

    if (doSendEmail) {
      try {
        // 1. Générer le lien magique
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery', // l'utilisateur définit son mot de passe via le flow recovery
          email,
        })
        const lienMagique = linkData?.properties?.action_link || ''
        if (linkErr || !lienMagique) {
          emailResult = { ok: false, error: linkErr?.message || 'Lien magique non généré' }
        } else {
          // 2. Charger le template "Bienvenue parent"
          const { data: tpl } = await supabaseAdmin
            .from('email_templates')
            .select('id, sujet, contenu_html')
            .eq('nom', 'Bienvenue parent')
            .eq('actif', true)
            .maybeSingle()

          if (!tpl) {
            emailResult = { ok: false, error: 'Template "Bienvenue parent" introuvable' }
          } else {
            // 3. Charger les infos famille pour les variables
            const { data: famille } = await supabaseAdmin
              .from('familles')
              .select('nom, parent1_prenom, nom_parent1:parent1_nom, parent2_prenom')
              .eq('id', familleId)
              .maybeSingle()

            const variables: Record<string, string> = {
              '{{lien_magique}}': lienMagique,
              '{{nom_famille}}': famille?.nom || '',
              '{{prenom_parent1}}': (famille as any)?.parent1_prenom || (slot === 'parent2' ? '' : ''),
              '{{nom_parent1}}': (famille as any)?.nom_parent1 || '',
              '{{prenom_parent2}}': (famille as any)?.parent2_prenom || '',
            }

            const remplacer = (s: string) => {
              let out = s
              for (const [k, v] of Object.entries(variables)) {
                out = out.split(k).join(v)
              }
              return out
            }

            const sujet = remplacer(tpl.sujet)
            const html = remplacer(tpl.contenu_html)

            // 4. Envoyer
            emailResult = await sendEmail({
              to: { email },
              subject: sujet,
              html,
            })

            // 5. Logger dans email_logs
            await supabaseAdmin.from('email_logs').insert({
              template_id: tpl.id,
              famille_id: familleId,
              destinataire: email,
              sujet,
              statut: emailResult.ok ? 'envoye' : 'echec',
              erreur: emailResult.ok ? null : (emailResult.error || 'inconnu').slice(0, 500),
              envoye_par: caller.id,
              date_envoi: new Date().toISOString(),
            })
          }
        }
      } catch (e: any) {
        emailResult = { ok: false, error: e?.message || 'Erreur inattendue envoi email' }
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      existed: !estNouveau,
      message: estNouveau
        ? `Compte parent créé pour ${email}`
        : `Compte existant lié à la famille`,
      email: {
        envoye: emailResult.ok,
        canal: emailResult.canal,
        erreur: emailResult.ok ? undefined : emailResult.error,
      },
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
