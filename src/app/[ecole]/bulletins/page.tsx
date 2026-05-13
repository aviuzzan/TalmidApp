'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive } from '@/lib/exercice-context'

type Classe = { id: string; nom: string; ordre: number }
type Enfant = { id: string; prenom: string; nom: string; classe_id: string | null }
type Bulletin = {
  id: string; enfant_id: string; classe_id: string;
  trimestre: number; moyenne_generale: number | null; rang: number | null;
  visible_famille: boolean; created_at: string;
}

export default function BulletinsPage() {
  const router = useRouter()
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [classes, setClasses] = useState<Classe[]>([])
  const [enfants, setEnfants] = useState<Enfant[]>([])
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [selectedClasse, setSelectedClasse] = useState<string>('')
  const [trimestre, setTrimestre] = useState<number>(1)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: cls }, { data: enf }] = await Promise.all([
      s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre'),
      s.from('enfants').select('id, prenom, nom, classe_id').eq('ecole_id', ecole.id).eq('annee_scolaire', annee).order('nom'),
    ])
    setClasses((cls ?? []) as Classe[])
    setEnfants((enf ?? []) as Enfant[])

    // Récupère les bulletins déjà générés pour ce trimestre + année courante
    const { data: ex } = await s.from('exercices').select('id').eq('ecole_id', ecole.id).eq('code', annee).maybeSingle()
    if (ex?.id) {
      const { data: bul } = await s.from('bulletins')
        .select('id, enfant_id, classe_id, trimestre, moyenne_generale, rang, visible_famille, created_at')
        .eq('ecole_id', ecole.id).eq('exercice_id', ex.id).eq('trimestre', trimestre)
      setBulletins((bul ?? []) as Bulletin[])
    } else {
      setBulletins([])
    }
    setLoading(false)
  }, [ecole?.id, annee, trimestre])

  useEffect(() => { load() }, [load])

  async function genererPourClasse() {
    if (!selectedClasse) { setMsg('Sélectionnez une classe'); return }
    setGenerating(true); setMsg('')
    const s = createClient()

    // Récupère exercice_id
    const { data: ex } = await s.from('exercices').select('id').eq('ecole_id', ecole.id).eq('code', annee).maybeSingle()
    if (!ex?.id) { setGenerating(false); setMsg('Pas d\'exercice ' + annee + ' configuré'); return }

    // Élèves de la classe
    const elevesClasse = enfants.filter(e => e.classe_id === selectedClasse)

    // Récupère toutes les notes du trimestre pour cette classe
    const { data: evals } = await s.from('evaluations')
      .select('id, matiere_id, coefficient, bareme, matieres(id, nom, ordre), notes(id, enfant_id, note, absent)')
      .eq('classe_id', selectedClasse).eq('exercice_id', ex.id).eq('trimestre', trimestre)

    let created = 0, skipped = 0
    for (const e of elevesClasse) {
      // Bulletin existe déjà ?
      const existing = bulletins.find(b => b.enfant_id === e.id)
      if (existing) { skipped++; continue }

      // Calcule moyennes par matière
      const moyennesParMatiere: Record<string, { matiere_id: string; matiere_nom: string; ordre: number; sumPond: number; sumCoef: number }> = {}
      for (const ev of (evals || []) as any[]) {
        const mat = ev.matieres
        if (!mat) continue
        const matKey = mat.id
        if (!moyennesParMatiere[matKey]) {
          moyennesParMatiere[matKey] = { matiere_id: mat.id, matiere_nom: mat.nom, ordre: mat.ordre || 0, sumPond: 0, sumCoef: 0 }
        }
        const note = (ev.notes || []).find((n: any) => n.enfant_id === e.id)
        if (note && !note.absent && note.note != null) {
          const noteSur20 = ev.bareme ? (Number(note.note) / Number(ev.bareme)) * 20 : Number(note.note)
          const coef = Number(ev.coefficient || 1)
          moyennesParMatiere[matKey].sumPond += noteSur20 * coef
          moyennesParMatiere[matKey].sumCoef += coef
        }
      }
      const lignes = Object.values(moyennesParMatiere).map(m => ({
        matiere_id: m.matiere_id,
        matiere_nom: m.matiere_nom,
        moyenne_eleve: m.sumCoef > 0 ? Number((m.sumPond / m.sumCoef).toFixed(2)) : null,
        position: m.ordre,
      }))
      const sumGen = lignes.reduce((s, l) => s + (l.moyenne_eleve || 0), 0)
      const countGen = lignes.filter(l => l.moyenne_eleve != null).length
      const moyenneGen = countGen > 0 ? Number((sumGen / countGen).toFixed(2)) : null

      // Crée le bulletin
      const { data: newBul } = await s.from('bulletins').insert({
        ecole_id: ecole.id,
        exercice_id: ex.id,
        enfant_id: e.id,
        classe_id: selectedClasse,
        trimestre,
        moyenne_generale: moyenneGen,
        effectif_classe: elevesClasse.length,
        visible_famille: false,
      }).select().single()

      if (newBul?.id && lignes.length > 0) {
        await s.from('bulletin_lignes').insert(
          lignes.map(l => ({ bulletin_id: newBul.id, ...l }))
        )
      }
      created++
    }

    setGenerating(false)
    setMsg(`✓ ${created} bulletin${created > 1 ? 's' : ''} créé${created > 1 ? 's' : ''}` + (skipped ? `, ${skipped} déjà existant${skipped > 1 ? 's' : ''}` : ''))
    setTimeout(() => setMsg(''), 4000)
    await load()
  }

  async function basculerVisibilite(b: Bulletin) {
    await createClient().from('bulletins').update({ visible_famille: !b.visible_famille }).eq('id', b.id)
    await load()
  }

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const bulletinsAffichage = selectedClasse ? bulletins.filter(b => b.classe_id === selectedClasse) : bulletins

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📋 Bulletins scolaires</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Génération auto à partir des notes saisies — exercice {annee}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: '#F8FAFC', padding: 12, borderRadius: 10, border: '1px solid #E2E8F0' }}>
        <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value))} style={inp}>
          <option value={1}>1er trimestre</option>
          <option value={2}>2e trimestre</option>
          <option value={3}>3e trimestre</option>
        </select>
        <select value={selectedClasse} onChange={e => setSelectedClasse(e.target.value)} style={inp}>
          <option value="">— Toutes les classes —</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <button onClick={genererPourClasse} disabled={!selectedClasse || generating} className="btn-primary">
          {generating ? 'Génération...' : '⚙ Générer pour cette classe'}
        </button>
      </div>

      {msg && <div style={{ background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{msg}</div>}

      {bulletinsAffichage.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', color: '#94A3B8', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12 }}>
          Aucun bulletin pour le {trimestre}{trimestre === 1 ? 'er' : 'e'} trimestre. Choisis une classe et clique "Générer".
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Élève', 'Classe', 'Moyenne', 'Visible famille', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bulletinsAffichage.map((b, i) => {
                const e = enfants.find(x => x.id === b.enfant_id)
                const cl = classes.find(c => c.id === b.classe_id)
                return (
                  <tr key={b.id} style={{ borderBottom: i < bulletinsAffichage.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{e ? e.prenom + ' ' + e.nom : '—'}</td>
                    <td style={{ padding: '11px 14px', color: '#64748B' }}>{cl?.nom || '—'}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: b.moyenne_generale && b.moyenne_generale >= 10 ? '#10B981' : '#DC2626' }}>
                      {b.moyenne_generale != null ? Number(b.moyenne_generale).toFixed(2) + ' / 20' : '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <button onClick={() => basculerVisibilite(b)}
                        style={{ background: b.visible_famille ? '#ECFDF5' : '#F1F5F9', color: b.visible_famille ? '#065F46' : '#64748B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {b.visible_famille ? '✓ Visible' : '🔒 Masqué'}
                      </button>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <button onClick={() => router.push(`/${ecole.slug}/bulletins/${b.id}`)} className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}>
                        Voir / Imprimer →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
