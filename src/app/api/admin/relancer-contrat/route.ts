import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/admin/relancer-contrat
 * Body: { familleIds: string[], anneeScolaire: string, ecoleId: string, messagePerso?: string }
 *
 * Envoie un email de relance a chaque famille de la liste (parents 1 + 2)
 * lui rappelant de completer le contrat de scolarite pour l'annee donnee.
 * Trace chaque envoi dans la table relances_contrat.
 */
export async function POST(req: NextRequest) {
  try {
    const { familleIds, anneeScolaire, ecoleId, messagePerso } = await req.json()
    if (!Array.isArray(familleIds) || familleIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'familleIds requis (tableau non vide)' }, { status: 400 })
    }
    if (!anneeScolaire || !ecoleId) {
      return NextResponse.json({ ok: false, error: 'anneeScolaire + ecoleId requis' }, { status: 400 })
    }

    // Auth : recupere le user courant depuis le header Authorization
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'Non authentifie' }, { status: 401 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: userData } = await sb.auth.getUser(token)
    if (!userData?.user?.id) return NextResponse.json({ ok: false, error: 'Session invalide' }, { status: 401 })
    const envoyePar = userData.user.id

    // Verifier que l'appelant est bien admin de cette ecole
    const { data: profile } = await sb.from('profiles').select('role, ecole_id').eq('id', envoyePar).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role) || (profile.role !== 'super_admin' && profile.ecole_id !== ecoleId)) {
      return NextResponse.json({ ok: false, error: 'Acces refuse' }, { status: 403 })
    }

    // Charger l'ecole (pour nom expediteur + URL portail)
    const { data: ecole } = await sb.from('ecoles').select('nom, slug').eq('id', ecoleId).single()
    const fromName = (ecole as any)?.nom || 'TalmidApp'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const portailUrl = baseUrl + '/portail'

    // Charger les familles
    const { data: familles } = await sb
      .from('familles')
      .select('id, nom, parent1_prenom, parent1_email, parent2_prenom, parent2_email')
      .in('id', familleIds)
      .eq('ecole_id', ecoleId)

    if (!familles || familles.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucune famille trouvee' }, { status: 404 })
    }

    // Charger TOUS les users auth une fois (pagination) pour detecter les comptes
    // jamais actives (pas de mot de passe cree = last_sign_in_at null).
    // Ces parents recoivent un LIEN MAGIQUE valable 24 h au lieu du lien portail
    // (sinon la relance mene a une page de login infranchissable).
    const usersParEmail = new Map<string, any>()
    {
      let page = 1
      const perPage = 200
      while (true) {
        const { data: pageData } = await sb.auth.admin.listUsers({ page, perPage })
        const users = pageData?.users || []
        users.forEach((u: any) => { if (u.email) usersParEmail.set(u.email.toLowerCase(), u) })
        if (users.length < perPage) break
        page++
        if (page > 50) break
      }
    }

    /** Retourne { url, lienMagique } pour un destinataire : lien magique 24h si compte jamais active, sinon portail. */
    const resoudreLien = async (email: string): Promise<{ url: string; lienMagique: boolean }> => {
      const user = usersParEmail.get(email.toLowerCase().trim())
      // Compte inexistant ou deja utilise (connecte au moins une fois) -> lien portail classique
      if (!user || user.last_sign_in_at) return { url: portailUrl, lienMagique: false }
      // Compte jamais active -> lien magique (recovery) vers la creation de mot de passe
      try {
        const { data: linkData } = await sb.auth.admin.generateLink({
          type: 'recovery',
          email: user.email,
          options: { redirectTo: baseUrl + '/auth/set-password?invited=1' },
        })
        const action = linkData?.properties?.action_link
        if (action) return { url: action, lienMagique: true }
      } catch { /* fallback portail */ }
      return { url: portailUrl, lienMagique: false }
    }

    const results: { famille_id: string; nom: string; ok: boolean; error?: string }[] = []

    for (const f of familles as any[]) {
      const destinataires: { email: string; name?: string }[] = []
      if (f.parent1_email) destinataires.push({ email: f.parent1_email, name: `${f.parent1_prenom || ''} ${f.nom}`.trim() })
      if (f.parent2_email && f.parent2_email !== f.parent1_email) {
        destinataires.push({ email: f.parent2_email, name: `${f.parent2_prenom || ''} ${f.nom}`.trim() })
      }

      if (destinataires.length === 0) {
        results.push({ famille_id: f.id, nom: f.nom, ok: false, error: 'Aucune adresse email' })
        continue
      }

      const sujet = `Rappel : Contrat de scolarite ${anneeScolaire} a completer`
      const messageBody = messagePerso && messagePerso.trim()
        ? `<p style="white-space:pre-wrap;">${escapeHtml(messagePerso.trim())}</p>`
        : `
          <p>Bonjour,</p>
          <p>Nous vous rappelons que le <strong>contrat de scolarite pour l'annee ${anneeScolaire}</strong> n'a pas encore ete complete pour votre famille.</p>
          <p>Merci de vous connecter a votre espace parent pour le finaliser dans les meilleurs delais.</p>
        `

      // Envoi INDIVIDUEL par destinataire : chaque parent recoit son propre lien
      // (magique 24h si compte jamais active, portail sinon).
      let success = false
      let lastError: string | undefined
      for (const dest of destinataires) {
        const { url, lienMagique } = await resoudreLien(dest.email)
        const boutonLabel = lienMagique ? 'Activer mon espace et completer le contrat' : 'Acceder a mon espace parent'
        const mentionLien = lienMagique
          ? `<p style="font-size: 12px; color: #B45309; background: #FEF3C7; border-radius: 8px; padding: 10px 14px; margin-top: 12px;">⏱ <strong>Ce lien est valable 24 heures.</strong> Il vous permet de creer votre mot de passe et d'acceder directement a votre espace. Passe ce delai, contactez l'ecole pour en recevoir un nouveau.</p>`
          : ''
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1E293B;">
            <div style="background: #F8FAFC; padding: 24px; border-radius: 12px;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #1E293B;">${fromName}</h2>
              ${messageBody}
              <div style="margin: 24px 0; text-align: center;">
                <a href="${url}" style="display: inline-block; background: #2563EB; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">${boutonLabel}</a>
              </div>
              ${mentionLien}
              <p style="font-size: 12px; color: #64748B; margin-top: 24px;">Si vous rencontrez la moindre difficulte, n'hesitez pas a nous contacter directement en repondant a ce message.</p>
              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
              <p style="font-size: 11px; color: #94A3B8; margin: 0;">Cordialement,<br/>${fromName}</p>
            </div>
          </div>
        `
        const sendRes = await sendEmail({ to: dest, subject: sujet, html, fromName })
        if (sendRes.ok) success = true
        else lastError = sendRes.error
      }

      // Trace en BDD (meme si echec pour savoir qu'on a essaye)
      await sb.from('relances_contrat').insert({
        famille_id: f.id,
        ecole_id: ecoleId,
        annee_scolaire: anneeScolaire,
        canal: 'email',
        destinataires: destinataires.map(d => d.email).join(', '),
        sujet,
        note: messagePerso || null,
        envoye_par: envoyePar,
        succes: success,
      })

      results.push({ famille_id: f.id, nom: f.nom, ok: success, error: success ? undefined : (lastError || 'Erreur envoi') })
    }

    const nbSucces = results.filter(r => r.ok).length
    const nbEchec = results.length - nbSucces
    return NextResponse.json({ ok: true, envoye: nbSucces, echec: nbEchec, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
