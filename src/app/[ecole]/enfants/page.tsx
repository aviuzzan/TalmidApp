'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useExercice } from '@/lib/exercice-context'
import { useI18n } from '@/lib/i18n'

export default function EnfantsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const ecole = useEcole()
  const { exerciceSelectionne } = useExercice()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtreClasse, setFiltreClasse] = useState('')
  const [classes, setClasses] = useState<any[]>([])
  const [showSortis, setShowSortis] = useState(false)

  useEffect(() => {
    if (ecole?.id && exerciceSelectionne?.id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id, exerciceSelectionne?.id])

  async function load() {
    if (!ecole?.id || !exerciceSelectionne?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: sco }, { data: cls }] = await Promise.all([
      s.from('scolarites')
        .select('id, enfant_id, classe_id, statut_inscription, date_sortie, enfants(id, prenom, nom, date_naissance, famille_id, familles(nom, parent1_email, parent1_telephone)), classes(nom)')
        .eq('ecole_id', ecole.id)
        .eq('exercice_id', exerciceSelectionne.id),
      s.from('classes').select('id, nom').eq('ecole_id', ecole.id).order('nom'),
    ])
    const list = (sco ?? []).slice().sort((a: any, b: any) =>
      (a.enfants?.nom || '').localeCompare(b.enfants?.nom || '') ||
      (a.enfants?.prenom || '').localeCompare(b.enfants?.prenom || ''))
    setRows(list)
    setClasses(cls ?? [])
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const e = r.enfants
    const q = search.toLowerCase()
    const matchSearch = !q ||
      e?.prenom?.toLowerCase().includes(q) ||
      e?.nom?.toLowerCase().includes(q) ||
      e?.familles?.nom?.toLowerCase().includes(q)
    const matchClasse = !filtreClasse || r.classe_id === filtreClasse
    const matchStatut = showSortis || r.statut_inscription !== 'sorti'
    return matchSearch && matchClasse && matchStatut
  })

  const nbSortis = rows.filter(r => r.statut_inscription === 'sorti').length

  const inp = {
    background: '#fff', border: '1px solid #E2E8F0', borderRadius: 9,
    padding: '9px 14px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('pages.enfants.title')}</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
            {filtered.length} élève(s) ·{' '}
            <span style={{ fontWeight: 600, color: '#2563EB' }}>Année {exerciceSelectionne?.code || '…'}</span>
          </p>
        </div>
      </div>

      {exerciceSelectionne?.statut === 'cloture' ? (
        <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, padding: '9px 14px' }}>
          🔒 L’année <strong>{exerciceSelectionne?.code}</strong> est <strong>clôturée</strong> : consultation uniquement. Les inscriptions, classes et factures de cette année ne peuvent plus être modifiées.
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#64748B', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '9px 14px' }}>
          Cette liste correspond à l’année <strong>{exerciceSelectionne?.code || '…'}</strong>. Changez d’année avec le sélecteur en haut de page pour voir les inscriptions d’une autre année scolaire.
        </div>
      )}

      {/* Barre de recherche */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', cursor: 'pointer', padding: '0 4px' }}>
          <input type="checkbox" checked={showSortis} onChange={e => setShowSortis(e.target.checked)} />
          Inclure les élèves sortis{nbSortis > 0 ? ` (${nbSortis})` : ''}
        </label>
      </div>

      {/* Tableau */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎓</div>
            <div style={{ color: '#94A3B8', fontSize: 14 }}>
              {search ? `Aucun résultat pour « ${search} »` : `Aucun élève inscrit pour ${exerciceSelectionne?.code || 'cette année'}`}
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
              {filtered.map((r, i) => {
                const e = r.enfants || {}
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F8FAFC' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onClick={() => router.push(`/${ecole.slug}/enfants/${r.enfant_id}`)}
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
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {e.prenom} {e.nom}
                            {r.statut_inscription === 'sorti' && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 5, padding: '1px 6px' }}>SORTI</span>
                            )}
                            {r.statut_inscription === 'en_attente' && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '1px 6px' }}>EN ATTENTE</span>
                            )}
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
                      {r.classes?.nom
                        ? <span style={{ fontSize: 12, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', fontWeight: 500 }}>{r.classes.nom}</span>
                        : <span style={{ color: '#CBD5E1', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B' }}>
                      {e.familles?.parent1_telephone || e.familles?.parent1_email || '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>→</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
