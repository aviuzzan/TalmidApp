import type { SupabaseClient } from '@supabase/supabase-js'

export type Niveau = 'aucun' | 'lecture' | 'ecriture' | 'admin'

export const NIVEAUX: Niveau[] = ['aucun', 'lecture', 'ecriture', 'admin']

export const NIVEAU_LABEL: Record<Niveau, string> = {
  aucun: 'Aucun',
  lecture: 'Lecture seule',
  ecriture: 'Écriture',
  admin: 'Admin',
}

export const NIVEAU_COLOR: Record<Niveau, { bg: string; fg: string }> = {
  aucun: { bg: '#F1F5F9', fg: '#94A3B8' },
  lecture: { bg: '#EFF6FF', fg: '#1E40AF' },
  ecriture: { bg: '#FEF3C7', fg: '#92400E' },
  admin: { bg: '#ECFDF5', fg: '#065F46' },
}

const ORDRE_NIVEAU: Record<Niveau, number> = { aucun: 0, lecture: 1, ecriture: 2, admin: 3 }

export function hasAtLeast(niveau: Niveau, requis: Niveau): boolean {
  return ORDRE_NIVEAU[niveau] >= ORDRE_NIVEAU[requis]
}

export interface Module {
  code: string
  nom: string
  description: string | null
  icone: string
  ordre: number
}

export interface UserPermissions {
  perms: Record<string, Niveau> // module_code -> niveau
  has: (moduleCode: string, requis?: Niveau) => boolean
  isAdminPrincipal: boolean
}

/**
 * Charge les permissions d'un user pour une école.
 * Retourne aussi des helpers `has()` et flag `isAdminPrincipal`.
 */
export async function loadPermissions(
  supabase: SupabaseClient,
  profileId: string,
  ecoleId: string
): Promise<UserPermissions> {
  const { data } = await supabase
    .from('permissions_modules')
    .select('module_code, niveau')
    .eq('profile_id', profileId)
    .eq('ecole_id', ecoleId)
  const perms: Record<string, Niveau> = {}
  for (const p of data || []) perms[p.module_code] = p.niveau as Niveau
  const isAdminPrincipal = perms['parametres'] === 'admin'
  return {
    perms,
    has: (code: string, requis: Niveau = 'lecture') => hasAtLeast(perms[code] || 'aucun', requis),
    isAdminPrincipal,
  }
}

/**
 * Templates d'assignation rapide.
 */
export const TEMPLATES: Record<string, { label: string; description: string; permissions: Record<string, Niveau> }> = {
  admin_principal: {
    label: 'Admin principal',
    description: 'Tous modules en admin (équivalent rôle admin actuel)',
    permissions: {
      dashboard: 'admin', administratif: 'admin', inscriptions: 'admin',
      facturation: 'admin', compta: 'admin', paye: 'admin', pedagogie: 'admin',
      professeurs: 'admin', emplois_du_temps: 'admin', transport: 'admin',
      cantine: 'admin', messagerie: 'admin', documents: 'admin', parametres: 'admin',
    },
  },
  comptable: {
    label: 'Comptable',
    description: 'Facturation/compta/paye en admin, reste en lecture',
    permissions: {
      dashboard: 'admin', administratif: 'lecture', inscriptions: 'lecture',
      facturation: 'admin', compta: 'admin', paye: 'admin', pedagogie: 'aucun',
      professeurs: 'lecture', emplois_du_temps: 'lecture', transport: 'aucun',
      cantine: 'lecture', messagerie: 'ecriture', documents: 'lecture', parametres: 'aucun',
    },
  },
  secretariat: {
    label: 'Secrétariat',
    description: 'Administratif + inscriptions + messagerie en écriture',
    permissions: {
      dashboard: 'admin', administratif: 'ecriture', inscriptions: 'ecriture',
      facturation: 'lecture', compta: 'aucun', paye: 'aucun', pedagogie: 'lecture',
      professeurs: 'ecriture', emplois_du_temps: 'lecture', transport: 'ecriture',
      cantine: 'ecriture', messagerie: 'ecriture', documents: 'ecriture', parametres: 'aucun',
    },
  },
  direction: {
    label: 'Direction',
    description: 'Tous modules en lecture minimum',
    permissions: {
      dashboard: 'admin', administratif: 'lecture', inscriptions: 'lecture',
      facturation: 'lecture', compta: 'lecture', paye: 'lecture', pedagogie: 'lecture',
      professeurs: 'lecture', emplois_du_temps: 'lecture', transport: 'lecture',
      cantine: 'lecture', messagerie: 'lecture', documents: 'lecture', parametres: 'lecture',
    },
  },
}

