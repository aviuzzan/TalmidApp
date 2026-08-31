'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { contenuModeleCSV } from '@/lib/import-modele'

/**
 * iiii5 (31/08/2026) — Fiche de bienvenue publique des nouvelles écoles.
 * Le super admin génère un lien secret /bienvenue/<token> et l'envoie à la
 * direction. L'école remplit tout en ligne (établissement, équipe, classes,
 * tarifs, paiements, documents + fichiers), enregistre en brouillon autant de
 * fois que nécessaire, puis soumet. TalmidApp examine et valide dans le
 * portail super admin ; une fiche validée n'est plus modifiable.
 * Thème selon le produit : TalmidApp (bleu→violet) ou Yeter (orange→rose→violet).
 */

const GRAD_TALMIDAPP = 'linear-gradient(135deg, #2563EB, #7C3AED)'
const GRAD_YETER = 'linear-gradient(135deg, #F59E0B, #EC4899 55%, #8B5CF6)'

type MembreEquipe = { prenom: string; nom: string; email: string; role: string; finances: boolean }

const DONNEES_VIDES = {
  etab: { nom_officiel: '', type: 'ecole', adresse: '', code_postal: '', ville: '', telephone: '', email_contact: '', uai: '', site_web: '' },
  equipe: [{ prenom: '', nom: '', email: '', role: 'Direction', finances: true }] as MembreEquipe[],
  classes: '',
  tarifs: '',
  paiements: { titulaire: '', iban: '', bic: '', modes: { sepa: true, cb: false, virement: false, cheque: false, especes: false }, echeances: '' },
  documents: '',
  remarques: '',
}

