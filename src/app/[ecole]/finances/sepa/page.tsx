'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { ANNEE_COURANTE } from '@/lib/inscriptions'
import { soldesParFamille, type SoldeFamille } from '@/lib/encaissement'

// AUDIT P1 (06/08/2026) — export SEPA branché sur une CONFIG vide au lieu des
// échéances réelles : l'écran ne proposait que les jours configurés dans
// `dates_encaissement`. Table vide (cas de l'école démo : 0 config, mais 42
// échéances SEPA bien réelles dans `cheques_prevus`) → aucun jour sélectionnable,
// aucune échéance chargée, export impossible — écran mort en silence.
// CORRIGÉ : les dates proposées viennent des échéances SEPA elles-mêmes
// (dates distinctes de `cheques_prevus`, mode sepa), avec compteur par date ;
// le mois affiché par défaut est le premier qui a des prélèvements à faire.
// En prime : le reste dû réel de chaque famille est affiché (volet
// sur-encaissement du même audit : ne pas prélever une famille déjà soldée).

export default function SepaExportPage() {
  const router = useRouter()
  const ecole = useEcole()
  // Dates candidates par mois 'YYYY-MM' → liste de { dateStr, nbPrevu, nbExporte }
  const [datesParMois, setDatesParMois] = useState<Map<string, { dateStr: string; nbPrevu: number; nbExporte: number }[]>>(new Map())
  const [selectedDateStr, setSelectedDateStr] = useState<string>('')
  const [mois, setMois] = useState<number>(new Date().getMonth() + 1)
  const [annee, setAnnee] = useState<number>(new Date().getFullYear())
  const [cheques, setCheques] = useState<any[]>([])
  const [mandats, setMandats] = useState<Map<string, any>>(new Map())
  const [soldes, setSoldes] = useState<Map<string, SoldeFamille>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingCheques, setLoadingCheques] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [ecoleInfo, setEcoleInfo] = useState<any>(null)
  const [dernierExport, setDernierExport] = useState<any[]>([])

  useEffect(() => { load() }, [ecole.id])

  async function load() {
    const s = createClient()
    // Les dates viennent des échéances SEPA réelles — la config dates_encaissement
    // n'est plus un prérequis (elle reste utile ailleurs pour générer les échéanciers).
    const [{ data: ech }, { data: ec }] = await Promise.all([
      s.from('cheques_prevus').select('date_echeance, statut').eq('ecole_id', ecole.id).eq('mode_paiement', 'sepa').in('statut', ['prevu', 'exporte']).not('date_echeance', 'is', null).order('date_echeance').limit(5000),
      s.from('ecoles').select('iban_ecole, bic_ecole, ics_sepa, nom_creancier').eq('id', ecole.id).single(),
    ])
    const parDate = new Map<string, { nbPrevu: number; nbExporte: number }>()
    for (const e of ech ?? []) {
      const cur = parDate.get(e.date_echeance) ?? { nbPrevu: 0, nbExporte: 0 }
      if (e.statut === 'prevu') cur.nbPrevu++; else cur.nbExporte++
      parDate.set(e.date_echeance, cur)
    }
    const parMois = new Map<string, { dateStr: string; nbPrevu: number; nbExporte: number }[]>()
    Array.from(parDate.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([dateStr, n]) => {
      const cle = dateStr.slice(0, 7)
      if (!parMois.has(cle)) parMois.set(cle, [])
      parMois.get(cle)!.push({ dateStr, ...n })
    })
    setDatesParMois(parMois)
    setEcoleInfo(ec)
    // Mois par défaut : le premier qui a encore des prélèvements à exporter, sinon le mois courant.
    const moisAvecPrevu = Array.from(parMois.entries()).find(([, ds]) => ds.some(d => d.nbPrevu > 0))
    if (moisAvecPrevu) {
      const [cle, ds] = moisAvecPrevu
      setAnnee(parseInt(cle.slice(0, 4)))
      setMois(parseInt(cle.slice(5, 7)))
      setSelectedDateStr((ds.find(d => d.nbPrevu > 0) ?? ds[0]).dateStr)
    }
    setLoading(false)
  }

  // Quand le mois/année change, resélectionner automatiquement la première date du mois.
  useEffect(() => {
    const ds = datesParMois.get(`${annee}-${String(mois).padStart(2, '0')}`) ?? []
    if (!ds.some(d => d.dateStr === selectedDateStr)) {
      setSelectedDateStr(ds.length ? (ds.find(d => d.nbPrevu > 0) ?? ds[0]).dateStr : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mois, annee, datesParMois])

  useEffect(() => {
    if (selectedDateStr) chargerCheques()
    else { setCheques([]); setMandats(new Map()); setSoldes(new Map()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateStr])

  async function chargerCheques() {
    if (!selectedDateStr) return
    setLoadingCheques(true)
    const s = createClient()
    const dateStr = selectedDateStr

    const { data: ch } = await s
      .from('cheques_prevus')
      .select('*, familles(id, nom, parent1_prenom, parent1_nom, parent1_email)')
      .eq('ecole_id', ecole.id)
      .eq('date_echeance', dateStr)
      .eq('mode_paiement', 'sepa')
      .order('statut')

    const { data: exp } = await s
      .from('cheques_prevus')
      .select('*, familles(nom)')
      .eq('ecole_id', ecole.id)
      .eq('mode_paiement', 'sepa')
      .eq('statut', 'exporte')
      .order('updated_at', { ascending: false })
      .limit(5)

    setCheques(ch ?? [])
    setDernierExport(exp ?? [])

    if (ch?.length) {
      const familleIds = ch.map((c: any) => c.famille_id)
      const [{ data: mand }, { soldes: sMap }] = await Promise.all([
        s.from('mandats_sepa').select('*').in('famille_id', familleIds).eq('ecole_id', ecole.id).eq('actif', true),
        soldesParFamille(s, familleIds),
      ])
      setMandats(new Map(mand?.map((m: any) => [m.famille_id, m]) || []))
      setSoldes(sMap)
    } else {
      setMandats(new Map())
      setSoldes(new Map())
    }
    setLoadingCheques(false)
  }

  async function exporterXML() {
    // Garde-fou sur-encaissement : prélever une famille déjà soldée = trop-perçu.
    const soldees = chequesPrets.filter((c: any) => {
      const sf = soldes.get(c.famille_id)
      return sf && sf.soldeRestant <= 0.009
    })
    if (soldees.length > 0 && !confirm(`⚠️ ${soldees.length} prélèvement(s) concernent une famille dont les factures sont DÉJÀ SOLDÉES (règlements saisis). Les prélever créerait un trop-perçu.\n\nGénérer quand même le fichier avec TOUS les prélèvements ?`)) return
    setExporting(true)
    const { data: { session } } = await createClient().auth.getSession()
    const dateStr = selectedDateStr

    const res = await fetch('/api/sepa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session!.access_token}` },
      body: JSON.stringify({ ecoleId: ecole.id, anneeScolaire: ANNEE_COURANTE, dateStr }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }))
      alert(`Erreur : ${err.error}`)
      setExporting(false)
      return
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SEPA_${dateStr}_${Date.now()}.xml`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setExporting(false)
    chargerCheques()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  const dateStr = selectedDateStr
  const datesDuMois = datesParMois.get(`${annee}-${String(mois).padStart(2, '0')}`) ?? []
  const anneesDispo = Array.from(new Set([new Date().getFullYear(), ...Array.from(datesParMois.keys()).map(k => parseInt(k.slice(0, 4)))])).sort()
  const chequesPrets = cheques.filter(c => mandats.has(c.famille_id) && c.statut === 'prevu')
  const chequesExportes = cheques.filter(c => c.statut === 'exporte')
  const chequesSansMandat = cheques.filter(c => !mandats.has(c.famille_id))
  const totalPrets = chequesPrets.reduce((s: number, c: any) => s + parseFloat(c.montant), 0)

  const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'Inter, sans-serif', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => router.push(`/${ecole.slug}/finances-hub`)} style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>← Retour</button>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: 0 }}>Export SEPA — Prélèvements</h1>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '4px 0 0' }}>Générer le fichier XML PAIN.008 pour votre banque</p>
        </div>
      </div>

      {/* Infos école */}
      {ecoleInfo && (
        <div style={{ background: ecoleInfo.iban_ecole ? 'rgba(16,185,129,0.06)' : '#FEF9EC', border: `1px solid ${ecoleInfo.iban_ecole ? 'rgba(16,185,129,0.25)' : '#F59E0B'}`, borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {ecoleInfo.iban_ecole ? (
            <>
              <div><div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>ICS Créancier</div><div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{ecoleInfo.ics_sepa}</div></div>
              <div><div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Créancier</div><div style={{ fontSize: 13, fontWeight: 600 }}>{ecoleInfo.nom_creancier}</div></div>
              <div><div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>IBAN École</div><div style={{ fontSize: 13, fontFamily: 'monospace' }}>{ecoleInfo.iban_ecole}</div></div>
              <div><div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>BIC</div><div style={{ fontSize: 13, fontFamily: 'monospace' }}>{ecoleInfo.bic_ecole}</div></div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Coordonnées bancaires non configurées</div>
                <div style={{ fontSize: 12, color: '#78350F' }}>Renseignez l'IBAN, BIC, ICS et nom créancier dans les paramètres de l'école.</div>
              </div>
              <button onClick={() => router.push(`/${ecole.slug}/parametres?tab=sepa`)} style={{ background: '#F59E0B', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: '#fff', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Configurer →</button>
            </div>
          )}
        </div>
      )}

      {/* Sélection date */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 16 }}>Date de prélèvement</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Mois */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Mois</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {MOIS.map((m, i) => (
                <button key={i} onClick={() => setMois(i + 1)}
                  style={{ padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: mois === i + 1 ? 700 : 400, background: mois === i + 1 ? '#1E293B' : '#F1F5F9', color: mois === i + 1 ? '#fff' : '#64748B' }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Année */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Année</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {anneesDispo.map(y => (
                <button key={y} onClick={() => setAnnee(y)}
                  style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: annee === y ? 700 : 400, background: annee === y ? '#1E293B' : '#F1F5F9', color: annee === y ? '#fff' : '#64748B' }}>
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Dates d'échéance réelles du mois (AUDIT P1 : issues de cheques_prevus, plus d'une config à part) */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Date d'échéance (échéances SEPA réelles)</label>
            {datesDuMois.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94A3B8', padding: '6px 0' }}>Aucune échéance SEPA ce mois-ci</div>
            ) : (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {datesDuMois.map(d => (
                  <button key={d.dateStr} onClick={() => setSelectedDateStr(d.dateStr)}
                    style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: selectedDateStr === d.dateStr ? 700 : 400, background: selectedDateStr === d.dateStr ? '#1E293B' : '#F1F5F9', color: selectedDateStr === d.dateStr ? '#fff' : '#64748B' }}>
                    le {parseInt(d.dateStr.slice(8, 10))} · {d.nbPrevu > 0 ? `${d.nbPrevu} à prélever` : `${d.nbExporte} exporté(s)`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {dateStr && (
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
              📅 {new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      {/* Tableau des prélèvements */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>Prélèvements du {dateStr || '—'}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
              {loadingCheques ? 'Chargement...' : `${cheques.length} total — ${chequesPrets.length} prêts — ${chequesSansMandat.length} sans mandat — ${chequesExportes.length} déjà exportés`}
            </div>
          </div>
          {chequesPrets.length > 0 && ecoleInfo?.iban_ecole && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                {chequesPrets.length} prélèvement(s) · <strong>{totalPrets.toLocaleString('fr-FR')} €</strong>
              </div>
              <button onClick={exporterXML} disabled={exporting}
                style={{ background: exporting ? '#94A3B8' : '#10B981', border: 'none', borderRadius: 10, padding: '10px 22px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: exporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {exporting ? '⏳ Génération...' : '⬇️ Exporter XML PAIN.008'}
              </button>
            </div>
          )}
        </div>

        {loadingCheques ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Chargement des prélèvements...</div>
        ) : cheques.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, color: '#64748B' }}>Aucun prélèvement SEPA pour cette date</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Vérifiez que des contrats ont été signés avec le mode SEPA pour cette période.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Famille', 'Montant', 'Reste dû famille', 'IBAN', 'RUM', 'Titulaire', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cheques.map((c: any) => {
                const mandat = mandats.get(c.famille_id)
                const isOk = !!mandat && c.statut === 'prevu'
                const isExp = c.statut === 'exporte'
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #F8FAFC', background: isOk ? 'rgba(16,185,129,0.03)' : isExp ? 'rgba(99,102,241,0.04)' : 'rgba(239,68,68,0.04)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{c.familles?.nom}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.familles?.parent1_email}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669' }}>
                      {parseFloat(c.montant).toLocaleString('fr-FR')} €
                    </td>
                    {/* AUDIT P1 : reste dû réel (règlements + avoirs déduits) — rouge si la famille est déjà soldée */}
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      {(() => {
                        const sf = soldes.get(c.famille_id)
                        if (!sf) return <span style={{ color: '#94A3B8' }}>—</span>
                        if (sf.soldeRestant <= 0.009) return <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'rgba(239,68,68,0.1)', borderRadius: 20, padding: '3px 10px' }}>⚠ Soldée</span>
                        return <span style={{ color: '#475569' }}>{sf.soldeRestant.toLocaleString('fr-FR')} €</span>
                      })()}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
                      {mandat ? mandat.iban.replace(/(.{4})/g, '$1 ').trim() : <span style={{ color: '#EF4444' }}>⚠ Mandat manquant</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
                      {mandat?.rum || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                      {mandat?.titulaire_compte || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {isExp && <span style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', background: 'rgba(99,102,241,0.1)', borderRadius: 20, padding: '3px 10px' }}>Exporté</span>}
                      {isOk && <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.1)', borderRadius: 20, padding: '3px 10px' }}>✓ Prêt</span>}
                      {!mandat && <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', background: 'rgba(239,68,68,0.1)', borderRadius: 20, padding: '3px 10px' }}>Mandat absent</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {chequesPrets.length > 0 && (
              <tfoot>
                <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700 }}>TOTAL ({chequesPrets.length} prélèvements)</td>
                  <td style={{ padding: '12px 16px', fontWeight: 800, fontSize: 15, color: '#059669' }}>{totalPrets.toLocaleString('fr-FR')} €</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Familles sans mandat */}
      {chequesSansMandat.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>⚠ {chequesSansMandat.length} famille(s) sans mandat SEPA</div>
          <div style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 8 }}>Ces familles ont choisi le prélèvement SEPA mais n'ont pas encore fourni leur mandat (IBAN). Contactez-les pour régulariser.</div>
          {chequesSansMandat.map((c: any) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid rgba(239,68,68,0.15)' }}>
              <span style={{ color: '#991B1B', fontWeight: 600 }}>{c.familles?.nom}</span>
              <span>{parseFloat(c.montant).toLocaleString('fr-FR')} €</span>
            </div>
          ))}
        </div>
      )}

      {/* Historique récent */}
      {dernierExport.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Historique récent des exports</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dernierExport.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{c.familles?.nom}</span>
                  <span style={{ color: '#94A3B8', marginLeft: 8 }}>{new Date(c.date_echeance).toLocaleDateString('fr-FR')}</span>
                </div>
                <span style={{ fontWeight: 700, color: '#6366F1' }}>{parseFloat(c.montant).toLocaleString('fr-FR')} €</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guide format */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8 }}>ℹ️ Format du fichier généré</div>
        <div style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.6 }}>
          Format : <strong>PAIN.008.001.02</strong> (standard SEPA européen) · Type : <strong>CORE / RCUR</strong> (prélèvement récurrent)<br />
          Compatible avec la plupart des banques françaises (CIC, Crédit Mutuel, BNP, CA, etc.)<br />
          Les chèques exportés sont marqués "exporté" et exclus des prochains exports.
        </div>
      </div>
    </div>
  )
}
