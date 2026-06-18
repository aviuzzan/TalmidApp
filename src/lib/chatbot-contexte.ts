/**
 * Helper qui assemble le contexte injecte dans le prompt chatbot.
 *
 * Regle metier capitale : le contexte reflete EXACTEMENT les permissions UI.
 * Un parent ne voit que sa famille. Un admin sans acces_finances n a pas les blocs financiers.
 */
import { createClient } from '@supabase/supabase-js'

export type RoleChatbot = 'parent' | 'admin' | 'super_admin'

export interface ContexteChatbot {
  role: RoleChatbot
  ecoleNom: string
  ecoleSlug: string
  accesFinances: boolean
  contexte: string  // markdown a injecter dans le prompt
  faqEcole: string
}

/**
 * Construit le contexte pour un user donne.
 * Le client supabase doit etre service_role car on appelle depuis l API server-side.
 */
export async function chargerContexteChatbot(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ContexteChatbot | null> {
  // 1. Profil utilisateur
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, prenom, nom, ecole_id, famille_id, acces_finances')
    .eq('id', userId)
    .single()
  if (!profile) return null

  // 2. Ecole
  let ecoleId = profile.ecole_id
  if (!ecoleId && profile.famille_id) {
    const { data: f } = await supabase.from('familles').select('ecole_id').eq('id', profile.famille_id).single()
    ecoleId = f?.ecole_id || null
  }
  if (!ecoleId) return null

  const { data: ecole } = await supabase
    .from('ecoles')
    .select('id, nom, slug')
    .eq('id', ecoleId)
    .single()
  if (!ecole) return null

  // 3. FAQ ecole
  const { data: faq } = await supabase
    .from('chatbot_faq')
    .select('contenu_markdown')
    .eq('ecole_id', ecoleId)
    .maybeSingle()

  // 4. Determine le role chatbot
  const role: RoleChatbot = profile.role === 'super_admin' ? 'super_admin'
    : profile.role === 'admin' ? 'admin'
    : 'parent'

  const accesFinances = profile.role === 'super_admin' ? true : (profile.acces_finances !== false)

  // 5. Contexte donnees specifique au role
  let donnees = ''
  if (role === 'parent' && profile.famille_id) {
    donnees = await contexteParent(supabase, profile.famille_id, accesFinances)
  } else if (role === 'admin' || role === 'super_admin') {
    donnees = await contexteAdmin(supabase, ecoleId, accesFinances)
  }

  return {
    role,
    ecoleNom: ecole.nom,
    ecoleSlug: ecole.slug,
    accesFinances,
    contexte: donnees,
    faqEcole: faq?.contenu_markdown || '',
  }
}

/**
 * Donnees visibles par un parent : SA famille + SES enfants + SES factures + SON contrat + SES echeances.
 * Strict : aucune donnee d une autre famille.
 */
async function contexteParent(
  supabase: ReturnType<typeof createClient>,
  familleId: string,
  accesFinances: boolean,
): Promise<string> {
  const lignes: string[] = []

  const { data: famille } = await supabase
    .from('familles')
    .select('id, nom, numero, parent1_prenom, parent1_nom, parent1_email, parent1_telephone, annee_inscription, scolarite_n1_annee')
    .eq('id', familleId)
    .single()

  if (famille) {
    lignes.push(`## Votre famille`)
    lignes.push(`- Nom : ${famille.nom}${famille.numero ? ' (N° ' + famille.numero + ')' : ''}`)
    if (famille.parent1_prenom || famille.parent1_nom) lignes.push(`- Parent 1 : ${famille.parent1_prenom || ''} ${famille.parent1_nom || ''}`.trim())
    if (famille.annee_inscription) lignes.push(`- Annee d inscription en cours : ${famille.annee_inscription}`)
  }

  const { data: enfants } = await supabase
    .from('enfants')
    .select('id, prenom, nom, date_naissance, classe_nom, annee_inscription, statut')
    .eq('famille_id', familleId)
    .order('date_naissance', { ascending: false })

  if (enfants && enfants.length > 0) {
    lignes.push(``)
    lignes.push(`## Vos enfants inscrits (${enfants.length})`)
    for (const e of enfants) {
      lignes.push(`- ${e.prenom} ${e.nom}${e.classe_nom ? ' (' + e.classe_nom + ')' : ''}${e.statut ? ' [' + e.statut + ']' : ''}`)
    }
  }

  // Bloc financier - on n inclut que si le parent peut voir ses propres factures (toujours oui).
  if (accesFinances) {
    const { data: factures } = await supabase
      .from('factures_solde')
      .select('id, numero, annee_scolaire, total_facture, total_regle, solde_restant, statut')
      .eq('famille_id', familleId)
      .neq('statut', 'annule')
      .order('annee_scolaire', { ascending: false })

    if (factures && factures.length > 0) {
      lignes.push(``)
      lignes.push(`## Vos factures`)
      for (const f of factures) {
        lignes.push(`- ${f.numero} (${f.annee_scolaire}) : total ${f.total_facture}€, regle ${f.total_regle}€, solde restant ${f.solde_restant}€ — statut ${f.statut}`)
      }
    }

    // Prochaine echeance via cheques_prevus
    const { data: contrat } = await supabase
      .from('contrats_scolarisation')
      .select('id, annee_scolaire')
      .eq('famille_id', familleId)
      .eq('statut', 'valide')
      .order('annee_scolaire', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (contrat) {
      const { data: echeances } = await supabase
        .from('cheques_prevus')
        .select('numero_cheque, montant, date_echeance, statut, mode_paiement')
        .eq('contrat_id', contrat.id)
        .order('date_echeance', { ascending: true })

      if (echeances && echeances.length > 0) {
        lignes.push(``)
        lignes.push(`## Echeancier de paiement ${contrat.annee_scolaire}`)
        for (const e of echeances) {
          lignes.push(`- N°${e.numero_cheque} : ${e.montant}€ le ${e.date_echeance} (${e.mode_paiement}) — ${e.statut}`)
        }
      }
    }
  }

  return lignes.join('\n')
}

/**
 * Donnees visibles par un admin : stats agregees de l ecole + KPIs.
 * Si pas d acces finances : exclu les montants.
 */
async function contexteAdmin(
  supabase: ReturnType<typeof createClient>,
  ecoleId: string,
  accesFinances: boolean,
): Promise<string> {
  const lignes: string[] = []

  const [{ count: familles }, { count: enfants }, { data: classes }] = await Promise.all([
    supabase.from('familles').select('*', { count: 'exact', head: true }).eq('ecole_id', ecoleId),
    supabase.from('enfants').select('*', { count: 'exact', head: true }),
    supabase.from('classes').select('id, nom').eq('ecole_id', ecoleId),
  ])

  lignes.push(`## Statistiques ecole`)
  lignes.push(`- ${familles ?? 0} familles inscrites`)
  lignes.push(`- ${enfants ?? 0} enfants au total`)
  lignes.push(`- ${classes?.length ?? 0} classes`)
  if (classes && classes.length > 0) {
    lignes.push(`- Liste des classes : ${classes.map(c => c.nom).join(', ')}`)
  }

  if (accesFinances) {
    const { data: factures } = await supabase
      .from('factures_solde')
      .select('total_facture, total_regle, solde_restant, statut')
      .neq('statut', 'annule')

    if (factures && factures.length > 0) {
      const totalFacture = factures.reduce((s, f) => s + Number(f.total_facture || 0), 0)
      const totalRegle = factures.reduce((s, f) => s + Number(f.total_regle || 0), 0)
      const totalReste = factures.reduce((s, f) => s + Number(f.solde_restant || 0), 0)
      lignes.push(``)
      lignes.push(`## Finances ecole`)
      lignes.push(`- ${factures.length} factures emises`)
      lignes.push(`- Total facture : ${totalFacture.toFixed(2)}€`)
      lignes.push(`- Total regle : ${totalRegle.toFixed(2)}€`)
      lignes.push(`- Reste a recouvrer : ${totalReste.toFixed(2)}€`)
    }
  }

  // Mini-doc TalmidApp pour les admins
  lignes.push(``)
  lignes.push(`## Comment utiliser TalmidApp (raccourcis utiles)`)
  lignes.push(`- Creer un avoir : Finances > Avoirs > + Nouvel avoir`)
  lignes.push(`- Valider un contrat : Inscriptions N+1 > cliquer sur la famille > Valider`)
  lignes.push(`- Inviter un parent : Comptes parents > + Inviter`)
  lignes.push(`- Envoyer une relance : Finances > Relances impayes > Envoyer N1/N2/N3`)
  lignes.push(`- Configurer les modes de paiement : Parametres > Modes de paiement`)
  lignes.push(`- Gerer les acces admin : Parametres > Comptes & acces (admin principal seulement)`)
  lignes.push(`- Toggle "Acces finances" : Parametres > Comptes & acces > selection admin > toggle en haut`)
  lignes.push(`- Editer la FAQ chatbot : Parametres > Chatbot`)

  return lignes.join('\n')
}

/**
 * Construit le prompt systeme final a partir du contexte.
 */
export function construirePromptSysteme(ctx: ContexteChatbot): string {
  const consigne = ctx.role === 'parent'
    ? `Tu es l assistant de l ecole "${ctx.ecoleNom}". Tu reponds aux questions du parent connecte. Tu ne dois JAMAIS reveler des donnees d une autre famille. Tu n as pas acces aux statistiques globales de l ecole. Tu reponds en francais, de maniere chaleureuse et concise.`
    : `Tu es l assistant administratif de l ecole "${ctx.ecoleNom}". Tu aides l administrateur connecte. ${ctx.accesFinances ? '' : 'L utilisateur n a PAS acces aux donnees financieres. Refuse poliment toute question liee aux factures montants soldes echeances ou paie.'} Tu reponds en francais, de maniere professionnelle et concise.`

  return `${consigne}

Voici les donnees auxquelles tu as acces (et uniquement celles-ci) :

${ctx.contexte}

${ctx.faqEcole ? `\n--- FAQ de l ecole ---\n${ctx.faqEcole}\n` : ''}

REGLES STRICTES :
1. Reponds UNIQUEMENT a partir des informations ci-dessus.
2. Si tu ne sais pas, dis "Je n ai pas cette information, contactez le secretariat de l ecole".
3. Ne propose JAMAIS d action qui modifie les donnees (envoi email, suppression, paiement).
4. Reste concis : 1-3 phrases sauf si la question demande des details.
5. ${ctx.role === 'parent' ? 'Tutoie ou vouvoie selon le ton, mais sois chaleureux.' : 'Sois factuel et professionnel.'}
`
}
