'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Statut = 'present' | 'absent' | 'retard' | 'sortie_anticipee'
type DemiJournee = 'matin' | 'apres_midi' | 'journee'

type Eleve = {
  id: string
  prenom: string
  nom: string
  classe_id: string | null
  statut_jour: Statut | null
  presence_id: string | null
  motif: string | null
  justifie: boolean
}

const STATUTS: { value: Statut; label: string; icon: string; bg: string; fg: string }[] = [
  { value: 'present', label: 'Présent', icon: '✓', bg: '#ECFDF5', fg: '#065F46' },
  { value: 'absent', label: 'Absent', icon: '✕', bg: '#FEF2F2', fg: '#991B1B' },
  { value: 'retard', label: 'Retard', icon: '⏰', bg: '#FEF3C7', fg: '#92400E' },
  { value: 'sortie_anticipee', label: 'Sortie ant.', icon: '↩', bg: '#EFF6FF', fg: '#1E40AF' },
]

export default function PresencesPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [demi, setDemi] = useState<DemiJournee>('matin')
  const [classeId, setClasseId] = useState<string>('')
  const [classes, setClasses] = useState<{ id: string; nom: string }[]>([])
  const [eleves, setEleves] = useState<Eleve[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [motifModalEleve, setMotifModalEleve] = useState<Eleve | null>(null)

  useEffect(() => {
    if (!ecole?.id) return
    createClient().from('classes').select('id, nom').eq('ecole_id', ecole.id).order('ordre').then(({ data }) => {
      setClasses(data || [])
      if (data && data.length > 0 && !classeId) setClasseId(data[0].id)
    })
  }, [ecole?.id])

  const load = useCallback(async () => {
    if (!classeId || !ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: enfs }, { data: pres }] = await Promise.all([
      s.from('enfants').select('id, prenom, nom, classe_id').eq('ecole_id', ecole.id).eq('classe_id', classeId).order('nom'),
      s.from('presences').select('*').eq('classe_id', classeId).eq('date_jour', date).eq('demi_journee', demi),
    ])
    const presMap = new Map((pres || []).map((p: any) => [p.enfant_id, p]))
    const list: Eleve[] = (enfs || []).map((e: any) => {
      const p = presMap.get(e.id)
      return {
        id: e.id, prenom: e.prenom, nom: e.nom, classe_id: e.classe_id,
        statut_jour: p?.statut || null,
        presence_id: p?.id || null,
        motif: p?.motif || null,
        justifie: p?.justifie || false,
      }
    })
    setEleves(list)
    setLoading(false)
  }, [classeId, ecole?.id, date, demi])

  useEffect(() => { load() }, [load])

  async function setStatut(eleve: Eleve, statut: Statut, motif?: string, justifie?: boolean) {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const payload = {
      ecole_id: ecole.id,
      enfant_id: eleve.id,
      classe_id: eleve.classe_id,
      date_jour: date,
      demi_journee: demi,
      statut,
      motif: motif !== undefined ? motif : eleve.motif,
      justifie: justifie !== undefined ? justifie : eleve.justifie,
      saisi_par: session?.user.id,
      updated_at: new Date().toISOString(),
    }
    if (eleve.presence_id) {
      await s.from('presences').update(payload).eq('id', eleve.presence_id)
    } else {
      await s.from('presences').insert(payload)
    }
    await load()
  }

  async function tousPresents() {
    if (!confirm(`Marquer les ${eleves.length} élèves comme présents pour ${demi === 'matin' ? 'le matin' : demi === 'apres_midi' ? 'l\'après-midi' : 'la journée'} du ${new Date(date).toLocaleDateString('fr-FR')} ?`)) return
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const rows = eleves.map(e => ({
      ecole_id: ecole.id, enfant_id: e.id, classe_id: e.classe_id,
      date_jour: date, demi_journee: demi, statut: 'present' as Statut, saisi_par: session?.user.id,
    }))
    // Upsert un par un (eviter erreur unique constraint)
    for (const r of rows) {
      const existing = eleves.find(x => x.id === r.enfant_id)?.presence_id
      if (existing) {
        await s.from('presences').update({ statut: 'present' }).eq('id', existing)
      } else {
        await s.from('presences').insert(r)
      }
    }
    await load()
    setSaving(false)
  }

  const stats = STATUTS.map(s => ({ ...s, count: eleves.filter(e => e.statut_jour === s.value).length }))
  const nonPointes = eleves.filter(e => !e.statut_jour).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Présences & absences</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>Pointage quotidien par classe — matin / après-midi / journée</p>
      </div>

      {/* Contrôles */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Demi-journée</label>
          <select value={demi} onChange={e => setDemi(e.target.value as DemiJournee)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
            <option value="matin">Matin</option>
            <option value="apres_midi">Après-midi</option>
            <option value="journee">Journée complète</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Classe</label>
          <select value={classeId} onChange={e => setClasseId(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
            <option value="">— Sélectionner —</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <button onClick={tousPresents} disabled={!classeId || saving || eleves.length === 0}
          style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (!classeId || saving) ? 0.5 : 1 }}>
          ✓ Tous présents
        </button>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {stats.map(s => (
          <div key={s.value} style={{ background: s.bg, borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.fg }}>{s.count}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.icon} {s.label}</div>
          </div>
        ))}
        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#94A3B8' }}>{nonPointes}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Non pointé</div>
        </div>
      </div>

      {/* Liste élèves */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        {!classeId ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Sélectionnez une classe pour pointer les élèves.</div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Chargement…</div>
        ) : eleves.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun élève dans cette classe.</div>
        ) : (
          eleves.map(e => {
            const sc = STATUTS.find(s => s.value === e.statut_jour)
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: '1px solid #F1F5F9' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{e.prenom} {e.nom}</div>
                  {e.motif && (
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      Motif : {e.motif} {e.justifie && <span style={{ color: '#065F46', fontWeight: 600 }}>(justifié)</span>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {STATUTS.map(s => {
                    const active = e.statut_jour === s.value
                    return (
                      <button key={s.value}
                        onClick={() => s.value === 'absent' || s.value === 'retard' ? setMotifModalEleve({ ...e, statut_jour: s.value }) : setStatut(e, s.value)}
                        style={{
                          background: active ? s.fg : s.bg,
                          color: active ? '#fff' : s.fg,
                          border: 'none', borderRadius: 8, padding: '7px 12px',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', minWidth: 36,
                        }} title={s.label}>
                        {s.icon} {s.label.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal motif */}
      {motifModalEleve && (
        <div onClick={() => setMotifModalEleve(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 460, width: '90%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>
              {motifModalEleve.statut_jour === 'absent' ? 'Absence' : 'Retard'} — {motifModalEleve.prenom} {motifModalEleve.nom}
            </h3>
            <MotifForm
              initialMotif={motifModalEleve.motif || ''}
              initialJustifie={motifModalEleve.justifie}
              onSave={(motif, justifie) => {
                setStatut(motifModalEleve, motifModalEleve.statut_jour!, motif, justifie)
                setMotifModalEleve(null)
              }}
              onCancel={() => setMotifModalEleve(null)} />
          </div>
        </div>
      )}
    </div>
  )
}

function MotifForm({ initialMotif, initialJustifie, onSave, onCancel }: {
  initialMotif: string; initialJustifie: boolean
  onSave: (motif: string, justifie: boolean) => void; onCancel: () => void
}) {
  const [motif, setMotif] = useState(initialMotif)
  const [justifie, setJustifie] = useState(initialJustifie)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Motif</label>
        <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Maladie, RDV médical, autre…"
          style={{ display: 'block', width: '100%', marginTop: 4, padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, minHeight: 60, boxSizing: 'border-box' }} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={justifie} onChange={e => setJustifie(e.target.checked)} />
        Absence/retard justifié(e)
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave(motif, justifie)}
          style={{ flex: 1, background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Enregistrer</button>
        <button onClick={onCancel}
          style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
      </div>
    </div>
  )
}
