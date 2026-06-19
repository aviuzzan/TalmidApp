'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getAnneeCouranteSync } from '@/lib/annee-courante'

type Prof = { id: string; prenom: string; nom: string; ecole_id: string }
type Classe = { id: string; nom: string; ordre: number; matieres: string[] }
type Eleve = { id: string; prenom: string; nom: string; classe_id: string | null }
type Creneau = {
  id: string; classe_id: string; jour_semaine: number;
  heure_debut: string; heure_fin: string; matiere: string | null;
  salle: string | null; notes: string | null;
}
type Ecole = { id: string; nom: string; slug: string }

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven']
const HEURES = Array.from({ length: 13 }, (_, i) => i + 7)

export default function PortailProfPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)
  const [prof, setProf] = useState<Prof | null>(null)
  const [ecole, setEcole] = useState<Ecole | null>(null)
  const [classes, setClasses] = useState<Classe[]>([])
  const [eleves, setEleves] = useState<Eleve[]>([])
  const [creneaux, setCreneaux] = useState<Creneau[]>([])
  const [tab, setTab] = useState<'edt' | 'classes'>('edt')
  const [selectedClasse, setSelectedClasse] = useState<string | null>(null)
  const [annee, setAnnee] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('talmid_prof_annee')
      if (stored) return stored
    }
    return getAnneeCouranteSync()
  })
  const [anneesDispo, setAnneesDispo] = useState<string[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('talmid_prof_annee', annee)
    }
    load()
  }, [annee])

  async function load() {
    setLoading(true)
    const s = createClient()

    // Retry session (peut être pas encore propagée juste après set-password)
    let session = null
    for (let i = 0; i < 8 && !session; i++) {
      const { data } = await s.auth.getSession()
      session = data.session
      if (!session) await new Promise(r => setTimeout(r, 250))
    }
    if (!session) { router.push('/login'); return }

    // Retry profile (timing handle_new_user trigger + upsert backend)
    let profile: any = null
    for (let i = 0; i < 5; i++) {
      const { data } = await s.from('profiles')
        .select('id, role, ecole_id').eq('id', session.user.id).maybeSingle()
      if (data && data.role) { profile = data; break }
      await new Promise(r => setTimeout(r, 300))
    }
    if (!profile || profile.role !== 'teacher') {
      setUnauthorized(true); setLoading(false); return
    }

    // Retry record professeurs (RLS peut prendre une fraction de seconde)
    let profRec: any = null
    for (let i = 0; i < 5; i++) {
      const { data } = await s.from('professeurs')
        .select('id, prenom, nom, ecole_id')
        .eq('profile_id', session.user.id).maybeSingle()
      if (data) { profRec = data; break }
      await new Promise(r => setTimeout(r, 300))
    }
    if (!profRec) { setUnauthorized(true); setLoading(false); return }
    setProf(profRec as Prof)

    const { data: ecoleRec } = await s.from('ecoles')
      .select('id, nom, slug').eq('id', profRec.ecole_id).single()
    setEcole(ecoleRec as Ecole)

    // Liste des annees scolaires depuis les exercices de l'ecole du prof
    try {
      const { data: exs } = await s.from('exercices')
        .select('code').eq('ecole_id', profRec.ecole_id).order('code')
      const codes = Array.from(new Set((exs ?? []).map((e: any) => e.code).filter(Boolean)))
      if (codes.length > 0) {
        setAnneesDispo(codes)
        // Si l'annee selectionnee n'est pas dans la liste, on bascule sur la derniere
        if (!codes.includes(annee)) {
          setAnnee(codes[codes.length - 1])
        }
      } else {
        // Fallback : annee courante calculee
        setAnneesDispo([getAnneeCouranteSync()])
      }
    } catch {
      setAnneesDispo([getAnneeCouranteSync()])
    }

    // Ses classes (via professeur_classes)
    const { data: pcs } = await s.from('professeur_classes')
      .select('classe_id, matieres, classes:classe_id(id, nom, ordre)')
      .eq('professeur_id', profRec.id)
    const classesList = (pcs ?? []).map((pc: any) => ({
      id: pc.classes.id, nom: pc.classes.nom, ordre: pc.classes.ordre,
      matieres: pc.matieres || [],
    })).sort((a: Classe, b: Classe) => a.ordre - b.ordre)
    setClasses(classesList)
    if (classesList.length > 0 && !selectedClasse) setSelectedClasse(classesList[0].id)

    // Tous les élèves des classes du prof (jointure via enfants.classe_id si dispo, sinon depuis inscriptions)
    if (classesList.length > 0) {
      const classeIds = classesList.map((c: Classe) => c.id)
      const { data: elv } = await s.from('enfants')
        .select('id, prenom, nom, classe_id')
        .in('classe_id', classeIds)
        .order('nom')
      setEleves((elv ?? []) as Eleve[])
    }

    // Son EDT
    const { data: edt } = await s.from('emploi_du_temps')
      .select('id, classe_id, jour_semaine, heure_debut, heure_fin, matiere, salle, notes')
      .eq('professeur_id', profRec.id)
      .eq('annee_scolaire', annee)
    setCreneaux((edt ?? []) as Creneau[])

    setLoading(false)
  }

  async function logout() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (unauthorized) return (
    <div style={{ padding: 40, textAlign: 'center', maxWidth: 480, margin: '60px auto', background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: 22, marginBottom: 10 }}>🔒</div>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>Accès refusé</h2>
      <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
        Ce portail est réservé aux professeurs. Si vous êtes professeur, contactez votre administration pour activer votre compte.
      </p>
      <button onClick={logout} style={{ ...btnSec, marginTop: 14 }}>Se déconnecter</button>
    </div>
  )
  if (!prof || !ecole) return null

  const classesById: Record<string, Classe> = {}
  classes.forEach(c => classesById[c.id] = c)
  const elevesParClasse = (cid: string) => eleves.filter(e => e.classe_id === cid)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>
            Bonjour {prof.prenom}
          </h1>
          <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>
            {ecole.nom} · {classes.length} classe{classes.length > 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={annee} onChange={e => setAnnee(e.target.value)} style={{ ...inp, width: 'auto' }}>
            {(anneesDispo.length > 0 ? anneesDispo : [annee]).map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <button onClick={logout} style={btnSec}>Déconnexion</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', padding: 4, borderRadius: 8, marginBottom: 16, width: 'fit-content' }}>
        <button onClick={() => setTab('edt')} style={{ ...btnTab, background: tab === 'edt' ? '#fff' : 'transparent', color: tab === 'edt' ? '#1E293B' : '#64748B' }}>
          Mon emploi du temps
        </button>
        <button onClick={() => setTab('classes')} style={{ ...btnTab, background: tab === 'classes' ? '#fff' : 'transparent', color: tab === 'classes' ? '#1E293B' : '#64748B' }}>
          Mes classes
        </button>
      </div>

      {tab === 'edt' ? (
        creneaux.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }}>
            Aucun cours programmé pour l année {annee}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ ...th, width: 50 }}>H</th>
                  {JOURS.map((j, idx) => <th key={idx} style={th}>{j}</th>)}
                </tr>
              </thead>
              <tbody>
                {HEURES.map(h => (
                  <tr key={h} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ ...td, fontWeight: 600, color: '#64748B', background: '#F8FAFC' }}>{h}h</td>
                    {JOURS.map((_, jour) => {
                      const cells = creneaux.filter(c => {
                        if (c.jour_semaine !== jour) return false
                        return parseInt(c.heure_debut.slice(0,2)) === h
                      })
                      return (
                        <td key={jour} style={{ ...td, padding: 2, minHeight: 50 }}>
                          {cells.length === 0 ? null : cells.map(c => {
                            const cl = classesById[c.classe_id]
                            return (
                              <div key={c.id} style={{
                                background: '#DBEAFE', border: '1px solid #93C5FD',
                                borderRadius: 4, padding: '4px 6px', marginBottom: 2,
                                fontSize: 10, lineHeight: 1.3,
                              }}>
                                <div style={{ fontWeight: 700, color: '#1E40AF' }}>
                                  {c.heure_debut.slice(0,5)}–{c.heure_fin.slice(0,5)}
                                </div>
                                {c.matiere && <div style={{ color: '#1E293B', fontWeight: 600 }}>{c.matiere}</div>}
                                {cl && <div style={{ color: '#64748B' }}>{cl.nom}</div>}
                                {c.salle && <div style={{ color: '#94A3B8' }}>salle {c.salle}</div>}
                              </div>
                            )
                          })}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        classes.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }}>
            Aucune classe assignée.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 6, height: 'fit-content' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', padding: '8px 10px' }}>
                Classes ({classes.length})
              </div>
              {classes.map(c => {
                const active = c.id === selectedClasse
                return (
                  <button key={c.id} onClick={() => setSelectedClasse(c.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: active ? '#EFF6FF' : 'transparent', border: 'none',
                      borderRadius: 7, padding: '8px 10px', cursor: 'pointer', marginBottom: 2,
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#1E40AF' : '#1E293B' }}>{c.nom}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      {elevesParClasse(c.id).length} élève{elevesParClasse(c.id).length > 1 ? 's' : ''}
                      {c.matieres.length > 0 && ' · ' + c.matieres.join(', ')}
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
              {selectedClasse && classesById[selectedClasse] ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>
                      {classesById[selectedClasse].nom}
                    </h2>
                    <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>
                      {classesById[selectedClasse].matieres.length > 0
                        ? 'Matières : ' + classesById[selectedClasse].matieres.join(', ')
                        : 'Aucune matière spécifiée'}
                    </p>
                  </div>
                  {elevesParClasse(selectedClasse).length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                      Aucun élève dans cette classe.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={th}>Élève</th>
                        </tr>
                      </thead>
                      <tbody>
                        {elevesParClasse(selectedClasse).map(e => (
                          <tr key={e.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={td}>{e.prenom} {e.nom}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
                  Sélectionnez une classe.
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  )
}

const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
const btnSec: React.CSSProperties = { background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnTab: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '6px 4px', verticalAlign: 'top', borderRight: '1px solid #F1F5F9' }
