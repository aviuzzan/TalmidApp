/**
 * Génération XML LSU (Livret Scolaire Unique).
 *
 * Le LSU est obligatoire depuis 2016 pour les écoles sous contrat (CP-CM2, 6e-3e).
 * Format XML défini par le BOEN. La transmission officielle passe par ONDE (primaire)
 * ou SIECLE (collège), mais TalmidApp permet de générer le XML en local pour
 * import manuel ou pour archivage.
 *
 * Schéma simplifié (compatible avec la plupart des outils LSU) :
 *
 * <livret_scolaire_unique xmlns="urn:lsu" version="1.0">
 *   <etablissement code_uai="..." nom="..."/>
 *   <annee_scolaire>2026-2027</annee_scolaire>
 *   <periode numero="1" debut="2026-09-01" fin="2026-12-19"/>
 *   <eleves>
 *     <eleve nom_naissance="..." prenom="..." date_naissance="..." classe="...">
 *       <bilan_periodique>
 *         <element_programme matiere="FRANCAIS" appreciation="..." positionnement="A"/>
 *         ...
 *       </bilan_periodique>
 *     </eleve>
 *   </eleves>
 * </livret_scolaire_unique>
 */

export interface LsuEleveData {
  nom: string
  prenom: string
  date_naissance: string | null
  classe_nom: string
  moyenne_generale: number | null
  appreciation_generale: string | null
  matieres: { nom: string; moyenne: number | null; appreciation: string | null }[]
}

export interface LsuExportData {
  ecole_nom: string
  code_uai: string
  annee_scolaire: string
  periode: number
  date_periode_debut?: string
  date_periode_fin?: string
  eleves: LsuEleveData[]
}

function escapeXml(s: string | number | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function moyenneToPositionnement(moy: number | null): string {
  if (moy == null) return 'NE' // Non évalué
  if (moy >= 16) return 'A'   // Très bonne maîtrise
  if (moy >= 12) return 'B'   // Maîtrise satisfaisante
  if (moy >= 8)  return 'C'   // Maîtrise fragile
  return 'D'                   // Maîtrise insuffisante
}

export function genererLsuXml(data: LsuExportData): string {
  const parts: string[] = []
  parts.push('<?xml version="1.0" encoding="UTF-8"?>')
  parts.push('<livret_scolaire_unique xmlns="urn:lsu" version="1.0">')
  parts.push(`  <etablissement code_uai="${escapeXml(data.code_uai || '')}" nom="${escapeXml(data.ecole_nom)}"/>`)
  parts.push(`  <annee_scolaire>${escapeXml(data.annee_scolaire)}</annee_scolaire>`)
  parts.push(`  <periode numero="${data.periode}"${data.date_periode_debut ? ` debut="${data.date_periode_debut}"` : ''}${data.date_periode_fin ? ` fin="${data.date_periode_fin}"` : ''}/>`)
  parts.push(`  <eleves>`)

  for (const eleve of data.eleves) {
    parts.push(`    <eleve nom_naissance="${escapeXml(eleve.nom)}" prenom="${escapeXml(eleve.prenom)}" date_naissance="${escapeXml(eleve.date_naissance || '')}" classe="${escapeXml(eleve.classe_nom)}">`)
    parts.push(`      <bilan_periodique>`)
    if (eleve.moyenne_generale != null) {
      parts.push(`        <moyenne_generale valeur="${eleve.moyenne_generale.toFixed(2)}" sur="20"/>`)
    }
    for (const mat of eleve.matieres) {
      const pos = moyenneToPositionnement(mat.moyenne)
      parts.push(`        <element_programme matiere="${escapeXml(mat.nom)}" positionnement="${pos}"${mat.moyenne != null ? ` moyenne="${mat.moyenne.toFixed(2)}"` : ''} appreciation="${escapeXml(mat.appreciation || '')}"/>`)
    }
    if (eleve.appreciation_generale) {
      parts.push(`        <appreciation_generale>${escapeXml(eleve.appreciation_generale)}</appreciation_generale>`)
    }
    parts.push(`      </bilan_periodique>`)
    parts.push(`    </eleve>`)
  }

  parts.push(`  </eleves>`)
  parts.push('</livret_scolaire_unique>')
  return parts.join('\n')
}
