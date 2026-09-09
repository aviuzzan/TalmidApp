'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * uuuu5 (09/09/2026) — HISTORIQUE / ARCHIVES.
 * Demande d'Avi (cas GOLDBERG, élève jamais venu) : une famille partie ne doit
 * plus apparaître dans les listes ; on doit la retrouver « à un seul endroit ».
 *
 * Deux onglets :
 *  - Familles archivées (familles.archivee_le) : date, motif, enfants, lien fiche
 *  - Élèves sortis (scolarites.statut_inscription = 'sorti') : dernière classe,
 *    date et motif de sortie, année — y compris les sorties d'élèves dont la
 *    famille est toujours active (un frère parti, l'autre resté)
 */
type FamilleArchivee = {
  id: string; numero: string | null; nom: string; archivee_le: string; archive_motif: string | null
  parent1_prenom: string | null; parent1_nom: string | null; parent1_email: string | null; parent1_telephone: string | null
  enfants: { id: string; prenom: string; nom: string; date_sortie: string | null }[]
}
type EleveSorti = {
  id: string; enfant_id: string; date_sortie: string | null; motif_sortie: string | null; annee_scolaire: string | null
  enfants: { id: string; prenom: string; nom: string; famille_id: string; familles: { id: string; nom: string; numero: string | null; archivee_le: string | null } | null } | null
  classes: { nom: string } | null
}

export default function ArchivesPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [onglet, setOnglet] = useState<'familles' | 'eleves'>('familles')
  const [familles, setFamilles] = useState<FamilleArchivee[]>([])
  const [eleves, setEleves] = useState<EleveSorti[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const s = createClient()
    const [{ data: fam }, { data: sco }] = await Promise.all([
      s.from('familles')
        .select('id, numero, nom, archivee_le, archive_motif, parent1_prenom, parent1_nom, parent1_email, parent1_telephone, enfants(id, prenom, nom, date_sortie)')
        .eq('ecole_id', ecole.id).not('archivee_le', 'is', null)
        .order('archivee_le', { ascending: false }),
      s.from('scolarites')
        .select('id, enfant_id, date_sortie, motif_sortie, annee_scolaire, enfants(id, prenom, nom, famille_id, familles(id, nom, numero, archivee_le)), classes(nom)')
        .eq('ecole_id', ecole.id).eq('statut_inscription', 'sorti')
        .order('date_sortie', { ascending: false, nullsFirst: false }),
    ])
    setFamilles((fam || []) as any)
    setEleves((sco || []) as any)
    setLoading(false)
  }, [ecole.id])

  useEffect(() => { load() }, [load])

  const q = search.trim().toLowerCase()
  const famFiltrees = familles.filter(f => !q || f.nom?.toLowerCase().includes(q) || f.numero?.toLowerCase().includes(q) || (f.enfants || []).some(e => `${e.prenom} ${e.nom}`.toLowerCase().includes(q)))
  const elvFiltres = eleves.filter(r => !q || `${r.enfants?.prenom} ${r.enfants?.nom}`.toLowerCase().includes(q) || r.enfants?.familles?.nom?.toLowerCase().includes(q))

  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }
  const td: React.CSSProperties = { padding: '11px 14px', fontSize: 13, borderTop: '1px solid #F1F5F9', verticalAlign: 'top' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🗄️ Historique / Archives</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
          Familles parties et élèves sortis. Ils n&apos;apparaissent plus dans les listes, effectifs, envois ni relances ; tout leur historique reste consultable ici.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {([['familles', `Familles archivées (${familles.length})`], ['eleves', `Élèves sortis (${eleves.length})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)}
            style={{ background: onglet === k ? '#1E293B' : '#fff', color: onglet === k ? '#fff' : '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {l}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un nom…"
          style={{ marginLeft: 'auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, minWidth: 240 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
      ) : onglet === 'familles' ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          {famFiltrees.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune famille archivée{q ? ' pour cette recherche' : ''}.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#F8FAFC' }}><tr>
                {['Famille', 'Enfants', 'Archivée le', 'Motif', 'Contact', ''].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {famFiltrees.map(f => (
                  <tr key={f.id}>
                    <td style={td}><strong>{f.nom}</strong>{f.numero && <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>{f.numero}</div>}</td>
                    <td style={td}>{(f.enfants || []).map(e => <div key={e.id}>{e.prenom} {e.nom}{e.date_sortie ? <span style={{ color: '#94A3B8', fontSize: 11 }}> · sorti le {fmtDate(e.date_sortie)}</span> : null}</div>)}</td>
                    <td style={td}>{fmtDate(f.archivee_le)}</td>
                    <td style={{ ...td, color: '#475569' }}>{f.archive_motif || '—'}</td>
                    <td style={{ ...td, fontSize: 12, color: '#475569' }}>{[f.parent1_prenom, f.parent1_nom].filter(Boolean).join(' ')}{f.parent1_email && <div style={{ color: '#2563EB' }}>{f.parent1_email}</div>}{f.parent1_telephone && <div>{f.parent1_telephone}</div>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => router.push(`/${ecole.slug}/familles/${f.id}`)}
                        style={{ background: '#F1F5F9', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Ouvrir la fiche</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          {elvFiltres.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun élève sorti{q ? ' pour cette recherche' : ''}.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#F8FAFC' }}><tr>
                {['Élève', 'Famille', 'Année', 'Dernière classe', 'Sorti le', 'Motif', ''].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {elvFiltres.map(r => (
                  <tr key={r.id}>
                    <td style={td}><strong>{r.enfants?.prenom} {r.enfants?.nom}</strong></td>
                    <td style={td}>{r.enfants?.familles?.nom || '—'}{r.enfants?.familles?.archivee_le && <span style={{ marginLeft: 6, fontSize: 10, color: '#475569', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 6, padding: '1px 6px' }}>archivée</span>}</td>
                    <td style={{ ...td, color: '#475569' }}>{r.annee_scolaire || '—'}</td>
                    <td style={{ ...td, color: '#475569' }}>{r.classes?.nom || '—'}</td>
                    <td style={td}>{fmtDate(r.date_sortie)}</td>
                    <td style={{ ...td, color: '#475569' }}>{r.motif_sortie || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {r.enfants?.id && (
                        <button onClick={() => router.push(`/${ecole.slug}/enfants/${r.enfants!.id}`)}
                          style={{ background: '#F1F5F9', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Fiche élève</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
