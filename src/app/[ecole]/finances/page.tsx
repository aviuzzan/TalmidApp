'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Tab = 'tarifs' | 'factures'

export default function FinancesPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [tab, setTab] = useState<Tab>('factures')
  const [tarifs, setTarifs] = useState<any[]>([])
  const [factures, setFactures] = useState<any[]>([])
  const [familles, setFamilles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showTarifForm, setShowTarifForm] = useState(false)
  const [showFactureForm, setShowFactureForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const ANNEE = '2025/2026'

  const emptyTarif = { nom: '', montant: '', annee_scolaire: ANNEE, description: '' }
  const [tarifForm, setTarifForm] = useState(emptyTarif)

  const emptyFacture = { famille_id: '', annee_scolaire: ANNEE, notes: '' }
  const [factureForm, setFactureForm] = useState(emptyFacture)

  const supabase = createClient()

  const load = useCallback(async () => {
    const [{ data: t }, { data: f }, { data: fam }] = await Promise.all([
      supabase.from('tarifs').select('*').eq('annee_scolaire', ANNEE).order('nom'),
      supabase.from('factures_solde').select('*, familles(nom, numero)').eq('annee_scolaire', ANNEE).order('date_emission', { ascending: false }),
      supabase.from('familles').select('id, nom, numero').order('nom'),
    ])
    setTarifs(t ?? [])
    setFactures(f ?? [])
    setFamilles(fam ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveTarif(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const { error: err } = await supabase.from('tarifs').insert({
      nom: tarifForm.nom,
      montant: parseFloat(tarifForm.montant),
      annee_scolaire: tarifForm.annee_scolaire,
      description: tarifForm.description || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowTarifForm(false); setTarifForm(emptyTarif); load(); setSaving(false)
  }

  async function deleteTarif(id: string) {
    if (!confirm('Supprimer ce tarif ?')) return
    await supabase.from('tarifs').delete().eq('id', id)
    load()
  }

  async function saveFacture(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const { error: err } = await supabase.from('factures').insert({
      famille_id: factureForm.famille_id,
      annee_scolaire: factureForm.annee_scolaire,
      notes: factureForm.notes || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowFactureForm(false); setFactureForm(emptyFacture); load(); setSaving(false)
  }

  function statutBadge(statut: string) {
    const map: any = {
      en_attente: ['#D97706', '#FFFBEB', 'En attente'],
      partiel: ['#2563EB', '#EFF6FF', 'Partiel'],
      solde: ['#059669', '#ECFDF5', 'Soldé'],
      annule: ['#DC2626', '#FEF2F2', 'Annulé'],
    }
    const [c, bg, label] = map[statut] ?? ['#64748B', '#F1F5F9', statut]
    return <span style={{ background: bg, color: c, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{label}</span>
  }

  const inp = { width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none' }

  const totalFacture = factures.reduce((s, f) => s + Number(f.total_facture), 0)
  const totalRegle = factures.reduce((s, f) => s + Number(f.total_regle), 0)
  const totalRestant = totalFacture - totalRegle

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Finances</h1>
          <p style={{ color: '#64748B', fontSize: 13 }}>Facturation & Règlements — {ANNEE}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {tab === 'tarifs' && (
            <button className="btn-primary" onClick={() => setShowTarifForm(true)}>+ Nouveau tarif</button>
          )}
          {tab === 'factures' && (
            <button className="btn-primary" onClick={() => setShowFactureForm(true)}>+ Nouvelle facture</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'Total facturé', value: `${totalFacture.toLocaleString('fr-FR')} €`, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Total réglé', value: `${totalRegle.toLocaleString('fr-FR')} €`, color: '#059669', bg: '#ECFDF5' },
          { label: 'Reste à encaisser', value: `${totalRestant.toLocaleString('fr-FR')} €`, color: totalRestant > 0 ? '#DC2626' : '#059669', bg: totalRestant > 0 ? '#FEF2F2' : '#ECFDF5' },
        ].map(s => (
          <div key={s.label} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #E2E8F0' }}>
        {[
          { id: 'factures', label: `📄 Factures (${factures.length})` },
          { id: 'tarifs', label: `💰 Tarifs (${tarifs.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, background: 'transparent', color: tab === t.id ? '#2563EB' : '#64748B', borderBottom: tab === t.id ? '2px solid #2563EB' : '2px solid transparent', marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Factures tab */}
      {tab === 'factures' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                {['N° Facture', 'Famille', 'Total', 'Réglé', 'Solde', 'Statut', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</td></tr>
              ) : factures.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#CBD5E1' }}>Aucune facture pour {ANNEE}</td></tr>
              ) : factures.map((f, i) => (
                <tr key={f.id} style={{ borderBottom: i < factures.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '13px 16px', fontFamily: 'monospace', fontSize: 12, color: '#94A3B8' }}>{f.numero}</td>
                  <td style={{ padding: '13px 16px', fontWeight: 600 }}>{f.familles?.nom} <span style={{ color: '#94A3B8', fontSize: 11 }}>({f.familles?.numero})</span></td>
                  <td style={{ padding: '13px 16px', fontWeight: 600 }}>{Number(f.total_facture).toLocaleString('fr-FR')} €</td>
                  <td style={{ padding: '13px 16px', color: '#059669', fontWeight: 600 }}>{Number(f.total_regle).toLocaleString('fr-FR')} €</td>
                  <td style={{ padding: '13px 16px', fontWeight: 700, color: Number(f.solde_restant) > 0 ? '#DC2626' : '#059669' }}>
                    {Number(f.solde_restant).toLocaleString('fr-FR')} €
                  </td>
                  <td style={{ padding: '13px 16px' }}>{statutBadge(f.statut)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => router.push(`/${ecole.slug}/familles/${f.famille_id}?tab=facturation`)}>
                      Voir →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tarifs tab */}
      {tab === 'tarifs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tarifs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px', color: '#94A3B8' }}>
              Aucun tarif configuré pour {ANNEE} — cliquez sur "Nouveau tarif"
            </div>
          ) : tarifs.map(t => (
            <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.nom}</div>
                {t.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{t.description}</div>}
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{t.annee_scolaire}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#2563EB' }}>{Number(t.montant).toLocaleString('fr-FR')} €</div>
                <button onClick={() => deleteTarif(t.id)} className="btn-danger" style={{ padding: '5px 12px', fontSize: 12 }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nouveau tarif */}
      {showTarifForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>💰 Nouveau tarif</h2>
              <button onClick={() => setShowTarifForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
            </div>
            <form onSubmit={saveTarif} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Année scolaire</label>
                <select style={inp} value={tarifForm.annee_scolaire} onChange={e => setTarifForm(p => ({ ...p, annee_scolaire: e.target.value }))}>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2026/2027">2026/2027</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Nom du tarif *</label>
                <input style={inp} value={tarifForm.nom} onChange={e => setTarifForm(p => ({ ...p, nom: e.target.value }))} placeholder="Ex: Scolarité Kita, Scolarité CP..." required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Montant annuel (€) *</label>
                <input style={inp} type="number" min="0" step="0.01" value={tarifForm.montant} onChange={e => setTarifForm(p => ({ ...p, montant: e.target.value }))} placeholder="Ex: 3600" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Description</label>
                <input style={inp} value={tarifForm.description} onChange={e => setTarifForm(p => ({ ...p, description: e.target.value }))} placeholder="Optionnel" />
              </div>
              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowTarifForm(false)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nouvelle facture */}
      {showFactureForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>📄 Nouvelle facture</h2>
              <button onClick={() => setShowFactureForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
            </div>
            <form onSubmit={saveFacture} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Année scolaire</label>
                <select style={inp} value={factureForm.annee_scolaire} onChange={e => setFactureForm(p => ({ ...p, annee_scolaire: e.target.value }))}>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2026/2027">2026/2027</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Famille *</label>
                <select style={inp} value={factureForm.famille_id} onChange={e => setFactureForm(p => ({ ...p, famille_id: e.target.value }))} required>
                  <option value="">-- Sélectionner une famille --</option>
                  {familles.map((f: any) => <option key={f.id} value={f.id}>{f.nom} ({f.numero})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Notes</label>
                <textarea style={{ ...inp, height: 80, resize: 'vertical' }} value={factureForm.notes} onChange={e => setFactureForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optionnel" />
              </div>
              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowFactureForm(false)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : '✓ Créer la facture'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