export default function FicheBienvenuePage() {
  const params = useParams<{ token: string }>()
  const token = params?.token
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [nomEcole, setNomEcole] = useState('')
  const [produit, setProduit] = useState<'talmidapp' | 'yeter'>('talmidapp')
  const [statut, setStatut] = useState('envoye')
  const [d, setD] = useState<any>(DONNEES_VIDES)
  const [fichiers, setFichiers] = useState<{ champ: string; nom: string; taille: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmerEnvoi, setConfirmerEnvoi] = useState(false)

  const gradient = produit === 'yeter' ? GRAD_YETER : GRAD_TALMIDAPP
  const marque = produit === 'yeter' ? 'Yeter by TalmidApp' : 'TalmidApp'
  const verrouille = statut === 'valide'

  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const res = await fetch(`/api/onboarding/${token}`)
        const json = await res.json()
        if (!res.ok) { setErreur(json.error || 'Lien invalide'); setChargement(false); return }
        setNomEcole(json.nom_ecole)
        setProduit(json.produit === 'yeter' ? 'yeter' : 'talmidapp')
        setStatut(json.statut)
        if (json.donnees && Object.keys(json.donnees).length > 0) {
          setD({ ...DONNEES_VIDES, ...json.donnees, etab: { ...DONNEES_VIDES.etab, ...(json.donnees.etab || {}) }, paiements: { ...DONNEES_VIDES.paiements, ...(json.donnees.paiements || {}), modes: { ...DONNEES_VIDES.paiements.modes, ...((json.donnees.paiements || {}).modes || {}) } } })
        } else {
          setD({ ...DONNEES_VIDES, etab: { ...DONNEES_VIDES.etab, nom_officiel: json.nom_ecole } })
        }
        setFichiers(json.fichiers || [])
      } catch { setErreur('Impossible de charger la fiche. Réessayez.') }
      setChargement(false)
    })()
  }, [token])

  async function enregistrer(action: 'brouillon' | 'soumettre') {
    if (action === 'soumettre') {
      if (!d.etab.nom_officiel || !d.etab.email_contact) {
        setMessage('⚠️ Le nom officiel et l\'email de contact sont indispensables avant l\'envoi.')
        setConfirmerEnvoi(false)
        return
      }
      // Confirmation en deux temps, sans dialogue natif du navigateur
      if (!confirmerEnvoi) { setConfirmerEnvoi(true); setMessage(''); return }
      setConfirmerEnvoi(false)
    }
    setBusy(true); setMessage('')
    try {
      const res = await fetch(`/api/onboarding/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donnees: d, action }),
      })
      const json = await res.json()
      if (!res.ok) setMessage('⚠️ ' + (json.error || 'Enregistrement échoué'))
      else if (action === 'soumettre') { setStatut('soumis'); setMessage('✅ Fiche envoyée ! Nous revenons vers vous très vite pour finaliser votre espace.') }
      else setMessage('✅ Brouillon enregistré — vous pouvez revenir sur cette page à tout moment avec le même lien.')
    } catch { setMessage('⚠️ Erreur réseau, réessayez.') }
    setBusy(false)
  }

  async function envoyerFichier(champ: string, file: File | null) {
    if (!file) return
    setBusy(true); setMessage('')
    const form = new FormData()
    form.append('fichier', file)
    form.append('champ', champ)
    try {
      const res = await fetch(`/api/onboarding/${token}`, { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) setMessage('⚠️ ' + (json.error || 'Envoi échoué'))
      else { setFichiers(json.fichiers || []); setMessage('✅ Fichier reçu : ' + file.name) }
    } catch { setMessage('⚠️ Erreur réseau pendant l\'envoi du fichier.') }
    setBusy(false)
  }

  function telechargerModele() {
    const blob = new Blob(['﻿' + contenuModeleCSV()], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'modele-familles-eleves.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const inp: React.CSSProperties = useMemo(() => ({
    width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10,
    border: '1px solid #DDE3EE', background: '#FFFFFF', fontSize: 16, color: '#1E293B', outline: 'none',
  }), [])
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#475569', margin: '14px 0 6px' }
  const carte: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E6EAF2', borderRadius: 16, padding: '22px 20px', marginTop: 18, boxShadow: '0 2px 10px rgba(30,41,59,0.05)' }
  const h2: React.CSSProperties = { fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0 }
  const aide: React.CSSProperties = { fontSize: 12.5, color: '#64748B', margin: '6px 0 0', lineHeight: 1.55 }

  function FicJoint({ champ }: { champ: string }) {
    const liste = fichiers.filter(f => f.champ === champ)
    if (liste.length === 0) return null
    return (
      <div style={{ marginTop: 8 }}>
        {liste.map((f, i) => (
          <div key={i} style={{ fontSize: 12.5, color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '6px 10px', marginTop: 4 }}>
            ✓ {f.nom} ({Math.round(f.taille / 1024)} Ko)
          </div>
        ))}
      </div>
    )
  }

  if (chargement) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#64748B' }}>Chargement…</div>
  if (erreur) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#B91C1C', padding: 24, textAlign: 'center' }}>{erreur}</div>

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FA', fontFamily: 'Inter, -apple-system, sans-serif', paddingBottom: 60 }}>
      <header style={{ background: gradient, color: '#fff', padding: '34px 20px 30px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>{marque}</div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 900, margin: '8px 0 0' }}>Bienvenue, {nomEcole} !</h1>
        <p style={{ fontSize: 14.5, maxWidth: 620, margin: '10px auto 0', opacity: 0.92, lineHeight: 1.6 }}>
          Cette fiche nous permet de préparer votre espace : inscriptions, facturation, paiements et
          communication aux familles. Remplissez ce que vous pouvez — vous pouvez enregistrer un brouillon
          et revenir plus tard avec ce même lien.
        </p>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>
        {verrouille && (
          <div style={{ ...carte, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: 14 }}>
            Cette fiche a été validée par notre équipe : elle n&apos;est plus modifiable. Pour toute correction, contactez-nous.
          </div>
        )}
        {statut === 'soumis' && !verrouille && (
          <div style={{ ...carte, background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', fontSize: 14 }}>
            Fiche déjà envoyée — vous pouvez encore la compléter et la renvoyer tant qu&apos;elle n&apos;est pas validée.
          </div>
        )}

        <section style={carte}>
          <h2 style={h2}>1 · Votre établissement</h2>
          <label style={lbl}>Nom officiel (association / école) *</label>
          <input style={inp} disabled={verrouille} value={d.etab.nom_officiel} onChange={e => setD({ ...d, etab: { ...d.etab, nom_officiel: e.target.value } })} />
          <label style={lbl}>Type d&apos;établissement</label>
          <select style={inp} disabled={verrouille} value={d.etab.type} onChange={e => setD({ ...d, etab: { ...d.etab, type: e.target.value } })}>
            <option value="ecole">École</option>
            <option value="talmud_torah">Talmud Torah</option>
            <option value="club">Club / centre aéré</option>
            <option value="cantine">Cantine</option>
          </select>
          <label style={lbl}>Adresse</label>
          <input style={inp} disabled={verrouille} value={d.etab.adresse} onChange={e => setD({ ...d, etab: { ...d.etab, adresse: e.target.value } })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div><label style={lbl}>Code postal</label><input style={inp} disabled={verrouille} value={d.etab.code_postal} onChange={e => setD({ ...d, etab: { ...d.etab, code_postal: e.target.value } })} /></div>
            <div><label style={lbl}>Ville</label><input style={inp} disabled={verrouille} value={d.etab.ville} onChange={e => setD({ ...d, etab: { ...d.etab, ville: e.target.value } })} /></div>
          </div>
          <label style={lbl}>Téléphone</label>
          <input style={inp} disabled={verrouille} value={d.etab.telephone} onChange={e => setD({ ...d, etab: { ...d.etab, telephone: e.target.value } })} />
          <label style={lbl}>Email de contact (celui que verront les familles) *</label>
          <input style={inp} type="email" disabled={verrouille} value={d.etab.email_contact} onChange={e => setD({ ...d, etab: { ...d.etab, email_contact: e.target.value } })} />
          <label style={lbl}>N° UAI / RNE (si établissement sous contrat)</label>
          <input style={inp} disabled={verrouille} value={d.etab.uai} onChange={e => setD({ ...d, etab: { ...d.etab, uai: e.target.value } })} />
          <label style={lbl}>Votre logo (PNG ou JPG, bonne qualité)</label>
          <input type="file" accept="image/*" disabled={verrouille || busy} onChange={e => envoyerFichier('logo', e.target.files?.[0] || null)} style={{ fontSize: 14 }} />
          <FicJoint champ="logo" />
        </section>

        <section style={carte}>
          <h2 style={h2}>2 · Votre équipe</h2>
          <p style={aide}>Les personnes qui auront accès à la plateforme. Cochez « Finances » pour celles autorisées à voir la facturation et les paiements.</p>
          {(d.equipe as MembreEquipe[]).map((m, i) => (
            <div key={i} style={{ border: '1px solid #EDF0F7', borderRadius: 12, padding: '12px 12px 14px', marginTop: 12, background: '#FAFBFE' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ ...lbl, marginTop: 0 }}>Prénom</label><input style={inp} disabled={verrouille} value={m.prenom} onChange={e => { const eq = [...d.equipe]; eq[i] = { ...m, prenom: e.target.value }; setD({ ...d, equipe: eq }) }} /></div>
                <div><label style={{ ...lbl, marginTop: 0 }}>Nom</label><input style={inp} disabled={verrouille} value={m.nom} onChange={e => { const eq = [...d.equipe]; eq[i] = { ...m, nom: e.target.value }; setD({ ...d, equipe: eq }) }} /></div>
              </div>
              <label style={lbl}>Email</label>
              <input style={inp} type="email" disabled={verrouille} value={m.email} onChange={e => { const eq = [...d.equipe]; eq[i] = { ...m, email: e.target.value }; setD({ ...d, equipe: eq }) }} />
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                <select style={{ ...inp, width: 'auto', flex: 1, minWidth: 150 }} disabled={verrouille} value={m.role} onChange={e => { const eq = [...d.equipe]; eq[i] = { ...m, role: e.target.value }; setD({ ...d, equipe: eq }) }}>
                  <option>Direction</option><option>Secrétariat</option><option>Comptabilité</option><option>Autre</option>
                </select>
                <label style={{ fontSize: 13.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" disabled={verrouille} checked={m.finances} onChange={e => { const eq = [...d.equipe]; eq[i] = { ...m, finances: e.target.checked }; setD({ ...d, equipe: eq }) }} /> Finances
                </label>
                {d.equipe.length > 1 && !verrouille && (
                  <button onClick={() => setD({ ...d, equipe: d.equipe.filter((_: any, j: number) => j !== i) })}
                    style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Retirer</button>
                )}
              </div>
            </div>
          ))}
          {!verrouille && (
            <button onClick={() => setD({ ...d, equipe: [...d.equipe, { prenom: '', nom: '', email: '', role: 'Secrétariat', finances: false }] })}
              style={{ marginTop: 12, background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              + Ajouter une personne
            </button>
          )}
        </section>

        <section style={carte}>
          <h2 style={h2}>3 · Vos classes</h2>
          <p style={aide}>Une classe par ligne, de la plus petite à la plus grande, avec l&apos;effectif approximatif. Ex. : « CP — 24 élèves ».</p>
          <textarea style={{ ...inp, minHeight: 110, marginTop: 10 }} disabled={verrouille} value={d.classes} onChange={e => setD({ ...d, classes: e.target.value })} placeholder={'Gan — 18 élèves\nCP — 24 élèves\nCE1 — 22 élèves\n…'} />
        </section>

        <section style={carte}>
          <h2 style={h2}>4 · Les familles et les élèves</h2>
          <p style={aide}>
            Téléchargez notre modèle, remplissez-le (une ligne par élève, colonnes famille répétées pour les fratries,
            même email du parent 1), puis déposez-le ci-dessous. Dernière colonne : si une famille doit encore un solde
            de l&apos;année dernière, indiquez le montant — il sera repris automatiquement sur son échéancier.
          </p>
          <button onClick={telechargerModele} style={{ marginTop: 12, background: gradient, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            ⬇ Télécharger le modèle (CSV, s&apos;ouvre dans Excel)
          </button>
          <label style={lbl}>Votre fichier rempli (CSV ou Excel)</label>
          <input type="file" accept=".csv,.xlsx,.xls" disabled={verrouille || busy} onChange={e => envoyerFichier('familles', e.target.files?.[0] || null)} style={{ fontSize: 14 }} />
          <FicJoint champ="familles" />
        </section>

        <section style={carte}>
          <h2 style={h2}>5 · Votre tarification</h2>
          <p style={aide}>Frais de scolarité (par classe ou par niveau de tarif), cantine, transport, garderie/étude, réductions (familles nombreuses…), frais d&apos;inscription. Texte libre — et/ou déposez votre grille (PDF, Excel, photo).</p>
          <textarea style={{ ...inp, minHeight: 110, marginTop: 10 }} disabled={verrouille} value={d.tarifs} onChange={e => setD({ ...d, tarifs: e.target.value })} placeholder={'Scolarité : 2 400 €/an\nCantine : 750 €/an\nTransport : …\nRéduction 3e enfant : …'} />
          <label style={lbl}>Grille tarifaire (facultatif)</label>
          <input type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.docx,.doc" disabled={verrouille || busy} onChange={e => envoyerFichier('grille', e.target.files?.[0] || null)} style={{ fontSize: 14 }} />
          <FicJoint champ="grille" />
        </section>

        <section style={carte}>
          <h2 style={h2}>6 · Les paiements</h2>
          <label style={lbl}>Titulaire du compte (association)</label>
          <input style={inp} disabled={verrouille} value={d.paiements.titulaire} onChange={e => setD({ ...d, paiements: { ...d.paiements, titulaire: e.target.value } })} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><label style={lbl}>IBAN</label><input style={inp} disabled={verrouille} value={d.paiements.iban} onChange={e => setD({ ...d, paiements: { ...d.paiements, iban: e.target.value } })} placeholder="FR76 …" /></div>
            <div><label style={lbl}>BIC</label><input style={inp} disabled={verrouille} value={d.paiements.bic} onChange={e => setD({ ...d, paiements: { ...d.paiements, bic: e.target.value } })} /></div>
          </div>
          <label style={lbl}>Modes de paiement acceptés</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', marginTop: 4 }}>
            {([['sepa', 'Prélèvement automatique (recommandé)'], ['cb', 'Carte bancaire'], ['virement', 'Virement'], ['cheque', 'Chèque'], ['especes', 'Espèces']] as const).map(([k, label]) => (
              <label key={k} style={{ fontSize: 13.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" disabled={verrouille} checked={!!d.paiements.modes[k]} onChange={e => setD({ ...d, paiements: { ...d.paiements, modes: { ...d.paiements.modes, [k]: e.target.checked } } })} /> {label}
              </label>
            ))}
          </div>
          <label style={lbl}>Rythme d&apos;échéances souhaité</label>
          <input style={inp} disabled={verrouille} value={d.paiements.echeances} onChange={e => setD({ ...d, paiements: { ...d.paiements, echeances: e.target.value } })} placeholder="Ex. : 10 mensualités de septembre à juin, le 5 du mois" />
        </section>

        <section style={carte}>
          <h2 style={h2}>7 · Documents pour les familles</h2>
          <p style={aide}>Règlement intérieur, règlement financier, ou tout document que les familles doivent lire ou accepter à l&apos;inscription. Vous pouvez déposer plusieurs fichiers.</p>
          <textarea style={{ ...inp, minHeight: 70, marginTop: 10 }} disabled={verrouille} value={d.documents} onChange={e => setD({ ...d, documents: e.target.value })} placeholder="Précisions éventuelles sur les documents joints…" />
          <label style={lbl}>Ajouter un document</label>
          <input type="file" accept=".pdf,.docx,.doc,.odt,.png,.jpg,.jpeg" disabled={verrouille || busy} onChange={e => { envoyerFichier('document', e.target.files?.[0] || null); e.target.value = '' }} style={{ fontSize: 14 }} />
          <FicJoint champ="document" />
        </section>

        <section style={carte}>
          <h2 style={h2}>8 · Autre chose à nous dire ?</h2>
          <textarea style={{ ...inp, minHeight: 80, marginTop: 10 }} disabled={verrouille} value={d.remarques} onChange={e => setD({ ...d, remarques: e.target.value })} placeholder="Particularités, questions, calendrier souhaité…" />
        </section>

        {message && (
          <div style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: message.startsWith('✅') ? '#047857' : '#B45309', background: message.startsWith('✅') ? '#ECFDF5' : '#FFFBEB', border: '1px solid ' + (message.startsWith('✅') ? '#A7F3D0' : '#FDE68A'), borderRadius: 12, padding: '12px 16px' }}>
            {message}
          </div>
        )}

        {confirmerEnvoi && !verrouille && (
          <div style={{ marginTop: 16, fontSize: 13.5, color: '#334155', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '12px 16px' }}>
            Prêt à envoyer ? Vous pourrez encore modifier la fiche tant qu&apos;elle n&apos;a pas été validée par notre équipe.
            {' '}<button onClick={() => setConfirmerEnvoi(false)} style={{ background: 'none', border: 'none', color: '#64748B', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
          </div>
        )}

        {!verrouille && (
          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <button disabled={busy} onClick={() => enregistrer('brouillon')}
              style={{ flex: 1, minWidth: 200, background: '#fff', color: '#334155', border: '1px solid #CBD5E1', borderRadius: 12, padding: '14px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              Enregistrer le brouillon
            </button>
            <button disabled={busy} onClick={() => enregistrer('soumettre')}
              style={{ flex: 1, minWidth: 200, background: confirmerEnvoi ? '#059669' : gradient, color: '#fff', border: 'none', borderRadius: 12, padding: '14px 20px', fontSize: 15, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {confirmerEnvoi ? 'Confirmer l\'envoi à ' + marque + ' ✓' : 'Envoyer la fiche ✓'}
            </button>
          </div>
        )}

        <footer style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 28 }}>
          {marque} · Vos données restent confidentielles et hébergées en France.
        </footer>
      </main>
    </div>
  )
}
