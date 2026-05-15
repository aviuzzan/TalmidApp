'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type Classe = { id: string; nom: string; ordre: number; secteur_id: string | null }
type Secteur = { id: string; nom: string }
type Enfant = { id: string; prenom: string; nom: string; classe_id: string | null; statut_inscription: string; exercice_id: string | null }

export default function PassagesDeClassePage() {
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const confirm = useConfirm()

  const [classes, setClasses] = useState<Classe[]>([])
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [enfants, setEnfants] = useState<Enfant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filtreSecteur, setFiltreSecteur] = useState('')
  const [cible, setCible] = useState<Record<string, string>>({})

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    const [{ data: cls }, { data: sec }, { data: enf }] = await Promise.all([
      s.from('classes').select('id, nom, ordre, secteur_id').eq('ecole_id', ecole.id).order('ordre'),
      s.from('secteurs').select('id, nom').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
      s.from('enfants').select('id, prenom, nom, classe_id, statut_inscription, exercice_id').eq('ecole_id', ecole.id).eq('statut_inscription', 'inscrit').order('nom'),
    ])
    const cl = (cls ?? []) as Classe[]
    setClasses(cl)
    setSecteurs((sec ?? []) as Secteur[])
    setEnfants((enf ?? []) as Enfant[])
    // Cible par défaut = classe suivante dans le même secteur (par ordre)
    const defaults: Record<string, string> = {}
    for (const e of (enf ?? []) as Enfant[]) {
      const current = cl.find(c => c.id === e.classe_id)
      if (current) {
        const next = cl
          .filter(c => c.secteur_id === current.secteur_id && c.ordre > current.ordre)
          .sort((a, b) => a.ordre - b.ordre)[0]
        if (next) defaults[e.id] = next.id
      }
    }
    setCible(defaults)
    setLoading(false)
  }

  const classesById = useMemo(() => Object.fromEntries(classes.map(c => [c.id, c])) as Record<string, Classe>, [classes])
  const secteursById = useMemo(() => Object.fromEntries(secteurs.map(s => [s.id, s])) as Record<string, Secteur>, [secteurs])

  const groupes = useMemo(() => {
    const filtered = enfants.filter(e => {
      if (!filtreSecteur) return true
      const c = e.classe_id ? classesById[e.classe_id] : null
      return c?.secteur_id === filtreSecteur
    })
    const map: Record<string, Enfant[]> = {}
    for (const e of filtered) {
      const key = e.classe_id || '__sans__'
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return Object.entries(map).sort(([a], [b]) => {
      const oa = a === '__sans__' ? 99999 : (classesById[a]?.ordre ?? 99998)
      const ob = b === '__sans__' ? 99999 : (classesById[b]?.ordre ?? 99998)
      return oa - ob
    })
  }, [enfants, filtreSecteur, classesById])

  const nbChangements = useMemo(
    () => enfants.filter(e => cible[e.id] && cible[e.id] !== e.classe_id).length,
    [enfants, cible],
  )

  function setClasseGroupe(classeKey: string, targetId: string) {
    const ids = (groupes.find(([k]) => k === classeKey)?.[1] || []).map(e => e.id)
    setCible(prev => {
      const next = { ...prev }
      for (const id of ids) next[id] = targetId
      return next
    })
  }

  async function appliquer() {
    const changements = enfants.filter(e => cible[e.id] && cible[e.id] !== e.classe_id)
    if (changements.length === 0) { toast.error('Aucun passage à appliquer.'); return }
    const ok = await confirm({
      title: `Appliquer ${changements.length} passage(s) de classe ?`,
      message: 'Chaque élève concerné change de classe et l’événement est enregistré dans son historique de scolarité.',
    })
    if (!ok) return
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    let errCount = 0
    for (const e of changements) {
      const avant = e.classe_id ? classesById[e.classe_id] : null
      const apres = classesById[cible[e.id]]
      const { error: e1 } = await s.from('enfants').update({ classe_id: cible[e.id] }).eq('id', e.id)
      if (e1) { errCount++; continue }
      await s.from('eleve_historique').insert({
        enfant_id: e.id, ecole_id: ecole.id, type: 'passage',
        exercice_id: e.exercice_id,
        classe_avant_id: e.classe_id, classe_apres_id: cible[e.id],
        classe_avant_nom: avant?.nom ?? null, classe_apres_nom: apres?.nom ?? null,
        motif: 'Passage de classe groupé',
        created_by: session?.user.id ?? null,
      })
    }
    setSaving(false)
    if (errCount > 0) toast.error(`${errCount} passage(s) en échec (droits insuffisants ?).`)
    else toast.success(`${changements.length} passage(s) appliqué(s).`)
    load()
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
            Réaffectez les élèves inscrits vers leur classe suivante. La classe suivante est pré-remplie selon l’ordre du secteur.
          </p>
        </div>
        <button onClick={appliquer} disabled={saving || nbChangements === 0}
          style={{
            background: nbChangements === 0 ? '#E2E8F0' : '#2563EB',
            color: nbChangements === 0 ? '#94A3B8' : '#fff',
            border: 'none', borderRadius: 9, padding: '10px 18px',
            fontSize: 13, fontWeight: 600, cursor: saving || nbChangements === 0 ? 'not-allowed' : 'pointer',
            minHeight: 40,
          }}>
          {saving ? 'Application…' : nbChangements === 0 ? 'Aucun passage en attente' : `✓ Appliquer ${nbChangements} passage(s)`}
        </button>
      </div>

      {/* Filtre secteur */}
      {secteurs.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>Secteur :</span>
          <select style={inp} value={filtreSecteur} onChange={e => setFiltreSecteur(e.target.value)}>
            <option value="">Tous les secteurs</option>
            {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </div>
      )}

      {groupes.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
          Aucun élève inscrit à réaffecter.
        </div>
      ) : groupes.map(([classeKey, eleves]) => {
        const classe = classeKey === '__sans__' ? null : classesById[classeKey]
        const secteur = classe?.secteur_id ? secteursById[classe.secteur_id] : null
        // Classes disponibles pour le select "tous vers" : on prend toutes les classes
        return (
          <div key={classeKey} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#F8FAFC' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
                  {classe ? classe.nom : 'Sans classe'}
                </span>
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
              {eleves.map((e, i) => {
                const target = cible[e.id] || ''
                const changed = target && target !== e.classe_id
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: i < eleves.length - 1 ? '1px solid #F8FAFC' : 'none', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 160, fontSize: 13, color: '#1E293B', fontWeight: 500 }}>
                      {e.prenom} {e.nom}
                    </span>
                    <span style={{ fontSize: 13, color: '#94A3B8' }}>→</span>
                    <select style={{ ...inp, minWidth: 150, borderColor: changed ? '#93C5FD' : '#E2E8F0', background: changed ? '#EFF6FF' : '#fff' }}
                      value={target}
                      onChange={ev => setCible(p => ({ ...p, [e.id]: ev.target.value }))}>
                      <option value="">Ne pas changer</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                    {changed && <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>modifié</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div style={{ fontSize: 12, color: '#94A3B8' }}>
        Les passages ne touchent que les élèves <strong>inscrits</strong>. Pour les élèves qui quittent l’établissement, utilisez l’action « Sortie de l’élève » sur leur fiche.
      </div>
    </div>
  )
}
