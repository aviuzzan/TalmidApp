'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive } from '@/lib/exercice-context'

type Classe = { id: string; nom: string; ordre: number }
type Enfant = { id: string; prenom: string; nom: string; classe_id: string | null }
type Ligne = {
  id?: string
  enfant_id: string
  prenom: string
  nom: string
  moyenne: number | null
  rang: number | null
  appreciation: string
  decision: string
}

const DECISIONS = [
  { v: 'felicitations',             l: '⭐ Félicitations',          c: '#059669' },
  { v: 'encouragements',            l: '👏 Encouragements',         c: '#10B981' },
  { v: 'compliments',               l: '😊 Compliments',            c: '#34D399' },
  { v: 'avertissement_travail',     l: '⚠️ Avert. travail',         c: '#F59E0B' },
  { v: 'avertissement_comportement', l: '⚠️ Avert. comportement',   c: '#EF4444' },
  { v: 'mise_en_garde',             l: '🚨 Mise en garde',          c: '#DC2626' },
  { v: 'aucune',                    l: '— Aucune',                  c: '#64748B' },
]

export default function ConseilsDeClassePage() {
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<Classe[]>([])
  const [selectedClasse, setSelectedClasse] = useState<string>('')
  const [trimestre, setTrimestre] = useState<number>(1)
  const [conseil, setConseil] = useState<any>(null)
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [commentaireGen, setCommentaireGen] = useState<string>('')
  const [dateConseil, setDateConseil] = useState<string>('')
  const [president, setPresident] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const { data: cls } = await s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre')
    setClasses((cls ?? []) as Classe[])
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  async function chargerOuCalculer() {
    if (!selectedClasse) { setMsg('Sélectionnez une classe'); return }
    setSaving(true); setMsg('')
    const s = createClient()

    const { data: ex } = await s.from('exercices').select('id').eq('ecole_id', ecole.id).eq('code', annee).maybeSingle()
    if (!ex?.id) { setMsg('Exercice ' + annee + ' introuvable'); setSaving(false); return }

    // Cherche un conseil existant
    let { data: c } = await s.from('conseils_de_classe')
      .select('*')
      .eq('ecole_id', ecole.id).eq('exercice_id', ex.id)
      .eq('classe_id', selectedClasse).eq('trimestre', trimestre)
      .maybeSingle()

    if (!c) {
      // Pas de conseil → on en crée un en mémoire (sauvegardé au "Enregistrer")
      c = null
    }
    setConseil(c)
    setCommentaireGen(c?.commentaire_general || '')
    setDateConseil(c?.date_conseil || new Date().toISOString().slice(0, 10))
    setPresident(c?.president || '')

    // Récupère les enfants de la classe + leurs moyennes via bulletins
    const { data: enfants } = await s.from('enfants')
      .select('id, prenom, nom, classe_id')
      .eq('classe_id', selectedClasse).eq('ecole_id', ecole.id).eq('annee_scolaire', annee)
      .order('nom')

    if (!enfants || enfants.length === 0) {
      setLignes([])
      setSaving(false)
      setMsg('Aucun élève dans cette classe')
      return
    }

    // Récupère bulletins du trimestre
    const enfantIds = enfants.map((e: any) => e.id)
    const { data: bulletins } = await s.from('bulletins')
      .select('id, enfant_id, moyenne_generale')
      .in('enfant_id', enfantIds)
      .eq('exercice_id', ex.id)
      .eq('trimestre', trimestre)

    // Calcul rang
    const moyennesParEnfant: Record<string, number | null> = {}
    for (const b of bulletins || []) {
      moyennesParEnfant[b.enfant_id] = b.moyenne_generale != null ? Number(b.moyenne_generale) : null
    }

    const sorted = enfants.map((e: any) => ({
      enfant_id: e.id,
      moyenne: moyennesParEnfant[e.id] ?? null,
    })).sort((a, b) => (b.moyenne ?? -1) - (a.moyenne ?? -1))

    const rangParEnfant: Record<string, number> = {}
    let rang = 0
    let lastMoy: number | null = null
    let counter = 0
    for (const item of sorted) {
      counter++
      if (item.moyenne == null) {
        rangParEnfant[item.enfant_id] = 0
        continue
      }
      if (item.moyenne !== lastMoy) {
        rang = counter
        lastMoy = item.moyenne
      }
      rangParEnfant[item.enfant_id] = rang
    }

    // Charge lignes existantes
    let lignesExistantes: any[] = []
    if (c?.id) {
      const { data: l } = await s.from('conseils_de_classe_lignes')
        .select('id, enfant_id, moyenne, rang, appreciation, decision')
        .eq('conseil_id', c.id)
      lignesExistantes = l || []
    }
    const mapLignes: Record<string, any> = {}
    for (const l of lignesExistantes) mapLignes[l.enfant_id] = l

    const newLignes: Ligne[] = (enfants as any[]).map(e => {
      const existing = mapLignes[e.id]
      return {
        id: existing?.id,
        enfant_id: e.id,
        prenom: e.prenom,
        nom: e.nom,
        moyenne: existing?.moyenne ?? moyennesParEnfant[e.id] ?? null,
        rang: existing?.rang ?? rangParEnfant[e.id] ?? null,
        appreciation: existing?.appreciation || '',
        decision: existing?.decision || 'aucune',
      }
    })
    // Tri par rang croissant
    newLignes.sort((a, b) => (a.rang || 999) - (b.rang || 999))
    setLignes(newLignes)
    setSaving(false)
  }

  async function enregistrer() {
    if (!selectedClasse || lignes.length === 0) return
    setSaving(true); setMsg('')
    const s = createClient()
    const { data: ex } = await s.from('exercices').select('id').eq('ecole_id', ecole.id).eq('code', annee).maybeSingle()
    if (!ex?.id) { setMsg('Exercice introuvable'); setSaving(false); return }

    // Moyenne classe
    const moysValides = lignes.filter(l => l.moyenne != null).map(l => Number(l.moyenne))
    const moyenneClasse = moysValides.length > 0 ? Number((moysValides.reduce((a, b) => a + b, 0) / moysValides.length).toFixed(2)) : null

    let conseilId = conseil?.id
    if (conseilId) {
      await s.from('conseils_de_classe').update({
        commentaire_general: commentaireGen,
        date_conseil: dateConseil || null,
        president: president || null,
        moyenne_classe: moyenneClasse,
        effectif_classe: lignes.length,
        updated_at: new Date().toISOString(),
      }).eq('id', conseilId)
    } else {
      const { data: c } = await s.from('conseils_de_classe').insert({
        ecole_id: ecole.id, exercice_id: ex.id,
        classe_id: selectedClasse, trimestre,
        commentaire_general: commentaireGen,
        date_conseil: dateConseil || null,
        president: president || null,
        moyenne_classe: moyenneClasse,
        effectif_classe: lignes.length,
      }).select('id').single()
      conseilId = c?.id
      setConseil(c)
    }

    if (conseilId) {
      const payload = lignes.map(l => ({
        conseil_id: conseilId,
        enfant_id: l.enfant_id,
        moyenne: l.moyenne,
        rang: l.rang,
        appreciation: l.appreciation || null,
        decision: l.decision || null,
      }))
      await s.from('conseils_de_classe_lignes').upsert(payload, { onConflict: 'conseil_id,enfant_id' })
    }

    setSaving(false)
    setMsg('✓ Conseil enregistré')
    setTimeout(() => setMsg(''), 4000)
  }

  function updateLigne(i: number, patch: Partial<Ligne>) {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>⚖️ Conseils de classe</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Calcul auto des moyennes + rang + appréciations et décisions trimestrielles</p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: '#F8FAFC', padding: 12, borderRadius: 10, border: '1px solid #E2E8F0' }}>
        <select value={trimestre} onChange={e => setTrimestre(Number(e.target.value))} style={inp}>
          <option value={1}>1er trimestre</option>
          <option value={2}>2e trimestre</option>
          <option value={3}>3e trimestre</option>
        </select>
        <select value={selectedClasse} onChange={e => setSelectedClasse(e.target.value)} style={inp}>
          <option value="">— Classe —</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <button onClick={chargerOuCalculer} disabled={saving || !selectedClasse} className="btn-primary">
          {saving ? '...' : '📊 Charger / Calculer'}
        </button>
      </div>

      {msg && <div style={{ background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{msg}</div>}

      {lignes.length > 0 && (
        <>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Date du conseil</label>
              <input type="date" value={dateConseil} onChange={e => setDateConseil(e.target.value)} style={{ ...inp, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>Président de séance</label>
              <input type="text" value={president} onChange={e => setPresident(e.target.value)} placeholder="ex. M. Cohen" style={{ ...inp, width: '100%' }} />
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Rang', 'Élève', 'Moyenne', 'Appréciation', 'Décision'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={l.enfant_id} style={{ borderBottom: i < lignes.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: '#1E40AF', width: 60 }}>{l.rang || '—'}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{l.prenom} {l.nom}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: l.moyenne != null && l.moyenne >= 10 ? '#059669' : '#DC2626' }}>
                      {l.moyenne != null ? Number(l.moyenne).toFixed(2) : '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <textarea value={l.appreciation} onChange={e => updateLigne(i, { appreciation: e.target.value })}
                        placeholder="Appréciation du conseil..." style={{ ...inp, width: '100%', minHeight: 50, fontSize: 12, fontFamily: 'inherit' }} />
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <select value={l.decision} onChange={e => updateLigne(i, { decision: e.target.value })} style={{ ...inp, fontSize: 12, minWidth: 180 }}>
                        {DECISIONS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 6, display: 'block' }}>Commentaire général du conseil</label>
            <textarea value={commentaireGen} onChange={e => setCommentaireGen(e.target.value)}
              placeholder="Synthèse du conseil, points marquants, projets pour le trimestre suivant..."
              style={{ ...inp, width: '100%', minHeight: 100, fontFamily: 'inherit' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={enregistrer} disabled={saving} className="btn-primary">
              {saving ? 'Enregistrement...' : '💾 Enregistrer le conseil'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
