/**
 * Export FEC (Fichier d'Échanges Comptables) — réglementation France BOFIP-BIC-DECLA-30-10-20-40.
 * Format : 18 colonnes séparées par tabulation, encodage UTF-8.
 *
 * Génère les écritures comptables à partir des factures + règlements + avoirs sur la période demandée.
 *
 * GET /api/compta/fec?ecole_id=...&debut=2025-09-01&fin=2026-08-31
 * GET /api/compta/fec?ecole_id=...&exercice=2025-2026        (dates lues en base)
 * GET /api/compta/fec?ecole_id=...&exercice_id=<uuid>
 *
 * ──────────────────────────────────────────────────────────────────────────
 * REFONTE ssss2-B — POURQUOI
 * ──────────────────────────────────────────────────────────────────────────
 * La version précédente portait un objet `COMPTE` avec des numéros CODÉS EN
 * DUR ('411', '706', '512', '530', '4191'…). Conséquences comptables :
 *   - TOUT produit partait sur le 706, quel que soit le poste : scolarité,
 *     cantine, transport et navette finissaient au même endroit, donc aucune
 *     ventilation exploitable par l'expert-comptable ;
 *   - une facture ne produisait qu'UNE ligne de crédit agrégée alors que
 *     `facture_lignes` était déjà chargé (et sa `description` jamais lue) ;
 *   - le compte auxiliaire était formé en `F-<numero>` ici et en
 *     `411<nom normalisé>` sur la page relevé client : deux conventions
 *     divergentes pour la même famille, donc un lettrage impossible ;
 *   - `CompAuxLib` valait le nom du parent 1 dans le bloc Ventes et le nom de
 *     famille dans le bloc Règlements : le même compte auxiliaire changeait
 *     de libellé au milieu du fichier.
 *
 * Désormais :
 *   - les comptes de contrepartie viennent de `imputations_defaut` (clés
 *     'client', 'banque', 'caisse', 'avoir', 'poste_defaut') ;
 *   - les ventes sont ventilées LIGNE PAR LIGNE, agrégées par `compte_id` ;
 *   - le compte auxiliaire est `familles.compte_auxiliaire` (convention
 *     unique, persistée, partagée avec la page relevé 411) ;
 *   - `CompAuxLib` vaut `familles.nom` PARTOUT : c'est le libellé du compte
 *     auxiliaire, pas celui d'un parent ;
 *   - la période est lue sur `exercices.date_debut` / `date_fin`.
 *
 * RÈGLE STRUCTURANTE : on ne fabrique JAMAIS un numéro de compte. S'il manque
 * une imputation, on refuse le fichier avec un message précis. Un faux numéro
 * dans un fichier réglementaire est pire que pas de fichier du tout.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * xxxx2 — CRÉANCES DOUTEUSES (4161)
 * ──────────────────────────────────────────────────────────────────────────
 * Une famille marquée `familles.douteux` voit sa créance présentée sur le
 * compte de la clé `creance_douteuse` (4161) au lieu de la clé `client` (411),
 * dans les TROIS journaux qui la touchent : débit VE, crédit BQ, crédit OD des
 * avoirs imputés. Compte auxiliaire inchangé (même tiers), montants inchangés.
 * La bascule N'EST PAS datée par facture : le statut courant est appliqué à
 * tout l'exercice exporté — simplification assumée, documentée sur la fonction
 * `compteCreance` et signalée dans l'en-tête X-FEC-Avertissements.
 */
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { chargerParLots, decouperEnTranches } from '@/lib/pagination'
import { chargerImputations, type CleImputation } from '@/lib/comptabilite'

function formatDate(d: string): string {
  return d.replace(/-/g, '')
}
function formatMontant(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
function escape(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/[\t\n\r]/g, ' ')
}

/**
 * Les montants sont manipulés en CENTIMES entiers pendant toute la
 * construction du fichier. En flottant, `0.1 + 0.2 !== 0.3` : un contrôle
 * d'équilibre débit/crédit sur des `number` finit par signaler un écart
 * fantôme de 1e-10, ou pire, par en masquer un vrai.
 */
function enCentimes(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) : 0
}
function enEuros(centimes: number): number {
  return centimes / 100
}

/**
 * Repli de compte auxiliaire quand `familles.compte_auxiliaire` est NULL.
 *
 * On REPRODUIT ici exactement l'algorithme de la page relevé client
 * (`familles/[id]/compte/page.tsx`), qui est aussi celui avec lequel la
 * colonne `compte_auxiliaire` a été générée : `411` + numéro (ou nom)
 * normalisé. Reprendre l'ancien `F-<numero>` propre au FEC ferait resurgir
 * la divergence de conventions que cette refonte corrige — le relevé et le
 * FEC doivent désigner la même famille par le même code, sinon aucun
 * lettrage n'est possible.
 */
function compteAuxiliaireDeRepli(numero: unknown, nom: unknown): string {
  const base = String(numero || nom || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10)
  return '411' + (base || 'CLIENT')
}

/** Un compte du plan comptable, prêt à écrire dans les colonnes CompteNum/CompteLib. */
type CompteFec = { code: string; libelle: string }

