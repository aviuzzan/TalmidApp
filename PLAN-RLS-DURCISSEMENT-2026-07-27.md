# Plan durcissement RLS (conçu par Fable, NON appliqué) — 27/07/2026

⚠️ À appliquer étape par étape via MCP Supabase APRÈS validation Avi, avec test de
non-régression entre chaque étape (SET LOCAL role authenticated + jwt claims).
Rollback fourni pour chaque étape.

## Root cause trouvée par Fable
`factures_solde` est une VUE SANS `security_invoker` → elle s'exécute avec les droits de
son owner (postgres) et BYPASSE toute la RLS. N'importe quel utilisateur authentifié
(voire anon qui a un GRANT SELECT) lit TOUTES les factures de TOUTES les écoles.
C'est LA faille principale. Correctif : `ALTER VIEW factures_solde SET (security_invoker=true)`
— MAIS uniquement APRÈS avoir ajouté le super_admin aux policies des tables sous-jacentes
(sinon on casse le super_admin qui ne marche aujourd'hui QUE via ce bypass).

## 🔴 Fuites cross-tenant PRÉ-EXISTANTES (pas causées par nous, mais graves)
- `familles_select_authenticated` : USING (auth.uid() IS NOT NULL) → TOUT parent connecté
  lit TOUTES les familles de TOUTES les écoles (noms, emails, téléphones)
- `enfants_select_authenticated` : idem → tous les enfants de toutes les écoles
- `contrats_scolarisation` policy "Parent voit ses contrats" : vérifie role='parent' mais
  PAS famille_id → tout parent lit tous les contrats (montants, données familiales)
- `mandats_sepa` parent_read/update_mandat : tout parent lit/modifie TOUS les mandats
  (IBAN d'autres familles !)
→ Ces 4 fuites sont plus urgentes que le verrou finances. À corriger dans le même chantier.

## Le SQL complet (fonctions + policies + rollback) : voir sortie agent Fable dans le
transcript. Résumé des étapes :
0. Créer 5 fonctions helper SECURITY DEFINER : current_user_ecole_id, current_user_acces_finances,
   is_finance_staff (super_admin OU (admin/agent AND acces_finances)), famille_ecole_id, facture_ecole_id
1. bulletins_paie  2. avoirs (+imputations)  3. mandats_sepa (+ resserrer parent)
4. cheques_prevus  5. factures + facture_lignes + reglements (AJOUTE super_admin + agent + scope école)
6. ALTER VIEW factures_solde security_invoker=true (APRÈS étape 5 obligatoirement)
7. REVOKE anon (défense en profondeur)
+ à ajouter : fix des 4 fuites cross-tenant familles/enfants/contrats
Modules par DB : reporté (permissions_modules trop peu peuplé, risque lock-out).

## Garde-fous "ne jamais bloquer Avi"
- is_finance_staff() fait passer super_admin inconditionnellement
- Avi (admin) et super_admin ont acces_finances=true (vérifié) → gardent tout
- Le SQL Editor reste en service_role → impossible de s'enfermer dehors, rollback en secondes
- Tester en tant qu'Avi + en tant qu'un parent réel entre chaque étape

## État : ✅ APPLIQUÉ INTÉGRALEMENT le 28/07/2026 (llll4), étape par étape avec tests de rôle.

### Ce qui a été appliqué (migrations Supabase MCP, DB-only, AUCUN .bat nécessaire) :
- **rls_durcissement_0_fonctions_helper** : 5 fonctions SECURITY DEFINER (current_user_ecole_id,
  current_user_acces_finances, is_finance_staff, famille_ecole_id, facture_ecole_id).
- **rls_durcissement_1a5_tables_finance** : policies staff (is_finance_staff) sur bulletins_paie,
  avoirs, avoirs_imputations, mandats_sepa, cheques_prevus, factures, facture_lignes, reglements.
  super_admin ajouté AVANT l'étape vue (obligatoire).
- **rls_durcissement_6_vue_factures_solde** : `ALTER VIEW factures_solde SET (security_invoker=true)`
  → la faille racine (vue bypassait toute la RLS) est fermée.
- **rls_durcissement_fuites_familles_enfants_contrats** : les 3 fuites cross-tenant fermées.
  familles_select_authenticated + enfants_select_authenticated (USING auth.uid() IS NOT NULL)
  remplacées par des policies STAFF scopées école (super_admin OU admin/agent de son école).
  "Parent voit ses contrats" corrigée : ajout `famille_id = get_user_famille_id(auth.uid())`.
- **rls_durcissement_7_revoke_anon** : REVOKE ALL anon sur les 9 tables finances + vue ;
  REVOKE SELECT anon sur familles/enfants/contrats_scolarisation (défense en profondeur).

### Tests de non-régression PASSÉS (SET LOCAL role + jwt claims, le 28/07) :
- Avi (admin) : 136 familles, 211 enfants, 94 contrats → OK, rien perdu.
- Parent sans contrat : 1 famille (la sienne), 3 enfants (les siens), 0 contrat, 0 accès famille B → OK.
- Parent AVEC contrat : voit exactement 1 contrat (le sien), 1 famille, 1 enfant → policy ne sur-bloque pas.
- anon : plus aucune lecture sur finances ni PII (grants retirés) → OK.

### Note mandats_sepa : la fuite parent (parent lisait/modifiait TOUS les IBAN) avait déjà été
resserrée lors de l'étape 1a5. Les 4 fuites du plan sont donc toutes traitées.
