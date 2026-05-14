import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Traitement d'une demande d'inscription par l'admin.
 * action 'accepter' :
 *   - cree la famille + l'enfant + la fiche inscriptions_pedagogiques
 *   - cree le compte parent (auth user + profile) facon "invitation prof"
 *   - envoie un email d'acces a l'espace famille
 *   - passe la demande en statut 'accepte'
 * action 'refuser' :
 *   - passe la demande en statut 'refuse' (+ motif), email d'information optionnel
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function buildAccesEmail(prenom: string, ecoleNom: string, link: string): string {
  const p = escapeHtml(prenom || '')
  const e = escapeHtml(ecoleNom)
  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Bienvenue</title></head>',
    '<body style="margin:0;padding:0;background:#F0F4FA;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1E293B;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F0F4FA;padding:32px 16px;"><tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);">',
    '<tr><td style="padding:36px 36px 8px;">',
    '<div style="font-size:14px;color:#64748B;margin-bottom:6px;">' + e + '</div>',
    '<h1 style="font-size:24px;font-weight:700;color:#1E293B;margin:0 0 16px;">Bonjour ' + p + ',</h1>',
    '<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 14px;">Bonne nouvelle : votre demande d\'inscription a ete acceptee par <strong>' + e + '</strong>.</p>',
    '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 22px;">Activez votre <strong>espace famille</strong> pour suivre le dossier de votre enfant, finaliser le contrat de scolarisation et acceder a vos documents. Cliquez sur le bouton ci-dessous et choisissez votre mot de passe.</p>',
    '<div style="text-align:center;margin:30px 0;"><a href="' + link + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Activer mon espace famille</a></div>',
    '<p style="font-size:13px;line-height:1.6;color:#64748B;margin:0 0 6px;">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</p>',
    '<p style="font-size:12px;color:#94A3B8;word-break:break-all;margin:0 0 22px;">' + link + '</p>',
    '<p style="font-size:14px;line-height:1.6;color:#1E293B;margin:0;font-weight:600;">L\'equipe ' + e + '</p>',
    '</td></tr>',
    '<tr><td style="padding:18px 36px 28px;border-top:1px solid #F1F5F9;background:#FAFAFB;">',
    '<p style="font-size:11px;color:#94A3B8;line-height:1.5;margin:0;">Ce message fait suite a votre demande d\'inscription aupres de ' + e + '.</p>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join('')
}

function buildRefusEmail(prenom: string, ecoleNom: string, motif: string): string {
  const p = escapeHtml(prenom || '')
  const e = escapeHtml(ecoleNom)
  const m = motif ? escapeHtml(motif) : ''
  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Demande d\'inscription</title></head>',
    '<body style="margin:0;padding:0;background:#F0F4FA;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1E293B;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F0F4FA;padding:32px 16px;"><tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);">',
    '<tr><td style="padding:36px 36px 28px;">',
    '<div style="font-size:14px;color:#64748B;margin-bottom:6px;">' + e + '</div>',
    '<h1 style="font-size:22px;font-weight:700;color:#1E293B;margin:0 0 16px;">Bonjour ' + p + ',</h1>',
    '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 14px;">Nous vous remercions de l\'interet que vous portez a <strong>' + e + '</strong>. Apres examen, nous ne sommes pas en mesure de donner une suite favorable a votre demande d\'inscription pour le moment.</p>',
    m ? '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 14px;">' + m + '</p>' : '',
    '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 14px;">Pour toute question, n\'hesitez pas a contacter l\'administration de l\'etablissement.</p>',
    '<p style="font-size:14px;line-height:1.6;color:#1E293B;margin:0;font-weight:600;">L\'equipe ' + e + '</p>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join('')
}

/**
 * Normalise la situation maritale vers les valeurs autorisees par la
 * contrainte familles_situation_maritale_check :
 * marie | celibataire | divorce | veuf | separe | non_connu (ou null).
 */
function normalizeSituation(v: any): string | null {
  if (!v) return null
  const s = String(v).toLowerCase().trim()
  const map: Record<string, string> = {
    marie: 'marie', maries: 'marie', 'marie(e)': 'marie',
    celibataire: 'celibataire',
    divorce: 'divorce', divorces: 'divorce', 'divorce(e)': 'divorce',
    veuf: 'veuf', veuve: 'veuf',
    separe: 'separe', separes: 'separe', 'separe(e)': 'separe',
    pacses: 'non_connu', union_libre: 'non_connu', non_connu: 'non_connu',
  }
  return map[s] || null
}

