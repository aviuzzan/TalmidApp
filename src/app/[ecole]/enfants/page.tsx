'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function EnfantsPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [enfants, setEnfants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtreClasse, setFiltreClasse] = useState('')
  const [classes, setClasses] = useState<any[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const [{ data: enf }, { data: cls }] = await Promise.all([
      s.from('enfants')
        .select('*, familles(id, nom, email_parent1, telephone_parent1), classes(nom)')
        .order('nom'),
      s.from('classes').select('id, nom').order('nom'),
    ])
    setEnfants(enf ?? [])
    setClasses(cls ?? [])
    setLoading(false)
  }

  const filtered = enfants.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      e.prenom?.toLowerCase().includes(q) ||
      e.nom?.toLowerCase().includes(q) ||
      e.familles?.nom?.toLowerCase().includes(q)
    const matchClasse = !filtreClasse || e.classe_id === filtreClasse
    return matchSearch && matchClasse
  })

  const inp = {
    background: '#fff', border: '1px solid #E2E8F0', borderRadius: 9,
    padding: '9px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Élèves</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{filtered.length} élève(s) trouvé(s)</p>
        </div>
      </div>

      {/* Barre de recherche */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 15 }}>🔍</span>
          <input
            style={{ ...inp, width: '100%', paddingLeft: 36 }}
            placeholder="Rechercher par nom, prénom, famille..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          style={{ ...inp, width: 180 }}
          value={filtreClasse}
          onChange={e => setFiltreClasse(e.target.value)}
        >
          <option value="">Toutes les classes</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
      </div>

      {/* Tableau */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎓</div>
            <div style={{ color: '#94A3B8', fontSize: 14 }}>
              {search ? `Aucun résultat pour « ${search} »` : 'Aucun élève'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Élève', 'Famille', 'Classe', 'Contact', ''].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr
                  key={e.id}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F8FAFC' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                  onClick={() => router.push(`/${ecole.slug}/enfants/${e.id}`)}
                  onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                  onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: '#fff',
                      }}>
                        {e.prenom?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
                          {e.prenom} {e.nom}
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>
                          {e.date_naissance
                            ? `Né(e) le ${new Date(e.date_naissance).toLocaleDateString('fr-FR')}`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <button
                      onClick={ev => { ev.stopPropagation(); router.push(`/${ecole.slug}/familles/${e.famille_id}`) }}
                      style={{ fontSize: 13, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0, textDecoration: 'underline' }}>
                      {e.familles?.nom || '—'}
                    </button>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    {e.classes?.nom
                      ? <span style={{ fontSize: 12, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', fontWeight: 500 }}>{e.classes.nom}</span>
                      : <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B' }}>
                    {e.familles?.telephone_parent1 || e.familles?.email_parent1 || '—'}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>→</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
