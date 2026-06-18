/**
 * Helper qui assemble le contexte injecte dans le prompt chatbot.
 *
 * Regle metier capitale : le contexte reflete EXACTEMENT les permissions UI.
 * Un parent ne voit que sa famille. Un admin sans acces_finances n a pas les blocs financiers.
 */
// Le type SupabaseClient est volontairement `any` ici car les versions de @supabase/supabase-js
// et de @supabase/ssr peuvent diverger sur les generics public/schema, ce qui casse le build TS.

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
  supabase: any,
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
  supabase: any,
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

    // Reglements deja effectues
    const { data: reglements } = await supabase
      .from('reglements')
      .select('montant, date_reglement, mode, reference')
      .eq('famille_id', familleId)
      .order('date_reglement', { ascending: false })
      .limit(20)

    if (reglements && reglements.length > 0) {
      lignes.push(``)
      lignes.push(`## Vos derniers reglements`)
      for (const r of reglements as any[]) {
        lignes.push(`- ${r.date_reglement} : ${Number(r.montant).toLocaleString('fr-FR')} EUR par ${r.mode}${r.reference ? ' (ref ' + r.reference + ')' : ''}`)
      }
    }
  }

  // Mode d'emploi portail parent
  lignes.push(``)
  lignes.push(`## Mode d'emploi du portail parent`)
  lignes.push(`- Voir vos enfants : Mes enfants (menu principal)`)
  lignes.push(`- Voir vos factures et solde : Mes factures`)
  lignes.push(`- Telecharger une attestation fiscale : Mes documents > Attestation fiscale (annee precedente generee automatiquement)`)
  lignes.push(`- Inscrire un nouvel enfant ou reinscrire : Inscriptions N+1 (visible pendant la periode d'inscription)`)
  lignes.push(`- Demander une reduction (DDR) : Inscriptions N+1 > Dossier reduction`)
  lignes.push(`- Signer le contrat de scolarisation : Inscriptions N+1 > Contrat`)
  lignes.push(`- Voir vos documents : Mes documents`)
  lignes.push(`- Envoyer un message a l'ecole : Messagerie > Nouveau message`)
  lignes.push(`- Changer votre mot de passe : Mon compte > Modifier mot de passe`)
  lignes.push(`- Modifier vos coordonnees : Mon compte > Coordonnees`)
  lignes.push(`- Voir le calendrier et les contacts : Contact ecole`)

  return lignes.join('\n')
}

/**
 * Donnees visibles par un admin : stats agregees + listes detaillees + mini-doc complete.
 * Si pas d acces finances : exclu les montants.
 */