/** Une ligne du fichier, avant sérialisation. Montants en centimes. */
type LigneFec = {
  journal: string
  journalLib: string
  num: string
  date: string
  compteNum: string
  compteLib: string
  auxNum: string
  auxLib: string
  ref: string
  lib: string
  debit: number
  credit: number
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const ecole_id = url.searchParams.get('ecole_id')
    const debutParam = url.searchParams.get('debut')
    const finParam = url.searchParams.get('fin')
    const exerciceCode = url.searchParams.get('exercice')
    const exerciceId = url.searchParams.get('exercice_id')

    if (!ecole_id) {
      return NextResponse.json({ error: 'ecole_id requis' }, { status: 400 })
    }
    if (!exerciceCode && !exerciceId && (!debutParam || !finParam)) {
      return NextResponse.json(
        { error: 'Periode requise : exercice (ou exercice_id), ou bien debut + fin (YYYY-MM-DD)' },
        { status: 400 },
      )
    }

    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérif droits
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await supa.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: profile } = await supa.from('profiles').select('role, ecole_id, acces_finances').eq('id', caller.id).single()
    if (!['admin', 'super_admin', 'agent'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    // FIX secu 27/07 : check tenant — un admin ne peut exporter que le FEC de sa propre école
    if (profile?.role !== 'super_admin' && profile?.ecole_id !== ecole_id) {
      return NextResponse.json({ error: 'Accès refusé à cette école' }, { status: 403 })
    }
    // llll2 : verrou finances cote API
    if (profile?.role !== 'super_admin' && profile?.acces_finances === false) {
      return NextResponse.json({ error: 'Accès finances non accordé' }, { status: 403 })
    }

    // Avertissements non bloquants remontés en en-tête HTTP (le corps de la
    // réponse est le fichier lui-même, on ne peut rien y glisser).
    const avertissements: string[] = []

    // ────────────────────────────────────────────────────────────────────
    // PÉRIODE — lue en base, pas déduite du code d'exercice
    // ────────────────────────────────────────────────────────────────────
    // L'appelant historique (page Exports) calcule `${yDeb}-09-01` →
    // `${yFin}-08-31` à partir du code d'exercice, alors que `exercices`
    // porte les vraies dates. Une école dont l'exercice court du 1er août au
    // 31 juillet voyait donc son FEC amputé de deux mois, sans aucun signal.
    const periode = await resoudrePeriode(supa, ecole_id, {
      exerciceId,
      exerciceCode,
      debut: debutParam,
      fin: finParam,
      avertissements,
    })
    if (!periode) {
      return NextResponse.json(
        { error: 'Periode introuvable : exercice inconnu pour cette ecole et aucun couple debut/fin fourni.' },
        { status: 400 },
      )
    }
    const { debut, fin } = periode

    // ────────────────────────────────────────────────────────────────────
    // PARAMÉTRAGE COMPTABLE
    // ────────────────────────────────────────────────────────────────────
    // `chargerImputations().parCle(x)` retombe SILENCIEUSEMENT sur
    // 'poste_defaut' quand la clé `x` n'est pas paramétrée (comportement
    // voulu pour la facturation : mieux vaut imputer au compte de repli que
    // de ne rien imputer). Pour un FEC c'est inacceptable : ça écrirait un
    // compte de produit 706 en contrepartie d'un encaissement bancaire. On
    // relit donc la liste des clés RÉELLEMENT paramétrées pour savoir
    // distinguer « configuré » de « repli ».
    const { data: clesRows, error: clesErr } = await supa
      .from('imputations_defaut')
      .select('cle')
      .eq('ecole_id', ecole_id)
    if (clesErr) {
      return NextResponse.json(
        { error: `Lecture du parametrage comptable (imputations_defaut) en echec : ${clesErr.message}` },
        { status: 500 },
      )
    }
    const clesConfigurees = new Set<string>((clesRows || []).map((r: any) => String(r.cle)))
    const imputations = await chargerImputations(supa, ecole_id)

    /** Compte de contrepartie paramétré, ou `null` si la clé n'existe pas. */
    const contrepartie = (cle: CleImputation): CompteFec | null => {
      if (!clesConfigurees.has(cle)) return null
      const imp = imputations.parCle(cle)
      if (!imp.compte_code) return null
      return { code: String(imp.compte_code), libelle: String(imp.compte_libelle || '') }
    }
    const cptClient = contrepartie('client')
    const cptBanque = contrepartie('banque')
    const cptCaisse = contrepartie('caisse')
    const cptAvoir = contrepartie('avoir')
    const cptDefaut = contrepartie('poste_defaut')
    // xxxx2 : compte 4161 « Familles - créances douteuses ». Même schéma
    // fail-closed que les autres clés : s'il n'est pas paramétré alors qu'une
    // famille douteuse est rencontrée, l'export est REFUSÉ. On ne dérive pas
    // « 4161 » depuis « 411 » et on ne retombe pas sur le 411 : présenter une
    // créance douteuse en compte client ordinaire fausse le poste clients du
    // bilan, et fabriquer un numéro dans un fichier réglementaire est pire
    // encore.
    const cptDouteux = contrepartie('creance_douteuse')

    /** Clés d'imputation manquantes effectivement RENCONTRÉES pendant la construction. */
    const manques = new Set<string>()

    // Récupération données
    // FIX audit 24/07/2026 :
    //  - filtre ecole_id sur les 3 requetes (service-role bypasse la RLS : sans
    //    filtre, le FEC contenait les ecritures de TOUTES les ecoles)
    //  - mode_paiement (colonne reelle) au lieu de mode (inexistante)
    //  - exclusion des reglements mode_paiement='avoir' des flux BQ (imputations
    //    d'avoir, deja comptabilisees via l'ecriture OD de l'avoir : les inclure
    //    ferait un double comptage)
    //  - exclusion des avoirs annules
    //
    // FIX pagination 29/07/2026 : les 3 requetes n'avaient ni `.range()` ni tri.
    // PostgREST plafonne SILENCIEUSEMENT a 1000 lignes : au-dela, le FEC etait
    // tronque SANS erreur -> fichier desequilibre (debit != credit) et incomplet
    // en cas de controle fiscal. Aggravant : la route utilise le client
    // service_role, donc aucune RLS ne limite le volume. On pagine desormais par
    // lots de 1000 avec un tri DETERMINISTE (date + `id` unique en departage :
    // sans cle unique en fin de tri, deux lots peuvent se recouvrir ou sauter des
    // ecritures) et STABLE d'un export a l'autre.
    // cccc4 (M8) — precision : ce tri ne rend PAS `EcritureNum` chronologique.
    // `ecritureNum` est un compteur global incremente dans l'ordre du code :
    // toutes les factures, puis tous les reglements, puis tous les avoirs. Un
    // reglement de septembre peut donc porter un numero superieur a une facture
    // d'octobre. C'est conforme (numerotation globale croissante et unique,
    // BOI-CF-IOR-60-40), mais l'ancien commentaire promettait une propriete
    // chronologique qui n'est pas garantie.
    // Sur un export reglementaire, une lecture partielle NE DOIT PAS produire de
    // fichier : toute erreur ou troncature renvoie une 500 explicite.
    //
    // ssss2-B : `facture_lignes` remonte desormais `compte_id` (imputation
    // snapshot) et `description` (libelle d'origine), et `familles` remonte
    // `compte_auxiliaire`. Les comptes du plan sont charges a part : on ne
    // passe pas par une jointure imbriquee `facture_lignes -> comptes` car le
    // nom de la contrainte FK n'est pas garanti sur tous les environnements,
    // et une jointure imbriquee sur un embed n'est pas paginable.
    const [resEcole, resFactures, resReglements, resAvoirs, resComptes] = await Promise.all([
      // FIX ssss2 pt2 : la colonne s'appelle `siren`, PAS `siret`. La requete
      // demandait `siret` -> PostgREST rendait une erreur, `data` restait null,
      // et comme l'erreur etait avalee (`{ data: ecole }` sans `error`), le nom
      // de fichier reglementaire sortait toujours en `000000000FEC….txt`. Le
      // defaut a tenu des mois precisement parce que rien ne testait `error` :
      // on le teste desormais explicitement ci-dessous.
      supa.from('ecoles').select('nom, siren').eq('id', ecole_id).single(),
      chargerParLots((from, to) => supa.from('factures')
        .select('id, numero, date_emission, statut, famille_id, familles!inner(nom, numero, compte_auxiliaire, ecole_id, douteux), facture_lignes(id, montant, description, compte_id)')
        .eq('familles.ecole_id', ecole_id)
        .gte('date_emission', debut).lte('date_emission', fin)
        .order('date_emission', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)),
      chargerParLots((from, to) => supa.from('reglements')
        .select('id, date_reglement, montant, mode_paiement, reference, factures!inner(numero, famille_id, familles!inner(nom, numero, compte_auxiliaire, ecole_id, douteux))')
        .eq('factures.familles.ecole_id', ecole_id)
        .neq('mode_paiement', 'avoir')
        .gte('date_reglement', debut).lte('date_reglement', fin)
        .order('date_reglement', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)),
      // ssss2 pt1 : `montant_utilise` (complete par `statut` sur les lignes
      // anciennes) distingue la part IMPUTEE d'un avoir de la part encore en
      // attente. Les deux n'ont pas la meme contrepartie, cf. bloc 3 plus bas.
      // `facture_origine_id` n'est volontairement PAS lu : il designe la facture
      // qui a donne naissance a l'avoir, pas celle sur laquelle il est impute.
      chargerParLots((from, to) => supa.from('avoirs')
        .select('id, numero, date_emission, montant, montant_utilise, motif, statut, famille_id, familles!inner(nom, numero, compte_auxiliaire, ecole_id, douteux)')
        .eq('familles.ecole_id', ecole_id)
        .neq('statut', 'annule')
        .gte('date_emission', debut).lte('date_emission', fin)
        .order('date_emission', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)),
      // Pas de filtre `actif` : un compte desactive depuis peut rester porte
      // par des lignes anciennes, et son libelle doit malgre tout sortir.
      chargerParLots((from, to) => supa.from('comptes_comptables')
        .select('id, code, libelle')
        .eq('ecole_id', ecole_id)
        .order('id', { ascending: true })
        .range(from, to)),
    ])

    // Un FEC partiel est pire que pas de FEC (debit != credit, ecritures
    // manquantes) : on refuse d'emettre le fichier plutot que de le tronquer.
    const lectures: { table: string; res: { error: string | null; tronque: boolean } }[] = [
      { table: 'factures', res: resFactures },
      { table: 'reglements', res: resReglements },
      { table: 'avoirs', res: resAvoirs },
      { table: 'comptes_comptables', res: resComptes },
    ]
    for (const { table, res } of lectures) {
      if (res.error) {
        return NextResponse.json(
          { error: `Lecture ${table} en echec, export FEC interrompu (un FEC partiel serait desequilibre) : ${res.error}` },
          { status: 500 },
        )
      }
      if (res.tronque) {
        return NextResponse.json(
          { error: `Volume ${table} superieur au garde-fou de pagination : export FEC interrompu pour ne pas produire un fichier incomplet. Restreindre la periode demandee.` },
          { status: 500 },
        )
      }
    }

    // Lecture de l'ecole : non bloquante (le FEC reste valide sans SIREN), mais
    // JAMAIS silencieuse. Un SIREN absent ou une lecture en echec produit un nom
    // de fichier non conforme : l'appelant doit le savoir.
    const ecole = resEcole.data as { nom?: string | null; siren?: string | null } | null
    if (resEcole.error) {
      avertissements.push(`Lecture ecoles en echec (${resEcole.error.message}) : nom de fichier sans SIREN`)
    } else if (!String(ecole?.siren || '').trim()) {
      avertissements.push('SIREN de l\'ecole non renseigne : nom de fichier en 000000000 (a completer dans Parametres > Ecole)')
    }

    const factures = resFactures.rows as any[]
    const reglements = resReglements.rows as any[]
    const avoirs = resAvoirs.rows as any[]

    // ────────────────────────────────────────────────────────────────────
    // FIX secu/compta cccc4 (G4) : la part IMPUTEE d'un avoir se lisait dans
    // `avoirs.montant_utilise`, colonne qui n'est JAMAIS ecrite (ni par l'UI
    // d'imputation, ni par l'imputation automatique, ni par aucune fonction
    // Postgres). La verite est dans `avoirs_imputations`. Sur un avoir
    // partiellement impute (statut 'partiellement_utilise'), le repli
    // `statut === 'utilise'` ne s'appliquait pas : impute valait 0, le FEC
    // creditait 0 EUR au 411/4161 et la totalite au 4197, alors qu'une partie
    // avait deja reduit la dette. Le fichier restait equilibre (le debit vaut
    // toujours le montant total), donc le garde-fou d'equilibre ne voyait rien :
    // c'etait une erreur de REPARTITION entre comptes, silencieuse.
    const imputeParAvoir = new Map<string, number>()
    if (avoirs.length > 0) {
      const idsAvoirs = avoirs.map(a => String(a.id)).filter(Boolean)
      // `.in(...)` passe par l'URL : on decoupe pour ne pas la faire exploser.
      for (const tranche of decouperEnTranches(idsAvoirs)) {
        const resImputations = await chargerParLots((from, to) => supa
          .from('avoirs_imputations')
          .select('avoir_id, montant')
          .in('avoir_id', tranche)
          .order('avoir_id', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to))
        if (resImputations.error) {
          return NextResponse.json(
            { error: `Lecture avoirs_imputations en echec, export FEC interrompu (la repartition 411/4197 des avoirs serait fausse) : ${resImputations.error}` },
            { status: 500 },
          )
        }
        if (resImputations.tronque) {
          return NextResponse.json(
            { error: 'Volume avoirs_imputations superieur au garde-fou de pagination : export FEC interrompu. Restreindre la periode demandee.' },
            { status: 500 },
          )
        }
        for (const imp of resImputations.rows as any[]) {
          const k = String(imp?.avoir_id || '')
          if (!k) continue
          imputeParAvoir.set(k, (imputeParAvoir.get(k) || 0) + enCentimes(imp?.montant))
        }
      }
    }

    /** id de compte -> { code, libelle }. */
    const comptesParId = new Map<string, CompteFec>()
    for (const c of resComptes.rows as any[]) {
      if (!c?.id || !c?.code) continue
      comptesParId.set(String(c.id), { code: String(c.code), libelle: String(c.libelle || '') })
    }

    // Compteurs de qualité de données, exploités plus bas.
    let nbLignesNonImputees = 0        // lignes rattachees au compte de repli
    let nbLignesSansCompteNiRepli = 0  // lignes qu'on ne sait imputer du tout
    const famillesSansAuxiliaire = new Set<string>()

    /** Familles rencontrées en créance douteuse (pour l'avertissement d'en-tête). */
    const famillesDouteuses = new Set<string>()

    /**
     * xxxx2 — COMPTE DE CRÉANCE D'UNE FAMILLE : 411 ou 4161 ?
     * ────────────────────────────────────────────────────────────────────
     * Une famille marquée `douteux` voit sa créance présentée sur le compte
     * de la clé `creance_douteuse` (4161) au lieu du compte client ordinaire
     * (clé `client`, 411). Le COMPTE AUXILIAIRE reste rigoureusement le même :
     * c'est le même tiers, seule la nature de la créance change. C'est ce qui
     * permet de continuer à lettrer le dossier de bout en bout.
     *
     * Cette fonction est utilisée pour les TROIS mouvements qui touchent la
     * créance : le débit de facturation (VE), le crédit d'encaissement (BQ) et
     * le crédit d'avoir imputé (OD). Débiter en 4161 et créditer en 411
     * rendrait le lettrage impossible et laisserait les deux comptes soldés à
     * tort — le crédit doit toujours aller là où est le débit.
     *
     * ⚠️ SIMPLIFICATION ASSUMÉE — LE STATUT N'EST PAS DATÉ PAR FACTURE.
     * `familles.douteux` est un état COURANT : la base garde bien une date de
     * bascule (`douteux_depuis`) et un historique (`familles_douteux_log`),
     * mais on n'essaie pas de reconstituer, écriture par écriture, si la
     * famille était douteuse à la date de chaque facture. Le statut ACTUEL est
     * appliqué à TOUT l'exercice exporté : une famille basculée en mai voit ses
     * factures de septembre déjà présentées en 4161.
     * POURQUOI : le classement en douteux est une appréciation portée à la
     * clôture sur une créance, pas un évènement qui coupe l'exercice en deux.
     * Reclasser à la date de bascule produirait une famille à cheval sur 411 et
     * 4161 dans le même exercice, donc deux soldes partiels impossibles à
     * lettrer. La contrepartie de ce choix : un export relancé après une
     * bascule ne rend pas le même fichier qu'avant. C'est signalé dans
     * l'en-tête X-FEC-Avertissements.
     */
    const compteCreance = (fam: any): CompteFec | null => {
      if (fam?.douteux === true) {
        famillesDouteuses.add(String(fam?.numero || fam?.nom || '?'))
        if (!cptDouteux) { manques.add('creance_douteuse'); return null }
        return cptDouteux
      }
      if (!cptClient) { manques.add('client'); return null }
      return cptClient
    }

    /** Compte auxiliaire d'une famille, avec repli signalé. */
    const auxDeFamille = (fam: any, familleId: unknown): string => {
      const persistant = String(fam?.compte_auxiliaire || '').trim()
      if (persistant) return persistant.substring(0, 20)
      famillesSansAuxiliaire.add(String(fam?.numero || fam?.nom || familleId || '?'))
      return compteAuxiliaireDeRepli(fam?.numero || familleId, fam?.nom).substring(0, 20)
    }

    const lignesFec: LigneFec[] = []
    let ecritureNum = 1

    // ────────────────────────────────────────────────────────────────────
    // 1. Écritures de facturation (VE - ventes) — VENTILÉES PAR COMPTE
    // ────────────────────────────────────────────────────────────────────
    for (const f of factures) {
      const statut = String(f.statut || '').toLowerCase()
      if (statut === 'annule' || statut === 'annulee') continue

      // Agrégation des lignes de la facture par compte de produit.
      // Une facture « scolarité + cantine + navette » produit donc trois
      // lignes de crédit distinctes, et non plus un seul 706 fourre-tout.
      const parCompte = new Map<string, { compte: CompteFec; centimes: number; libelles: string[] }>()
      let totalCentimes = 0
      let factureNonImputable = false

      for (const l of (f.facture_lignes || []) as any[]) {
        const c = enCentimes(l.montant)
        if (c === 0) continue
        totalCentimes += c

        let compte = l.compte_id ? comptesParId.get(String(l.compte_id)) || null : null
        if (!compte) {
          // Ligne historique (colonnes d'imputation à NULL) ou compte
          // supprimé : repli sur `poste_defaut`. Si ce dernier n'est pas
          // paramétré, on n'invente RIEN — le fichier sera refusé plus bas.
          nbLignesNonImputees++
          compte = cptDefaut
          if (!compte) {
            nbLignesSansCompteNiRepli++
            manques.add('poste_defaut')
            factureNonImputable = true
            continue
          }
        }
        const cle = compte.code
        const agg = parCompte.get(cle) || { compte, centimes: 0, libelles: [] }
        agg.centimes += c
        // `description` était chargée et jamais utilisée : elle sert
        // maintenant de libellé d'écriture quand la facture ne concerne
        // qu'un seul poste sur ce compte.
        const d = String(l.description || '').trim()
        if (d && !agg.libelles.includes(d)) agg.libelles.push(d)
        parCompte.set(cle, agg)
      }

      if (factureNonImputable) continue
      if (totalCentimes <= 0) continue

      const date = formatDate(f.date_emission || debut)
      const fam = f.familles
      const aux = auxDeFamille(fam, f.famille_id)
      // CompAuxLib = libellé du COMPTE AUXILIAIRE, donc le nom de famille,
      // identique dans les trois journaux. Auparavant : parent1 en VE et
      // familles.nom en BQ, soit deux libellés pour un même CompAuxNum.
      const auxLib = String(fam?.nom || '')
      const ref = f.numero || ''
      const libEcriture = `Facture ${ref} - ${auxLib}`.trim()
      const num = String(ecritureNum++).padStart(6, '0')

      // 411 ou 4161 selon le statut ACTUEL de la famille (cf. compteCreance).
      const cptCreance = compteCreance(fam)
      if (!cptCreance) continue

      // Débit client (compte auxiliaire famille). Le montant débité est la
      // SOMME DES GROUPES ARRONDIS, pas le total arrondi séparément : sinon
      // un centime d'arrondi ferait basculer l'écriture en déséquilibre.
      // Array.from plutôt qu'une itération directe sur le Map : le tsconfig du
      // projet ne définit pas de `target`, donc l'itérateur d'un Map n'est pas
      // parcourable directement (il faudrait `downlevelIteration`).
      const groupes = Array.from(parCompte.values())

      let debitClient = 0
      for (const agg of groupes) debitClient += agg.centimes

      lignesFec.push({
        journal: 'VE', journalLib: 'Ventes', num, date,
        compteNum: cptCreance.code, compteLib: cptCreance.libelle || 'Clients',
        auxNum: aux, auxLib,
        ref, lib: libEcriture,
        debit: debitClient, credit: 0,
      })

      for (const agg of groupes) {
        // Libellé de la ligne de crédit : le libellé du compte, complété du
        // détail des postes quand il est court.
        const detail = agg.libelles.length === 1 ? ` (${agg.libelles[0]})` : ''
        const lib = `${agg.compte.libelle || agg.compte.code}${detail} - ${ref}`.trim()
        if (agg.centimes >= 0) {
          lignesFec.push({
            journal: 'VE', journalLib: 'Ventes', num, date,
            compteNum: agg.compte.code, compteLib: agg.compte.libelle || agg.compte.code,
            auxNum: '', auxLib: '',
            ref, lib,
            debit: 0, credit: agg.centimes,
          })
        } else {
          // Un groupe négatif (remises regroupées sur un compte de produit)
          // ne s'écrit pas « crédit négatif » : le FEC n'admet pas de montant
          // signé. On le passe au débit du même compte, l'équilibre est
          // conservé par construction.
          lignesFec.push({
            journal: 'VE', journalLib: 'Ventes', num, date,
            compteNum: agg.compte.code, compteLib: agg.compte.libelle || agg.compte.code,
            auxNum: '', auxLib: '',
            ref, lib,
            debit: -agg.centimes, credit: 0,
          })
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────
    // 2. Écritures de règlement (BQ - banque)
    // Les règlements mode_paiement='avoir' sont exclus en amont (imputations, pas des flux).
    // ────────────────────────────────────────────────────────────────────
    for (const r of reglements) {
      const date = formatDate(r.date_reglement || debut)
      const fam = r.factures?.familles
      const aux = auxDeFamille(fam, r.factures?.famille_id)
      const auxLib = String(fam?.nom || '')
      const ref = r.reference || r.factures?.numero || `R-${String(r.id).substring(0, 8)}`
      const modePaiement = String(r.mode_paiement || '').toLowerCase()
      const lib = `Règlement ${modePaiement || ''} - ${r.factures?.numero || ''}`
      const m = enCentimes(r.montant)
      if (m === 0) continue

      const cptEncaissement = modePaiement === 'especes' ? cptCaisse : cptBanque
      if (!cptEncaissement) {
        manques.add(modePaiement === 'especes' ? 'caisse' : 'banque')
        continue
      }
      // Le crédit doit atterrir sur le MÊME compte que le débit de facturation,
      // sinon le règlement d'une famille douteuse crédite un 411 qui n'a jamais
      // été débité : les deux comptes restent ouverts et le lettrage est mort.
      const cptCreance = compteCreance(fam)
      if (!cptCreance) continue
      const num = String(ecritureNum++).padStart(6, '0')

      lignesFec.push({
        journal: 'BQ', journalLib: 'Banque', num, date,
        compteNum: cptEncaissement.code,
        compteLib: cptEncaissement.libelle || (modePaiement === 'especes' ? 'Caisse' : 'Banque'),
        auxNum: '', auxLib: '',
        ref, lib,
        debit: m, credit: 0,
      })
      lignesFec.push({
        journal: 'BQ', journalLib: 'Banque', num, date,
        compteNum: cptCreance.code, compteLib: cptCreance.libelle || 'Clients',
        auxNum: aux, auxLib,
        ref, lib,
        debit: 0, credit: m,
      })
    }

    // ────────────────────────────────────────────────────────────────────
    // 3. Avoirs (OD - opérations diverses)
    // La table `avoirs` ne porte pas de lignes détaillées : la contrepartie
    // produit ne peut pas être ventilée, elle part sur `poste_defaut`.
    //
    // FIX ssss2 pt1 — POURQUOI DEUX CONTREPARTIES SELON L'IMPUTATION
    // ────────────────────────────────────────────────────────────────
    // La version précédente créditait TOUJOURS le 4197 (clé 'avoir', « Clients
    // - avoirs à établir ») et n'écrivait jamais rien au crédit du compte
    // auxiliaire 4111 de la famille. Or les `reglements` de
    // `mode_paiement = 'avoir'` sont volontairement exclus du journal BQ (ce
    // sont des imputations, pas des flux de trésorerie : les y laisser
    // doublerait le comptage). Résultat : RIEN ne créditait jamais le compte
    // client. Le solde 411 sorti dans le FEC surévaluait la créance du montant
    // cumulé de tous les avoirs imputés, et l'expert-comptable devait lettrer
    // 4111 contre 4197 à la main, avoir par avoir.
    //
    // Règle retenue, avoir par avoir :
    //   - part IMPUTÉE (`montant_utilise`, c'est-à-dire la fraction adossée à
    //     des règlements `mode_paiement='avoir'`) : elle éteint une créance
    //     réelle, donc elle CRÉDITE LE COMPTE CLIENT (clé 'client') avec le
    //     compte auxiliaire de la famille. Elle se lettre alors d'elle-même
    //     contre les débits de facturation du même auxiliaire ;
    //   - part NON IMPUTÉE (`montant - montant_utilise`, avoir émis mais pas
    //     encore adossé à une facture) : aucune créance identifiée en face, on
    //     conserve le compte d'attente 4197 (clé 'avoir'). C'est le seul cas où
    //     ce compte garde son sens.
    // La contrepartie au débit reste le compte de produit dans les deux cas :
    // un avoir annule un produit constaté, il n'a jamais rien à faire au débit
    // du 4197.
    //
    // `montant_utilise` est borné à [0, montant] : une valeur aberrante en base
    // ne doit pas produire un montant négatif (interdit dans un FEC) ni une
    // écriture déséquilibrée.
    for (const a of avoirs) {
      const date = formatDate(a.date_emission || debut)
      const fam = a.familles
      const aux = auxDeFamille(fam, a.famille_id)
      const auxLib = String(fam?.nom || '')
      const ref = a.numero || ''
      const lib = `Avoir ${ref} - ${a.motif || ''}`
      const m = enCentimes(a.montant)
      if (m === 0) continue

      // cccc4 (G4) : la part imputée vient de la somme réelle des lignes de
      // `avoirs_imputations`. `montant_utilise` n'est conservé qu'en repli pour
      // d'éventuelles lignes historiques antérieures à la table d'imputations,
      // et `statut = 'utilise'` reste le dernier filet : un avoir marqué
      // totalement utilisé sans aucune trace d'imputation est intégralement
      // imputé, et son montant doit créditer le client — pas le compte d'attente.
      const statutAvoir = String(a.statut || '').toLowerCase()
      const imputeReel = imputeParAvoir.get(String(a.id)) || 0
      const utiliseBrut = imputeReel > 0 ? imputeReel : enCentimes(a.montant_utilise)
      const impute = statutAvoir === 'utilise' && utiliseBrut <= 0
        ? m
        : Math.min(Math.max(utiliseBrut, 0), m)
      const enAttente = m - impute

      // xxxx2 : même raisonnement qu'en BQ. La part imputée éteint une créance
      // qui a été débitée en 4161 pour une famille douteuse : elle doit créditer
      // ce même 4161. Le compte d'attente 4197 de la part NON imputée, lui, ne
      // change pas — il ne représente aucune créance identifiée, donc rien à
      // reclasser.
      const cptCreance = impute > 0 ? compteCreance(fam) : null
      if (impute > 0 && !cptCreance) continue
      if (enAttente > 0 && !cptAvoir) { manques.add('avoir'); continue }
      if (!cptDefaut) { manques.add('poste_defaut'); continue }
      const num = String(ecritureNum++).padStart(6, '0')

      if (impute > 0) {
        // Crédit du compte de créance : c'est cette ligne qui manquait et qui
        // laissait le 411 débiteur à tort.
        lignesFec.push({
          journal: 'OD', journalLib: 'Opérations diverses', num, date,
          compteNum: cptCreance!.code, compteLib: cptCreance!.libelle || 'Clients',
          auxNum: aux, auxLib,
          ref, lib: `${lib} (imputé)`.trim(),
          debit: 0, credit: impute,
        })
      }
      if (enAttente > 0) {
        // Avoir émis, pas encore adossé à une créance : compte d'attente.
        lignesFec.push({
          journal: 'OD', journalLib: 'Opérations diverses', num, date,
          compteNum: cptAvoir!.code, compteLib: cptAvoir!.libelle || 'Avoirs clients',
          auxNum: aux, auxLib,
          ref, lib: `${lib} (à imputer)`.trim(),
          debit: 0, credit: enAttente,
        })
      }
      // Contrepartie produit : un seul débit pour le montant total de l'avoir,
      // de sorte que l'écriture reste équilibrée quelle que soit la répartition.
      lignesFec.push({
        journal: 'OD', journalLib: 'Opérations diverses', num, date,
        compteNum: cptDefaut.code, compteLib: cptDefaut.libelle || cptDefaut.code,
        auxNum: '', auxLib: '',
        ref, lib,
        debit: m, credit: 0,
      })
    }

    // ────────────────────────────────────────────────────────────────────
    // GARDE-FOU 1 : aucune imputation inventée
    // ────────────────────────────────────────────────────────────────────
    if (manques.size > 0) {
      const details: string[] = []
      if (nbLignesSansCompteNiRepli > 0) {
        details.push(
          `${nbLignesSansCompteNiRepli} ligne(s) de facture sans compte de produit et sans imputation de repli`,
        )
      }
      return NextResponse.json(
        {
          error:
            'Export FEC interrompu : parametrage comptable incomplet. ' +
            `Cle(s) d'imputation manquante(s) dans imputations_defaut : ${Array.from(manques).sort().join(', ')}.` +
            (details.length ? ' ' + details.join(' ; ') + '.' : '') +
            ' Aucun numero de compte n\'est invente : completer Parametres > Comptabilite puis relancer l\'export.',
          cles_manquantes: Array.from(manques).sort(),
          lignes_non_imputables: nbLignesSansCompteNiRepli,
        },
        { status: 500 },
      )
    }

    // ────────────────────────────────────────────────────────────────────
    // GARDE-FOU 2 : équilibre débit / crédit BLOQUANT
    // ────────────────────────────────────────────────────────────────────
    // Un FEC déséquilibré est rejeté par l'administration et fait perdre du
    // temps à tout le monde. Le calcul est fait en centimes entiers, donc un
    // écart non nul est un vrai écart, pas un artefact de flottant.
    let totalDebit = 0
    let totalCredit = 0
    for (const l of lignesFec) { totalDebit += l.debit; totalCredit += l.credit }
    const ecart = totalDebit - totalCredit
    if (ecart !== 0) {
      return NextResponse.json(
        {
          error:
            `Export FEC interrompu : ecritures desequilibrees. Total debit ${formatMontant(enEuros(totalDebit))} EUR, ` +
            `total credit ${formatMontant(enEuros(totalCredit))} EUR, ecart ${formatMontant(enEuros(ecart))} EUR. ` +
            'Le fichier n\'est pas emis (un FEC desequilibre est rejete au controle).',
          total_debit: enEuros(totalDebit),
          total_credit: enEuros(totalCredit),
          ecart: enEuros(ecart),
        },
        { status: 500 },
      )
    }

    // ────────────────────────────────────────────────────────────────────
    // Sérialisation — format inchangé : 18 colonnes, tabulation, CRLF
    // ────────────────────────────────────────────────────────────────────
    const lines: string[] = []
    lines.push([
      'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
      'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
      'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
      'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
    ].join('\t'))

    for (const l of lignesFec) {
      lines.push([
        l.journal, l.journalLib, l.num, l.date,
        escape(l.compteNum), escape(l.compteLib), escape(l.auxNum), escape(l.auxLib),
        escape(l.ref), l.date, escape(l.lib),
        formatMontant(enEuros(l.debit)), formatMontant(enEuros(l.credit)),
        '', '', l.date, '0,00', 'EUR',
      ].join('\t'))
    }

    // Filename FEC standard : SIREN_FECYYYYMMDD.txt
    // Le SIREN fait 9 chiffres ; on ne garde que les chiffres (une saisie du
    // type « 123 456 789 » ou « 123456789 00012 » ne doit pas casser le nom).
    const sirenSaisi = String(ecole?.siren || '').replace(/[^0-9]/g, '')
    const siren = sirenSaisi.substring(0, 9) || '000000000'
    const finStr = fin.replace(/-/g, '')
    const filename = `${siren}FEC${finStr}.txt`

    const content = lines.join('\r\n') + '\r\n'

    if (famillesSansAuxiliaire.size > 0) {
      avertissements.push(
        `${famillesSansAuxiliaire.size} famille(s) sans familles.compte_auxiliaire : repli calcule 411+identifiant`,
      )
    }
    if (nbLignesNonImputees > 0) {
      avertissements.push(
        `${nbLignesNonImputees} ligne(s) de facture sans compte_id rattachee(s) au compte poste_defaut`,
      )
    }
    // xxxx2 : la simplification « statut actuel applique a tout l'exercice » doit
    // etre EXPLICITE pour qui recoit le fichier. Sans ce signal, un expert-comptable
    // qui compare deux exports de la meme periode constaterait des creances passees
    // de 411 a 4161 sans explication. Message volontairement ASCII (en-tete HTTP).
    if (famillesDouteuses.size > 0) {
      avertissements.push(
        `${famillesDouteuses.size} famille(s) en creance douteuse : creances presentees en ${cptDouteux?.code || '4161'} ` +
        '(statut ACTUEL applique a tout l\'exercice exporte, la bascule n\'est pas datee par facture)',
      )
    }

    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Contrôle d'équilibre exposé : l'appelant peut le journaliser.
      'X-FEC-Total-Debit': String(enEuros(totalDebit)),
      'X-FEC-Total-Credit': String(enEuros(totalCredit)),
      'X-FEC-Periode': `${debut}/${fin}`,
      'X-FEC-Periode-Source': periode.source,
    }
    if (avertissements.length > 0) {
      // Les en-têtes HTTP ne tolèrent pas l'UTF-8 : message volontairement ASCII.
      headers['X-FEC-Avertissements'] = avertissements.join(' | ')
    }

    return new NextResponse(content, { status: 200, headers })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}

/**
 * Résout la période à exporter.
 *
 * Ordre de préférence :
 *   1. `exercice_id` / `exercice` fournis -> dates lues sur `exercices` ;
 *   2. à défaut, dates septembre-août déduites du code (repli historique) ;
 *   3. `debut` / `fin` explicites.
 *
 * Cas particulier volontaire : quand l'appelant ne transmet QUE des dates et
 * que celles-ci sont exactement le calendrier par défaut (01-09 -> 31-08), on
 * tente de retrouver l'exercice correspondant et on lui préfère ses vraies
 * dates. C'est précisément le cas de la page Exports, qui calcule la période
 * en dur ; sans ça, la correction n'aurait aucun effet pour l'utilisateur.
 * Une plage réellement personnalisée n'est jamais remplacée.
 */
async function resoudrePeriode(
  supa: any,
  ecoleId: string,
  p: {
    exerciceId: string | null
    exerciceCode: string | null
    debut: string | null
    fin: string | null
    avertissements: string[]
  },
): Promise<{ debut: string; fin: string; source: string } | null> {
  const lireExercice = async (colonne: 'id' | 'code', valeur: string) => {
    const { data, error } = await supa
      .from('exercices')
      .select('id, code, date_debut, date_fin')
      .eq('ecole_id', ecoleId)
      .eq(colonne, valeur)
      .maybeSingle()
    // Une erreur de lecture ne doit pas faire échouer l'export : on le
    // signale et on retombe sur le calcul historique.
    if (error) {
      p.avertissements.push(`Lecture exercices en echec (${error.message}) : periode calculee`)
      return null
    }
    return data || null
  }

  // 1 / 2 — exercice explicitement demandé
  const identifiant = p.exerciceId
    ? ({ colonne: 'id' as const, valeur: p.exerciceId })
    : p.exerciceCode
      ? ({ colonne: 'code' as const, valeur: p.exerciceCode })
      : null
  if (identifiant) {
    const ex = await lireExercice(identifiant.colonne, identifiant.valeur)
    if (ex?.date_debut && ex?.date_fin) {
      return { debut: String(ex.date_debut), fin: String(ex.date_fin), source: 'exercices' }
    }
    const code = String(ex?.code || p.exerciceCode || '')
    const calcule = periodeParDefaut(code)
    if (calcule) {
      p.avertissements.push(
        ex ? 'Exercice sans date_debut/date_fin : periode septembre-aout calculee'
           : 'Exercice introuvable : periode septembre-aout calculee',
      )
      return { ...calcule, source: 'calcul' }
    }
    if (p.debut && p.fin) return { debut: p.debut, fin: p.fin, source: 'parametres' }
    return null
  }

  // 3 — dates explicites
  if (p.debut && p.fin) {
    if (/-09-01$/.test(p.debut) && /-08-31$/.test(p.fin)) {
      const code = `${p.debut.slice(0, 4)}-${p.fin.slice(0, 4)}`
      const ex = await lireExercice('code', code)
      if (ex?.date_debut && ex?.date_fin) {
        if (String(ex.date_debut) !== p.debut || String(ex.date_fin) !== p.fin) {
          p.avertissements.push(
            `Periode alignee sur l'exercice ${code} (${ex.date_debut} -> ${ex.date_fin}) au lieu du calendrier par defaut`,
          )
        }
        return { debut: String(ex.date_debut), fin: String(ex.date_fin), source: 'exercices' }
      }
    }
    return { debut: p.debut, fin: p.fin, source: 'parametres' }
  }

  return null
}

/** Repli historique : exercice « 2025-2026 » -> 01/09/2025 au 31/08/2026. */
function periodeParDefaut(code: string): { debut: string; fin: string } | null {
  const m = /^(\d{4})\s*[-/]\s*(\d{4})$/.exec(String(code).trim())
  if (!m) return null
  return { debut: `${m[1]}-09-01`, fin: `${m[2]}-08-31` }
}
