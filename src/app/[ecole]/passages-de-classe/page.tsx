'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useExercice } from '@/lib/exercice-context'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { getScolarites, upsertScolarite, ScolariteAvecEnfant } from '@/lib/scolarite'

type Classe = { id: string; nom: string; ordre: number; secteur_id: string | null }
type Secteur = { id: string; nom: string }

export default function PassagesDeClassePage() {
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const confirm = useConfirm()
  const { exercices, exercice: exerciceCourant } = useExercice()

  const [classes, setClasses] = useState<Classe[]>([])
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [sourceExId, setSourceExId] = useState('')
  const [cibleExId, setCibleExId] = useState('')
  const [scoSource, setScoSource] = useState<ScolariteAvecEnfant[]>([])
  const [scoCible, setScoCible] = useState<ScolariteAvecEnfant[]>([])
  const [loading, setLoading] = useState(true)
  const [chargementLignes, setChargementLignes] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filtreSecteur, setFiltreSecteur] = useState('')
  const [cible, setCible] = useState<Record<string, string>>({})

  // Chargement initial : classes + secteurs + valeurs par défaut des exercices
  useEffect(() => {
    if (!ecole?.id) return
    ;(async () => {
      const s = createClient()
      const [{ data: cls }, { data: sec }] = await Promise.all([
        s.from('classes').select('id, nom, ordre, secteur_id').eq('ecole_id', ecole.id).order('ordre'),
        s.from('secteurs').select('id, nom').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
      ])
      setClasses((cls ?? []) as Classe[])
      setSecteurs((sec ?? []) as Secteur[])
      setLoading(false)
    })()
  }, [ecole?.id])

  // Défauts d'exercices : source = exercice courant/ouvert ; cible = suivant chaîné ou en préparation
  useEffect(() => {
    if (exercices.length === 0 || sourceExId) return
    const courant = exerciceCourant || exercices.find(e => e.statut === 'ouvert') || exercices[0]
    const src = courant?.id || exercices[0].id
    setSourceExId(src)
    const srcEx = exercices.find(e => e.id === src)
    const suivant = srcEx?.exercice_suivant_id
      ? exercices.find(e => e.id === srcEx.exercice_suivant_id)
      : exercices.find(e => e.statut === 'preparation' && e.id !== src) || exercices.find(e => e.id !== src)
    if (suivant) setCibleExId(suivant.id)
  }, [exercices, exerciceCourant, sourceExId])

  // Rechargement des scolarités quand source/cible changent
  useEffect(() => {
    if (!ecole?.id || !sourceExId || !cibleExId || sourceExId === cibleExId) {
      setScoSource([]); setScoCible([]); setCible({})
      return
    }
    ;(async () => {
      setChargementLignes(true)
      const s = createClient()
      const [src, cbl] = await Promise.all([
        getScolarites(s, ecole.id, sourceExId),
        getScolarites(s, ecole.id, cibleExId),
      ])
      // On ne fait monter que les élèves inscrits dans l'exercice source
      const srcInscrits = src.filter(x => x.statut_inscription === 'inscrit')
      setScoSource(srcInscrits)
      setScoCible(cbl)
      setChargementLignes(false)
    })()
  }, [ecole?.id, sourceExId, cibleExId])

  const classesById = useMemo(() => Object.fromEntries(classes.map(c => [c.id, c])) as Record<string, Classe>, [classes])
  const secteursById = useMemo(() => Object.fromEntries(secteurs.map(s => [s.id, s])) as Record<string, Secteur>, [secteurs])
  const cibleByEnfant = useMemo(() => {
    const m: Record<string, ScolariteAvecEnfant> = {}
    for (const sc of scoCible) m[sc.enfant_id] = sc
    return m
  }, [scoCible])

  // Quand les scolarités source changent, on (re)calcule les classes cibles par défaut
  useEffect(() => {
    if (scoSource.length === 0) { setCible({}); return }
    const defaults: Record<string, string> = {}
    for (const sc of scoSource) {
      const dejaCible = cibleByEnfant[sc.enfant_id]
      if (dejaCible?.classe_id) { defaults[sc.enfant_id] = dejaCible.classe_id; continue }
      const current = sc.classe_id ? classesById[sc.classe_id] : null
      if (current) {
        const next = classes
          .filter(c => c.secteur_id === current.secteur_id && c.ordre > current.ordre)
          .sort((a, b) => a.ordre - b.ordre)[0]
        if (next) defaults[sc.enfant_id] = next.id
      }
    }
    setCible(defaults)
  }, [scoSource, cibleByEnfant, classesById, classes])

  const sourceEx = exercices.find(e => e.id === sourceExId)
  const cibleEx = exercices.find(e => e.id === cibleExId)
  const cibleCloturee = cibleEx?.statut === 'cloture'
  const memeExercice = !!sourceExId && sourceExId === cibleExId

  const groupes = useMemo(() => {
    const filtered = scoSource.filter(sc => {
      if (!filtreSecteur) return true
      const c = sc.classe_id ? classesById[sc.classe_id] : null
      return c?.secteur_id === filtreSecteur
    })
    const map: Record<string, ScolariteAvecEnfant[]> = {}
    for (const sc of filtered) {
      const key = sc.classe_id || '__sans__'
      if (!map[key]) map[key] = []
      map[key].push(sc)
    }
    return Object.entries(map).sort(([a], [b]) => {
      const oa = a === '__sans__' ? 99999 : (classesById[a]?.ordre ?? 99998)
      const ob = b === '__sans__' ? 99999 : (classesById[b]?.ordre ?? 99998)
      return oa - ob
    })
  }, [scoSource, filtreSecteur, classesById])

  const nbAFaireMonter = useMemo(
    () => scoSource.filter(sc => cible[sc.enfant_id]).length,
    [scoSource, cible],
  )

  function setClasseGroupe(classeKey: string, targetId: string) {
    const ids = (groupes.find(([k]) => k === classeKey)?.[1] || []).map(sc => sc.enfant_id)
    setCible(prev => {
      const next = { ...prev }
      for (const id of ids) next[id] = targetId
      return next
    })
  }

  async function appliquer() {
    if (cibleCloturee) { toast.error('L’exercice cible est clôturé : impossible d’y inscrire des élèves.'); return }
    const aTraiter = scoSource.filter(sc => cible[sc.enfant_id])
    if (aTraiter.length === 0) { toast.error('Aucun élève sélectionné pour la montée.'); return }
    const ok = await confirm({
      title: `Faire monter ${aTraiter.length} élève(s) vers ${cibleEx?.libelle || cibleEx?.code} ?`,
      message: `Les scolarités de ${cibleEx?.code} sont créées (ou mises à jour). L’année ${sourceEx?.code} n’est pas modifiée.`,
    })
    if (!ok) return
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    let errCount = 0
    for (const sc of aTraiter) {
      const targetClasseId = cible[sc.enfant_id]
      const avant = sc.classe_id ? classesById[sc.classe_id] : null
      const apres = classesById[targetClasseId]
      const res = await upsertScolarite(s, {
        enfant_id: sc.enfant_id,
        exercice_id: cibleExId,
        ecole_id: ecole.id,
        classe_id: targetClasseId,
        statut_inscription: 'inscrit',
        annee_scolaire: cibleEx?.code ?? null,
        regime: sc.regime,
        transport: sc.transport,
        instruction_religieuse: sc.instruction_religieuse,
        etude_garderie: sc.etude_garderie,
      })
      if (!res.ok) { errCount++; continue }
      await s.from('eleve_historique').insert({
        enfant_id: sc.enfant_id, ecole_id: ecole.id, type: 'passage',
        exercice_id: cibleExId,
        classe_avant_id: sc.classe_id, classe_apres_id: targetClasseId,
        classe_avant_nom: avant?.nom ?? null, classe_apres_nom: apres?.nom ?? null,
        motif: `Montée de classe ${sourceEx?.code ?? ''} → ${cibleEx?.code ?? ''}`.trim(),
        created_by: session?.user.id ?? null,
      })
    }
    setSaving(false)
    if (errCount > 0) toast.error(`${errCount} montée(s) en échec (droits insuffisants ?).`)
    else toast.success(`${aTraiter.length} élève(s) inscrit(s) en ${cibleEx?.code}.`)
    // Recharge les scolarités cible
    const cbl = await getScolarites(s, ecole.id, cibleExId)
    setScoCible(cbl)
  }

  const inp: React.CSSProperties = {
    background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8,
    padding: '7px 10px', fontSize: 13, outline: 'none', color: '#1E293B',
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => router.push(`/${ecole.slug}/administration`)}
          style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>
          ← Administration
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Passages de classe</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
            Montée pédagogique : crée les scolarités de l’année cible à partir d’une année source. L’année source n’est jamais modifiée.
          </p>
        </div>
        <button onClick={appliquer} disabled={saving || nbAFaireMonter === 0 || cibleCloturee || memeExercice}
          style={{
            background: (nbAFaireMonter === 0 || cibleCloturee || memeExercice) ? '#E2E8F0' : '#2563EB',
            color: (nbAFaireMonter === 0 || cibleCloturee || memeExercice) ? '#94A3B8' : '#fff',
            border: 'none', borderRadius: 9, padding: '10px 18px',
            fontSize: 13, fontWeight: 600,
            cursor: (saving || nbAFaireMonter === 0 || cibleCloturee || memeExercice) ? 'not-allowed' : 'pointer',
            minHeight: 40,
          }}>
          {saving ? 'Application…' : nbAFaireMonter === 0 ? 'Aucune montée' : `✓ Faire monter ${nbAFaireMonter} élève(s)`}
        </button>
      </div>

      {/* Sélecteurs d'exercices */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}>ANNÉE SOURCE (lue)</div>
          <select style={inp} value={sourceExId} onChange={e => setSourceExId(e.target.value)}>
            {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle || ex.code}{ex.statut === 'ouvert' ? ' · ouvert' : ex.statut === 'cloture' ? ' · clôturé' : ''}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 18, color: '#94A3B8', paddingBottom: 6 }}>→</div>
        <div>
          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}>ANNÉE CIBLE (écrite)</div>
          <select style={inp} value={cibleExId} onChange={e => setCibleExId(e.target.value)}>
            <option value="">— choisir —</option>
            {exercices.map(ex => <option key={ex.id} value={ex.id}>{ex.libelle || ex.code}{ex.statut === 'ouvert' ? ' · ouvert' : ex.statut === 'cloture' ? ' · clôturé' : ''}</option>)}
          </select>
        </div>
        {secteurs.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}>SECTEUR</div>
            <select style={inp} value={filtreSecteur} onChange={e => setFiltreSecteur(e.target.value)}>
              <option value="">Tous</option>
              {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
        )}
      </div>

      {memeExercice && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E' }}>
          Choisissez une année cible différente de l’année source.
        </div>
      )}
      {cibleCloturee && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C' }}>
          L’année cible est <strong>clôturée</strong> : on ne peut plus y inscrire d’élèves. Choisissez une année en préparation ou ouverte.
        </div>
      )}

      {chargementLignes ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
          Chargement des élèves…
        </div>
      ) : (!memeExercice && groupes.length === 0) ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
          Aucun élève inscrit dans l’année source.
        </div>
      ) : groupes.map(([classeKey, eleves]) => {
        const classe = classeKey === '__sans__' ? null : classesById[classeKey]
        const secteur = classe?.secteur_id ? secteursById[classe.secteur_id] : null
        return (
          <div key={classeKey} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#F8FAFC' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{classe ? classe.nom : 'Sans classe'}</span>
                {secteur && <span style={{ marginLeft: 8, fontSize: 11, background: '#EEF2FF', color: '#4338CA', borderRadius: 6, padding: '2px 8px' }}>{secteur.nom}</span>}
                <span style={{ marginLeft: 8, fontSize: 12, color: '#94A3B8' }}>{eleves.length} élève(s)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Tous vers :</span>
                <select style={inp} value="" onChange={e => { if (e.target.value) setClasseGroupe(classeKey, e.target.value) }}>
                  <option value="">— choisir —</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
            </div>
            <div>
              {eleves.map((sc, i) => {
                const target = cible[sc.enfant_id] || ''
                const dejaCible = cibleByEnfant[sc.enfant_id]
                const enf = sc.enfants
                return (
                  <div key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: i < eleves.length - 1 ? '1px solid #F8FAFC' : 'none', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 160, fontSize: 13, color: '#1E293B', fontWeight: 500 }}>
                      {enf ? `${enf.prenom} ${enf.nom}` : '—'}
                      {dejaCible && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#4338CA', background: '#EEF2FF', borderRadius: 5, padding: '1px 6px' }}>
                          déjà en {cibleEx?.code}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 13, color: '#94A3B8' }}>→</span>
                    <select style={{ ...inp, minWidth: 150, borderColor: target ? '#93C5FD' : '#E2E8F0', background: target ? '#EFF6FF' : '#fff' }}
                      value={target}
                      onChange={ev => setCible(p => ({ ...p, [sc.enfant_id]: ev.target.value }))}>
                      <option value="">Ne pas faire monter</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div style={{ fontSize: 12, color: '#94A3B8' }}>
        Seuls les élèves <strong>inscrits</strong> dans l’année source sont proposés. La montée crée leur scolarité dans l’année cible —
        l’année source reste intacte. Pour un élève qui quitte l’établissement, utilisez « Sortie de l’élève » sur sa fiche.
      </div>
    </div>
  )
}
