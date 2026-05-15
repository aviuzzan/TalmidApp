'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function EnfantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const enfantId = params.id as string

  const [enfant, setEnfant] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [inscriptions, setInscriptions] = useState<any[]>([])
  const [contrats, setContrats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<any>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [inscriptionDocs, setInscriptionDocs] = useState<any[]>([])
  const [personnesAutorisees, setPersonnesAutorisees] = useState<any[]>([])
  const [historique, setHistorique] = useState<any[]>([])
  const [showSortieModal, setShowSortieModal] = useState(false)
  const [sortieForm, setSortieForm] = useState({ date_sortie: new Date().toISOString().slice(0, 10), motif_sortie: '' })

  useEffect(() => { load() }, [enfantId])

  async function load() {
    const s = createClient()
    const [{ data: e }, { data: cls }] = await Promise.all([
      s.from('enfants')
        .select('*, familles(*), classes(id, nom)')
        .eq('id', enfantId)
        .single(),
      s.from('classes').select('id, nom').order('nom'),
    ])

    if (e) {
      setEnfant(e)
      setFamille(e.familles)
      setForm({ ...e })
    }
    setClasses(cls ?? [])

    // Inscriptions N+1
    const [{ data: inscr }, { data: cont }] = await Promise.all([
      s.from('inscriptions_pedagogiques')
        .select('*, secteurs(nom)')
        .eq('enfant_id', enfantId)
        .order('annee_scolaire', { ascending: false }),
      s.from('contrat_enfants')
        .select('*, contrats_scolarisation(annee_scolaire, statut, montant_total, mode_reglement)')
        .eq('enfant_id', enfantId),
    ])
    setInscriptions(inscr ?? [])
    setContrats(cont ?? [])

    const { data: idocs } = await s.from('inscription_documents_uploaded')
      .select('*').eq('enfant_id', enfantId).order('uploaded_at', { ascending: false })
    setInscriptionDocs(idocs ?? [])

    const { data: persAuto } = await s.from('enfant_personnes_autorisees')
      .select('*').eq('enfant_id', enfantId).order('created_at')
    setPersonnesAutorisees(persAuto ?? [])

    const { data: hist } = await s.from('eleve_historique')
      .select('*')
      .eq('enfant_id', enfantId)
      .order('date_evenement', { ascending: false })
      .order('created_at', { ascending: false })
    setHistorique(hist ?? [])
    setLoading(false)
  }

  async function sauvegarder() {
    setSaving(true)
    await createClient().from('enfants').update({
      prenom: form.prenom, nom: form.nom,
      date_naissance: form.date_naissance || null,
      classe_id: form.classe_id || null,
      transport: form.transport,
      instruction_religieuse: form.instruction_religieuse,
      etude_garderie: form.etude_garderie,
    }).eq('id', enfantId)
    await load()
    setEditMode(false)
    setSaving(false)
  }

  async function validerInscription() {
    setSaving(true)
    await createClient().from('enfants').update({ statut_inscription: 'inscrit' }).eq('id', enfantId)
    await load()
    setSaving(false)
  }

  async function confirmerSortie() {
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const dateEvt = sortieForm.date_sortie || new Date().toISOString().slice(0, 10)
    const { error } = await s.from('enfants').update({
      statut_inscription: 'sorti',
      date_sortie: dateEvt,
      motif_sortie: sortieForm.motif_sortie || null,
    }).eq('id', enfantId)
    if (!error) {
      await s.from('eleve_historique').insert({
        enfant_id: enfantId, ecole_id: enfant.ecole_id, type: 'sortie',
        exercice_id: enfant.exercice_id,
        classe_avant_id: enfant.classe_id, classe_avant_nom: enfant.classes?.nom ?? null,
        date_evenement: dateEvt,
        motif: sortieForm.motif_sortie || null,
        created_by: session?.user.id ?? null,
      })
    }
    setShowSortieModal(false)
    await load()
    setSaving(false)
  }

  async function reintegrer() {
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const { error } = await s.from('enfants').update({
      statut_inscription: 'inscrit', date_sortie: null, motif_sortie: null,
    }).eq('id', enfantId)
    if (!error) {
      await s.from('eleve_historique').insert({
        enfant_id: enfantId, ecole_id: enfant.ecole_id, type: 'retour',
        exercice_id: enfant.exercice_id,
        classe_apres_id: enfant.classe_id, classe_apres_nom: enfant.classes?.nom ?? null,
        motif: 'Réintégration de l’élève',
        created_by: session?.user.id ?? null,
      })
    }
    await load()
    setSaving(false)
  }

  const HIST_META: Record<string, { label: string; icone: string; color: string }> = {
    entree: { label: 'Entrée', icone: '🚪', color: '#2563EB' },
    passage: { label: 'Passage de classe', icone: '🎒', color: '#7C3AED' },
    reinscription: { label: 'Réinscription', icone: '🔁', color: '#0891B2' },
    sortie: { label: 'Sortie', icone: '👋', color: '#DC2626' },
    retour: { label: 'Réintégration', icone: '↩️', color: '#059669' },
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>
  if (!enfant) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Élève introuvable</div>

  const STATUT_COLOR: Record<string, string> = {
    brouillon: '#94A3B8', soumis: '#F59E0B', accepte: '#10B981', refuse: '#EF4444', valide: '#10B981',
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => router.push(`/${ecole.slug}/enfants`)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>
          ← Retour
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {enfant.prenom?.[0]?.toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>
              {enfant.prenom} {enfant.nom}
            </h1>
            <button
              onClick={() => router.push(`/${ecole.slug}/familles/${enfant.famille_id}`)}
              style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
              Famille {famille?.nom} →
            </button>
          </div>
        </div>
        <button
          onClick={() => router.push(`/${ecole.slug}/enfants/${enfantId}/sante`)}
          style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 9, padding: '9px 14px', fontSize: 13, color: '#991B1B', cursor: 'pointer', fontWeight: 600 }}>
          🏥 Fiche santé
        </button>
        <button
          onClick={() => editMode ? sauvegarder() : setEditMode(true)}
          disabled={saving}
          style={{ background: editMode ? '#2563EB' : '#F1F5F9', border: `1px solid ${editMode ? '#2563EB' : '#E2E8F0'}`, borderRadius: 9, padding: '9px 18px', fontSize: 13, color: editMode ? '#fff' : '#475569', cursor: 'pointer', fontWeight: editMode ? 600 : 400 }}>
          {saving ? 'Enregistrement...' : editMode ? '✓ Enregistrer' : '✏️ Modifier'}
        </button>
        {editMode && (
          <button onClick={() => { setEditMode(false); setForm({ ...enfant }) }}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '9px 14px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
            Annuler
          </button>
        )}
      </div>

      {/* Statut d'inscription (banner avec actions selon le statut) */}
      {(() => {
        const st = enfant.statut_inscription
        const palette: Record<string, { bg: string; border: string; fg: string; icone: string; label: string }> = {
          inscrit: { bg: '#ECFDF5', border: '#A7F3D0', fg: '#059669', icone: '✓', label: 'Inscription validée' },
          en_attente: { bg: '#FFFBEB', border: '#FDE68A', fg: '#D97706', icone: '⏳', label: 'En attente d\'inscription' },
          sorti: { bg: '#FEF2F2', border: '#FECACA', fg: '#B91C1C', icone: '👋', label: 'Élève sorti de l\'établissement' },
          refuse: { bg: '#F8FAFC', border: '#E2E8F0', fg: '#64748B', icone: '✗', label: 'Inscription refusée' },
        }
        const p = palette[st] || palette.en_attente
        return (
          <div style={{
            background: p.bg, border: `1px solid ${p.border}`,
            borderRadius: 12, padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 22 }}>{p.icone}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: p.fg }}>{p.label}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Année {enfant.annee_scolaire} · {enfant.classes?.nom || 'Sans classe'}
                  {st === 'sorti' && enfant.date_sortie && <> · Sortie le {new Date(enfant.date_sortie).toLocaleDateString('fr-FR')}</>}
                  {st === 'sorti' && enfant.motif_sortie && <> · {enfant.motif_sortie}</>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {st === 'en_attente' && (
                <button onClick={validerInscription} disabled={saving}
                  style={{ background: '#10B981', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 40 }}>
                  {saving ? '…' : '✓ Valider l\'inscription'}
                </button>
              )}
              {st === 'inscrit' && (
                <button onClick={() => { setSortieForm({ date_sortie: new Date().toISOString().slice(0, 10), motif_sortie: '' }); setShowSortieModal(true) }} disabled={saving}
                  style={{ background: '#fff', border: '1px solid #FCA5A5', borderRadius: 9, padding: '10px 18px', fontSize: 13, color: '#B91C1C', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 40 }}>
                  👋 Sortie de l&apos;élève
                </button>
              )}
              {st === 'sorti' && (
                <button onClick={reintegrer} disabled={saving}
                  style={{ background: '#10B981', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 40 }}>
                  {saving ? '…' : '↩️ Réintégrer l\'élève'}
                </button>
              )}
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Infos élève */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>
            Informations élève
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Prénom</label>
              {editMode
                ? <input style={inp} value={form.prenom || ''} onChange={e => setForm((p: any) => ({ ...p, prenom: e.target.value }))} />
                : <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{enfant.prenom}</div>
              }
            </div>
            <div>
              <label style={lbl}>Nom</label>
              {editMode
                ? <input style={inp} value={form.nom || ''} onChange={e => setForm((p: any) => ({ ...p, nom: e.target.value }))} />
                : <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{enfant.nom}</div>
              }
            </div>
          </div>
          <div>
            <label style={lbl}>Date de naissance</label>
            {editMode
              ? <input style={inp} type="date" value={form.date_naissance || ''} onChange={e => setForm((p: any) => ({ ...p, date_naissance: e.target.value }))} />
              : <div style={{ fontSize: 13, color: '#1E293B' }}>{enfant.date_naissance ? new Date(enfant.date_naissance).toLocaleDateString('fr-FR') : '—'}</div>
            }
          </div>
          <div>
            <label style={lbl}>Classe actuelle</label>
            {editMode
              ? <select style={inp} value={form.classe_id || ''} onChange={e => setForm((p: any) => ({ ...p, classe_id: e.target.value || null }))} >
                  <option value="">Non affecté</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              : <div style={{ fontSize: 13, color: '#1E293B' }}>
                  {enfant.classes?.nom
                    ? <span style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{enfant.classes.nom}</span>
                    : '—'}
                </div>
            }
          </div>
          <div>
            <label style={lbl}>Options</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'transport', label: '🚌 Transport' },
                { key: 'instruction_religieuse', label: '✡️ Instruction religieuse' },
                { key: 'etude_garderie', label: '📚 Étude / Garderie' },
              ].map(opt => (
                <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E293B', cursor: editMode ? 'pointer' : 'default' }}>
                  <input type="checkbox"
                    checked={editMode ? !!form[opt.key] : !!enfant[opt.key]}
                    disabled={!editMode}
                    onChange={e => editMode && setForm((p: any) => ({ ...p, [opt.key]: e.target.checked }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Famille */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Famille
            <button onClick={() => router.push(`/${ecole.slug}/familles/${enfant.famille_id}`)}
              style={{ fontSize: 11, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              Voir la fiche →
            </button>
          </div>
          {[
            { label: 'Nom de famille', value: famille?.nom },
            { label: 'Email', value: famille?.parent1_email },
            { label: 'Téléphone', value: famille?.parent1_telephone },
            { label: 'Adresse', value: [famille?.parent1_adresse, famille?.parent1_code_postal, famille?.parent1_ville].filter(Boolean).join(' ') },
            { label: 'Situation', value: famille?.situation_maritale },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
              <div style={{ fontSize: 13, color: f.value ? '#1E293B' : '#CBD5E1' }}>{f.value || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Inscriptions N+1 */}
      {inscriptions.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
            Inscriptions N+1
          </div>
          {inscriptions.map((insc, i) => (
            <div key={insc.id} style={{ padding: '12px 20px', borderBottom: i < inscriptions.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{insc.annee_scolaire}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Secteur : {insc.secteurs?.nom || '—'} · Classe : {insc.classe_souhaitee || '—'}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                color: STATUT_COLOR[insc.statut] || '#94A3B8',
                background: `${STATUT_COLOR[insc.statut]}18` || 'rgba(148,163,184,0.1)',
              }}>
                {insc.statut.charAt(0).toUpperCase() + insc.statut.slice(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Contrats */}
      {contrats.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
            Contrats de scolarisation
          </div>
          {contrats.map((c, i) => (
            <div key={c.id} style={{ padding: '12px 20px', borderBottom: i < contrats.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{c.contrats_scolarisation?.annee_scolaire}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  {c.classe_prevue || '—'} · {c.contrats_scolarisation?.mode_reglement || '—'}
                  {c.sous_total ? ` · ${c.sous_total.toLocaleString('fr-FR')} €` : ''}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                color: STATUT_COLOR[c.contrats_scolarisation?.statut] || '#94A3B8',
                background: `${STATUT_COLOR[c.contrats_scolarisation?.statut]}18`,
              }}>
                {c.contrats_scolarisation?.statut || '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Documents d'inscription fournis par la famille */}
      {inscriptionDocs.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
            📎 Documents d&apos;inscription fournis
          </div>
          {inscriptionDocs.map((d, i) => (
            <div key={d.id} style={{ padding: '12px 20px', borderBottom: i < inscriptionDocs.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.label}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  {d.nom_fichier}{d.taille_ko ? ` · ${d.taille_ko} Ko` : ''} · {new Date(d.uploaded_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '5px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Ouvrir ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Historique de scolarité */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
          📜 Historique de scolarité
        </div>
        {historique.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 12, color: '#94A3B8' }}>Aucun événement enregistré pour le moment.</div>
        ) : historique.map((h, i) => {
          const meta = HIST_META[h.type] || { label: h.type, icone: '•', color: '#64748B' }
          return (
            <div key={h.id} style={{ padding: '12px 20px', borderBottom: i < historique.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 16, lineHeight: '20px' }}>{meta.icone}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>
                  {meta.label}
                  {(h.classe_avant_nom || h.classe_apres_nom) && (
                    <span style={{ fontWeight: 400, color: '#475569' }}>
                      {' — '}
                      {h.classe_avant_nom || '—'}{h.classe_apres_nom ? ` → ${h.classe_apres_nom}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                  {h.date_evenement ? new Date(h.date_evenement).toLocaleDateString('fr-FR') : ''}
                  {h.motif ? ` · ${h.motif}` : ''}
                  {h.notes ? ` · ${h.notes}` : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Personnes autorisées à récupérer l'enfant */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
          👤 Personnes autorisées à récupérer l&apos;enfant
        </div>
        {personnesAutorisees.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 12, color: '#94A3B8' }}>Aucune personne déclarée. Seuls les parents sont autorisés. La famille peut compléter cette liste depuis son espace.</div>
        ) : personnesAutorisees.map((pa, i) => (
          <div key={pa.id} style={{ padding: '12px 20px', borderBottom: i < personnesAutorisees.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{[pa.prenom, pa.nom].filter(Boolean).join(' ')}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {pa.lien || 'Lien non précisé'}{pa.telephone ? ` · ${pa.telephone}` : ''}
              </div>
            </div>
            {pa.autorise_sortie === false && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '2px 8px' }}>NON AUTORISÉ SORTIE</span>}
          </div>
        ))}
      </div>

      {/* Modal Sortie de l'élève */}
      {showSortieModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, padding: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1E293B' }}>👋 Sortie de l&apos;élève</h2>
              <button onClick={() => setShowSortieModal(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#64748B' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', marginBottom: 18 }}>
              {enfant.prenom} {enfant.nom} sera marqué comme <strong>sorti</strong>. L&apos;élève reste consultable dans l&apos;historique et la sortie est tracée. Vous pourrez le réintégrer à tout moment.
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Date de sortie</label>
              <input type="date" style={inp} value={sortieForm.date_sortie}
                onChange={e => setSortieForm(p => ({ ...p, date_sortie: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>Motif de la sortie</label>
              <input style={inp} value={sortieForm.motif_sortie}
                placeholder="Déménagement, changement d'établissement, fin de scolarité…"
                onChange={e => setSortieForm(p => ({ ...p, motif_sortie: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSortieModal(false)} disabled={saving}
                style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '9px 16px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={confirmerSortie} disabled={saving}
                style={{ background: '#DC2626', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? '…' : 'Confirmer la sortie'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
