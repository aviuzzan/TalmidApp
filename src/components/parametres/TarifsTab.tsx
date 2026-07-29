'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { CATEGORIES_OPTION, labelCategorie, chargerPlacesOptions, type PlacesOption } from '@/lib/options-vie-scolaire'

type EditForm = {
  secteur_id: string
  tranche_id: string
  nom_poste: string
  montant: string
  obligatoire: boolean
  code_comptable: string
  inclus_dans_reduction: boolean
  groupe_exclusif: string
  categorie: string
  places_max: string
  compte_id: string
  activite_id: string
  centre_cout_id: string
}

const VIDE_T = {
  secteur_id: '', tranche_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '',
  inclus_dans_reduction: true, groupe_exclusif: '', categorie: '', places_max: '',
  compte_id: '', activite_id: '', centre_cout_id: '',
}

export default function TarifsTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [tranches, setTranches] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  // ssss2-C : plan comptable de l'école, pour rattacher chaque poste à un compte.
  const [comptes, setComptes] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])
  const [proposition, setProposition] = useState(false)
  const [newT, setNewT] = useState<EditForm>({ ...VIDE_T })
  const [editing, setEditing] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ ...VIDE_T })
  const [places, setPlaces] = useState<Map<string, PlacesOption>>(new Map())
  const [saving, setSaving] = useState(false)
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecoleId, annee])
  async function load() {
    const s = createClient()
    // Sans jointure tranches_facturation (cause un freeze quand la table n'a pas de match). On joint cote front via tranchesMap.
    // Idem pour comptes_comptables / sections_analytiques : on charge les listes a part
    // et on resout cote front, ce qui evite de dependre du nom exact des cles etrangeres.
    // Limites explicites : Supabase plafonne silencieusement a 1000 lignes.
    const [{ data: sec }, { data: tar }, { data: tra }, resCpt, resSec] = await Promise.all([
      s.from('secteurs').select('id, nom').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
      s.from('tarifs_secteur').select('*, secteurs(nom)').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre').limit(1000),
      s.from('tranches_facturation').select('id, code, libelle').eq('ecole_id', ecoleId).order('ordre').limit(500),
      s.from('comptes_comptables').select('id, code, libelle, type, actif').eq('ecole_id', ecoleId).order('code').limit(2000),
      s.from('sections_analytiques').select('id, dimension, code, libelle, actif').eq('ecole_id', ecoleId).order('ordre').limit(500),
    ])
    const tranchesMap = new Map<string, any>()
    ;((tra ?? []) as any[]).forEach(t => tranchesMap.set(t.id, t))
    const tarifsEnriched = ((tar ?? []) as any[]).map(t => ({ ...t, tranches_facturation: t.tranche_id ? tranchesMap.get(t.tranche_id) : null }))
    setSecteurs(sec ?? []); setTarifs(tarifsEnriched); setTranches(tra ?? [])
    setComptes((resCpt?.data ?? []) as any[])
    setSections((resSec?.data ?? []) as any[])
    setPlaces(await chargerPlacesOptions(s, ecoleId, annee))
  }

  // ── Listes de choix comptables ──
  const comptesParId = new Map<string, any>()
  comptes.forEach(c => comptesParId.set(c.id, c))
  const sectionsParId = new Map<string, any>()
  sections.forEach(s => sectionsParId.set(s.id, s))
  /** Comptes de produit actifs + celui déjà choisi, même s'il ne l'est plus. */
  function optionsCompte(selectionne: string): any[] {
    const list = comptes.filter(c => c.actif && c.type === 'produit')
    if (selectionne && !list.some(c => c.id === selectionne)) {
      const c = comptesParId.get(selectionne)
      if (c) return [...list, c]
    }
    return list
  }
  function optionsSection(dimension: string, selectionne: string): any[] {
    const list = sections.filter(s => s.dimension === dimension && s.actif)
    if (selectionne && !list.some(s => s.id === selectionne)) {
      const s = sectionsParId.get(selectionne)
      if (s) return [...list, s]
    }
    return list
  }
  const nbSansCompte = tarifs.filter(t => !t.compte_id).length

  /** Le retour d'une fonction SQL scalaire arrive parfois brut, parfois encapsulé. */
  function nombreTraites(data: any): number | null {
    if (typeof data === 'number') return data
    if (Array.isArray(data)) {
      const v = data[0]
      if (typeof v === 'number') return v
      if (v && typeof v === 'object') {
        const first = Object.values(v)[0]
        return typeof first === 'number' ? first : null
      }
      return null
    }
    const n = Number(data)
    return Number.isFinite(n) ? n : null
  }

  async function proposerImputations() {
    setProposition(true)
    const { data, error } = await createClient().rpc('proposer_imputations', { p_ecole_id: ecoleId })
    setProposition(false)
    if (error) { toast.error('Proposition impossible : ' + error.message); return }
    const n = nombreTraites(data)
    if (n === null) toast.success('Imputations proposées. Vérifiez les postes ci-dessous.')
    else if (n === 0) toast.info('Aucun poste à compléter : tous vos postes ont déjà un compte, ou aucune correspondance n’a été trouvée.')
    else toast.success(`${n} poste(s) complété(s) automatiquement. Vérifiez les propositions.`)
    await load()
  }
  async function ajouter() {
    if (!newT.nom_poste.trim() || !newT.montant || parseFloat(newT.montant) <= 0) { toast.error('Poste obligatoire et montant > 0'); return }
    const { data, error } = await createClient().from('tarifs_secteur').insert({ ecole_id: ecoleId, annee_scolaire: annee, secteur_id: newT.secteur_id || null, tranche_id: newT.tranche_id || null, nom_poste: newT.nom_poste, montant: parseFloat(newT.montant), obligatoire: newT.obligatoire, inclus_dans_reduction: newT.inclus_dans_reduction, groupe_exclusif: newT.groupe_exclusif.trim().toLowerCase() || null, categorie: newT.categorie || null, places_max: newT.places_max ? parseInt(newT.places_max) : null, ordre: tarifs.length, compte_id: newT.compte_id || null, activite_id: newT.activite_id || null, centre_cout_id: newT.centre_cout_id || null }).select('id')
    if (error) { toast.error('Erreur : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Tarif non créé : vous n’avez pas les droits d’écriture sur les tarifs.'); return }
    setNewT({ ...VIDE_T })
    toast.success('Tarif ajouté')
    await load()
  }
  function ouvrirEdition(t: any) {
    setEditForm({
      secteur_id: t.secteur_id || '',
      tranche_id: t.tranche_id || '',
      nom_poste: t.nom_poste || '',
      montant: String(t.montant ?? ''),
      obligatoire: !!t.obligatoire,
      code_comptable: t.code_comptable || '',
      inclus_dans_reduction: t.inclus_dans_reduction !== false,
      groupe_exclusif: t.groupe_exclusif || '',
      categorie: t.categorie || '',
      places_max: t.places_max != null ? String(t.places_max) : '',
      compte_id: t.compte_id || '',
      activite_id: t.activite_id || '',
      centre_cout_id: t.centre_cout_id || '',
    })
    setEditing(t)
  }
  async function enregistrerEdition() {
    if (!editing) return
    if (!editForm.nom_poste.trim() || !editForm.montant || parseFloat(editForm.montant) <= 0) { toast.error('Poste obligatoire et montant > 0'); return }
    // Avertir si on reduit places_max sous le nombre d'inscrits actuels
    const nouveauMax = editForm.places_max ? parseInt(editForm.places_max) : null
    const p = places.get(editing.id)
    if (nouveauMax != null && p && p.nb_inscrits > nouveauMax) {
      const ok = await confirmDialog({
        title: 'Capacité inférieure aux inscrits',
        message: `Il y a déjà ${p.nb_inscrits} inscrit(s) pour ce tarif. Les inscriptions existantes seront conservées, mais toute nouvelle inscription sera bloquée. Continuer ?`,
      })
      if (!ok) return
    }
    setSaving(true)
    // `code_comptable` n'est volontairement pas dans le UPDATE : champ historique,
    // conservé en base tel quel, remplacé par compte_id / activite_id / centre_cout_id.
    const { data, error } = await createClient().from('tarifs_secteur').update({
      secteur_id: editForm.secteur_id || null,
      tranche_id: editForm.tranche_id || null,
      nom_poste: editForm.nom_poste,
      montant: parseFloat(editForm.montant),
      obligatoire: editForm.obligatoire,
      inclus_dans_reduction: editForm.inclus_dans_reduction,
      groupe_exclusif: editForm.groupe_exclusif.trim().toLowerCase() || null,
      categorie: editForm.categorie || null,
      places_max: nouveauMax,
      compte_id: editForm.compte_id || null,
      activite_id: editForm.activite_id || null,
      centre_cout_id: editForm.centre_cout_id || null,
    }).eq('id', editing.id).eq('ecole_id', ecoleId).select('id')
    if (error) { toast.error('Erreur : ' + error.message); setSaving(false); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été enregistré : vous n’avez pas les droits sur ce tarif.'); setSaving(false); return }
    toast.success('Tarif modifié')
    setEditing(null)
    setSaving(false)
    await load()
  }
  async function supprimer(t: any) {
    const ok = await confirmDialog({ title: 'Supprimer ce tarif ?', message: `« ${t.nom_poste} » (${t.montant?.toLocaleString('fr-FR')}€) sera supprimé.`, danger: true })
    if (!ok) return
    const { data, error } = await createClient().from('tarifs_secteur').delete().eq('id', t.id).eq('ecole_id', ecoleId).select('id')
    if (error) { toast.error('Erreur : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été supprimé : vous n’avez pas les droits sur ce tarif.'); return }
    setTarifs(p => p.filter(x => x.id !== t.id))
    toast.success('Tarif supprimé')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ssss2-C : contrôle d'ensemble du rattachement comptable */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: nbSansCompte > 0 ? '#FFFBEB' : '#F8FAFC',
        border: `1px solid ${nbSansCompte > 0 ? '#FDE68A' : '#E2E8F0'}`,
        borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748B', lineHeight: 1.5,
      }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          {nbSansCompte > 0 ? (
            <><strong style={{ color: '#B45309' }}>{nbSansCompte} poste(s) sans compte comptable.</strong> Les factures produites par ces postes n&apos;auront pas d&apos;imputation propre et votre export FEC sera incomplet. Le compte se choisit dans le plan comptable de l&apos;onglet <strong>Comptabilité</strong>.</>
          ) : (
            <>Tous les postes de {annee} sont rattachés à un compte comptable. L&apos;imputation est recopiée sur la facture au moment de son émission.</>
          )}
        </div>
        <button onClick={proposerImputations} disabled={proposition}
          style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '7px 14px', cursor: proposition ? 'not-allowed' : 'pointer', fontWeight: 500, whiteSpace: 'nowrap', opacity: proposition ? 0.6 : 1 }}>
          {proposition ? 'Analyse…' : 'Proposer les imputations manquantes'}
        </button>
      </div>

      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>AJOUTER UN POSTE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.6fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>SECTEUR</div><select style={{ ...inp }} value={newT.secteur_id} onChange={e => setNewT(p => ({ ...p, secteur_id: e.target.value }))}><option value="">Tous</option>{secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>TRANCHE</div><select style={{ ...inp }} value={newT.tranche_id} onChange={e => setNewT(p => ({ ...p, tranche_id: e.target.value }))}><option value="">Toutes</option>{tranches.map(t => <option key={t.id} value={t.id}>{t.code} — {t.libelle}</option>)}</select></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>POSTE</div><input style={inp} value={newT.nom_poste} onChange={e => setNewT(p => ({ ...p, nom_poste: e.target.value }))} placeholder="Scolarité..." /></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>MONTANT €</div><input style={inp} type="number" value={newT.montant} onChange={e => setNewT(p => ({ ...p, montant: e.target.value }))} /></div>
          <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr', gap: 10, marginTop: 10, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>COMPTE COMPTABLE (PRODUIT)</div>
            <select style={inp} value={newT.compte_id} onChange={e => setNewT(p => ({ ...p, compte_id: e.target.value }))}>
              <option value="">— Aucun compte —</option>
              {optionsCompte(newT.compte_id).map(c => <option key={c.id} value={c.id}>{c.code} — {c.libelle}{c.actif ? '' : ' (inactif)'}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>ACTIVITÉ</div>
            <select style={inp} value={newT.activite_id} onChange={e => setNewT(p => ({ ...p, activite_id: e.target.value }))}>
              <option value="">— Aucune —</option>
              {optionsSection('activite', newT.activite_id).map(a => <option key={a.id} value={a.id}>{a.code} — {a.libelle}{a.actif ? '' : ' (inactive)'}</option>)}
            </select>
          </div>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: '#94A3B8', cursor: 'pointer' }}>Centre de coût (facultatif)</summary>
          <select style={{ ...inp, marginTop: 6, maxWidth: 340 }} value={newT.centre_cout_id} onChange={e => setNewT(p => ({ ...p, centre_cout_id: e.target.value }))}>
            <option value="">— Aucun —</option>
            {optionsSection('centre_cout', newT.centre_cout_id).map(cc => <option key={cc.id} value={cc.id}>{cc.code} — {cc.libelle}{cc.actif ? '' : ' (inactif)'}</option>)}
          </select>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Dimension libre de gestion interne (site, projet…). Sans effet sur le FEC.</div>
        </details>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
          <input type="checkbox" checked={newT.obligatoire} onChange={e => setNewT(p => ({ ...p, obligatoire: e.target.checked }))} />
          Poste obligatoire (inclus automatiquement)
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
          <input type="checkbox" checked={newT.inclus_dans_reduction} onChange={e => setNewT(p => ({ ...p, inclus_dans_reduction: e.target.checked }))} style={{ marginTop: 2 }} />
          <span>
            <span style={{ fontWeight: 600 }}>Inclus dans la commission DDR</span>
            <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Coché = ce tarif est couvert par le tarif accordé en réduction. Décoché = ce tarif s&apos;ajoute EN PLUS au tarif accordé (typique pour options : cantine, navette, instruction religieuse...).</span>
          </span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>GROUPE EXCLUSIF (optionnel)</div>
            <input style={inp} value={newT.groupe_exclusif} onChange={e => setNewT(p => ({ ...p, groupe_exclusif: e.target.value }))} placeholder="ex : transport" />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Tarifs du même groupe = choix unique (ex : Car OU Navette).</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CATÉGORIE VIE SCOLAIRE</div>
            <select style={inp} value={newT.categorie} onChange={e => setNewT(p => ({ ...p, categorie: e.target.value }))}>
              <option value="">Aucune (tarif ordinaire)</option>
              {CATEGORIES_OPTION.map(c => <option key={c.value} value={c.value}>{c.icone} {c.label}</option>)}
            </select>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Rattache le tarif à la page Transport / Cantine.</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>PLACES MAX (optionnel)</div>
            <input style={inp} type="number" min="1" value={newT.places_max} onChange={e => setNewT(p => ({ ...p, places_max: e.target.value }))} placeholder="Vide = illimité" />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Capacité de ce tarif pour l&apos;année. Complet = blocage + liste d&apos;attente.</div>
          </div>
        </div>
      </div>
      {tarifs.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun tarif pour {annee}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Secteur', 'Tranche', 'Poste', 'Montant', 'Compte', 'Obligatoire', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {tarifs.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < tarifs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, background: '#EFF6FF', color: '#2563EB', borderRadius: 5, padding: '2px 8px' }}>{t.secteurs?.nom || 'Tous'}</span></td>
                <td style={{ padding: '11px 14px' }}>{t.tranches_facturation ? <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, background: '#EEF2FF', color: '#4338CA', borderRadius: 5, padding: '2px 8px' }} title={t.tranches_facturation.libelle}>{t.tranches_facturation.code}</span> : <span style={{ fontSize: 11, color: '#CBD5E1' }}>Toutes</span>}</td>
                <td style={{ padding: '11px 14px', fontWeight: 500 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {t.nom_poste}
                    {t.inclus_dans_reduction === false && (
                      <span title="Ce tarif s'ajoute EN PLUS du tarif accordé en commission DDR" style={{ fontSize: 10, background: '#FEF3C7', color: '#B45309', borderRadius: 5, padding: '2px 6px', fontWeight: 600 }}>💡 Option</span>
                    )}
                    {t.groupe_exclusif && (
                      <span title={`Mutuellement exclusif avec les autres tarifs du groupe "${t.groupe_exclusif}"`} style={{ fontSize: 10, background: '#EDE9FE', color: '#6D28D9', borderRadius: 5, padding: '2px 6px', fontWeight: 600 }}>↔ {t.groupe_exclusif}</span>
                    )}
                    {t.categorie && (
                      <span title="Catégorie Vie scolaire" style={{ fontSize: 10, background: '#E0F2FE', color: '#0369A1', borderRadius: 5, padding: '2px 6px', fontWeight: 600 }}>{labelCategorie(t.categorie)}</span>
                    )}
                    {(() => {
                      const p = places.get(t.id)
                      if (!p || p.places_max == null) return null
                      const depassement = p.nb_inscrits > p.places_max
                      const bg = depassement ? '#FEF2F2' : p.complet ? '#FFF7ED' : '#ECFDF5'
                      const color = depassement ? '#991B1B' : p.complet ? '#9A3412' : '#065F46'
                      return (
                        <span title={depassement ? 'Dépassement de capacité' : p.complet ? 'Complet — nouvelles inscriptions bloquées' : 'Places disponibles'} style={{ fontSize: 10, background: bg, color, borderRadius: 5, padding: '2px 6px', fontWeight: 700 }}>
                          {p.nb_inscrits}/{p.places_max}{depassement ? ' ⚠' : p.complet ? ' Complet' : ''}
                          {p.nb_attente > 0 ? ` · ${p.nb_attente} att.` : ''}
                        </span>
                      )
                    })()}
                  </span>
                </td>
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#059669' }}>{t.montant?.toLocaleString('fr-FR')}€</td>
                <td style={{ padding: '11px 14px' }}>
                  {(() => {
                    const c = t.compte_id ? comptesParId.get(t.compte_id) : null
                    const a = t.activite_id ? sectionsParId.get(t.activite_id) : null
                    if (!t.compte_id) {
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span title="Sans compte, ce poste ne sera pas imputé correctement dans l'export FEC" style={{ fontSize: 10, background: '#FEF3C7', color: '#B45309', borderRadius: 5, padding: '2px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>Compte non défini</span>
                          {t.code_comptable && <span title="Ancien champ texte, plus utilisé par l'application" style={{ fontSize: 10, color: '#CBD5E1', fontFamily: 'monospace' }}>ancien : {t.code_comptable}</span>}
                        </span>
                      )
                    }
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span title={c ? c.libelle : 'Compte introuvable dans le plan comptable'} style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, background: '#ECFDF5', color: '#065F46', borderRadius: 5, padding: '2px 8px' }}>{c ? c.code : '?'}</span>
                        {a && <span title="Activité analytique" style={{ fontSize: 10, background: '#EEF2FF', color: '#4338CA', borderRadius: 5, padding: '2px 6px', fontWeight: 600 }}>{a.code}</span>}
                      </span>
                    )
                  })()}
                </td>
                <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, background: t.obligatoire ? 'rgba(16,185,129,0.1)' : '#F1F5F9', color: t.obligatoire ? '#10B981' : '#94A3B8', borderRadius: 5, padding: '2px 8px' }}>{t.obligatoire ? '✓ Oui' : 'Non'}</span></td>
                <td style={{ padding: '11px 14px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => ouvrirEdition(t)} title="Modifier ce tarif" style={{ fontSize: 11, color: '#475569', background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>✏️ Modifier</button>
                  <button onClick={() => supprimer(t)} title="Supprimer ce tarif" style={{ fontSize: 11, color: '#EF4444', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div onClick={() => !saving && setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>Modifier le tarif</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 18 }}>Mettez à jour les informations du poste « {editing.nom_poste} ».</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>SECTEUR</div>
                  <select style={{ ...inp }} value={editForm.secteur_id} onChange={e => setEditForm(p => ({ ...p, secteur_id: e.target.value }))}>
                    <option value="">Tous</option>
                    {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>TRANCHE</div>
                  <select style={{ ...inp }} value={editForm.tranche_id} onChange={e => setEditForm(p => ({ ...p, tranche_id: e.target.value }))}>
                    <option value="">Toutes</option>
                    {tranches.map(t => <option key={t.id} value={t.id}>{t.code} — {t.libelle}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>POSTE</div>
                <input style={inp} value={editForm.nom_poste} onChange={e => setEditForm(p => ({ ...p, nom_poste: e.target.value }))} placeholder="Scolarité..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>MONTANT €</div>
                  <input style={inp} type="number" value={editForm.montant} onChange={e => setEditForm(p => ({ ...p, montant: e.target.value }))} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>COMPTE COMPTABLE (PRODUIT)</div>
                  <select style={inp} value={editForm.compte_id} onChange={e => setEditForm(p => ({ ...p, compte_id: e.target.value }))}>
                    <option value="">— Aucun compte —</option>
                    {optionsCompte(editForm.compte_id).map(c => <option key={c.id} value={c.id}>{c.code} — {c.libelle}{c.actif ? '' : ' (inactif)'}</option>)}
                  </select>
                  {!editForm.compte_id && <div style={{ fontSize: 11, color: '#B45309', marginTop: 4 }}>Sans compte, ce poste ne sera pas imputé dans l&apos;export FEC.</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>ACTIVITÉ</div>
                  <select style={inp} value={editForm.activite_id} onChange={e => setEditForm(p => ({ ...p, activite_id: e.target.value }))}>
                    <option value="">— Aucune —</option>
                    {optionsSection('activite', editForm.activite_id).map(a => <option key={a.id} value={a.id}>{a.code} — {a.libelle}{a.actif ? '' : ' (inactive)'}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Secteur d&apos;activité : sert au résultat analytique.</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CENTRE DE COÛT (FACULTATIF)</div>
                  <select style={inp} value={editForm.centre_cout_id} onChange={e => setEditForm(p => ({ ...p, centre_cout_id: e.target.value }))}>
                    <option value="">— Aucun —</option>
                    {optionsSection('centre_cout', editForm.centre_cout_id).map(cc => <option key={cc.id} value={cc.id}>{cc.code} — {cc.libelle}{cc.actif ? '' : ' (inactif)'}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Dimension libre de gestion interne.</div>
                </div>
              </div>
              {editForm.code_comptable && (
                <div style={{ fontSize: 11, color: '#94A3B8', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px' }}>
                  Ancien code comptable saisi : <code style={{ fontFamily: 'monospace', color: '#64748B' }}>{editForm.code_comptable}</code> — champ texte historique, conservé en base mais <strong>plus utilisé</strong> par l&apos;application. Le rattachement se fait désormais par le sélecteur de compte ci-dessus.
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
                <input type="checkbox" checked={editForm.obligatoire} onChange={e => setEditForm(p => ({ ...p, obligatoire: e.target.checked }))} />
                Poste obligatoire (inclus automatiquement)
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
                <input type="checkbox" checked={editForm.inclus_dans_reduction} onChange={e => setEditForm(p => ({ ...p, inclus_dans_reduction: e.target.checked }))} style={{ marginTop: 2 }} />
                <span>
                  <span style={{ fontWeight: 600 }}>Inclus dans la commission DDR</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Coché = ce tarif est couvert par le tarif accordé en réduction. Décoché = ce tarif s&apos;ajoute EN PLUS au tarif accordé (typique pour options : cantine, navette, instruction religieuse...).</span>
                </span>
              </label>
              <div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>GROUPE EXCLUSIF (optionnel)</div>
                <input style={inp} value={editForm.groupe_exclusif} onChange={e => setEditForm(p => ({ ...p, groupe_exclusif: e.target.value }))} placeholder="ex : transport" />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Les tarifs partageant la même valeur sont mutuellement exclusifs dans le contrat (ex : Car et Navette dans «&nbsp;transport&nbsp;»).</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CATÉGORIE VIE SCOLAIRE</div>
                  <select style={inp} value={editForm.categorie} onChange={e => setEditForm(p => ({ ...p, categorie: e.target.value }))}>
                    <option value="">Aucune (tarif ordinaire)</option>
                    {CATEGORIES_OPTION.map(c => <option key={c.value} value={c.value}>{c.icone} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>PLACES MAX</div>
                  <input style={inp} type="number" min="1" value={editForm.places_max} onChange={e => setEditForm(p => ({ ...p, places_max: e.target.value }))} placeholder="Vide = illimité" />
                  {(() => {
                    const p = editing ? places.get(editing.id) : null
                    return p && p.places_max != null ? <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Actuellement : {p.nb_inscrits} inscrit(s){p.nb_attente > 0 ? ` · ${p.nb_attente} en attente` : ''}</div> : null
                  })()}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setEditing(null)} disabled={saving} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                Annuler
              </button>
              <button onClick={enregistrerEdition} disabled={saving} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
