'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'
import { calcDuADateBatch, type DuADateResult } from '@/lib/du-a-date'
import { chargerParLots } from '@/lib/pagination'
import AidePage from '@/components/ui/AidePage'
import { appConfirm } from '@/components/ui/ConfirmDialog'

type Facture = {
  id: string
  numero: string
  famille_id: string
  total_facture: number
  total_regle: number
  solde_restant: number
  date_emission: string
  date_echeance: string | null
  statut: string
  parent_prenom?: string
  parent_nom?: string
  parent_email?: string
  famille_nom?: string
  duAdate?: DuADateResult
  // CRÉANCE DOUTEUSE (xxxx2) : ces familles sortent de la liste des relances
  // mais restent affichées à part — l'admin doit voir qu'elles existent.
  douteux?: boolean
  douteux_depuis?: string | null
  douteux_motif?: string | null
}

type RelanceLog = { facture_id: string; niveau: number; envoyee_le: string }

export default function RelancesPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string>('')
  const [factures, setFactures] = useState<Facture[]>([])
  const [logs, setLogs] = useState<Record<string, RelanceLog[]>>({})
  const [msg, setMsg] = useState('')
  const [showAll, setShowAll] = useState(false)  // false = uniquement en retard reel
  // Bloc « Créances douteuses » replié par défaut : c'est un rappel de suivi,
  // pas la file de travail du jour.
  const [showDouteuses, setShowDouteuses] = useState(false)
  // Exercice piloté par le sélecteur global (même source que /finances et /finances/dashboard).
  const annee = useAnneeScolaireActive()
  const { loading: exerciceLoading } = useExercice()

  const load = useCallback(async () => {
    if (!ecole?.id || exerciceLoading) return
    setLoading(true)
    const s = createClient()

    // Utilise factures_solde (vue) + jointure familles pour récupérer parent + filtrer école
    // FIX audit 29/07/2026 :
    //  - filtre d'EXERCICE ajouté (`annee_scolaire`) : sans lui, cet écran cumulait les
    //    impayés de toutes les années depuis la création de l'école, et les KPI
    //    « Familles en retard » / « Solde annuel total » ne correspondaient à aucun
    //    exercice. On s'aligne sur le sélecteur global, comme /finances.
    //  - PAGINATION : Supabase tronque silencieusement à 1000 lignes.
    const { rows: facts, error: errFacts } = await chargerParLots((debut, fin) => s.from('factures_solde')
      .select('*, familles!inner(nom, parent1_prenom, parent1_nom, parent1_email, ecole_id, douteux, douteux_depuis, douteux_motif)')
      .gt('solde_restant', 0)
      .neq('statut', 'annule')
      .eq('familles.ecole_id', ecole.id)
      .eq('annee_scolaire', annee)
      // Tri déterministe : chaque lot est une NOUVELLE requête, `id` départage.
      .order('date_echeance', { ascending: true, nullsFirst: false })
      .order('id')
      .range(debut, fin))
    if (errFacts) setMsg('❌ Liste des impayés incomplète : ' + errFacts)

    const factsList: Facture[] = (facts || []).map((f: any) => ({
      id: f.id, numero: f.numero, famille_id: f.famille_id,
      total_facture: Number(f.total_facture || 0),
      total_regle: Number(f.total_regle || 0),
      solde_restant: Number(f.solde_restant || 0),
      date_emission: f.date_emission,
      date_echeance: f.date_echeance,
      statut: f.statut,
      famille_nom: f.familles?.nom || '',
      parent_prenom: f.familles?.parent1_prenom || '',
      parent_nom: f.familles?.parent1_nom || '',
      parent_email: f.familles?.parent1_email || '',
      douteux: f.familles?.douteux === true,
      douteux_depuis: f.familles?.douteux_depuis || null,
      douteux_motif: f.familles?.douteux_motif || null,
    }))

    // Calcule le du a date pour chaque facture (echeances echues - reglements imputes).
    // Permet de distinguer "facture annuelle avec solde" vs "vraiment en retard sur une echeance".
    const duMap = await calcDuADateBatch(s, factsList.map(f => f.id))
    for (const f of factsList) f.duAdate = duMap[f.id]

    setFactures(factsList)

    if (factsList.length > 0) {
      const { data: lgs } = await s.from('relances_log')
        .select('facture_id, niveau, envoyee_le, envoye_at')
        .in('facture_id', factsList.map(f => f.id))
      const map: Record<string, RelanceLog[]> = {}
      for (const l of (lgs || [])) {
        const niveau = typeof (l as any).niveau === 'number' ? (l as any).niveau : parseInt((l as any).niveau) || 1
        const envoye = (l as any).envoyee_le || (l as any).envoye_at || ''
        if (!map[l.facture_id]) map[l.facture_id] = []
        map[l.facture_id].push({ facture_id: l.facture_id, niveau, envoyee_le: envoye })
      }
      setLogs(map)
    } else setLogs({})
    setLoading(false)
  }, [ecole?.id, annee, exerciceLoading])

  useEffect(() => { load() }, [load])

  function joursRetard(f: Facture): number {
    // Si date_echeance définie → diff. Sinon, diff avec date_emission (négatif si récent).
    const ref = f.date_echeance ? new Date(f.date_echeance) : new Date(f.date_emission)
    return Math.floor((new Date().getTime() - ref.getTime()) / (1000 * 60 * 60 * 24))
  }
  const nomNiveau = (n: number) => ['—', 'Rappel amical', 'Relance', 'Mise en demeure'][n] || '—'

  async function envoyerRelance(f: Facture, niveau: number) {
    if (!f.parent_email) { setMsg('❌ Aucun email parent'); return }
    if (!await appConfirm(`Envoyer la relance N${niveau} (${nomNiveau(niveau)}) à ${f.parent_email} pour ${f.numero} ?`)) return
    setSending(f.id); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    try {
      const res = await fetch('/api/relances/envoyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ factureId: f.id, niveau, ecoleId: ecole.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur envoi')
      setMsg(`✓ Relance N${niveau} envoyée à ${f.parent_email}`)
      await load()
    } catch (e: any) { setMsg('❌ ' + e.message) }
    setSending(''); setTimeout(() => setMsg(''), 4000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  // CRÉANCE DOUTEUSE (xxxx2) : on scinde AVANT tout calcul de relance.
  // Une créance douteuse ne se relance pas par e-mail (dossier suivi en direct :
  // plan amiable, recouvrement) — mais elle ne doit pas disparaître de l'écran
  // pour autant, sinon l'admin croit son poste clients assaini. D'où le bloc
  // dédié plus bas, sans aucun bouton d'envoi.
  const facturesDouteuses = factures.filter(f => f.douteux)
  const facturesRelancables = factures.filter(f => !f.douteux)

  // Filtre principal : facture vraiment en retard (du a date > 0). Toggle pour voir aussi les autres.
  const facturesEnRetard = facturesRelancables.filter(f => (f.duAdate?.duAdate || 0) > 0)
  const facturesAffichees = showAll ? facturesRelancables : facturesEnRetard
  const totalDuAdate = facturesEnRetard.reduce((s, f) => s + (f.duAdate?.duAdate || 0), 0)
  // Inchangé volontairement : le solde annuel reste le reste à recouvrer TOTAL,
  // créances douteuses comprises. Une créance douteuse reste due — la classer
  // ailleurs au bilan ne l'efface pas. La part douteuse est simplement isolée
  // juste en dessous, pour que le chiffre reste lisible.
  const totalSoldeAnnuel = factures.reduce((s, f) => s + f.solde_restant, 0)
  const totalSoldeDouteux = facturesDouteuses.reduce((s, f) => s + f.solde_restant, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📩 Relances impayés</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
          Exercice {annee} — familles avec au moins une échéance échue non couverte par un règlement.
          Le solde annuel est affiché à part — une famille peut avoir un solde sans être en retard.
        </p>
      </div>

      <AidePage route="finances-relances" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 600, textTransform: 'uppercase' }}>Familles en retard</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#DC2626', marginTop: 4 }}>{facturesEnRetard.length}</div>
        </div>
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600, textTransform: 'uppercase' }}>Dû à date</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#D97706', marginTop: 4 }}>{totalDuAdate.toLocaleString('fr-FR')} €</div>
          <div style={{ fontSize: 11, color: '#92400E', marginTop: 2 }}>échéances échues − règlements</div>
        </div>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>Solde annuel total</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#475569', marginTop: 4 }}>{totalSoldeAnnuel.toLocaleString('fr-FR')} €</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>reste à recouvrer sur l&apos;année</div>
          {facturesDouteuses.length > 0 && (
            <div style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
              dont {totalSoldeDouteux.toLocaleString('fr-FR')} € en créance douteuse
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Voir toutes les factures avec solde (pas seulement en retard)
        </label>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2',
          color: msg.startsWith('✓') ? '#065F46' : '#991B1B',
          padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{msg}</div>
      )}

      {facturesAffichees.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          🎉 Aucune famille à relancer. Toutes les échéances échues sont couvertes.
          {facturesDouteuses.length > 0 && (
            <div style={{ marginTop: 6, color: '#B45309' }}>
              {facturesDouteuses.length} créance{facturesDouteuses.length > 1 ? 's' : ''} douteuse{facturesDouteuses.length > 1 ? 's' : ''} en dehors du circuit de relance — voir le bloc ci-dessous.
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  {['Facture','Famille','Dû à date','Solde annuel','Prochaine éch.','Relances envoyées','Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Dû à date' || h === 'Solde annuel' ? 'right' : h === 'Prochaine éch.' || h === 'Relances envoyées' ? 'center' : h === 'Action' ? 'right' : 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facturesAffichees.map(f => {
                  const sentLogs = logs[f.id] || []
                  const maxSent = sentLogs.reduce((m, l) => Math.max(m, l.niveau), 0)
                  const next = Math.min(maxSent + 1, 3)
                  const du = f.duAdate
                  const enRetard = (du?.duAdate || 0) > 0
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9', background: enRetard ? '#FEF2F2' : 'transparent' }}>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#1E293B' }}>{f.numero}</td>
                      <td style={{ padding: '12px', color: '#475569' }}>
                        <div style={{ fontWeight: 600 }}>{f.famille_nom}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>
                          {f.parent_prenom} {f.parent_nom}
                          {f.parent_email && <span> · {f.parent_email}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: enRetard ? '#DC2626' : '#94A3B8' }}>
                        {enRetard ? `${(du?.duAdate || 0).toLocaleString('fr-FR')} €` : '— à jour —'}
                        {enRetard && (
                          <div style={{ fontSize: 10, color: '#991B1B', fontWeight: 500 }}>
                            {du?.nbEcheancesEchues} éch. échue{(du?.nbEcheancesEchues || 0) > 1 ? 's' : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>
                        {f.solde_restant.toLocaleString('fr-FR')} €
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: '#475569' }}>
                        {du?.prochaineEcheance ? (
                          <div>
                            <div>{new Date(du.prochaineEcheance.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{du.prochaineEcheance.montant.toLocaleString('fr-FR')} €</div>
                          </div>
                        ) : <span style={{ color: '#94A3B8' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#475569', fontSize: 12 }}>
                        {sentLogs.length === 0 ? '—' : sentLogs.map(l => `N${l.niveau}`).join(', ')}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {enRetard && next > maxSent && f.parent_email ? (
                          <button onClick={() => envoyerRelance(f, next)} disabled={sending === f.id}
                            style={{ background: next === 3 ? '#DC2626' : '#2563EB', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: sending === f.id ? 0.6 : 1 }}>
                            {sending === f.id ? '…' : `Envoyer N${next}`}
                          </button>
                        ) : <span style={{ color: '#94A3B8', fontSize: 11 }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CRÉANCES DOUTEUSES (xxxx2) ───────────────────────────────────────
          Ces familles sont retirées de la liste ci-dessus : on ne leur envoie
          plus de relance automatique ni manuelle depuis cet écran. Elles restent
          affichées ici, avec leur solde, leur motif et leur ancienneté, pour que
          l'admin sache qu'elles existent et suive le dossier en direct.
          Aucun bouton d'envoi ici : c'est le sens même du statut. */}
      {facturesDouteuses.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #FCA5A5', borderRadius: 12, overflow: 'hidden' }}>
          <button onClick={() => setShowDouteuses(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#FEF2F2', border: 'none', borderBottom: showDouteuses ? '1px solid #FECACA' : 'none', padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#991B1B' }}>
              ⚠️ Créances douteuses ({facturesDouteuses.length}) — {totalSoldeDouteux.toLocaleString('fr-FR')} €
            </span>
            <span style={{ fontSize: 11, color: '#B91C1C', fontWeight: 600 }}>
              {showDouteuses ? 'Masquer ▲' : 'Afficher ▼'}
            </span>
          </button>
          {showDouteuses && (
            <>
              <div style={{ padding: '10px 16px', fontSize: 12, color: '#7F1D1D', background: '#FFF5F5' }}>
                Ces familles sont <strong>exclues des relances</strong> (automatiques et manuelles) : le dossier
                se traite en direct — plan amiable, échéancier négocié, recouvrement. Le statut se retire
                depuis la fiche famille, il est réversible.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      {['Facture', 'Famille', 'Solde', 'Douteuse depuis', 'Motif'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Solde' ? 'right' : 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {facturesDouteuses.map(f => (
                      <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px', fontWeight: 600, color: '#1E293B' }}>{f.numero}</td>
                        <td style={{ padding: '12px', color: '#475569' }}>
                          <a href={`/${ecole.slug}/familles/${f.famille_id}`} style={{ fontWeight: 600, color: '#1E293B', textDecoration: 'none' }}>{f.famille_nom}</a>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{f.parent_prenom} {f.parent_nom}</div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#B91C1C' }}>
                          {f.solde_restant.toLocaleString('fr-FR')} €
                        </td>
                        <td style={{ padding: '12px', color: '#475569', fontSize: 12 }}>
                          {f.douteux_depuis ? new Date(f.douteux_depuis).toLocaleDateString('fr-FR') : <span style={{ color: '#94A3B8' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px', color: '#475569', fontSize: 12 }}>
                          {f.douteux_motif || <span style={{ color: '#94A3B8' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, fontSize: 12, color: '#475569' }}>
        💡 Niveaux : <strong>N1 Rappel amical</strong> → <strong>N2 Relance</strong> → <strong>N3 Mise en demeure</strong>. Configurez délais et templates dans Paramètres → Relances.
      </div>
    </div>
  )
}
