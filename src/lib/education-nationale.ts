/**
 * Connecteurs Éducation Nationale française.
 *
 * - ONDE (Outil Numérique pour la Direction d'École) : primaire (maternelle + élémentaire)
 *   - Gestion administrative des élèves, transmission au DSDEN
 *   - Pas d'API publique → import/export CSV manuels via fichier .csv UAI
 *
 * - SIECLE (Système d'Information pour les Élèves de Collège et de Lycée) : secondaire
 *   - Export Base Élèves Établissement (BEE) en XML
 *   - Idem : pas d'API publique, échange par fichier
 *
 * - Parcoursup : orientation post-bac
 *   - API LDA (Liaison Données Administratives) pour transmission notes/avis terminaux
 *
 * STRATÉGIE TalmidApp :
 *   - Pour ONDE/SIECLE : génération de fichiers CSV/XML conformes que l'admin importe
 *     manuellement dans son interface académique. Import inverse : upload du fichier
 *     fourni par l'académie, parsing, mapping vers enfants TalmidApp.
 *   - Pour Parcoursup : génération du fichier de notes/avis selon le format LDA.
 *
 * Ce fichier contient les helpers de génération/parsing de fichiers.
 * Pour des connecteurs API réels (quand ONDE/SIECLE ouvriront des APIs), il
 * faudra étendre via getIntegration().
 */

// ============================================================
// ONDE - Export CSV pour import dans ONDE
// ============================================================

export interface OndeEleveData {
  ine?: string                  // Identifiant National Élève (12 chars : 2 lettres + 10 chiffres)
  nom: string
  nom_usage?: string
  prenoms: string               // séparés par espace
  date_naissance: string        // YYYY-MM-DD
  lieu_naissance?: string
  pays_naissance?: string
  sexe: 'M' | 'F'
  adresse?: string
  code_postal?: string
  commune?: string
  classe_nom: string
  niveau_onde?: string          // ex: PS, MS, GS, CP, CE1, CE2, CM1, CM2
  date_entree?: string
  responsables: { lien: string; nom: string; prenom: string; tel?: string; email?: string }[]
}

export function genererOndeCsv(eleves: OndeEleveData[]): string {
  const headers = [
    'INE','Nom','NomUsage','Prenoms','DateNaissance','LieuNaissance','PaysNaissance','Sexe',
    'Adresse','CodePostal','Commune','Classe','NiveauONDE','DateEntree',
    'Responsable1_Lien','Responsable1_Nom','Responsable1_Prenom','Responsable1_Tel','Responsable1_Email',
    'Responsable2_Lien','Responsable2_Nom','Responsable2_Prenom','Responsable2_Tel','Responsable2_Email',
  ]
  const rows: string[] = []
  rows.push(headers.join(';'))
  for (const e of eleves) {
    const r1 = e.responsables?.[0]
    const r2 = e.responsables?.[1]
    const row = [
      e.ine || '', e.nom || '', e.nom_usage || '', e.prenoms || '',
      e.date_naissance || '', e.lieu_naissance || '', e.pays_naissance || 'FRA', e.sexe || '',
      e.adresse || '', e.code_postal || '', e.commune || '',
      e.classe_nom || '', e.niveau_onde || '', e.date_entree || '',
      r1?.lien || '', r1?.nom || '', r1?.prenom || '', r1?.tel || '', r1?.email || '',
      r2?.lien || '', r2?.nom || '', r2?.prenom || '', r2?.tel || '', r2?.email || '',
    ].map(v => escapeCsv(String(v)))
    rows.push(row.join(';'))
  }
  return rows.join('\n')
}

function escapeCsv(v: string): string {
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

// ============================================================
// SIECLE - Export XML BEE
// ============================================================

export interface SiecleEleveData extends OndeEleveData {
  numero_national?: string      // INE 12 chars
  division_nom?: string         // classe (ex: 6A)
  mef?: string                  // Module Élémentaire de Formation
}

export function genererSiecleXml(eleves: SiecleEleveData[], etablissement: { code_uai: string; nom: string }): string {
  const parts: string[] = []
  parts.push('<?xml version="1.0" encoding="UTF-8"?>')
  parts.push('<BEE xmlns="urn:siecle:bee" version="1.0">')
  parts.push(`  <ETABLISSEMENT code_uai="${esc(etablissement.code_uai)}" nom="${esc(etablissement.nom)}"/>`)
  parts.push(`  <ELEVES>`)
  for (const e of eleves) {
    parts.push(`    <ELEVE numero_national="${esc(e.numero_national || e.ine || '')}">`)
    parts.push(`      <IDENTITE>`)
    parts.push(`        <NOM>${esc(e.nom)}</NOM>`)
    parts.push(`        <NOM_USAGE>${esc(e.nom_usage || '')}</NOM_USAGE>`)
    parts.push(`        <PRENOMS>${esc(e.prenoms)}</PRENOMS>`)
    parts.push(`        <DATE_NAISSANCE>${esc(e.date_naissance)}</DATE_NAISSANCE>`)
    parts.push(`        <SEXE>${esc(e.sexe)}</SEXE>`)
    parts.push(`      </IDENTITE>`)
    parts.push(`      <SCOLARITE division="${esc(e.division_nom || e.classe_nom)}" mef="${esc(e.mef || '')}"/>`)
    parts.push(`    </ELEVE>`)
  }
  parts.push(`  </ELEVES>`)
  parts.push('</BEE>')
  return parts.join('\n')
}

function esc(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ============================================================
// Parcoursup - Export CSV LDA simplifié
// ============================================================

export interface ParcoursupCandidatData {
  ine: string
  nom: string
  prenoms: string
  date_naissance: string
  sexe: 'M' | 'F'
  classe_terminale: string                  // ex: TG (Terminale Générale), TST2S, etc.
  moyennes_par_matiere: { matiere: string; moy_t1: number | null; moy_t2: number | null; moy_t3: number | null }[]
  appreciation_chef_etablissement?: string
}

export function genererParcoursupCsv(candidats: ParcoursupCandidatData[]): string {
  const headers = ['INE','Nom','Prenoms','DateNaissance','Sexe','ClasseTerminale','MatiereCode','MoyT1','MoyT2','MoyT3','AppreciationChef']
  const rows: string[] = [headers.join(';')]
  for (const c of candidats) {
    for (const mat of c.moyennes_par_matiere) {
      rows.push([
        c.ine, c.nom, c.prenoms, c.date_naissance, c.sexe, c.classe_terminale,
        mat.matiere, fmtNum(mat.moy_t1), fmtNum(mat.moy_t2), fmtNum(mat.moy_t3),
        c.appreciation_chef_etablissement || '',
      ].map(v => escapeCsv(String(v))).join(';'))
    }
  }
  return rows.join('\n')
}

function fmtNum(n: number | null): string {
  return n == null ? '' : n.toFixed(2).replace('.', ',')
}

// ============================================================
// Parsing CSV pour import inverse (fichier reçu de l'académie)
// ============================================================

export function parseCsv(csvContent: string, separator = ';'): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = splitCsvLine(lines[0], separator)
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], separator)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] || '' })
    rows.push(row)
  }
  return { headers, rows }
}

function splitCsvLine(line: string, sep: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === sep && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += c
    }
  }
  result.push(current)
  return result
}