/**
 * Map module_code → URL côté admin école.
 */
export const MODULE_HREF: Record<string, string> = {
  dashboard: 'dashboard',
  administratif: 'familles',
  inscriptions: 'inscriptions',
  facturation: 'finances',
  compta: 'finances',
  paye: 'paye',
  pedagogie: 'pedagogie',
  professeurs: 'professeurs',
  emplois_du_temps: 'emplois-du-temps',
  transport: 'transport',
  cantine: 'cantine',
  messagerie: 'messages',
  documents: 'documents',
  parametres: 'parametres',
}

/**
 * Catégories pour le dashboard admin école.
 * Chaque catégorie regroupe plusieurs modules.
 */
export interface Categorie {
  code: string
  nom: string
  description: string
  icone: string
  couleur: { bg: string; fg: string; border: string }
  modules: string[]
  hrefHub: string // route de la page intermédiaire
}

export const CATEGORIES: Categorie[] = [
  {
    code: 'administration',
    nom: 'Administration',
    description: 'Familles, élèves, comptes parents, inscriptions',
    icone: '👨‍👩‍👧',
    couleur: { bg: '#E6F1FB', fg: '#0C447C', border: '#378ADD' },
    modules: ['administratif', 'inscriptions'],
    hrefHub: 'administration',
  },
  {
    code: 'finances',
    nom: 'Finances',
    description: 'Facturation, comptabilité, paye, SEPA',
    icone: '💰',
    couleur: { bg: '#E1F5EE', fg: '#085041', border: '#1D9E75' },
    modules: ['facturation', 'compta', 'paye'],
    hrefHub: 'finances-hub',
  },
  {
    code: 'pedagogie',
    nom: 'Pédagogie',
    description: 'Programmes, professeurs, emplois du temps',
    icone: '📚',
    couleur: { bg: '#FAEEDA', fg: '#854F0B', border: '#BA7517' },
    modules: ['pedagogie', 'professeurs', 'emplois_du_temps'],
    hrefHub: 'pedagogie',
  },
  {
    code: 'vie_scolaire',
    nom: 'Vie scolaire',
    description: 'Transport, cantine, activités',
    icone: '🚌',
    couleur: { bg: '#EEEDFE', fg: '#3C3489', border: '#7F77DD' },
    modules: ['transport', 'cantine'],
    hrefHub: 'vie-scolaire',
  },
  {
    code: 'communication',
    nom: 'Communication',
    description: 'Messagerie, documents, notifications',
    icone: '💬',
    couleur: { bg: '#FBEAF0', fg: '#72243E', border: '#D4537E' },
    modules: ['messagerie', 'documents'],
    hrefHub: 'communication',
  },
  {
    code: 'configuration',
    nom: 'Paramètres',
    description: 'Paramètres école, comptes & accès',
    icone: '⚙️',
    couleur: { bg: '#F1EFE8', fg: '#444441', border: '#888780' },
    modules: ['parametres'],
    hrefHub: 'configuration',
  },
]

/**
 * Retourne true si user a au moins niveau "lecture" sur AU MOINS UN module de la catégorie.
 * Bypass pour super_admin et admin principal.
 */
export function hasCategoryAccess(
  cat: Categorie,
  perms: Record<string, Niveau>,
  role: string,
  isAdminPrincipal: boolean
): boolean {
  if (role === 'super_admin' || role === 'admin' || isAdminPrincipal) return true
  return cat.modules.some(m => {
    const n = perms[m] || 'aucun'
    return n !== 'aucun'
  })
}
