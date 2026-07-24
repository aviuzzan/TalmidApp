'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type Mvt = {
  id: string; date_op: string; libelle: string; montant: number; reference: string | null;
  statut: 'a_rapprocher' | 'rapproche' | 'ignore';
  facture_id: string | null; reglement_id: string | null; score_match: number | null;
}
type FactureImpayee = {
  id: string; numero: string | null; famille_id: string; solde_restant: number;
  familles: { nom: string; numero: string | null } | null;
}

export default function RapprochementPage() {
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const confirm = useConfirm()

  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [mvts, setMvts] = useState<Mvt[]>([])
  const [impayees, setImpayees] = useState<FactureImpayee[]>([])
  const [filtre, setFiltre] = useState<'a_rapprocher' | 'rapproche' | 'tous'>('a_rapprocher')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (ecole?.id) load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id, filtre])

  async function load() {
    setLoading(true)
    const s = createClient()
    let q = s.from('mouvements_bancaires').select('*').eq('ecole_id', ecole.id).order('date_op', { ascending: false })
    if (filtre !== 'tous') q = q.eq('statut', filtre)
    const [{ data: m }, { data: f }] = await Promise.all([
      q,
      s.from('factures_solde').select('id, numero, famille_id, solde_restant, familles(nom, numero)').neq('statut', 'annule').gt('solde_restant', 0),
    ])
    setMvts((m ?? []) as Mvt[])
    setImpayees((f ?? []) as any[])
    setLoading(false)
  }

  function parserCSV(txt: string): { date_op: string; libelle: string; montant: number; reference: string | null }[] {
    // Format souple : date;libelle;montant ou date,libelle,montant
    // Date au format JJ/MM/AAAA ou AAAA-MM-JJ
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const out: { date_op: string; libelle: string; montant: number; reference: string | null }[] = []
    for (const ln of lines) {
      const parts = ln.split(/[;\t,]/).map(p => p.trim())
      if (parts.length < 3) continue
      let dateStr = parts[0]
      const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      if (m) dateStr = `${m[3]}-${m[2]}-${m[1]}`
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue
      const libelle = parts[1]
      // Le montant peut être en colonne 2 (positif/négatif) ou 2/3 si crédit/débit séparés
      let montant = NaN
      if (parts.length >= 3 && parts[2]) {
        montant = parseFloat(parts[2].replace(/[^\d.,-]/g, '').replace(',', '.'))
      }
      if (parts.length >= 4 && parts[3] && (isNaN(montant) || montant === 0)) {
        montant = parseFloat(parts[3].replace(/[^\d.,-]/g, '').replace(',', '.'))
      }
      if (isNaN(montant) || montant === 0) continue
      const reference = parts.length >= 4 ? parts[3] : null
      out.push({ date_op: dateStr, libelle, montant: Math.abs(montant), reference: typeof reference === 'string' && /[A-Z0-9]+/i.test(reference) ? reference : null })
    }
    return out
  }

  async function importer() {
    if (!csvText.trim()) { toast.error('Collez un relevé CSV avant d\'importer.'); return }
    const rows = parserCSV(csvText)
    if (rows.length === 0) { toast.error('Aucun mouvement valide détecté. Format : date;libellé;montant'); return }
    const ok = await confirm({ title: `Importer ${rows.length} mouvement(s) ?`, message: 'Les mouvements seront ajoutés à la liste à rapprocher.' })
    if (!ok) return
    setImporting(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const { data: imp, error: e1 } = await s.from('imports_bancaires')
      .insert({ ecole_id: ecole.id, nb_mouvements: rows.length, importe_par: session?.user.id ?? null })
      .select('id').single()
    if (e1 || !imp) { toast.error(e1?.message || 'Import échoué'); setImporting(false); return }
    const mvtsToInsert = rows.map(r => ({ ...r, import_id: imp.id, ecole_id: ecole.id, statut: 'a_rapprocher' }))
    const { error: e2 } = await s.from('mouvements_bancaires').insert(mvtsToInsert)
    if (e2) { toast.error(e2.message); setImporting(false); return }
    setCsvText('')
    setImporting(false)
    toast.success(`${rows.length} mouvement(s) importé(s).`)
    load()
  }

  function matchScore(mvt: Mvt, fac: FactureImpayee): number {
    let score = 0
    const tol = 0.01
    if (Math.abs(Number(fac.solde_restant) - Number(mvt.montant)) < tol) score += 100
    const lib = (mvt.libelle || '').toLowerCase()
    const refMvt = (mvt.reference || '').toLowerCase()
    if (fac.familles?.nom && lib.includes((fac.familles.nom || '').toLowerCase())) score += 30
    if (fac.familles?.numero && (lib.includes(fac.familles.numero) || refMvt.includes(fac.familles.numero))) score += 30
    if (fac.numero && (lib.includes(fac.numero.toLowerCase()) || refMvt.includes(fac.numero.toLowerCase()))) score += 50
    return score
  }

  function suggererFacture(mvt: Mvt): FactureImpayee | null {
    let best: FactureImpayee | null = null
    let bestScore = 0
    for (const f of impayees) {
      const sc = matchScore(mvt, f)
      if (sc > bestScore) { best = f; bestScore = sc }
    }
    return bestScore >= 80 ? best : null
  }

  async function rapprocher(mvt: Mvt, factureId: string) {
    const fac = impayees.find(f => f.id === factureId)
    if (!fac) return
    const s = createClient()
    const { data: regl, error: e1 } = await s.from('reglements').insert({
      facture_id: factureId, famille_id: fac.famille_id,
      montant: Number(mvt.montant), date_reglement: mvt.date_op,
      mode_paiement: 'virement', reference: mvt.reference || mvt.libelle.slice(0, 80),
      notes: 'Rapprochement bancaire',
    }).select('id').single()
    if (e1 || !regl) { toast.error(e1?.message || 'Création règlement échouée'); return }
    await s.from('mouvements_bancaires').update({ statut: 'rapproche', facture_id: factureId, reglement_id: regl.id }).eq('id', mvt.id)
    // Recalcul statut facture
    const { data: factSolde } = await s.from('factures_solde').select('total_facture, total_regle, solde_restant').eq('id', factureId).single()
    if (factSolde) {
      // NOTE : `total_regle` exclut les avoirs imputés. Ici on vient de créer un règlement
      // virement (non-avoir) donc `total_regle > 0` ; le statut 'partiel' est bien atteint.
      // On étend aussi à `sr < total` pour couvrir le cas où des avoirs ont déjà entamé le solde.
      const sr = Number((factSolde as any).solde_restant)
      const tf = Number((factSolde as any).total_facture)
      const tr = Number((factSolde as any).total_regle)
      const newStatut = sr <= 0 ? 'paye' : (tr > 0 || sr < tf) ? 'partiel' : 'en_attente'
      await s.from('factures').update({ statut: newStatut }).eq('id', factureId)
    }
    toast.success('Mouvement rapproché et règlement créé')
    load()
  }

  async function ignorer(mvt: Mvt) {
    const s = createClient()
    await s.from('mouvements_bancaires').update({ statut: 'ignore' }).eq('id', mvt.id)
    toast.success('Mouvement ignoré')
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <button onClick={() => router.push(`/${ecole.slug}/finances-hub`)}
          style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>
          ← Finances
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Rapprochement bancaire</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Importez votre relevé bancaire et rapprochez automatiquement les recettes contre les factures impayées.
        </p>
      </div>

      {/* Bloc import CSV */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0, marginBottom: 8 }}>Importer un relevé</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
          Collez les lignes au format <code>date;libellé;montant</code> — une ligne par mouvement. Date acceptée en JJ/MM/AAAA ou AAAA-MM-JJ. Crédit/débit indistincts (le signe est ignoré, on travaille en valeur absolue).
        </p>
        <textarea value={csvText} onChange={e => setCsvText(e.target.value)}
          placeholder={"15/05/2026;VIREMENT UZZAN DYLAN;3600\n12/05/2026;CHEQUE 0001;260\n10/05/2026;VIR SEPA FAM-2026-0001;7200"}
          style={{ width: '100%', minHeight: 120, padding: 12, border: '1px solid #E2E8F0', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, outline: 'none', resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button onClick={importer} disabled={importing}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: importing ? 'wait' : 'pointer' }}>
            {importing ? 'Import…' : '📥 Importer les mouvements'}
          </button>
        </div>
      </div>

      {/* Filtre */}
      <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 9, padding: 3, alignSelf: 'flex-start' }}>
        {[
          { id: 'a_rapprocher', label: 'À rapprocher' },
          { id: 'rapproche', label: 'Rapprochés' },
          { id: 'tous', label: 'Tous' },
        ].map(t => (
          <button key={t.id} onClick={() => setFiltre(t.id as any)}
            style={{ background: filtre === t.id ? '#fff' : 'transparent', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: filtre === t.id ? 700 : 500, color: filtre === t.id ? '#1E293B' : '#64748B', cursor: 'pointer', boxShadow: filtre === t.id ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Liste mouvements */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement…</div>
        ) : mvts.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Aucun mouvement {filtre === 'a_rapprocher' ? 'à rapprocher' : filtre === 'rapproche' ? 'rapproché' : 'enregistré'}.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Date', 'Libellé', 'Montant', 'Suggestion', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mvts.map((m, i) => {
                const sugg = m.statut === 'a_rapprocher' ? suggererFacture(m) : null
                return (
                  <tr key={m.id} style={{ borderBottom: i < mvts.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td style={{ padding: '11px 14px', color: '#475569' }}>{new Date(m.date_op).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#1E293B' }}>{m.libelle}{m.reference ? <span style={{ color: '#94A3B8', marginLeft: 8 }}>({m.reference})</span> : null}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: '#059669' }}>{Number(m.montant).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</td>
                    <td style={{ padding: '11px 14px' }}>
                      {m.statut === 'rapproche' ? (
                        <span style={{ fontSize: 11, background: '#ECFDF5', color: '#065F46', borderRadius: 5, padding: '3px 9px', fontWeight: 600 }}>✓ Rapproché</span>
                      ) : m.statut === 'ignore' ? (
                        <span style={{ fontSize: 11, background: '#F1F5F9', color: '#94A3B8', borderRadius: 5, padding: '3px 9px' }}>Ignoré</span>
                      ) : sugg ? (
                        <span style={{ fontSize: 11, background: '#EEF2FF', color: '#4338CA', borderRadius: 5, padding: '3px 9px', fontWeight: 600 }} title={sugg.familles?.nom || ''}>
                          {sugg.numero} · {sugg.familles?.nom}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>Aucune correspondance</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {m.statut === 'a_rapprocher' ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {sugg && <button onClick={() => rapprocher(m, sugg.id)} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✓ Confirmer</button>}
                          <select onChange={e => { if (e.target.value) rapprocher(m, e.target.value); e.target.value = '' }}
                            style={{ fontSize: 11, padding: '5px 8px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', color: '#475569' }}>
                            <option value="">Choisir une facture…</option>
                            {impayees.map(f => (
                              <option key={f.id} value={f.id}>{f.numero} — {f.familles?.nom} ({Number(f.solde_restant).toFixed(2)} €)</option>
                            ))}
                          </select>
                          <button onClick={() => ignorer(m)} style={{ background: 'transparent', color: '#94A3B8', border: 'none', fontSize: 11, cursor: 'pointer' }}>Ignorer</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