export async function POST(req: NextRequest) {
  try {
    const { demandeId, action, motif } = await req.json()
    if (!demandeId || !['accepter', 'refuser'].includes(action)) {
      return NextResponse.json({ error: 'demandeId et action (accepter|refuser) requis' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authToken)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role, ecole_id').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { data: demande } = await supabaseAdmin
      .from('demandes_inscription').select('*').eq('id', demandeId).single()
    if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
    if (callerProfile?.role === 'admin' && callerProfile?.ecole_id !== demande.ecole_id) {
      return NextResponse.json({ error: 'Acces refuse a cette ecole' }, { status: 403 })
    }
    if (demande.statut !== 'en_attente') {
      return NextResponse.json({ error: 'Cette demande n\'est pas en attente de traitement.' }, { status: 409 })
    }

    const { data: ecoleRec } = await supabaseAdmin
      .from('ecoles').select('nom').eq('id', demande.ecole_id).single()
    const ecoleNom = ecoleRec?.nom || 'votre ecole'

    // ---------- REFUS ----------
    if (action === 'refuser') {
      const { error: updErr } = await supabaseAdmin
        .from('demandes_inscription')
        .update({ statut: 'refuse', motif_refus: motif || null, traite_par: caller.id, traite_le: new Date().toISOString() })
        .eq('id', demandeId)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

      let emailSent = false
      const dest = demande.parent1_email || demande.email_invite
      if (dest && isEmailConfigured()) {
        const r = await sendEmail({
          to: { email: dest },
          subject: 'Votre demande d\'inscription - ' + ecoleNom,
          html: buildRefusEmail(demande.parent1_prenom, ecoleNom, motif),
        })
        emailSent = r.ok
      }
      await supabaseAdmin.from('admin_logs').insert({
        admin_id: caller.id, ecole_id: demande.ecole_id,
        action: 'demande_inscription_refusee', details: { demande_id: demandeId },
      }).then(() => {}, () => {})

      return NextResponse.json({ success: true, statut: 'refuse', emailSent })
    }

    // ---------- ACCEPTATION ----------
    // 1. Famille
    const { data: famille, error: famErr } = await supabaseAdmin
      .from('familles')
      .insert({
        ecole_id: demande.ecole_id,
        nom: demande.nom_famille || demande.parent1_nom || 'Famille',
        email: demande.parent1_email || demande.email_invite || null,
        telephone: demande.parent1_telephone || null,
        statut_dossier: 'en_attente',
        date_creation: new Date().toISOString(),
        situation_maritale: normalizeSituation(demande.situation_maritale),
        parent1_prenom: demande.parent1_prenom || null,
        parent1_nom: demande.parent1_nom || null,
        parent1_email: demande.parent1_email || null,
        parent1_telephone: demande.parent1_telephone || null,
        parent1_emploi: demande.parent1_emploi || null,
        parent1_adresse: demande.parent1_adresse || null,
        parent1_code_postal: demande.parent1_code_postal || null,
        parent1_ville: demande.parent1_ville || null,
        parent2_prenom: demande.parent2_prenom || null,
        parent2_nom: demande.parent2_nom || null,
        parent2_email: demande.parent2_email || null,
        parent2_telephone: demande.parent2_telephone || null,
        parent2_emploi: demande.parent2_emploi || null,
        parent2_adresse: demande.parent2_adresse || null,
        parent2_code_postal: demande.parent2_code_postal || null,
        parent2_ville: demande.parent2_ville || null,
      })
      .select('id')
      .single()
    if (famErr || !famille) {
      return NextResponse.json({ error: 'Erreur creation famille : ' + (famErr?.message || 'inconnue') }, { status: 500 })
    }

    // 2. Enfant
    const { data: enfant, error: enfErr } = await supabaseAdmin
      .from('enfants')
      .insert({
        famille_id: famille.id,
        ecole_id: demande.ecole_id,
        prenom: demande.enfant_prenom || '',
        deuxieme_prenom: demande.enfant_deuxieme_prenom || null,
        nom: demande.enfant_nom || '',
        genre: demande.enfant_genre || null,
        date_naissance: demande.enfant_date_naissance || null,
        lieu_naissance: demande.enfant_lieu_naissance || null,
        annee_scolaire: demande.annee_scolaire,
        exercice_id: demande.exercice_id || null,
        statut_inscription: 'en_attente',
        instruction_religieuse: demande.instruction_religieuse,
        etude_garderie: demande.etude_garderie,
      })
      .select('id')
      .single()
    if (enfErr || !enfant) {
      return NextResponse.json({ error: 'Erreur creation enfant : ' + (enfErr?.message || 'inconnue') }, { status: 500 })
    }

    // 3. Fiche pedagogique
    const { error: pedErr } = await supabaseAdmin
      .from('inscriptions_pedagogiques')
      .insert({
        ecole_id: demande.ecole_id,
        famille_id: famille.id,
        enfant_id: enfant.id,
        annee_scolaire: demande.annee_scolaire,
        exercice_id: demande.exercice_id || null,
        secteur_souhaite_id: demande.secteur_souhaite_id || null,
        classe_souhaitee: demande.classe_souhaitee || null,
        date_entree_souhaitee: demande.date_entree_souhaitee || null,
        deja_scolarise: demande.deja_scolarise,
        etablissement_precedent: demande.etablissement_precedent || null,
        transport: demande.transport,
        instruction_religieuse: demande.instruction_religieuse,
        etude_garderie: demande.etude_garderie,
        signes_particuliers: demande.signes_particuliers || null,
        medecin_nom: demande.medecin_nom || null,
        medecin_telephone: demande.medecin_telephone || null,
        urgence_1_nom: demande.urgence_1_nom || null,
        urgence_1_tel: demande.urgence_1_tel || null,
        urgence_1_lien: demande.urgence_1_lien || null,
        urgence_2_nom: demande.urgence_2_nom || null,
        urgence_2_tel: demande.urgence_2_tel || null,
        urgence_2_lien: demande.urgence_2_lien || null,
        statut: 'accepte',
        soumis_le: demande.soumis_le || new Date().toISOString(),
        valide_par: caller.id,
        valide_le: new Date().toISOString(),
      })
    if (pedErr) {
      return NextResponse.json({ error: 'Erreur creation fiche pedagogique : ' + pedErr.message }, { status: 500 })
    }

    // 4. Compte parent (createUser + generateLink recovery)
    const loginEmail = (demande.parent1_email || demande.email_invite || '').trim()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const redirectTo = baseUrl + '/auth/set-password?invited=1'
    let inviteLink: string | null = null
    let userId: string | null = null

    if (loginEmail) {
      const { data: existingList } = await supabaseAdmin.auth.admin.listUsers()
      const existing = existingList?.users?.find(u => u.email?.toLowerCase() === loginEmail.toLowerCase())
      if (existing) {
        userId = existing.id
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery', email: loginEmail, options: { redirectTo },
        })
        inviteLink = linkData?.properties?.action_link || null
      } else {
        const randomPwd = 'Tmp!' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase()
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: loginEmail, password: randomPwd, email_confirm: true,
          user_metadata: { role: 'parent', ecole_id: demande.ecole_id },
        })
        if (!createErr && created?.user) {
          userId = created.user.id
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery', email: loginEmail, options: { redirectTo },
          })
          inviteLink = linkData?.properties?.action_link || null
        }
      }
      if (userId) {
        await supabaseAdmin.from('profiles').upsert({
          id: userId, role: 'parent', ecole_id: demande.ecole_id, famille_id: famille.id,
          prenom: demande.parent1_prenom || null, nom: demande.parent1_nom || null, email: loginEmail,
          telephone: demande.parent1_telephone || null,
        })
      }
    }

    // 5. Email d'acces
    let emailSent = false
    let emailError: string | undefined
    if (inviteLink && loginEmail) {
      if (!isEmailConfigured()) {
        emailError = 'SMTP non configure'
      } else {
        const r = await sendEmail({
          to: { email: loginEmail, name: (demande.parent1_prenom || '') + ' ' + (demande.parent1_nom || '') },
          subject: 'Votre inscription est acceptee - ' + ecoleNom,
          html: buildAccesEmail(demande.parent1_prenom, ecoleNom, inviteLink),
        })
        emailSent = r.ok
        emailError = r.error
      }
    } else if (!loginEmail) {
      emailError = 'Aucun email parent renseigne'
    }

    // 6. Marquer la demande comme acceptee
    const { error: updErr } = await supabaseAdmin
      .from('demandes_inscription')
      .update({
        statut: 'accepte', traite_par: caller.id, traite_le: new Date().toISOString(),
        famille_id: famille.id, enfant_id: enfant.id,
      })
      .eq('id', demandeId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: caller.id, ecole_id: demande.ecole_id,
      action: 'demande_inscription_acceptee',
      details: { demande_id: demandeId, famille_id: famille.id, enfant_id: enfant.id },
    }).then(() => {}, () => {})

    return NextResponse.json({
      success: true,
      statut: 'accepte',
      familleId: famille.id,
      enfantId: enfant.id,
      compteCreee: !!userId,
      emailSent,
      emailError,
      inviteLink: emailSent ? undefined : inviteLink,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
