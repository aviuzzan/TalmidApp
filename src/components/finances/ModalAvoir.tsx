'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  ecoleId: string
  exerciceId?: string | null
  familles: any[]
  familleIdInitiale?: string
  onClose: () => void
  onCreated: () => void
}

const SOURCES = [
  { value: 'paiement_excedentaire', label: 'Paiement excédentaire' },
  { value: 'contrat_annule', label: 'Contrat annulé' },
  { value: 'geste_commercial', label: 'Geste commercial' },
  { value: 'reduction_post_facturation', label: 'Réduction post-facturation' },
  { value: 'autre', label: 'Autre' },
]

/**
 * Modal de création d'un avoir (note de crédit) côté école.
 * Aligné avec le schéma BDD :
 *   - type        : 'avoir' | 'note_credit'
 *   - statut      : 'actif' à la création
 *   - source      : 'paiement_excedentaire' | 'contrat_annule' | 'geste_commercial' | 'reduction_post_facturation' | 'autre'
 *   - numero      : généré A-AAAA-NNNN
 */
export default function ModalAvoir({ ecoleId, exerciceId, familles, familleIdInitiale, onClose, onCreated }: Props) {
  const [familleId, setFamilleId] = useState(familleIdInitiale || '')
  const [recherche, setRecherche] = useState('')
  const [motif, setMotif] = useState('')
  const [montant, setMontant] = useState('')
  const [type, setType] = useState<'avoir' | 'note_credit'>('avoir')
  const [source, setSource] = useState('geste_commercial')
  const [factureOrigine, setFactureOrigine] = useState('')
  const [facturesFamille, setFacturesFamille] = useState<any[]>([])
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [dateExpiration, setDateExpiration] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!familleId) { setFacturesFamille([]); return }
    const s = createClient()
    s.from('factures')
      .select('id, numero, annee_scolaire, statut')
      .eq('famille_id', familleId)
      .neq('statut', 'annule')
      .order('date_emission', { ascending: false })
      .then(({ data }) => setFacturesFamille(data || []))
  }, [familleId])

  const familleNom = (f: any) => `${f.nom}${f.numero ? ' (N° ' + f.numero + ')' : ''}`
  const famillesFiltrees = recherche
    ? familles.filter(f => {
        const q = recherche.toLowerCase()
        return (f.nom || '').toLowerCase().includes(q)
          || (f.numero || '').toLowerCase().includes(q)
          || (f.parent1_nom || '').toLowerCase().includes(q)
          || (f.parent1_prenom || '').toLowerCase().includes(q)
      }).slice(0, 20)
    : []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!familleId) { setError('Choisissez une famille'); return }
    const m = parseFloat(montant)
    if (isNaN(m) || m <= 0) { setError('Montant invalide'); return }
    if (!motif.trim()) { setError('Motif requis'); return }

    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()

    // Numéro A-AAAA-NNNN (aligné avec la page famille)
    const year = new Date().getFullYear()
    const { data: last } = await s.from('avoirs')
      .select('numero')
      .like('numero', `A-${year}-%`)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle()
    let nextNum = 1
    if (last?.numero) {
      const match = last.numero.match(/A-\d+-(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const numero = `A-${year}-${String(nextNum).padStart(4, '0')}`

    const { error: errIns } = await s.from('avoirs').insert({
      ecole_id: ecoleId,
      famille_id: familleId,
      exercice_id: exerciceId || null,
      numero,
      type,
      source,
      motif: motif.trim(),
      montant: m,
      montant_utilise: 0,
      statut: 'actif',
      facture_origine_id: factureOrigine || null,
      date_emission: date,
      date_expiration: dateExpiration || null,
      cree_par: session?.user.id,
    })
    if (errIns) { setError(errIns.message); setSaving(false); return }

    setSaving(false)
    onCreated()
  }

  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 5, display: 'block' as const }
  const inp = { width: '100%', padding: '9px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const, background: '#fff' }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <form onSubmit={submit}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.05em' }}>NOUVEL AVOIR</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1E293B', margin: '3px 0 0' }}>Note de crédit famille</h2>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Famille */}
          <div>
            <label style={lbl}>Famille bénéficiaire</label>
            {familleId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '9px 12px' }}>
                <span style={{ fontSize: 13, color: '#065F46', fontWeight: 600 }}>
                  {familleNom(familles.find(f => f.id === familleId) || {})}
                </span>
                <button type="button" onClick={() => { setFamilleId(''); setRecherche('') }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: 12 }}>Changer</button>
              </div>
            ) : (
              <>
                <input type="text" value={recherche} onChange={e => setRecherche(e.target.value)}
                  placeholder="Rechercher famille (nom, numéro, parent)..."
                  style={inp} />
                {famillesFiltrees.length > 0 && (
                  <div style={{ marginTop: 6, border: '1px solid #E2E8F0', borderRadius: 8, maxHeight: 200, overflowY: 'auto', background: '#fff' }}>
                    {famillesFiltrees.map(f => (
                      <button type="button" key={f.id} onClick={() => { setFamilleId(f.id); setRecherche('') }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: '#fff', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontSize: 12 }}>
                        <strong style={{ color: '#1E293B' }}>{f.nom}</strong>
                        {f.numero && <span style={{ color: '#94A3B8', marginLeft: 6 }}>N° {f.numero}</span>}
                        {(f.parent1_prenom || f.parent1_nom) && (
                          <div style={{ fontSize: 11, color: '#64748B' }}>{f.parent1_prenom} {f.parent1_nom}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Date + Montant */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Date d&apos;émission</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inp} />
            </div>
            <div>
              <label style={lbl}>Montant (€)</label>
              <input type="number" step="0.01" min="0.01" value={montant} onChange={e => setMontant(e.target.value)} required style={inp} placeholder="0.00" />
            </div>
          </div>

          {/* Type + Source */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Type</label>
              <select value={type} onChange={e => setType(e.target.value as any)} style={inp}>
                <option value="avoir">Avoir</option>
                <option value="note_credit">Note de crédit</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Origine</label>
              <select value={source} onChange={e => setSource(e.target.value)} style={inp}>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Motif */}
          <div>
            <label style={lbl}>Motif (visible sur l&apos;attestation)</label>
            <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3} required
              style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }}
              placeholder="Ex : Geste commercial suite à problème de paiement, remboursement chèque non encaissé..." />
          </div>

          {/* Facture liée optionnelle */}
          {facturesFamille.length > 0 && (
            <div>
              <label style={lbl}>Facture d&apos;origine (optionnel)</label>
              <select value={factureOrigine} onChange={e => setFactureOrigine(e.target.value)} style={inp}>
                <option value="">Aucune (avoir libre)</option>
                {facturesFamille.map(f => (
                  <option key={f.id} value={f.id}>{f.numero} — {f.annee_scolaire}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                Si lié, cet avoir est rattaché à la facture pour tracer le motif.
              </div>
            </div>
          )}

          {/* Expiration */}
          <div>
            <label style={lbl}>Date d&apos;expiration (optionnel)</label>
            <input type="date" value={dateExpiration} onChange={e => setDateExpiration(e.target.value)} style={inp} />
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 12 }}>{error}</div>
          )}
        </div>

        <div style={{ padding: '14px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="submit" disabled={saving}
            style={{ background: saving ? '#94A3B8' : '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Création...' : '+ Créer l\'avoir'}
          </button>
        </div>
      </form>
    </div>
  )
}
