'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useExercice } from '@/lib/exercice-context'
import { downloadCSV } from '@/lib/csv-export'

/**
 * Import de la base de données de l'école via fichier CSV.
 * - Une ligne par élève ; les colonnes "famille" sont répétées pour les fratries.
 * - Les élèves d'une même famille sont regroupés par l'email du parent 1.
 * - L'import alimente l'année de RÉFÉRENCE (l'exercice courant) : familles + élèves.
 * - Aucun compte parent n'est créé, aucun email n'est envoyé (bouton séparé).
 */

type Col = { label: string; entity: 'famille' | 'enfant'; field: string; required?: boolean }

const COLUMNS: Col[] = [
  { label: 'Nom de famille', entity: 'famille', field: 'nom', required: true },
  { label: 'Situation familiale (marie/celibataire/divorce/separe/veuf/non_connu)', entity: 'famille', field: 'situation_maritale' },
  { label: 'Parent 1 - Prenom', entity: 'famille', field: 'parent1_prenom' },
  { label: 'Parent 1 - Nom', entity: 'famille', field: 'parent1_nom' },
  { label: 'Parent 1 - Email', entity: 'famille', field: 'parent1_email', required: true },
  { label: 'Parent 1 - Telephone', entity: 'famille', field: 'parent1_telephone' },
  { label: 'Parent 1 - Profession', entity: 'famille', field: 'parent1_emploi' },
  { label: 'Parent 1 - Adresse', entity: 'famille', field: 'parent1_adresse' },
  { label: 'Parent 1 - Code postal', entity: 'famille', field: 'parent1_code_postal' },
  { label: 'Parent 1 - Ville', entity: 'famille', field: 'parent1_ville' },
  { label: 'Parent 2 - Prenom', entity: 'famille', field: 'parent2_prenom' },
  { label: 'Parent 2 - Nom', entity: 'famille', field: 'parent2_nom' },
  { label: 'Parent 2 - Email', entity: 'famille', field: 'parent2_email' },
  { label: 'Parent 2 - Telephone', entity: 'famille', field: 'parent2_telephone' },
  { label: 'Parent 2 - Profession', entity: 'famille', field: 'parent2_emploi' },
  { label: 'Parent 2 - Adresse', entity: 'famille', field: 'parent2_adresse' },
  { label: 'Parent 2 - Code postal', entity: 'famille', field: 'parent2_code_postal' },
  { label: 'Parent 2 - Ville', entity: 'famille', field: 'parent2_ville' },
  { label: 'Eleve - Prenom', entity: 'enfant', field: 'prenom', required: true },
  { label: 'Eleve - 2e prenom', entity: 'enfant', field: 'deuxieme_prenom' },
  { label: 'Eleve - Nom', entity: 'enfant', field: 'nom', required: true },
  { label: 'Eleve - Genre (M/F)', entity: 'enfant', field: 'genre' },
  { label: 'Eleve - Date de naissance (JJ/MM/AAAA)', entity: 'enfant', field: 'date_naissance' },
  { label: 'Eleve - Lieu de naissance', entity: 'enfant', field: 'lieu_naissance' },
  { label: 'Eleve - Classe actuelle', entity: 'enfant', field: 'classe' },
  { label: 'Eleve - Regime (demi_pension/externe/interne)', entity: 'enfant', field: 'regime' },
  { label: 'Eleve - Transport', entity: 'enfant', field: 'transport' },
  { label: 'Eleve - Instruction religieuse (oui/non)', entity: 'enfant', field: 'instruction_religieuse' },
  { label: 'Eleve - Etude/garderie (oui/non)', entity: 'enfant', field: 'etude_garderie' },
  { label: 'Eleve - INE', entity: 'enfant', field: 'ine' },
]

// --- Parsing CSV robuste (gere ; ou , et les champs entre guillemets) ---
function parseCSV(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/)[0] || ''
  const delim = firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === delim) { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* ignore */ }
      else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

function parseDateFr(s: string): string | null {
  const v = (s || '').trim()
  if (!v) return null
  let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return v
  return null
}

