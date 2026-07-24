'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useToast } from '@/components/ui/Toast'
import { getExerciceInscription } from '@/lib/annee-inscription'

/**
 * Inbox "À traiter" (simplification UX) : agrège en UNE page tout ce qui
 * attend une action de l'admin, avec les boutons directement sur chaque ligne.
 * Sections : contrats soumis, DDR à étudier, demandes d'option (+ liste
 * d'attente), chèques à réceptionner, demandes d'inscription.
 */
export default function ATraiterPage() {
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const [annee, setAnnee] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [contratsSoumis, setContratsSoumis] = useState<any[]>([])
  const [ddrs, setDdrs] = useState<any[]>([])
  const [demandesOption, setDemandesOption] = useState<any[]>([])
  const [chequesAttente, setChequesAttente] = useState<any[]>([])
  const [demandesInscription, setDemandesInscription] = useState<any[]>([])

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const { code } = await getExerciceInscription(s, ecole.id)
    setAnnee(code)

    const [{ data: contrats }, { data: ddr }, { data: dopts }, { data: cheques }, { data: dinsc }] = await Promise.all([
      s.from('contrats_scolarisation')
        .select('id, soumis_le, famille_id, familles(nom), contrat_enfants(enfants(prenom))')
        .eq('ecole_id', ecole.id).eq('annee_scolaire', code).eq('statut', 'soumis')
        .order('soumis_le', { ascending: true }),
      s.from('demandes_reduction')
        .select('id, statut, soumis_le, tarif_propose, nb_enfants_concernes, familles!inner(nom, ecole_id)')
        .eq('familles.ecole_id', ecole.id).eq('annee_scolaire', code)
        .in('statut', ['soumis', 'en_etude'])
        .order('soumis_le', { ascending: true }),
      s.from('demandes_option')
        .select('id, statut, demande_le, tarif_nom, tarif_montant, note_famille, enfants(prenom, nom), familles(nom)')
        .eq('ecole_id', ecole.id)
        .in('statut', ['en_attente', 'liste_attente'])
        .order('demande_le', { ascending: true }),
      s.from('cheques_prevus')
        .select('id, numero_cheque, montant, date_echeance, mode_paiement, familles(nom)')
        .eq('ecole_id', ecole.id).eq('statut', 'attente_reception')
        .order('date_echeance', { ascending: true }),
      // Demandes d'inscription : "à traiter" = soumises par le parent (soumis_le renseigné) et pas encore traitées
      s.from('demandes_inscription')
        .select('id, created_at, soumis_le, statut, nom_famille, parent1_prenom, parent1_email, email_invite, enfant_prenom, enfant_nom')
        .eq('ecole_id', ecole.id).eq('statut', 'en_attente')
        .not('soumis_le', 'is', null)
        .order('soumis_le', { ascending: true }),
    ])
    setContratsSoumis(contrats ?? [])
    setDdrs(ddr ?? [])
    setDemandesOption(dopts ?? [])
    setChequesAttente(cheques ?? [])
    setDemandesInscription(dinsc ?? [])
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  async function traiterOption(demandeId: string, accepte: boolean) {
    setSaving(demandeId)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { toast.error('Session expirée'); setSaving(null); return }
    const res = await fetch('/api/admin/gerer-option', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: accepte ? 'accepter_demande' : 'refuser_demande', demandeId }),
    })
    const data = await res.json()
    setSaving(null)
    if (!res.ok || !data.ok) { toast.error(data.error || 'Erreur'); return }
    toast.success(accepte ? 'Option acceptée (contrat + facture mis à jour)' : 'Demande refusée')
    load()
  }

  async function marquerChequeRecu(id: string) {
    setSaving(id)
    const { error } = await createClient().from('cheques_prevus').update({ statut: 'prevu' }).eq('id', id)
    setSaving(null)
    if (error) { toast.error(error.message); return }
    toast.success('Chèque marqué reçu')
    load()
  }

  const totalATraiter = contratsSoumis.length + ddrs.length + demandesOption.length + chequesAttente.length + demandesInscription.length

  const SectionCard = ({ icon, title, count, children, emptyLabel }: any) => (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>{title}</span>
        {count > 0 && <span style={{ background: '#2563EB', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '1px 8px' }}>{count}</span>}
      </div>
      {count === 0 ? <div style={{ padding: '16px 20px', fontSize: 12, color: '#94A3B8' }}>✓ {emptyLabel}</div> : children}
    </div>
  )

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderTop: '1px solid #F8FAFC', flexWrap: 'wrap' }
  const btnPrimary = (label: string, onClick: () => void, color = '#2563EB', bg = '#EFF6FF', border = '#BFDBFE') => (
    <button onClick={onClick} style={{ fontSize: 12, color, background: bg, border: `1px solid ${border}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</button>
  )

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📥 À traiter</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          {totalATraiter === 0
            ? 'Rien en attente — tout est traité 🎉'
            : `${totalATraiter} élément${totalATraiter > 1 ? 's' : ''} en attente d'action · ${annee}`}
        </p>
      </div>

      {/* Contrats soumis */}
      <SectionCard icon="📝" title="Contrats à valider" count={contratsSoumis.length} emptyLabel="Aucun contrat en attente">
        {contratsSoumis.map((c: any) => (
          <div key={c.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{c.familles?.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {(c.contrat_enfants || []).map((e: any) => e.enfants?.prenom).filter(Boolean).join(', ')}
                {c.soumis_le ? ` · soumis le ${new Date(c.soumis_le).toLocaleDateString('fr-FR')}` : ''}
              </div>
            </div>
            {btnPrimary('Examiner →', () => router.push(`/${ecole.slug}/inscriptions/contrat/${c.id}`))}
          </div>
        ))}
      </SectionCard>

      {/* DDR */}
      <SectionCard icon="💸" title="Demandes de réduction à étudier" count={ddrs.length} emptyLabel="Aucune DDR en attente">
        {ddrs.map((d: any) => (
          <div key={d.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.familles?.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {d.nb_enfants_concernes || '?'} enfant(s)
                {d.tarif_propose ? ` · proposition ${Number(d.tarif_propose).toLocaleString('fr-FR')} €` : ''}
                {' · '}{d.statut === 'en_etude' ? 'En étude' : 'Soumise'}
              </div>
            </div>
            {btnPrimary('Étudier →', () => router.push(`/${ecole.slug}/inscriptions/reduction/${d.id}`))}
          </div>
        ))}
      </SectionCard>

      {/* Demandes d'option */}
      <SectionCard icon="🚌" title="Demandes d'option (navette, cantine…)" count={demandesOption.length} emptyLabel="Aucune demande d'option">
        {demandesOption.map((d: any) => (
          <div key={d.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {d.enfants?.prenom} {d.enfants?.nom} <span style={{ color: '#94A3B8', fontWeight: 400 }}>({d.familles?.nom})</span>
                {d.statut === 'liste_attente' && <span style={{ background: '#EDE9FE', color: '#6D28D9', borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>Liste d&apos;attente</span>}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {d.tarif_nom} · {Number(d.tarif_montant || 0).toLocaleString('fr-FR')} €{d.note_famille ? ` · « ${d.note_famille} »` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => traiterOption(d.id, true)} disabled={saving === d.id}
                style={{ fontSize: 12, color: '#fff', background: '#10B981', border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 700 }}>✓ Accepter</button>
              <button onClick={() => traiterOption(d.id, false)} disabled={saving === d.id}
                style={{ fontSize: 12, color: '#DC2626', background: '#fff', border: '1px solid #FCA5A5', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}>✗ Refuser</button>
            </div>
          </div>
        ))}
      </SectionCard>

      {/* Chèques à réceptionner */}
      <SectionCard icon="🏦" title="Chèques en attente de réception" count={chequesAttente.length} emptyLabel="Aucun chèque en attente">
        {chequesAttente.map((c: any) => (
          <div key={c.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{c.familles?.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                N°{c.numero_cheque} · {Number(c.montant).toLocaleString('fr-FR')} € · échéance {new Date(c.date_echeance).toLocaleDateString('fr-FR')}
              </div>
            </div>
            <button onClick={() => marquerChequeRecu(c.id)} disabled={saving === c.id}
              style={{ fontSize: 12, color: '#2563EB', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}>✓ Marquer reçu</button>
          </div>
        ))}
      </SectionCard>

      {/* Demandes d'inscription */}
      <SectionCard icon="👨‍👩‍👧" title="Demandes d'inscription" count={demandesInscription.length} emptyLabel="Aucune demande d'inscription">
        {demandesInscription.map((d: any) => (
          <div key={d.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.nom_famille || d.parent1_email || d.email_invite}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {d.enfant_prenom ? `${d.enfant_prenom} ${d.enfant_nom || ''}` : (d.parent1_prenom || '')}
                {' · soumise le '}{new Date(d.soumis_le || d.created_at).toLocaleDateString('fr-FR')}
              </div>
            </div>
            {btnPrimary('Traiter →', () => router.push(`/${ecole.slug}/demandes-inscription`))}
          </div>
        ))}
      </SectionCard>
    </div>
  )
}
