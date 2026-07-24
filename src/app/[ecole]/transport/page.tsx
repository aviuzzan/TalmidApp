'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Forfait = { id: string; nom: string; zone: string | null; trajet: string | null; prix: number; actif: boolean; ordre: number }

export default function TransportPage() {
  const ecole = useEcole()
  const [tab, setTab] = useState<'inscriptions'|'depuis_contrats'|'forfaits'>('depuis_contrats')
  const [forfaits, setForfaits] = useState<Forfait[]>([])
  const [inscriptions, setInscriptions] = useState<any[]>([])
  const [depuisContrats, setDepuisContrats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editForfait, setEditForfait] = useState<Forfait | null>(null)
  const [form, setForm] = useState({ nom: '', zone: '', trajet: 'aller_retour', prix: '' })

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: f }, { data: i }] = await Promise.all([
      s.from('transport_forfaits').select('*').eq('ecole_id', ecole.id).order('ordre'),
      s.from('transport_inscriptions').select('*, enfants(prenom, nom, classes(nom), familles(nom)), transport_forfaits(nom, prix, zone)').eq('ecole_id', ecole.id).eq('statut', 'actif').order('created_at', { ascending: false }),
    ])
    setForfaits(f || [])
    setInscriptions(i || [])

    // Charger les inscriptions "depuis contrat" : enfants ayant un tarif de transport dans postes JSONB
    // On identifie les tarifs "transport" via le groupe_exclusif='transport' OU nom contenant navette/car/transport
    const { data: tarifsTransport } = await s.from('tarifs_secteur')
      .select('id, nom_poste, montant, groupe_exclusif')
      .eq('ecole_id', ecole.id)
      .or('groupe_exclusif.eq.transport,nom_poste.ilike.%navette%,nom_poste.ilike.%car%,nom_poste.ilike.%transport%,nom_poste.ilike.%ramassage%')
    const idsTransport = new Set((tarifsTransport || []).map((t: any) => t.id))
    if (idsTransport.size > 0) {
      const { data: contratEnfants } = await s.from('contrat_enfants')
        .select('id, enfant_id, postes, sous_total, contrat_id, contrats_scolarisation!inner(id, annee_scolaire, statut, ecole_id), enfants(prenom, nom, classes(nom), familles(nom))')
        .eq('contrats_scolarisation.ecole_id', ecole.id)
        .in('contrats_scolarisation.statut', ['valide', 'accepte', 'soumis'])
      const filtres: any[] = []
      ;(contratEnfants || []).forEach((ce: any) => {
        const postes = Array.isArray(ce.postes) ? ce.postes : []
        postes.forEach((p: any) => {
          if (idsTransport.has(p.tarif_id)) {
            filtres.push({
              id: ce.id + '_' + p.tarif_id,
              enfant: ce.enfants,
              annee: ce.contrats_scolarisation?.annee_scolaire,
              nom_option: p.nom || 'Transport',
              montant: parseFloat(p.montant) || 0,
            })
          }
        })
      })
      setDepuisContrats(filtres)
    } else {
      setDepuisContrats([])
    }
    setLoading(false)
  }, [ecole?.id])
  useEffect(() => { load() }, [load])

  async function saveForfait(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nom.trim() || !form.prix) return
    const s = createClient()
    const payload: any = { ecole_id: ecole.id, nom: form.nom.trim(), zone: form.zone || null, trajet: form.trajet, prix: parseFloat(form.prix), ordre: (forfaits.length || 0) + 1 }
    if (editForfait) await s.from('transport_forfaits').update(payload).eq('id', editForfait.id)
    else await s.from('transport_forfaits').insert(payload)
    setShowForm(false); setEditForfait(null); setForm({ nom: '', zone: '', trajet: 'aller_retour', prix: '' })
    await load()
  }
  async function toggleForfait(id: string, actif: boolean) {
    await createClient().from('transport_forfaits').update({ actif: !actif }).eq('id', id); await load()
  }
  async function deleteForfait(id: string) {
    if (!confirm('Supprimer ce forfait transport ?')) return
    await createClient().from('transport_forfaits').delete().eq('id', id); await load()
  }
  async function annuler(id: string) {
    if (!confirm('Annuler cette inscription transport ?')) return
    await createClient().from('transport_inscriptions').update({ statut: 'annule' }).eq('id', id); await load()
  }

  const fmt = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
  const totalMensuel = inscriptions.reduce((s, i: any) => s + Number(i.transport_forfaits?.prix || 0), 0)
  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🚌 Transport</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>Forfaits transport scolaire, inscriptions, facturation.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Inscrits</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1E293B' }}>{inscriptions.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>CA mensuel transport</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981' }}>{fmt(totalMensuel)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Forfaits</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB' }}>{forfaits.filter(f => f.actif).length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
        {([
          { id: 'depuis_contrats' as const, label: '📝 Depuis contrats', count: depuisContrats.length },
          { id: 'inscriptions' as const, label: '👨‍👩‍👧 Inscriptions manuelles', count: inscriptions.length },
          { id: 'forfaits' as const, label: '💶 Forfaits' },
        ]).map(o => (
          <button key={o.id} onClick={() => setTab(o.id)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === o.id ? '#fff' : 'transparent', color: tab === o.id ? '#1E293B' : '#64748B',
              fontSize: 13, fontWeight: tab === o.id ? 600 : 400,
              boxShadow: tab === o.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6 }}>
            {o.label}
            {typeof o.count === 'number' && o.count > 0 && (
              <span style={{ background: tab === o.id ? '#EFF6FF' : '#E2E8F0', color: tab === o.id ? '#2563EB' : '#64748B', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{o.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'depuis_contrats' && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Enfants ayant une option transport dans leur contrat</h3>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>Source : contrats de scolarisation validés (Navette, Car de ramassage, etc.)</div>
            </div>
            {depuisContrats.length > 0 && (
              <button onClick={() => {
                const csv = 'Prénom;Nom;Classe;Famille;Année;Option;Montant\n' + depuisContrats.map((r: any) => [r.enfant?.prenom || '', r.enfant?.nom || '', r.enfant?.classes?.nom || '', r.enfant?.familles?.nom || '', r.annee || '', r.nom_option, r.montant].map((v: any) => String(v).replace(/;/g, ',')).join(';')).join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `transport-depuis-contrats.csv`; a.click(); URL.revokeObjectURL(url)
              }} style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📥 Export CSV</button>
            )}
          </div>
          {depuisContrats.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun enfant avec une option transport dans son contrat.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <tr>{['Enfant','Classe','Famille','Année','Option','Montant'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {depuisContrats.map((r: any) => (
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
          )}
        </div>
      )}

      {tab === 'forfaits' && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Forfaits transport</h3>
            <button onClick={() => { setShowForm(true); setEditForfait(null) }}
              style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Nouveau forfait</button>
          </div>

          {showForm && (
            <form onSubmit={saveForfait} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <div><label style={lbl}>Nom</label><input style={inp} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Zone 1 - Aller-retour" required /></div>
              <div><label style={lbl}>Zone</label><input style={inp} value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} placeholder="Ex: Paris 19e" /></div>
              <div><label style={lbl}>Trajet</label>
                <select style={inp} value={form.trajet} onChange={e => setForm({ ...form, trajet: e.target.value })}>
                  <option value="aller">Aller seul</option>
                  <option value="retour">Retour seul</option>
                  <option value="aller_retour">Aller-retour</option>
                </select>
              </div>
              <div><label style={lbl}>Prix mensuel €</label><input type="number" step="0.01" style={inp} value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })} required /></div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                <button type="submit" style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{editForfait ? 'Enregistrer' : 'Créer'}</button>
                <button type="button" onClick={() => { setShowForm(false); setEditForfait(null) }} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12, cursor: 'pointer' }}>Annuler</button>
              </div>
            </form>
          )}

          {forfaits.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun forfait. Créez-en un pour commencer.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ borderBottom: '1px solid #E2E8F0' }}>
                <tr>{['Nom','Zone','Trajet','Prix','Actif','Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {forfaits.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13 }}>{f.nom}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>{f.zone || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>{f.trajet === 'aller_retour' ? 'A/R' : f.trajet}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>{fmt(f.prix)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button onClick={() => toggleForfait(f.id, f.actif)} style={{ background: f.actif ? '#ECFDF5' : '#FEF2F2', color: f.actif ? '#065F46' : '#991B1B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{f.actif ? '✓ Actif' : '✕ Inactif'}</button>
                    </td>
                    <td style={{ padding: '6px 12px', display: 'flex', gap: 4 }}>
                      <button onClick={() => { setEditForfait(f); setForm({ nom: f.nom, zone: f.zone || '', trajet: f.trajet || 'aller_retour', prix: String(f.prix) }); setShowForm(true) }} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>✏</button>
                      <button onClick={() => deleteForfait(f.id)} style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'inscriptions' && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 12px' }}>Élèves inscrits transport</h3>
          {inscriptions.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              Aucun élève inscrit. Inscriptions à venir depuis la fiche élève.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ borderBottom: '1px solid #E2E8F0' }}>
                <tr>{['Élève','Classe','Famille','Forfait','Zone','Prix','Montée','Descente','Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {inscriptions.map((i: any) => (
                  <tr key={i.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{i.enfants?.prenom} {i.enfants?.nom}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>{i.enfants?.classes?.nom || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>{i.enfants?.familles?.nom || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>{i.transport_forfaits?.nom || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>{i.transport_forfaits?.zone || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#10B981' }}>{fmt(i.transport_forfaits?.prix || 0)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 11 }}>{i.point_montee || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 11 }}>{i.point_descente || '—'}</td>
                    <td style={{ padding: '6px 12px' }}>
                      <button onClick={() => annuler(i.id)} style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
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
