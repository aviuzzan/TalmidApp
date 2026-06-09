'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Page RGPD - Anonymisation d'une famille (Article 17 - droit à l'oubli)
 * Accessible via /{ecole}/familles/{id}/rgpd
 *
 * Sécurités UX :
 * - Avertissement explicite sur l'irréversibilité
 * - Saisie du nom famille pour confirmer
 * - Double clic via deux écrans (étape 1 puis étape 2)
 */
export default function RgpdFamillePage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const familleId = params.id as string

  const [famille, setFamille] = useState<any>(null)
  const [enfantsCount, setEnfantsCount] = useState(0)
  const [facturesCount, setFacturesCount] = useState(0)
  const [reglementsCount, setReglementsCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState<'lecture' | 'confirmation' | 'fait'>('lecture')
  const [motif, setMotif] = useState('')
  const [confirmNom, setConfirmNom] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [resultMsg, setResultMsg] = useState('')

  async function exporterDonnees() {
    setExporting(true); setError('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setError('Session expirée'); setExporting(false); return }
    try {
      const r = await fetch('/api/admin/exporter-famille', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ familleId }),
      })
      if (!r.ok) { const j = await r.json(); setError(j.error || 'Erreur export'); setExporting(false); return }
      const blob = await r.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `famille-${(famille?.nom || familleId.slice(0,8)).replace(/[^a-zA-Z0-9-]/g, '_')}-${new Date().toISOString().slice(0,10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau')
    }
    setExporting(false)
  }

  useEffect(() => {
    async function load() {
      const s = createClient()
      const [{ data: fam }, { count: nbEnfants }, { count: nbFactures }, { count: nbReglements }] = await Promise.all([
        s.from('familles').select('id, nom, parent1_prenom, parent1_nom, parent1_email, parent2_prenom, parent2_nom, parent2_email, anonymized_at, created_at').eq('id', familleId).single(),
        s.from('enfants').select('*', { count: 'exact', head: true }).eq('famille_id', familleId),
        s.from('factures').select('*', { count: 'exact', head: true }).eq('famille_id', familleId),
        s.from('reglements').select('*', { count: 'exact', head: true }).eq('famille_id', familleId),
      ])
      setFamille(fam)
      setEnfantsCount(nbEnfants || 0)
      setFacturesCount(nbFactures || 0)
      setReglementsCount(nbReglements || 0)
      setLoading(false)
    }
    load()
  }, [familleId])

  async function anonymiser() {
    setSaving(true); setError('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setError('Session expirée'); setSaving(false); return }
    try {
      const r = await fetch('/api/admin/anonymiser-famille', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ familleId, motif: motif || null, confirmNom }),
      })
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Erreur'); setSaving(false); return }
      setResultMsg(json.message || 'Anonymisation effectuée')
      setStep('fait')
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau')
    }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, color: '#64748B' }}>Chargement...</div>
  if (!famille) return <div style={{ padding: 40, color: '#EF4444' }}>Famille introuvable</div>

  // Déjà anonymisée ?
  if (famille.anonymized_at) {
    return (
      <div style={{ padding: 40, maxWidth: 720, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>Famille déjà anonymisée</h1>
        <p style={{ fontSize: 14, color: '#64748B', marginTop: 14 }}>
          Cette famille a été anonymisée le {new Date(famille.anonymized_at).toLocaleDateString('fr-FR')}.
          Les données nominatives ont été remplacées par des marqueurs. Les factures et règlements
          sont conservés pour la comptabilité.
        </p>
        <button onClick={() => router.back()} style={btnSecondary}>← Retour</button>
      </div>
    )
  }

  if (step === 'fait') {
    return (
      <div style={{ padding: 40, maxWidth: 720, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid #10B981', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#10B981', marginBottom: 8 }}>✓ Anonymisation terminée</div>
          <div style={{ fontSize: 14, color: '#1E293B', lineHeight: 1.6 }}>{resultMsg}</div>
        </div>
        <button onClick={() => router.push(`/${ecole.slug}/familles`)}
          style={{ ...btnPrimary, marginTop: 24 }}>← Liste des familles</button>
      </div>
    )
  }

  return (
    <div style={{ padding: 40, maxWidth: 720, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <button onClick={() => router.back()}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 14 }}>
        ← Retour à la fiche famille
      </button>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1E293B', margin: '0 0 4px' }}>
        🛡️ RGPD — Droit à l&apos;oubli
      </h1>
      <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 24px' }}>
        Article 17 du règlement général sur la protection des données
      </p>

      {/* Carte famille */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Famille concernée</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>{famille.nom}</div>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
          {famille.parent1_prenom} {famille.parent1_nom}
          {famille.parent1_email && <> · {famille.parent1_email}</>}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#475569' }}>
          <span>📚 {enfantsCount} enfant(s)</span>
          <span>📄 {facturesCount} facture(s)</span>
          <span>💶 {reglementsCount} règlement(s)</span>
        </div>
      </div>

      {/* Bloc export RGPD - portabilité */}
      <div style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 12, padding: 18, marginBottom: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E40AF', marginBottom: 8 }}>
          📦 Portabilité des données (Article 20)
        </div>
        <div style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 1.6, marginBottom: 12 }}>
          Avant toute anonymisation, vous pouvez exporter l&apos;ensemble des données de la famille
          au format JSON : infos parents, enfants, factures, règlements, chèques, scolarités, contrats.
        </div>
        <button onClick={exporterDonnees} disabled={exporting}
          style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: exporting ? 0.6 : 1 }}>
          {exporting ? 'Génération...' : '↓ Télécharger toutes les données'}
        </button>
      </div>

      {/* Bloc explicatif */}
      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 12, padding: 18, marginBottom: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 10 }}>⚠️ Cette action est irréversible</div>
        <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>
            L&apos;anonymisation remplace toutes les données nominatives par des marqueurs
            <code style={{ background: '#fff', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', marginLeft: 4 }}>Anonymisé #{famille.id.slice(0, 8)}</code> :
          </p>
          <ul style={{ margin: '0 0 8px', paddingLeft: 22 }}>
            <li>Nom famille, prénoms et noms des parents</li>
            <li>Emails, téléphones, adresses, employeurs</li>
            <li>Prénoms et noms des enfants</li>
            <li>Comptes parents (connexion désactivée)</li>
          </ul>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Les factures et règlements sont conservés</strong> pour la comptabilité
            (obligation légale 10 ans), mais ils porteront désormais le nom anonymisé.
          </p>
          <p style={{ margin: 0 }}>
            La famille n&apos;apparaîtra plus dans la liste active des familles. L&apos;action est
            tracée dans le journal d&apos;audit avec votre identifiant.
          </p>
        </div>
      </div>

      {step === 'lecture' && (
        <>
          <div style={{ fontSize: 13, color: '#475569', marginBottom: 14 }}>
            Motif de la demande (optionnel mais recommandé pour la traçabilité)
          </div>
          <textarea
            value={motif}
            onChange={e => setMotif(e.target.value)}
            rows={3}
            placeholder="Ex : demande de suppression suite à départ de l'école, courrier du parent du JJ/MM/AAAA..."
            style={{
              width: '100%', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
              padding: 12, fontSize: 13, color: '#1E293B', fontFamily: 'inherit', boxSizing: 'border-box',
              outline: 'none', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
            <button onClick={() => router.back()} style={btnSecondary}>Annuler</button>
            <button onClick={() => setStep('confirmation')} style={btnDanger}>
              Continuer →
            </button>
          </div>
        </>
      )}

      {step === 'confirmation' && (
        <>
          <div style={{ fontSize: 14, color: '#1E293B', fontWeight: 600, marginBottom: 6 }}>
            Confirmation : tapez le nom exact de la famille
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
            Pour éviter une erreur, recopiez exactement : <strong>{famille.nom}</strong>
          </div>
          <input
            value={confirmNom}
            onChange={e => setConfirmNom(e.target.value)}
            placeholder={famille.nom}
            style={{
              width: '100%', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
              padding: 12, fontSize: 14, color: '#1E293B', fontFamily: 'inherit', boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {error && (
            <div style={{ marginTop: 14, padding: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid #EF4444', borderRadius: 8, fontSize: 12, color: '#991B1B' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
            <button onClick={() => setStep('lecture')} disabled={saving} style={btnSecondary}>← Précédent</button>
            <button
              onClick={anonymiser}
              disabled={saving || confirmNom.trim().toLowerCase() !== famille.nom.trim().toLowerCase()}
              style={{ ...btnDanger, opacity: saving || confirmNom.trim().toLowerCase() !== famille.nom.trim().toLowerCase() ? 0.5 : 1 }}>
              {saving ? 'Anonymisation en cours...' : '🛡️ Anonymiser définitivement'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  background: '#2563EB', border: 'none', borderRadius: 10, padding: '12px 22px',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 22px',
  color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  background: '#DC2626', border: 'none', borderRadius: 10, padding: '12px 22px',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