function parseBool(s: string): boolean {
  return /^(oui|yes|true|1|x)$/i.test((s || '').trim())
}

// Normalise la situation maritale vers une des valeurs autorisees par la BDD
// (marie, celibataire, divorce, veuf, separe, non_connu). Retourne null si vide
// ou non reconnu (securite : ne bloque pas l'import sur une faute de saisie).
function normaliserSituation(s: string): string | null {
  const v = (s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!v) return null
  if (v === 'marie' || v === 'mariee') return 'marie'
  if (v.startsWith('celib')) return 'celibataire'
  if (v.startsWith('divorc')) return 'divorce'
  if (v.startsWith('sepa')) return 'separe'
  if (v.startsWith('veuf') || v.startsWith('veuve')) return 'veuf'
  if (v === 'non_connu' || v === 'inconnu' || v === 'nc' || v === 'autre') return 'non_connu'
  return null
}

type ParsedFamille = {
  key: string
  famille: Record<string, any>
  enfants: Record<string, any>[]
  existe: boolean
}

export default function ImportPage() {
  const ecole = useEcole()
  const { exercice } = useExercice()
  const [classes, setClasses] = useState<any[]>([])
  const [parsed, setParsed] = useState<ParsedFamille[] | null>(null)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [resultat, setResultat] = useState<string>('')

  const loadClasses = useCallback(async () => {
    if (!ecole?.id) return
    const { data } = await createClient().from('classes').select('id, nom').eq('ecole_id', ecole.id)
    setClasses(data || [])
  }, [ecole?.id])
  useEffect(() => { loadClasses() }, [loadClasses])

  function telechargerModele() {
    downloadCSV(
      `modele-import-${ecole.slug || 'ecole'}.csv`,
      COLUMNS.map(c => c.label),
      [COLUMNS.map(c => c.required ? '(obligatoire)' : '')],
    )
  }

  async function onFile(file: File) {
    setResultat(''); setParsed(null); setErreurs([])
    setFileName(file.name)
    let text = ''
    try {
      text = await file.text()
      // Si accents casses (encodage Windows-1252), relire en latin1
      if (text.includes('�')) {
        const buf = await file.arrayBuffer()
        text = new TextDecoder('windows-1252').decode(buf)
      }
    } catch {
      setErreurs(['Impossible de lire le fichier.'])
      return
    }
    const rows = parseCSV(text)
    if (rows.length < 2) { setErreurs(['Le fichier est vide ou ne contient pas de donnees.']); return }

    // Ligne d'en-tete : on se cale sur l'ordre des colonnes du modele
    const dataRows = rows.slice(1)
    const errs: string[] = []
    const groupes = new Map<string, ParsedFamille>()

    dataRows.forEach((cells, idx) => {
      const ligne = idx + 2 // +1 entete +1 base 1
      const famille: Record<string, any> = {}
      const enfant: Record<string, any> = {}
      COLUMNS.forEach((col, i) => {
        const raw = (cells[i] ?? '').trim()
        if (col.entity === 'famille') famille[col.field] = raw
        else enfant[col.field] = raw
      })
      // Validation minimale
      if (!famille.nom) { errs.push(`Ligne ${ligne} : nom de famille manquant.`); return }
      if (!famille.parent1_email) { errs.push(`Ligne ${ligne} : email du parent 1 manquant.`); return }
      if (!enfant.prenom || !enfant.nom) { errs.push(`Ligne ${ligne} : prenom ou nom de l'eleve manquant.`); return }

      const key = famille.parent1_email.toLowerCase()
      if (!groupes.has(key)) {
        groupes.set(key, { key, famille, enfants: [], existe: false })
      }
      groupes.get(key)!.enfants.push(enfant)
    })

    // Verifier les familles deja presentes (par email parent 1)
    const liste = Array.from(groupes.values())
    const emails = liste.map(g => g.famille.parent1_email)
    if (emails.length) {
      const { data: existantes } = await createClient()
        .from('familles').select('parent1_email')
        .eq('ecole_id', ecole.id).in('parent1_email', emails)
      const setExist = new Set((existantes || []).map((e: any) => (e.parent1_email || '').toLowerCase()))
      liste.forEach(g => { g.existe = setExist.has(g.key) })
    }

    setErreurs(errs)
    setParsed(liste)
  }

  async function lancerImport() {
    if (!parsed) return
    if (!exercice?.id) {
      alert('Aucune année scolaire sélectionnée. Choisissez d\'abord une année dans le sélecteur en haut de page.')
      return
    }
    setImporting(true); setResultat('')
    const s = createClient()
    const aImporter = parsed.filter(g => !g.existe)
    let okFam = 0, okEnf = 0, echecs = 0
    const erreursDetail: string[] = []

    for (const g of aImporter) {
      const f = g.famille
      const { data: nouvelleFam, error: famErr } = await s.from('familles').insert({
        ecole_id: ecole.id,
        nom: f.nom,
        statut_dossier: 'complet',
        date_creation: new Date().toISOString(),
        situation_maritale: normaliserSituation(f.situation_maritale),
        parent1_prenom: f.parent1_prenom || null,
        parent1_nom: f.parent1_nom || null,
        parent1_email: f.parent1_email || null,
        parent1_telephone: f.parent1_telephone || null,
        parent1_emploi: f.parent1_emploi || null,
        parent1_adresse: f.parent1_adresse || null,
        parent1_code_postal: f.parent1_code_postal || null,
        parent1_ville: f.parent1_ville || null,
        parent2_prenom: f.parent2_prenom || null,
        parent2_nom: f.parent2_nom || null,
        parent2_email: f.parent2_email || null,
        parent2_telephone: f.parent2_telephone || null,
        parent2_emploi: f.parent2_emploi || null,
        parent2_adresse: f.parent2_adresse || null,
        parent2_code_postal: f.parent2_code_postal || null,
        parent2_ville: f.parent2_ville || null,
        email: f.parent1_email || null,
        telephone: f.parent1_telephone || null,
      }).select('id').single()

      if (famErr || !nouvelleFam) {
        echecs++
        if (erreursDetail.length < 10) {
          erreursDetail.push(`Famille "${f.nom}" (${f.parent1_email}) : ${famErr?.message || 'pas de ligne retournée — vérifiez vos droits ou reconnectez-vous'}`)
        }
        // eslint-disable-next-line no-console
        console.error('Import famille échouée', { famille: f, error: famErr })
        continue
      }
      okFam++

      for (const e of g.enfants) {
        const classeMatch = classes.find(c => (c.nom || '').toLowerCase() === (e.classe || '').toLowerCase())
        const { data: nouvelEnf, error: enfErr } = await s.from('enfants').insert({
          famille_id: nouvelleFam.id,
          ecole_id: ecole.id,
          prenom: e.prenom,
          deuxieme_prenom: e.deuxieme_prenom || null,
          nom: e.nom,
          genre: /^[mf]$/i.test(e.genre) ? e.genre.toUpperCase() : null,
          date_naissance: parseDateFr(e.date_naissance),
          lieu_naissance: e.lieu_naissance || null,
          classe: e.classe || null,
          classe_id: classeMatch?.id || null,
          regime: ['demi_pension', 'externe', 'interne'].includes((e.regime || '').toLowerCase()) ? e.regime.toLowerCase() : null,
          transport: e.transport || null,
          instruction_religieuse: parseBool(e.instruction_religieuse),
          etude_garderie: parseBool(e.etude_garderie),
          ine: e.ine || null,
          annee_scolaire: exercice.code,
          exercice_id: exercice.id,
          statut_inscription: 'inscrit',
        }).select('id').single()
        if (enfErr || !nouvelEnf) {
          echecs++
          if (erreursDetail.length < 10) {
            erreursDetail.push(`Élève "${e.prenom} ${e.nom}" (famille ${f.nom}) : ${enfErr?.message || 'pas de ligne retournée'}`)
          }
          // eslint-disable-next-line no-console
          console.error('Import enfant échoué', { enfant: e, error: enfErr })
          continue
        }
        // Créer la scolarité pour que l'enfant apparaisse dans la liste Élèves
        const { error: scoErr } = await s.from('scolarites').insert({
          enfant_id: nouvelEnf.id,
          ecole_id: ecole.id,
          exercice_id: exercice.id,
          classe_id: classeMatch?.id || null,
          statut_inscription: 'inscrit',
        })
        if (scoErr) {
          // eslint-disable-next-line no-console
          console.error('Création scolarité échouée', { enfant_id: nouvelEnf.id, error: scoErr })
        }
        okEnf++
      }
    }

    setImporting(false)
    setResultat(`Import termine : ${okFam} famille(s) et ${okEnf} eleve(s) ajoute(s) sur l'annee ${exercice?.code || ''}.` +
      (echecs > 0 ? ` ${echecs} ligne(s) en echec.` : '') +
      (parsed.length - aImporter.length > 0 ? ` ${parsed.length - aImporter.length} famille(s) deja presente(s), ignoree(s).` : ''))
    setErreurs(erreursDetail)
    setParsed(null)
  }

  const nbFamilles = parsed?.length || 0
  const nbExistantes = parsed?.filter(g => g.existe).length || 0
  const nbEnfants = parsed?.reduce((s, g) => s + g.enfants.length, 0) || 0
  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Importer la base de l&apos;ecole</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Chargez vos familles et eleves d&apos;un coup. L&apos;import alimente l&apos;annee de reference
          <strong> {exercice?.code || ''}</strong>. Aucun compte n&apos;est cree et aucun email n&apos;est envoye.
        </p>
      </div>

      {/* Etape 1 : modele */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>1. Telecharger le modele</div>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 0, marginBottom: 14 }}>
          Une ligne par eleve. Pour une fratrie, repetez les colonnes de la famille (meme email du parent 1).
          Colonnes obligatoires : nom de famille, email du parent 1, prenom et nom de l&apos;eleve.
        </p>
        <button onClick={telechargerModele} className="btn-secondary">Telecharger le modele CSV</button>
      </div>

      {/* Etape 2 : upload */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>2. Deposer le fichier rempli</div>
        <input type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} style={inp} />
        {fileName && <div style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>Fichier : {fileName}</div>}
      </div>

      {erreurs.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, color: '#991B1B', fontSize: 13, marginBottom: 8 }}>{erreurs.length} probleme(s) detecte(s)</div>
          <div style={{ fontSize: 12, color: '#991B1B', display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
            {erreurs.slice(0, 50).map((e, i) => <div key={i}>{e}</div>)}
            {erreurs.length > 50 && <div>... et {erreurs.length - 50} autre(s)</div>}
          </div>
        </div>
      )}

      {parsed && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>3. Apercu</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1E40AF' }}>{nbFamilles - nbExistantes}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>Familles a importer</div>
            </div>
            <div style={{ background: '#ECFDF5', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#065F46' }}>{nbEnfants}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>Eleves</div>
            </div>
            <div style={{ background: '#FFFBEB', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#92400E' }}>{nbExistantes}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>Deja presentes (ignorees)</div>
            </div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: '#F8FAFC' }}>
                {['Famille', 'Parent 1', 'Email', 'Eleves'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, color: '#64748B' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {parsed.map((g, i) => (
                  <tr key={g.key} style={{ borderTop: '1px solid #F1F5F9', opacity: g.existe ? 0.5 : 1 }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{g.famille.nom}{g.existe ? ' (deja la)' : ''}</td>
                    <td style={{ padding: '8px 12px' }}>{[g.famille.parent1_prenom, g.famille.parent1_nom].filter(Boolean).join(' ') || '-'}</td>
                    <td style={{ padding: '8px 12px', color: '#64748B' }}>{g.famille.parent1_email}</td>
                    <td style={{ padding: '8px 12px' }}>{g.enfants.map(e => `${e.prenom} ${e.nom}`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={lancerImport} disabled={importing || nbFamilles - nbExistantes === 0} className="btn-primary">
              {importing ? 'Import en cours...' : `Importer ${nbFamilles - nbExistantes} famille(s)`}
            </button>
          </div>
        </div>
      )}

      {resultat && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '14px 18px', color: '#065F46', fontSize: 13 }}>
          {resultat}
        </div>
      )}
    </div>
  )
}
