'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { chargerPlacesOptions, type PlacesOption } from '@/lib/options-vie-scolaire'

/**
 * Tableau "Depuis contrats" : liste les enfants ayant une option d'une
 * catégorie donnée (transport, cantine...) dans leur contrat de scolarisation.
 * Utilisé par /transport et /cantine. Source : tarifs_secteur.categorie
 * + JSONB contrat_enfants.postes.
 */
export default function OptionsDepuisContrats({ ecoleId, categorie }: { ecoleId: string; categorie: 'transport' | 'cantine' | 'activite' | 'autre' }) {
  const [rows, setRows] = useState<any[]>([])
  const [places, setPlaces] = useState<Map<string, PlacesOption>>(new Map())
  const [tarifNoms, setTarifNoms] = useState<Map<string, string>>(new Map())
  const [filtreOption, setFiltreOption] = useState<string>('toutes')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!ecoleId) return
    setLoading(true)
    const s = createClient()
    const { data: tarifsCat } = await s.from('tarifs_secteur')
      .select('id, nom_poste, montant, annee_scolaire, places_max')
      .eq('ecole_id', ecoleId).eq('categorie', categorie)
    const ids = new Set((tarifsCat || []).map((t: any) => t.id))
    const noms = new Map<string, string>()
    ;(tarifsCat || []).forEach((t: any) => noms.set(t.id, t.nom_poste))
    setTarifNoms(noms)

    if (ids.size === 0) { setRows([]); setLoading(false); return }

    const { data: contratEnfants } = await s.from('contrat_enfants')
      .select('id, enfant_id, postes, contrat_id, contrats_scolarisation!inner(id, annee_scolaire, statut, ecole_id), enfants(prenom, nom, classes(nom), familles(nom))')
      .eq('contrats_scolarisation.ecole_id', ecoleId)
      .in('contrats_scolarisation.statut', ['valide', 'accepte', 'soumis'])

    const filtres: any[] = []
    const annees = new Set<string>()
    ;(contratEnfants || []).forEach((ce: any) => {
      const postes = Array.isArray(ce.postes) ? ce.postes : []
      postes.forEach((p: any) => {
        if (ids.has(p.tarif_id)) {
          annees.add(ce.contrats_scolarisation?.annee_scolaire)
          filtres.push({
            id: ce.id + '_' + p.tarif_id,
            tarif_id: p.tarif_id,
            enfant: ce.enfants,
            annee: ce.contrats_scolarisation?.annee_scolaire,
            nom_option: p.nom || noms.get(p.tarif_id) || categorie,
            montant: parseFloat(p.montant) || 0,
          })
        }
      })
    })
    setRows(filtres)

    // Compteurs de places (RPC) sur l'annee la plus recente presente
    const anneesTriees = Array.from(annees).sort()
    const derniereAnnee = anneesTriees[anneesTriees.length - 1]
    if (derniereAnnee) {
      setPlaces(await chargerPlacesOptions(s, ecoleId, derniereAnnee))
    }
    setLoading(false)
  }, [ecoleId, categorie])

  useEffect(() => { load() }, [load])

  const optionsUniques = Array.from(new Set(rows.map((r: any) => r.nom_option))).sort()
  const rowsFiltres = filtreOption === 'toutes' ? rows : rows.filter((r: any) => r.nom_option === filtreOption)
  const totalFiltres = rowsFiltres.reduce((s: number, r: any) => s + Number(r.montant || 0), 0)

  // Bandeau places par tarif de la catégorie
  const placesBadges: { nom: string; p: PlacesOption }[] = []
  tarifNoms.forEach((nom, tarifId) => {
    const p = places.get(tarifId)
    if (p && p.places_max != null) placesBadges.push({ nom, p })
  })

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Chargement…</div>

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Enfants ayant une option {categorie} dans leur contrat</h3>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>Source : contrats de scolarisation validés · catégorie «&nbsp;{categorie}&nbsp;» des tarifs</div>
        </div>
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={filtreOption} onChange={e => setFiltreOption(e.target.value)}
              style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 500, color: '#1E293B', cursor: 'pointer' }}>
              <option value="toutes">Toutes options ({rows.length})</option>
              {optionsUniques.map(opt => {
                const n = rows.filter((r: any) => r.nom_option === opt).length
                return <option key={opt} value={opt}>{opt} ({n})</option>
              })}
            </select>
            <button onClick={() => {
              const csv = 'Prénom;Nom;Classe;Famille;Année;Option;Montant\n' + rowsFiltres.map((r: any) => [r.enfant?.prenom || '', r.enfant?.nom || '', r.enfant?.classes?.nom || '', r.enfant?.familles?.nom || '', r.annee || '', r.nom_option, r.montant].map((v: any) => String(v).replace(/;/g, ',')).join(';')).join('\n')
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const suffix = filtreOption === 'toutes' ? '' : '-' + filtreOption.toLowerCase().replace(/\s+/g, '-')
              const a = document.createElement('a'); a.href = url; a.download = `${categorie}-depuis-contrats${suffix}.csv`; a.click(); URL.revokeObjectURL(url)
            }} style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📥 Export CSV</button>
          </div>
        )}
      </div>

      {/* Bandeau places limitees */}
      {placesBadges.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {placesBadges.map(({ nom, p }) => {
            const ratio = p.places_max ? p.nb_inscrits / p.places_max : 0
            const depassement = p.places_max != null && p.nb_inscrits > p.places_max
            const bg = depassement ? '#FEF2F2' : p.complet ? '#FFF7ED' : '#F0FDF4'
            const color = depassement ? '#991B1B' : p.complet ? '#9A3412' : '#065F46'
            return (
              <div key={nom} style={{ background: bg, color, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>
                {nom} : {p.nb_inscrits} / {p.places_max}
                {depassement && ' ⚠ Dépassement'}
                {!depassement && p.complet && ' · Complet'}
                {p.nb_attente > 0 && ` · ${p.nb_attente} en liste d'attente`}
                {!p.complet && !depassement && ratio >= 0.8 && ' · Bientôt complet'}
              </div>
            )
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun enfant avec une option {categorie} dans son contrat.</div>
      ) : rowsFiltres.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun enfant pour «&nbsp;{filtreOption}&nbsp;».</div>
      ) : (
        <>
          <div style={{ marginBottom: 10, padding: '8px 12px', background: '#F0FDF4', borderRadius: 8, fontSize: 12, color: '#065F46' }}>
            <strong>{rowsFiltres.length}</strong> enfant{rowsFiltres.length > 1 ? 's' : ''}
            {filtreOption !== 'toutes' && <> · option <strong>{filtreOption}</strong></>}
            {' · '}Total annuel : <strong>{Number(totalFiltres).toLocaleString('fr-FR')} €</strong>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ borderBottom: '1px solid #E2E8F0' }}>
                <tr>{['Enfant','Classe','Famille','Année','Option','Montant'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rowsFiltres.map((r: any) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.enfant?.prenom || ''} {r.enfant?.nom || ''}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{r.enfant?.classes?.nom || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{r.enfant?.familles?.nom || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{r.annee}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, background: '#EEF2FF', color: '#4338CA', borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>{r.nom_option}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
