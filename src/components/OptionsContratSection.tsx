'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  enfantId: string
  ecoleId: string
  anneeScolaire: string
  mode: 'admin' | 'parent'
  enfantPrenom?: string
}

/**
 * Section reutilisable "Options du contrat" pour la fiche enfant.
 * - mode 'admin' : bouton "+ Ajouter" direct + gestion demandes en attente (accepter/refuser)
 * - mode 'parent' : bouton "Demander une option" + liste demandes en cours
 */
export default function OptionsContratSection({ enfantId, ecoleId, anneeScolaire, mode, enfantPrenom }: Props) {
  const [postes, setPostes] = useState<any[]>([])
  const [contratId, setContratId] = useState<string | null>(null)
  const [tarifs, setTarifs] = useState<any[]>([])
  const [demandes, setDemandes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [tarifChoisi, setTarifChoisi] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!enfantId || !anneeScolaire) return
    setLoading(true)
    const s = createClient()
    // Contrat + postes
    const { data: enfant } = await s.from('enfants').select('famille_id').eq('id', enfantId).maybeSingle()
    if (enfant?.famille_id) {
      const { data: contrat } = await s.from('contrats_scolarisation')
        .select('id, statut').eq('famille_id', enfant.famille_id).eq('annee_scolaire', anneeScolaire)
        .in('statut', ['valide', 'accepte', 'soumis']).maybeSingle()
      if (contrat) {
        setContratId(contrat.id)
        const { data: ce } = await s.from('contrat_enfants').select('postes').eq('contrat_id', contrat.id).eq('enfant_id', enfantId).maybeSingle()
        setPostes(Array.isArray(ce?.postes) ? ce.postes : [])
      } else {
        setContratId(null); setPostes([])
      }
    }
    // Tarifs de l'ecole (optionnels seulement, ie. non obligatoires)
    const { data: tars } = await s.from('tarifs_secteur')
      .select('id, nom_poste, montant, obligatoire, inclus_dans_reduction, groupe_exclusif')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', anneeScolaire).order('ordre')
    setTarifs((tars || []).filter((t: any) => !t.obligatoire))
    // Demandes en cours pour cet enfant
    const { data: dems } = await s.from('demandes_option')
      .select('*').eq('enfant_id', enfantId).eq('annee_scolaire', anneeScolaire)
      .order('demande_le', { ascending: false })
    setDemandes(dems || [])
    setLoading(false)
  }, [enfantId, ecoleId, anneeScolaire])

  useEffect(() => { load() }, [load])

  async function ajouterDirect() {
    if (!tarifChoisi) return
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { alert('Session expiree'); setSaving(false); return }
    const res = await fetch('/api/admin/gerer-option', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'ajouter_direct', enfantId, tarifId: tarifChoisi, ecoleId, anneeScolaire }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) { alert(data.error || 'Erreur'); setSaving(false); return }
    alert(`Option ajoutee${data.factureModifiee ? ' + facture ' + (data.factureNumero || '') + ' mise a jour' : ''}`)
    setShowAdd(false); setTarifChoisi(''); setSaving(false)
    await load()
  }

  async function demanderParent() {
    if (!tarifChoisi) return
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { alert('Session expiree'); setSaving(false); return }
    const res = await fetch('/api/famille/demander-option', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ enfantId, tarifId: tarifChoisi, anneeScolaire, note: note.trim() || undefined }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) { alert(data.error || 'Erreur'); setSaving(false); return }
    alert('Demande envoyee. L\'ecole vous confirmera l\'ajout.')
    setShowAdd(false); setTarifChoisi(''); setNote(''); setSaving(false)
    await load()
  }

  async function traiterDemande(demandeId: string, accepte: boolean) {
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { alert('Session expiree'); setSaving(false); return }
    const res = await fetch('/api/admin/gerer-option', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: accepte ? 'accepter_demande' : 'refuser_demande', demandeId }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) { alert(data.error || 'Erreur'); setSaving(false); return }
    setSaving(false)
    await load()
  }

  const demandesEnAttente = demandes.filter((d: any) => d.statut === 'en_attente')
  // Tarifs disponibles (non deja presents et pas en attente)
  const tarifsDeja = new Set(postes.map((p: any) => p.tarif_id))
  const tarifsEnAttente = new Set(demandesEnAttente.map((d: any) => d.tarif_id))
  const tarifsDispos = tarifs.filter((t: any) => !tarifsDeja.has(t.id) && !tarifsEnAttente.has(t.id))

  if (loading) return <div style={{ padding: 12, fontSize: 12, color: '#94A3B8' }}>Chargement des options…</div>
  if (!contratId) return null

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>Options du contrat {anneeScolaire}</div>
        {tarifsDispos.length > 0 && !showAdd && (
          <button onClick={() => setShowAdd(true)}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {mode === 'admin' ? '+ Ajouter' : '+ Demander une option'}
          </button>
        )}
      </div>

      {/* Postes actuels */}
      {postes.length === 0 ? (
        <div style={{ padding: '14px 20px', fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>Aucune option souscrite pour {enfantPrenom || 'cet enfant'}.</div>
      ) : (
        <div style={{ padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {postes.map((p: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: '#1E293B', fontWeight: 500 }}>{p.nom}</span>
              <span style={{ color: '#059669', fontWeight: 700 }}>{parseFloat(p.montant || 0).toLocaleString('fr-FR')} €</span>
            </div>
          ))}
        </div>
      )}

      {/* Demandes en attente */}
      {demandesEnAttente.length > 0 && (
        <div style={{ padding: '10px 20px', borderTop: '1px solid #F1F5F9', background: '#FFFBEB' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', marginBottom: 6 }}>Demandes en attente</div>
          {demandesEnAttente.map((d: any) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: '#78350F' }}>
                <strong>{d.tarif_nom}</strong> ({parseFloat(d.tarif_montant || 0).toLocaleString('fr-FR')} €){d.note_famille ? ` — « ${d.note_famille} »` : ''}
              </div>
              {mode === 'admin' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => traiterDemande(d.id, true)} disabled={saving}
                    style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✓ Accepter</button>
                  <button onClick={() => traiterDemande(d.id, false)} disabled={saving}
                    style={{ background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✗ Refuser</button>
                </div>
              )}
              {mode === 'parent' && <span style={{ fontSize: 11, color: '#94A3B8' }}>En attente de validation</span>}
            </div>
          ))}
        </div>
      )}

      {/* Formulaire ajout / demande */}
      {showAdd && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select value={tarifChoisi} onChange={e => setTarifChoisi(e.target.value)}
            style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
            <option value="">Choisir une option…</option>
            {tarifsDispos.map((t: any) => (
              <option key={t.id} value={t.id}>{t.nom_poste} — {parseFloat(t.montant).toLocaleString('fr-FR')} €{t.groupe_exclusif ? ` (groupe ${t.groupe_exclusif})` : ''}</option>
            ))}
          </select>
          {mode === 'parent' && (
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note pour l'école (optionnel)"
              style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }} />
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowAdd(false); setTarifChoisi(''); setNote('') }} disabled={saving}
              style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Annuler</button>
            <button onClick={() => mode === 'admin' ? ajouterDirect() : demanderParent()} disabled={!tarifChoisi || saving}
              style={{ background: tarifChoisi ? '#2563EB' : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: tarifChoisi && !saving ? 'pointer' : 'not-allowed' }}>
              {saving ? 'Envoi…' : mode === 'admin' ? 'Ajouter au contrat' : 'Envoyer la demande'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
