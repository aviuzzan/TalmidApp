'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function SEPATab({ ecoleId }: { ecoleId: string }) {
  const [form, setForm] = useState<any>({ iban_ecole: '', bic_ecole: '', ics_sepa: '', nom_creancier: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  useEffect(() => {
    createClient().from('ecoles').select('iban_ecole, bic_ecole, ics_sepa, nom_creancier').eq('id', ecoleId).single()
      .then(({ data }) => {
        setForm({
          iban_ecole: data?.iban_ecole || '',
          bic_ecole: data?.bic_ecole || '',
          ics_sepa: data?.ics_sepa || '',
          nom_creancier: data?.nom_creancier || '',
        })
        setLoading(false)
      })
  }, [ecoleId])

  async function save() {
    setSaving(true)
    setSaved(false)
    setSaveErr(null)
    const { data, error } = await createClient().from('ecoles').update({
      iban_ecole: form.iban_ecole || null,
      bic_ecole: form.bic_ecole || null,
      ics_sepa: form.ics_sepa || null,
      nom_creancier: form.nom_creancier || null,
    }).eq('id', ecoleId).select()
    setSaving(false)
    if (error) {
      setSaveErr('Erreur lors de l\'enregistrement : ' + error.message)
      return
    }
    if (!data || data.length === 0) {
      setSaveErr('Enregistrement bloqué (aucune ligne modifiée). Vérifiez vos permissions.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inp = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const help = { fontSize: 11, color: '#94A3B8', marginTop: 4 }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const allFilled = form.iban_ecole && form.bic_ecole && form.ics_sepa && form.nom_creancier

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>🏦 Coordonnées bancaires (SEPA)</h2>
        <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Ces informations sont utilisées pour générer le fichier d'export SEPA (PAIN.008.001.02) à transmettre à votre banque.
        </p>
      </div>

      {!allFilled && (
        <div style={{ background: '#FEF9EC', border: '1px solid #F59E0B', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E' }}>
          ⚠️ Tant que les 4 champs ne sont pas remplis, l'export SEPA est désactivé.
        </div>
      )}
      {allFilled && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#059669' }}>
          ✓ Configuration complète — l'export SEPA est opérationnel.
        </div>
      )}

      <div>
        <label style={lbl}>Nom du créancier *</label>
        <input style={inp} value={form.nom_creancier} onChange={e => setForm((p: any) => ({ ...p, nom_creancier: e.target.value }))} placeholder="Nom légal du créancier SEPA" />
        <div style={help}>Nom légal qui apparaît sur les prélèvements bancaires.</div>
      </div>

      <div>
        <label style={lbl}>Identifiant Créancier SEPA (ICS) *</label>
        <input style={{ ...inp, fontFamily: 'monospace' }} value={form.ics_sepa} onChange={e => setForm((p: any) => ({ ...p, ics_sepa: e.target.value.toUpperCase() }))} placeholder="Ex : FR70ZZZ408187" />
        <div style={help}>Identifiant unique délivré par la Banque de France (commence par 2 lettres pays + 3 chiffres + 4-7 caractères).</div>
      </div>

      <div>
        <label style={lbl}>IBAN école *</label>
        <input style={{ ...inp, fontFamily: 'monospace' }} value={form.iban_ecole} onChange={e => setForm((p: any) => ({ ...p, iban_ecole: e.target.value.toUpperCase().replace(/\s+/g, '') }))} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
        <div style={help}>IBAN du compte sur lequel les prélèvements seront crédités.</div>
      </div>

      <div>
        <label style={lbl}>BIC *</label>
        <input style={{ ...inp, fontFamily: 'monospace' }} value={form.bic_ecole} onChange={e => setForm((p: any) => ({ ...p, bic_ecole: e.target.value.toUpperCase() }))} placeholder="Ex : BNPAFRPPXXX" />
        <div style={help}>Code BIC/SWIFT de la banque (8 ou 11 caractères).</div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
        <button onClick={save} disabled={saving} className="btn-primary" style={{ minHeight: 44, padding: '10px 22px' }}>
          {saving ? 'Enregistrement…' : '💾 Enregistrer'}
        </button>
        {saved && <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✓ Enregistré</span>}
      </div>
      {saveErr && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#DC2626' }}>
          ⚠️ {saveErr}
        </div>
      )}
    </div>
  )
}