async function contexteAdmin(
  supabase: any,
  ecoleId: string,
  accesFinances: boolean,
): Promise<string> {
  const lignes: string[] = []

  // ====================================================================
  // STATS ECOLE
  // ====================================================================
  const [
    { count: familles },
    { count: enfants },
    { data: classes },
    { data: ecoleData },
  ] = await Promise.all([
    supabase.from('familles').select('*', { count: 'exact', head: true }).eq('ecole_id', ecoleId),
    supabase.from('enfants').select('*', { count: 'exact', head: true }),
    supabase.from('classes').select('id, nom, niveau, capacite').eq('ecole_id', ecoleId).order('ordre'),
    supabase.from('ecoles').select('nom, adresse, telephone, email, siren, code_uai').eq('id', ecoleId).single(),
  ])

  lignes.push(`## Ecole`)
  if (ecoleData) {
    lignes.push(`- Nom : ${ecoleData.nom}`)
    if (ecoleData.adresse) lignes.push(`- Adresse : ${ecoleData.adresse}`)
    if (ecoleData.telephone) lignes.push(`- Telephone : ${ecoleData.telephone}`)
    if (ecoleData.email) lignes.push(`- Email : ${ecoleData.email}`)
    if (ecoleData.siren) lignes.push(`- SIREN : ${ecoleData.siren}`)
    if (ecoleData.code_uai) lignes.push(`- Code UAI/RNE : ${ecoleData.code_uai}`)
  }

  lignes.push(``)
  lignes.push(`## Effectifs`)
  lignes.push(`- ${familles ?? 0} familles inscrites`)
  lignes.push(`- ${enfants ?? 0} enfants au total`)
  lignes.push(`- ${classes?.length ?? 0} classes`)

  if (classes && classes.length > 0) {
    lignes.push(``)
    lignes.push(`## Classes de l'ecole`)
    for (const c of classes as any[]) {
      lignes.push(`- ${c.nom}${c.niveau ? ' (' + c.niveau + ')' : ''}${c.capacite ? ' - capacite ' + c.capacite : ''}`)
    }
  }

  // ====================================================================
  // ENFANTS PAR CLASSE
  // ====================================================================
  const { data: enfantsParClasse } = await supabase
    .from('enfants')
    .select('classe_nom, statut')
    .order('classe_nom')

  if (enfantsParClasse && enfantsParClasse.length > 0) {
    const compte: Record<string, number> = {}
    for (const e of enfantsParClasse as any[]) {
      const k = e.classe_nom || 'Non affecte'
      compte[k] = (compte[k] || 0) + 1
    }
    lignes.push(``)
    lignes.push(`## Repartition eleves par classe`)
    for (const [classe, n] of Object.entries(compte)) {
      lignes.push(`- ${classe} : ${n} eleves`)
    }
  }

  // ====================================================================
  // FAMILLES (30 dernieres)
  // ====================================================================
  const { data: famillesListe } = await supabase
    .from('familles')
    .select('nom, numero, parent1_prenom, parent1_nom, parent1_email')
    .eq('ecole_id', ecoleId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (famillesListe && famillesListe.length > 0) {
    lignes.push(``)
    lignes.push(`## Dernieres familles inscrites (30 max)`)
    for (const f of famillesListe as any[]) {
      const parent = [f.parent1_prenom, f.parent1_nom].filter(Boolean).join(' ')
      lignes.push(`- ${f.nom}${f.numero ? ' (' + f.numero + ')' : ''}${parent ? ' - ' + parent : ''}${f.parent1_email ? ' - ' + f.parent1_email : ''}`)
    }
  }

  // ====================================================================
  // PROFESSEURS
  // ====================================================================
  const { data: profs } = await supabase
    .from('professeurs')
    .select('prenom, nom, email, matieres')
    .eq('ecole_id', ecoleId)

  if (profs && profs.length > 0) {
    lignes.push(``)
    lignes.push(`## Professeurs (${profs.length})`)
    for (const p of profs as any[]) {
      lignes.push(`- ${p.prenom} ${p.nom}${p.email ? ' (' + p.email + ')' : ''}${p.matieres ? ' - ' + (Array.isArray(p.matieres) ? p.matieres.join(', ') : p.matieres) : ''}`)
    }
  }

  // ====================================================================
  // BLOC FINANCIER (uniquement si acces finances)
  // ====================================================================
  if (accesFinances) {
    const { data: factures } = await supabase
      .from('factures_solde')
      .select('total_facture, total_regle, solde_restant, statut')
      .neq('statut', 'annule')

    if (factures && factures.length > 0) {
      const totalFacture = factures.reduce((s: number, f: any) => s + Number(f.total_facture || 0), 0)
      const totalRegle = factures.reduce((s: number, f: any) => s + Number(f.total_regle || 0), 0)
      const totalReste = factures.reduce((s: number, f: any) => s + Number(f.solde_restant || 0), 0)
      lignes.push(``)
      lignes.push(`## Finances globales ecole`)
      lignes.push(`- ${factures.length} factures emises`)
      lignes.push(`- Total facture : ${totalFacture.toLocaleString('fr-FR')} EUR`)
      lignes.push(`- Total regle : ${totalRegle.toLocaleString('fr-FR')} EUR`)
      lignes.push(`- Reste a recouvrer : ${totalReste.toLocaleString('fr-FR')} EUR`)
    }

    // Tarifs en vigueur
    const { data: tarifs } = await supabase
      .from('tarifs_secteur')
      .select('nom, montant, annee_scolaire, secteur_id')
      .eq('ecole_id', ecoleId)
      .order('nom')

    if (tarifs && tarifs.length > 0) {
      lignes.push(``)
      lignes.push(`## Tarifs en vigueur`)
      for (const t of tarifs as any[]) {
        lignes.push(`- ${t.nom} : ${Number(t.montant).toLocaleString('fr-FR')} EUR${t.annee_scolaire ? ' (' + t.annee_scolaire + ')' : ''}`)
      }
    }

    // Frais d'inscription
    const { data: frais } = await supabase
      .from('frais_inscription_config')
      .select('annee_scolaire, montant_nouvelle_inscription, montant_reinscription')
      .eq('ecole_id', ecoleId)

    if (frais && frais.length > 0) {
      lignes.push(``)
      lignes.push(`## Frais d'inscription`)
      for (const f of frais as any[]) {
        lignes.push(`- ${f.annee_scolaire} : nouvelle ${f.montant_nouvelle_inscription || 0} EUR / reinscription ${f.montant_reinscription || 0} EUR`)
      }
    }

    // Tranches de facturation
    const { data: tranches } = await supabase
      .from('tranches_facturation')
      .select('code, libelle, description')
      .eq('ecole_id', ecoleId)
      .order('ordre')

    if (tranches && tranches.length > 0) {
      lignes.push(``)
      lignes.push(`## Tranches de facturation`)
      for (const t of tranches as any[]) {
        lignes.push(`- ${t.code}${t.libelle ? ' - ' + t.libelle : ''}${t.description ? ' : ' + t.description : ''}`)
      }
    }

    // Modes de paiement
    const { data: modes } = await supabase
      .from('modes_reglement_ecole')
      .select('code, nom, actif')
      .eq('ecole_id', ecoleId)
      .eq('actif', true)

    if (modes && modes.length > 0) {
      lignes.push(``)
      lignes.push(`## Modes de paiement actifs`)
      for (const m of modes as any[]) {
        lignes.push(`- ${m.nom} (${m.code})`)
      }
    }

    // Avoirs actifs
    const { data: avoirs } = await supabase
      .from('avoirs')
      .select('numero, montant, montant_utilise, statut, motif')
      .eq('ecole_id', ecoleId)
      .in('statut', ['actif', 'partiellement_utilise'])

    if (avoirs && avoirs.length > 0) {
      lignes.push(``)
      lignes.push(`## Avoirs en cours (${avoirs.length})`)
      for (const a of avoirs as any[]) {
        const restant = Number(a.montant) - Number(a.montant_utilise || 0)
        lignes.push(`- ${a.numero || 'sans numero'} : ${Number(a.montant).toLocaleString('fr-FR')} EUR (restant ${restant.toLocaleString('fr-FR')} EUR)${a.motif ? ' - ' + a.motif : ''}`)
      }
    }
  }

  // ====================================================================
  // CONTRATS & INSCRIPTIONS
  // ====================================================================
  const { data: contrats } = await supabase
    .from('contrats_scolarisation')
    .select('statut, annee_scolaire')
    .eq('ecole_id', ecoleId)

  if (contrats && contrats.length > 0) {
    const compteStatut: Record<string, number> = {}
    for (const c of contrats as any[]) {
      compteStatut[c.statut] = (compteStatut[c.statut] || 0) + 1
    }
    lignes.push(``)
    lignes.push(`## Contrats de scolarisation`)
    for (const [statut, n] of Object.entries(compteStatut)) {
      lignes.push(`- ${statut} : ${n}`)
    }
  }

  const { data: demandes } = await supabase
    .from('demandes_inscription')
    .select('statut, parent1_nom, parent1_prenom')
    .eq('ecole_id', ecoleId)
    .in('statut', ['en_attente', 'soumise', 'en_cours'])

  if (demandes && demandes.length > 0) {
    lignes.push(``)
    lignes.push(`## Demandes d'inscription en attente (${demandes.length})`)
    for (const d of demandes as any[]) {
      const nom = [d.parent1_prenom, d.parent1_nom].filter(Boolean).join(' ') || '(sans nom)'
      lignes.push(`- ${nom} - ${d.statut}`)
    }
  }

  // ====================================================================
  // MINI-DOC TALMIDAPP - 35+ pages
  // ====================================================================
  lignes.push(``)
  lignes.push(`## Mode d'emploi TalmidApp (comment faire X dans l'app)`)
  lignes.push(``)
  lignes.push(`### Administration & familles`)
  lignes.push(`- Voir la liste des familles : Administration > Familles`)
  lignes.push(`- Fiche detaillee famille : cliquer sur une famille dans la liste`)
  lignes.push(`- Inviter un parent au portail : Comptes parents > + Inviter (envoie email d'activation)`)
  lignes.push(`- Renvoyer un lien d'activation : Comptes parents > selectionner le parent > Renvoyer`)
  lignes.push(`- Voir la liste des eleves : Administration > Eleves`)
  lignes.push(`- Passer les eleves a la classe suivante : Administration > Passages de classe`)
  lignes.push(`- Tableau de bord direction : Administration > Tableau de bord direction (vue executive)`)
  lignes.push(``)
  lignes.push(`### Inscriptions N+1`)
  lignes.push(`- Envoyer lien d'inscription a une famille externe : Administration > Demandes de nouvelles inscriptions > Inviter`)
  lignes.push(`- Voir les demandes recues : Administration > Demandes de nouvelles inscriptions`)
  lignes.push(`- Accepter/refuser une demande : ouvrir la demande > boutons Accepter/Refuser`)
  lignes.push(`- Voir tous les dossiers N+1 : Administration > Inscriptions N+1`)
  lignes.push(`- Valider une demande de reduction (DDR) : Inscriptions N+1 > selectionner famille > Reduction > Valider`)
  lignes.push(`- Valider un contrat : Inscriptions N+1 > selectionner famille > Contrat > Valider`)
  lignes.push(``)
  lignes.push(`### Finances`)
  lignes.push(`- Tableau de bord financier (KPI) : Finances > Tableau de bord`)
  lignes.push(`- Liste des factures : Finances > Factures`)
  lignes.push(`- Creer une facture manuelle : Finances > Factures > + Nouvelle facture`)
  lignes.push(`- Annuler une facture : ouvrir la facture > bouton Annuler`)
  lignes.push(`- Voir les avoirs : Finances > Avoirs`)
  lignes.push(`- Creer un avoir : Finances > Avoirs > + Nouvel avoir`)
  lignes.push(`- Imputer un avoir sur une facture : fiche famille > onglet Avoirs > bouton Imputer`)
  lignes.push(`- Envoyer une relance impaye : Finances > Relances impayes > Envoyer N1/N2/N3`)
  lignes.push(`- Niveau N1 = rappel amical, N2 = relance, N3 = mise en demeure`)
  lignes.push(`- Bordereau de remise de cheques : Finances > Bordereau cheques (imprimable)`)
  lignes.push(`- Rapprochement bancaire : Finances > Rapprochement bancaire`)
  lignes.push(`- Compta analytique : Finances > Compta analytique`)
  lignes.push(`- Exporter SEPA : Finances > Export SEPA`)
  lignes.push(`- Saisir un paiement : Finances > Tableau de bord > + Saisir un paiement (ou depuis fiche famille)`)
  lignes.push(``)
  lignes.push(`### Pedagogie`)
  lignes.push(`- Liste des professeurs : Pedagogie > Professeurs`)
  lignes.push(`- Inviter un nouveau prof : Pedagogie > Professeurs > + Inviter`)
  lignes.push(`- Grille emplois du temps : Pedagogie > Emplois du temps`)
  lignes.push(`- Devoirs / cahier de textes : Pedagogie > Devoirs`)
  lignes.push(`- Bulletins trimestriels : Pedagogie > Bulletins`)
  lignes.push(`- Conseils de classe : Pedagogie > Conseils de classe (calcul moyennes auto)`)
  lignes.push(`- Notes : Pedagogie > Notes & evaluations`)
  lignes.push(`- Export LSU : Pedagogie > LSU (Livret Scolaire Unique XML)`)
  lignes.push(`- Connecteurs Education Nationale : Pedagogie > Connecteurs EN (ONDE, SIECLE, Parcoursup)`)
  lignes.push(``)
  lignes.push(`### Vie scolaire`)
  lignes.push(`- Presences/absences : Vie scolaire > Presences`)
  lignes.push(`- Sanctions discipline : Vie scolaire > Sanctions`)
  lignes.push(`- Transport scolaire : Vie scolaire > Transport`)
  lignes.push(`- Cantine : Vie scolaire > Cantine`)
  lignes.push(`- Casiers eleves : Vie scolaire > Casiers`)
  lignes.push(`- Prets de materiel : Vie scolaire > Prets`)
  lignes.push(``)
  lignes.push(`### Communication`)
  lignes.push(`- Messagerie avec familles : Communication > Messagerie`)
  lignes.push(`- Documents partages : Communication > Documents ecole`)
  lignes.push(`- Envoyer SMS : Communication > SMS`)
  lignes.push(`- Notifications push : Communication > Notifications push`)
  lignes.push(`- Emails groupes : Communication > Notifications`)
  lignes.push(``)
  lignes.push(`### Parametres`)
  lignes.push(`- Parametres ecole generaux : Parametres > Parametres ecole`)
  lignes.push(`- Coordonnees / SIREN / UAI : Parametres > Infos & identifiants`)
  lignes.push(`- Integrations (Stripe, Brevo, etc) : Parametres > Integrations`)
  lignes.push(`- Comptes admin : Parametres > Comptes & acces (admin principal uniquement)`)
  lignes.push(`- Toggle "Acces finances" sur un admin : Parametres > Comptes & acces > selection admin > toggle en haut`)
  lignes.push(`- Configurer le chatbot (cette page) : Parametres > Chatbot`)
  lignes.push(`- Editer la FAQ que je connais : Parametres > Chatbot > zone Markdown libre`)
  lignes.push(`- Journal d'audit : Parametres > Journal d'audit`)
  lignes.push(`- Exporter en CSV : Parametres > Exports CSV`)
  lignes.push(`- Importer depuis CSV : Parametres > Importer des donnees`)
  lignes.push(`- Aide & demarrage : Parametres > Aide & demarrage`)

  return lignes.join('\n')
}

/**
 * Construit le prompt systeme final a partir du contexte.
 */
export function construirePromptSysteme(ctx: ContexteChatbot): string {
  const consigne = ctx.role === 'parent'
    ? `Tu es Levy, l'assistant virtuel TalmidApp de l'ecole "${ctx.ecoleNom}". Tu aides le parent connecte. Tu ne dois JAMAIS reveler des donnees d'une autre famille. Tu n'as pas acces aux statistiques globales de l'ecole. Tu reponds en francais, de maniere chaleureuse, claire et concise.`
    : `Tu es Levy, l'assistant virtuel TalmidApp de l'ecole "${ctx.ecoleNom}". Tu aides l'administrateur connecte a comprendre ses donnees et a utiliser l'application. ${ctx.accesFinances ? '' : 'IMPORTANT: L\'utilisateur n\'a PAS acces aux donnees financieres. Refuse poliment toute question liee aux factures, montants, soldes, echeances ou paie en disant "Vous n\'avez pas l\'acces aux finances dans cette ecole, contactez l\'admin principal."'} Tu reponds en francais, de maniere professionnelle et concise.`

  return `${consigne}

=== DONNEES AUXQUELLES TU AS ACCES (et UNIQUEMENT celles-ci) ===

${ctx.contexte}

${ctx.faqEcole ? `=== FAQ DE L'ECOLE (redigee par l'admin) ===\n${ctx.faqEcole}\n` : ''}

=== REGLES STRICTES (TRES IMPORTANT) ===

REGLE 1 - LECTURE SEULE
Tu es PUREMENT CONSULTATIF. Tu ne peux RIEN modifier, RIEN envoyer, RIEN supprimer, RIEN creer.
Tu n'as AUCUN outil d'action a ta disposition.
Si on te demande de faire une action (envoyer un mail, supprimer une famille, creer une facture, etc.) :
  - REPONDS : "Je ne peux pas effectuer cette action directement. Voici comment faire vous-meme : ..."
  - Puis indique le chemin dans l'app (ex: "Allez dans Finances > Factures > + Nouvelle facture")
Ne pretends JAMAIS avoir fait une action. Tu n'as fait que repondre du texte.

REGLE 2 - RESTE DANS LE CONTEXTE
Reponds UNIQUEMENT a partir des informations ci-dessus.
Si la question est hors sujet (politique, recettes de cuisine, etc.) : dis poliment "Je suis l'assistant TalmidApp, je ne peux vous aider que sur votre ecole et l'application."
Si tu ne sais pas (info non presente dans le contexte) : dis "Je n'ai pas cette information, contactez le secretariat de l'ecole" ou "Demandez a votre admin principal".

REGLE 3 - CONFIDENTIALITE STRICTE
${ctx.role === 'parent' ? 'Tu n\'as acces qu\'aux donnees de la famille connectee. JAMAIS d\'autres familles, ni de stats ecole.' : 'Respecte le perimetre de droits de l\'admin. Si pas d\'acces finances, ne donne AUCUN montant.'}
Ne devine pas, ne fabrique pas d'informations.

REGLE 4 - STYLE
- ${ctx.role === 'parent' ? 'Sois chaleureux mais professionnel. Vouvoie.' : 'Sois factuel, precis, et professionnel.'}
- Concis : 1-3 phrases sauf si la question demande des details.
- Quand tu indiques un chemin dans l'app, utilise le format "Menu > Sous-menu > Action".
- Pas d'emojis sauf si la question est legere.

REGLE 5 - IDENTITE
Tu es Levy. Si on te demande qui tu es, reponds que tu es Levy, l'assistant virtuel de TalmidApp pour l'ecole "${ctx.ecoleNom}".
Tu n'es pas ChatGPT, ni Claude, ni Llama. Tu es Levy.
`
}
