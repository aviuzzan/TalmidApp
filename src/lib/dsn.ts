/**
 * Helper DSN (Déclaration Sociale Nominative).
 *
 * La DSN est OBLIGATOIRE pour tous les employeurs depuis 2017.
 * Format : fichier .dsn (texte brut, suite de rubriques structurées S20.G00.05 etc.)
 *
 * Doc officielle : https://www.dsn-info.fr/documentation.htm
 * Norme NEODES : http://www.net-entreprises.fr/
 *
 * ATTENTION : la DSN réelle est extrêmement complexe (200+ rubriques par salarié).
 * Cette implémentation est un STUB minimal pour démarrer ; la production nécessite
 * un module dédié certifié (HelloPay, PayFit, Silae) ou un cabinet d'expertise comptable.
 */

export interface DsnSalarie {
  nir: string                    // Numéro de Sécu (15 chars)
  nom: string
  prenoms: string
  date_naissance: string         // YYYY-MM-DD
  sexe: 'M' | 'F'
  // Salaire
  salaire_brut: number
  salaire_net: number
  cotisations_salariales: number
  cotisations_patronales: number
  csg_crds: number
  heures: number
}

export interface DsnExportData {
  siren: string                  // 9 chars
  raison_sociale: string
  adresse: string
  code_postal: string
  commune: string
  mois: string                   // YYYY-MM
  numero_ordre: number           // 001, 002, ...
  salaries: DsnSalarie[]
}

function rubrique(code: string, value: string | number): string {
  return `${code},'${value}'\n`
}

/**
 * Génère un fichier DSN minimal (structure NEODES P22V01 simplifiée).
 * NE PAS UTILISER EN PRODUCTION SANS VALIDATION PAR UN EXPERT-COMPTABLE.
 */
export function genererDsnFichier(data: DsnExportData): string {
  let out = ''

  // S10.G00.00 - Envoi
  out += rubrique('S10.G00.00.001', 'P22V01')                 // Version norme
  out += rubrique('S10.G00.00.002', 'TalmidApp v1')           // Nom logiciel
  out += rubrique('S10.G00.00.003', '01')                    // Code certification
  out += rubrique('S10.G00.00.004', 'TalmidApp')             // Nom éditeur
  out += rubrique('S10.G00.00.005', '01')                    // Code envoi nominatif
  out += rubrique('S10.G00.00.006', '00')                    // Type envoi

  // S20.G00.05 - Déclaration
  out += rubrique('S20.G00.05.001', '01')                    // Mois principal déclaré
  out += rubrique('S20.G00.05.002', data.mois.replace('-', ''))  // Mois (AAAAMM)
  out += rubrique('S20.G00.05.005', String(data.numero_ordre).padStart(3, '0'))

  // S21.G00.06 - Entreprise
  out += rubrique('S21.G00.06.001', data.siren)
  out += rubrique('S21.G00.06.003', data.raison_sociale)
  out += rubrique('S21.G00.06.004', data.adresse)
  out += rubrique('S21.G00.06.005', data.code_postal)
  out += rubrique('S21.G00.06.006', data.commune)

  // Boucle salariés
  for (const s of data.salaries) {
    out += rubrique('S21.G00.30.001', s.nir)
    out += rubrique('S21.G00.30.002', s.nom)
    out += rubrique('S21.G00.30.004', s.prenoms)
    out += rubrique('S21.G00.30.005', s.date_naissance.replace(/-/g, ''))
    out += rubrique('S21.G00.30.006', s.sexe === 'F' ? '02' : '01')

    // S21.G00.51 - Rémunération
    out += rubrique('S21.G00.51.011', s.salaire_brut.toFixed(2))   // Brut
    out += rubrique('S21.G00.51.012', s.salaire_net.toFixed(2))    // Net
    out += rubrique('S21.G00.51.013', s.cotisations_salariales.toFixed(2))
    out += rubrique('S21.G00.51.014', s.cotisations_patronales.toFixed(2))
  }

  // S90.G00.90 - Fin
  out += rubrique('S90.G00.90.001', String(data.salaries.length))

  return out
}

/**
 * Calcul ultra-simplifié des cotisations (à ne PAS utiliser en production).
 * Charges salariales ~ 22%, patronales ~ 42% du brut.
 */
export function calculerCotisationsApprox(salaireBrut: number): {
  cotisations_salariales: number
  cotisations_patronales: number
  csg_crds: number
  salaire_net: number
  net_imposable: number
} {
  const tauxSal = 0.22
  const tauxPat = 0.42
  const tauxCsg = 0.0975
  const cotisations_salariales = Number((salaireBrut * tauxSal).toFixed(2))
  const cotisations_patronales = Number((salaireBrut * tauxPat).toFixed(2))
  const csg_crds = Number((salaireBrut * tauxCsg).toFixed(2))
  const salaire_net = Number((salaireBrut - cotisations_salariales).toFixed(2))
  const net_imposable = Number((salaire_net + csg_crds * 0.5).toFixed(2))
  return { cotisations_salariales, cotisations_patronales, csg_crds, salaire_net, net_imposable }
}
