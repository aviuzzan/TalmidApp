import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { estAppelInterne } from '@/lib/internal-auth'
import { sendEmail, isEmailConfigured } from '@/lib/email'
import { ANNEE_COURANTE } from '@/lib/inscriptions'

// Variables disponibles dans les templates
const VARIABLES = [
  'nom_famille', 'prenom_parent1', 'nom_parent1',
  'prenom_parent2', 'nom_parent2', 'email_parent1',
  'solde_restant', 'total_facture', 'total_regle',
  'nb_enfants', 'annee_scolaire', 'couleur_solde'
]

function resolveVariables(template: string, data: Record<string, string>): string {
  return VARIABLES.reduce((str, varName) => {
    const regex = new RegExp(`{{${varName}}}`, 'g')
    return str.replace(regex, data[varName] ?? '')
  }, template)
}

async function getFamilleData(supabase: any, familleId: string) {
  const ANNEE = ANNEE_COURANTE
  const [{ data: famille }, { data: facture }, { count: nbEnfants }] = await Promise.all([
    supabase.from('familles').select('*').eq('id', familleId).single(),
    supabase.from('factures_solde').select('*').eq('famille_id', familleId).eq('annee_scolaire', ANNEE).single(),
    supabase.from('enfants').select('*', { count: 'exact', head: true }).eq('famille_id', familleId),
  ])

  const solde = Number(facture?.solde_restant ?? 0)

  return {
    nom_famille: famille?.nom ?? '',
    prenom_parent1: famille?.parent1_prenom ?? '',
    nom_parent1: famille?.parent1_nom ?? '',
    prenom_parent2: famille?.parent2_prenom ?? '',
    nom_parent2: famille?.parent2_nom ?? '',
    email_parent1: famille?.parent1_email ?? '',
    solde_restant: solde.toLocaleString('fr-FR') + ' €',
    total_facture: Number(facture?.total_facture ?? 0).toLocaleString('fr-FR') + ' €',
    total_regle: Number(facture?.total_regle ?? 0).toLocaleString('fr-FR') + ' €',
    nb_enfants: String(nbEnfants ?? 0),
    annee_scolaire: ANNEE,
    couleur_solde: solde > 0 ? '#DC2626' : '#059669',
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { famille_ids, sujet, contenu_html, template_id, admin_id } = body

    if (!famille_ids?.length || !sujet || !contenu_html) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: 'Configuration SMTP manquante (SMTP_HOST, SMTP_USER, SMTP_PASSWORD)' }, { status: 500 })
    }

    // Client Supabase avec service role pour bypasser RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // FIX secu 27/07 : route auparavant sans auth — double règle :
    // (a) appel serveur→serveur avec x-internal-key, ou (b) admin/super_admin authentifié + tenant check
    let envoyeParId: string | null = admin_id || null
    const isInternal = estAppelInterne(req)
    if (!isInternal) {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '')
      if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
      const { data: { user } } = await supabase.auth.getUser(token)
      if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
      const { data: profile } = await supabase
        .from('profiles').select('role, ecole_id, famille_id').eq('id', user.id).single()
      if (!['admin', 'super_admin'].includes(profile?.role)) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
      // Tenant check : toutes les familles ciblées doivent appartenir à l'école de l'appelant
      if (profile?.role !== 'super_admin') {
        const { data: famsCheck } = await supabase
          .from('familles').select('id, ecole_id').in('id', famille_ids)
        const horsEcole = (famsCheck || []).some((f: any) => f.ecole_id !== profile?.ecole_id)
        if (horsEcole || (famsCheck || []).length !== famille_ids.length) {
          return NextResponse.json({ error: 'Une ou plusieurs familles n\'appartiennent pas à votre école' }, { status: 403 })
        }
      }
      // FIX secu 27/07 : admin_id du body remplacé par l'id du user réellement authentifié
      envoyeParId = user.id
    }

    const results = []

    // Charger le nom de l'école pour le fromName (toutes les familles partagent normalement la même école)
    let ecoleNom = 'TalmidApp'
    // rrrr1 : les reponses des parents doivent arriver a l'ecole, pas sur la boite
    // d'envoi TalmidApp -> Reply-To = email de contact de l'ecole (Parametres > ecole).
    let ecoleReplyTo = ''
    try {
      const { data: firstFam } = await supabase.from('familles').select('ecole_id').eq('id', famille_ids[0]).single()
      if (firstFam?.ecole_id) {
        const { data: ec } = await supabase.from('ecoles').select('nom, email_contact').eq('id', firstFam.ecole_id).single()
        if (ec?.nom) ecoleNom = ec.nom
        if (ec?.email_contact) ecoleReplyTo = ec.email_contact
      }
    } catch {}

    for (const familleId of famille_ids) {
      try {
        // Récupérer les données de la famille
        const vars = await getFamilleData(supabase, familleId)
        const { data: famille } = await supabase.from('familles').select('parent1_email, parent2_email, nom').eq('id', familleId).single()

        if (!famille?.parent1_email) {
          results.push({ familleId, status: 'erreur', error: 'Email parent 1 manquant' })
          continue
        }

        // llll1 : {{lien_magique}} disponible dans les emails personnalisés.
        // Lien de création/réinitialisation du mot de passe (recovery) généré à la
        // volée pour le compte portail de la famille — même mécanique que le
        // renvoi individuel (renvoyer-lien-magique). Repli : page de connexion.
        let lienMagique = ''
        const veutLien = contenu_html.includes('{{lien_magique}}') || sujet.includes('{{lien_magique}}')
        if (veutLien) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
          lienMagique = baseUrl + '/login'
          const { data: comptes } = await supabase
            .from('profiles_with_email').select('email').eq('famille_id', familleId).limit(1)
          const compteEmail = comptes?.[0]?.email
          if (compteEmail) {
            const { data: linkData } = await supabase.auth.admin.generateLink({
              type: 'recovery',
              email: compteEmail,
              options: { redirectTo: baseUrl + '/auth/set-password?invited=1' },
            })
            if (linkData?.properties?.action_link) lienMagique = linkData.properties.action_link
          }
        }

        // Résoudre les variables
        const sujetResolu = resolveVariables(sujet, vars).split('{{lien_magique}}').join(lienMagique)
        const htmlResolu = resolveVariables(contenu_html, vars).split('{{lien_magique}}').join(lienMagique)

        // Construire les destinataires
        const to = [{ email: famille.parent1_email, name: `${vars.prenom_parent1} ${vars.nom_parent1}`.trim() }]
        if (famille.parent2_email) {
          to.push({ email: famille.parent2_email, name: `${vars.prenom_parent2} ${vars.nom_parent2}`.trim() })
        }

        // Envoyer via SMTP
        const result = await sendEmail({
          to,
          subject: sujetResolu,
          html: htmlResolu,
          fromName: ecoleNom,
          ...(ecoleReplyTo ? { replyTo: ecoleReplyTo } : {}),
        })

        if (!result.ok) {
          await supabase.from('email_logs').insert({
            template_id: template_id || null,
            famille_id: familleId,
            destinataire: famille.parent1_email,
            sujet: sujetResolu,
            statut: 'erreur',
            erreur: result.error ?? 'Erreur SMTP',
            envoye_par: envoyeParId, // FIX secu 27/07 : id authentifié, pas celui du body
          })
          results.push({ familleId, famille: famille.nom, status: 'erreur', error: result.error })
        } else {
          await supabase.from('email_logs').insert({
            template_id: template_id || null,
            famille_id: familleId,
            destinataire: famille.parent1_email,
            sujet: sujetResolu,
            statut: 'envoye',
            envoye_par: envoyeParId, // FIX secu 27/07 : id authentifié, pas celui du body
          })
          results.push({ familleId, famille: famille.nom, status: 'envoye' })
        }
      } catch (err: any) {
        results.push({ familleId, status: 'erreur', error: err.message })
      }
    }

    const nbEnvoyes = results.filter(r => r.status === 'envoye').length
    const nbErreurs = results.filter(r => r.status === 'erreur').length

    return NextResponse.json({ success: true, nbEnvoyes, nbErreurs, results })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
