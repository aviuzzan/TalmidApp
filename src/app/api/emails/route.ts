import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const ANNEE = '2025/2026'
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

    const brevoApiKey = process.env.BREVO_API_KEY
    const fromEmail = process.env.BREVO_FROM_EMAIL
    const fromName = process.env.BREVO_FROM_NAME ?? 'Heder Loubavitch'

    if (!brevoApiKey || !fromEmail) {
      return NextResponse.json({ error: 'Configuration Brevo manquante' }, { status: 500 })
    }

    // Client Supabase avec service role pour bypasser RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const results = []

    for (const familleId of famille_ids) {
      try {
        // Récupérer les données de la famille
        const vars = await getFamilleData(supabase, familleId)
        const { data: famille } = await supabase.from('familles').select('parent1_email, parent2_email, nom').eq('id', familleId).single()

        if (!famille?.parent1_email) {
          results.push({ familleId, status: 'erreur', error: 'Email parent 1 manquant' })
          continue
        }

        // Résoudre les variables
        const sujetResolu = resolveVariables(sujet, vars)
        const htmlResolu = resolveVariables(contenu_html, vars)

        // Construire les destinataires
        const to = [{ email: famille.parent1_email, name: `${vars.prenom_parent1} ${vars.nom_parent1}` }]
        if (famille.parent2_email) {
          to.push({ email: famille.parent2_email, name: `${vars.prenom_parent2} ${vars.nom_parent2}` })
        }

        // Envoyer via Brevo API transactionnelle
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: fromName, email: fromEmail },
            to,
            subject: sujetResolu,
            htmlContent: htmlResolu,
          }),
        })

        const brevoData = await brevoRes.json()

        if (!brevoRes.ok) {
          // Log erreur
          await supabase.from('email_logs').insert({
            template_id: template_id || null,
            famille_id: familleId,
            destinataire: famille.parent1_email,
            sujet: sujetResolu,
            statut: 'erreur',
            erreur: brevoData.message ?? 'Erreur Brevo',
            envoye_par: admin_id,
          })
          results.push({ familleId, famille: famille.nom, status: 'erreur', error: brevoData.message })
        } else {
          // Log succès
          await supabase.from('email_logs').insert({
            template_id: template_id || null,
            famille_id: familleId,
            destinataire: famille.parent1_email,
            sujet: sujetResolu,
            statut: 'envoye',
            envoye_par: admin_id,
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
