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
