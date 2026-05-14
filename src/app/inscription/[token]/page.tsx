'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

/**
 * Page publique de demande d'inscription.
 * Accessible sans compte via un token unique envoye par l'ecole.
 * Le parent remplit la fiche de son enfant + ses propres coordonnees.
 * A la soumission, la demande passe "en attente" cote administration.
 */

type Secteur = { id: string; nom: string }
type Classe = { id: string; nom: string; secteur_id: string | null }

const EMPTY = {
  nom_famille: '', situation_maritale: '',
  parent1_prenom: '', parent1_nom: '', parent1_email: '', parent1_telephone: '',
  parent1_emploi: '', parent1_adresse: '', parent1_code_postal: '', parent1_ville: '',
  parent2_prenom: '', parent2_nom: '', parent2_email: '', parent2_telephone: '',
  parent2_emploi: '', parent2_adresse: '', parent2_code_postal: '', parent2_ville: '',
  enfant_prenom: '', enfant_deuxieme_prenom: '', enfant_nom: '', enfant_genre: '',
  enfant_date_naissance: '', enfant_lieu_naissance: '',
  secteur_souhaite_id: '', classe_souhaitee_id: '',
  date_entree_souhaitee: '', deja_scolarise: false, etablissement_precedent: '',
  transport: false, instruction_religieuse: true, etude_garderie: false,
  signes_particuliers: '', medecin_nom: '', medecin_telephone: '',
  urgence_1_nom: '', urgence_1_tel: '', urgence_1_lien: '',
  urgence_2_nom: '', urgence_2_tel: '', urgence_2_lien: '',
}

export default function DemandeInscriptionPage() {
  const params = useParams()
  const token = String(params?.token || '')

  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState('')
  const [dejaTraitee, setDejaTraitee] = useState(false)
  const [ecole, setEcole] = useState<any>(null)
  const [annee, setAnnee] = useState('')
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [classes, setClasses] = useState<Classe[]>([])
  const [form, setForm] = useState<any>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    if (!token) { setInvalid('Lien invalide.'); setLoading(false); return }
    try {
      const res = await fetch('/api/inscription/' + token)
      const data = await res.json()
      if (!res.ok) { setInvalid(data.error || 'Lien invalide ou expire.'); setLoading(false); return }
      setEcole(data.ecole)
      setAnnee(data.annee_scolaire || '')
      setSecteurs(data.secteurs || [])
      setClasses(data.classes || [])
      if (data.dejaTraitee) { setDejaTraitee(true); setLoading(false); return }

      const d = data.demande || {}
      const classeMatch = (data.classes || []).find((c: Classe) => c.nom === d.classe_souhaitee)
      setForm({
        ...EMPTY,
        nom_famille: d.nom_famille || '',
        situation_maritale: d.situation_maritale || '',
        parent1_prenom: d.parent1_prenom || '',
        parent1_nom: d.parent1_nom || '',
        parent1_email: d.parent1_email || data.email_invite || '',
        parent1_telephone: d.parent1_telephone || '',
        parent1_emploi: d.parent1_emploi || '',
        parent1_adresse: d.parent1_adresse || '',
        parent1_code_postal: d.parent1_code_postal || '',
        parent1_ville: d.parent1_ville || '',
        parent2_prenom: d.parent2_prenom || '',
        parent2_nom: d.parent2_nom || '',
        parent2_email: d.parent2_email || '',
        parent2_telephone: d.parent2_telephone || '',
        parent2_emploi: d.parent2_emploi || '',
        parent2_adresse: d.parent2_adresse || '',
        parent2_code_postal: d.parent2_code_postal || '',
        parent2_ville: d.parent2_ville || '',
        enfant_prenom: d.enfant_prenom || '',
        enfant_deuxieme_prenom: d.enfant_deuxieme_prenom || '',
        enfant_nom: d.enfant_nom || '',
        enfant_genre: d.enfant_genre || '',
        enfant_date_naissance: d.enfant_date_naissance || '',
        enfant_lieu_naissance: d.enfant_lieu_naissance || '',
        secteur_souhaite_id: d.secteur_souhaite_id || '',
        classe_souhaitee_id: classeMatch?.id || '',
        date_entree_souhaitee: d.date_entree_souhaitee || '',
        deja_scolarise: !!d.deja_scolarise,
        etablissement_precedent: d.etablissement_precedent || '',
        transport: !!d.transport,
        instruction_religieuse: d.instruction_religieuse !== false,
        etude_garderie: !!d.etude_garderie,
        signes_particuliers: d.signes_particuliers || '',
        medecin_nom: d.medecin_nom || '',
        medecin_telephone: d.medecin_telephone || '',
        urgence_1_nom: d.urgence_1_nom || '',
        urgence_1_tel: d.urgence_1_tel || '',
        urgence_1_lien: d.urgence_1_lien || '',
        urgence_2_nom: d.urgence_2_nom || '',
        urgence_2_tel: d.urgence_2_tel || '',
        urgence_2_lien: d.urgence_2_lien || '',
      })
    } catch (e: any) {
      setInvalid('Impossible de charger la demande. Verifiez votre connexion.')
    }
    setLoading(false)
  }

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })) }

  async function soumettre() {
    setError('')
    if (!form.enfant_prenom || !form.enfant_nom || !form.enfant_date_naissance || !form.enfant_genre) {
      setError("Le prenom, le nom, la date de naissance et le genre de l'enfant sont obligatoires.")
      return
    }
    if (!form.classe_souhaitee_id) { setError('Veuillez choisir une classe souhaitee.'); return }
    if (!form.parent1_prenom || !form.parent1_nom || !form.parent1_email) {
      setError('Le prenom, le nom et l\'email du responsable 1 sont obligatoires.')
      return
    }
    setSaving(true)
    const classeChoisie = classes.find(c => c.id === form.classe_souhaitee_id)
    const payload = {
      ...form,
      classe_souhaitee: classeChoisie?.nom || '',
      secteur_souhaite_id: form.secteur_souhaite_id || classeChoisie?.secteur_id || '',
    }
    try {
      const res = await fetch('/api/inscription/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setSaving(false)
      if (!res.ok) { setError(data.error || 'Erreur lors de l\'envoi.'); return }
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) {
      setSaving(false)
      setError('Erreur reseau. Veuillez reessayer.')
    }
  }

  const primary = ecole?.couleur_primaire || '#2563EB'
  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B', fontFamily: 'Inter, sans-serif' }}>Chargement...</div>

  if (invalid) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 440, textAlign: 'center', boxShadow: '0 4px 16px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{'⚠️'}</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>Lien indisponible</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>{invalid}</p>
          <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 16 }}>Contactez l&apos;administration de l&apos;etablissement pour obtenir un nouveau lien.</p>
        </div>
      </div>
    )
  }

  if (dejaTraitee) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 440, textAlign: 'center', boxShadow: '0 4px 16px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{'✅'}</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>Demande deja traitee</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>Cette demande d&apos;inscription a deja ete examinee par l&apos;etablissement. Pour toute question, contactez l&apos;administration.</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 460, textAlign: 'center', boxShadow: '0 4px 16px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>{'🎉'}</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: '#1E293B', margin: '0 0 10px' }}>Demande envoyee !</h1>
          <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Merci. Votre demande d&apos;inscription a bien ete transmise a <strong>{ecole?.nom}</strong>.
            L&apos;etablissement va l&apos;examiner et vous recevrez un email pour activer votre espace famille une fois la demande acceptee.
          </p>
        </div>
      </div>
    )
  }

  const classesAffichees = form.secteur_souhaite_id
    ? classes.filter(c => c.secteur_id === form.secteur_souhaite_id)
    : classes

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FA', padding: '0 0 60px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: primary, padding: '28px 24px', textAlign: 'center' }}>
        {ecole?.logo_url
          ? <img src={ecole.logo_url} alt={ecole?.nom} style={{ height: 46, objectFit: 'contain', marginBottom: 8 }} />
          : <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{ecole?.nom}</div>}
        <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 }}>
          Demande d&apos;inscription{annee ? ' - ' + annee : ''}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 18px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#1E40AF', lineHeight: 1.55 }}>
          Remplissez ce formulaire pour demander l&apos;inscription de votre enfant. Aucun compte n&apos;est necessaire :
          une fois la demande acceptee par l&apos;etablissement, vous recevrez un email pour creer votre espace famille.
        </div>

        {/* Responsables legaux */}
        <div style={card}>
          <div style={cardTitle}>Responsables legaux</div>
          <div><label style={lbl}>Nom de famille</label><input style={inp} value={form.nom_famille} onChange={e => set('nom_famille', e.target.value)} placeholder="Ex: Cohen" /></div>
          <div>
            <label style={lbl}>Situation familiale</label>
            <select style={inp} value={form.situation_maritale} onChange={e => set('situation_maritale', e.target.value)}>
              <option value="">- Choisir -</option>
              <option value="marie">Marie(e)</option>
              <option value="celibataire">Celibataire</option>
              <option value="divorce">Divorce(e)</option>
              <option value="separe">Separe(e)</option>
              <option value="veuf">Veuf / Veuve</option>
              <option value="non_connu">Non communique</option>
            </select>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 4 }}>Responsable 1</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Prenom *</label><input style={inp} value={form.parent1_prenom} onChange={e => set('parent1_prenom', e.target.value)} /></div>
            <div><label style={lbl}>Nom *</label><input style={inp} value={form.parent1_nom} onChange={e => set('parent1_nom', e.target.value)} /></div>
            <div><label style={lbl}>Email *</label><input style={inp} type="email" value={form.parent1_email} onChange={e => set('parent1_email', e.target.value)} /></div>
            <div><label style={lbl}>Telephone</label><input style={inp} value={form.parent1_telephone} onChange={e => set('parent1_telephone', e.target.value)} /></div>
            <div><label style={lbl}>Profession</label><input style={inp} value={form.parent1_emploi} onChange={e => set('parent1_emploi', e.target.value)} /></div>
            <div><label style={lbl}>Adresse</label><input style={inp} value={form.parent1_adresse} onChange={e => set('parent1_adresse', e.target.value)} /></div>
            <div><label style={lbl}>Code postal</label><input style={inp} value={form.parent1_code_postal} onChange={e => set('parent1_code_postal', e.target.value)} /></div>
            <div><label style={lbl}>Ville</label><input style={inp} value={form.parent1_ville} onChange={e => set('parent1_ville', e.target.value)} /></div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginTop: 4 }}>Responsable 2 (optionnel)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Prenom</label><input style={inp} value={form.parent2_prenom} onChange={e => set('parent2_prenom', e.target.value)} /></div>
            <div><label style={lbl}>Nom</label><input style={inp} value={form.parent2_nom} onChange={e => set('parent2_nom', e.target.value)} /></div>
            <div><label style={lbl}>Email</label><input style={inp} type="email" value={form.parent2_email} onChange={e => set('parent2_email', e.target.value)} /></div>
            <div><label style={lbl}>Telephone</label><input style={inp} value={form.parent2_telephone} onChange={e => set('parent2_telephone', e.target.value)} /></div>
            <div><label style={lbl}>Profession</label><input style={inp} value={form.parent2_emploi} onChange={e => set('parent2_emploi', e.target.value)} /></div>
            <div><label style={lbl}>Adresse</label><input style={inp} value={form.parent2_adresse} onChange={e => set('parent2_adresse', e.target.value)} /></div>
            <div><label style={lbl}>Code postal</label><input style={inp} value={form.parent2_code_postal} onChange={e => set('parent2_code_postal', e.target.value)} /></div>
            <div><label style={lbl}>Ville</label><input style={inp} value={form.parent2_ville} onChange={e => set('parent2_ville', e.target.value)} /></div>
          </div>
        </div>

        {/* Etat civil enfant */}
        <div style={card}>
          <div style={cardTitle}>Etat civil de l&apos;enfant</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Prenom *</label><input style={inp} value={form.enfant_prenom} onChange={e => set('enfant_prenom', e.target.value)} /></div>
            <div><label style={lbl}>Nom *</label><input style={inp} value={form.enfant_nom} onChange={e => set('enfant_nom', e.target.value)} /></div>
            <div><label style={lbl}>Deuxieme prenom</label><input style={inp} value={form.enfant_deuxieme_prenom} onChange={e => set('enfant_deuxieme_prenom', e.target.value)} /></div>
            <div>
              <label style={lbl}>Genre *</label>
              <select style={inp} value={form.enfant_genre} onChange={e => set('enfant_genre', e.target.value)}>
                <option value="">- Choisir -</option>
                <option value="M">Garcon</option>
                <option value="F">Fille</option>
              </select>
            </div>
            <div><label style={lbl}>Date de naissance *</label><input style={inp} type="date" value={form.enfant_date_naissance} onChange={e => set('enfant_date_naissance', e.target.value)} /></div>
            <div><label style={lbl}>Lieu de naissance</label><input style={inp} value={form.enfant_lieu_naissance} onChange={e => set('enfant_lieu_naissance', e.target.value)} /></div>
          </div>
        </div>

        {/* Scolarite demandee */}
        <div style={card}>
          <div style={cardTitle}>Scolarite demandee</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Secteur souhaite</label>
              <select style={inp} value={form.secteur_souhaite_id} onChange={e => { set('secteur_souhaite_id', e.target.value); set('classe_souhaitee_id', '') }}>
                <option value="">- Choisir -</option>
                {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Classe souhaitee *</label>
              <select style={inp} value={form.classe_souhaitee_id} onChange={e => set('classe_souhaitee_id', e.target.value)}>
                <option value="">- Choisir -</option>
                {classesAffichees.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Date d&apos;entree souhaitee</label><input style={inp} type="date" value={form.date_entree_souhaitee} onChange={e => set('date_entree_souhaitee', e.target.value)} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.deja_scolarise} onChange={e => set('deja_scolarise', e.target.checked)} style={{ accentColor: primary }} />
            L&apos;enfant a deja ete scolarise ailleurs
          </label>
          {form.deja_scolarise && (
            <div><label style={lbl}>Etablissement precedent</label><input style={inp} value={form.etablissement_precedent} onChange={e => set('etablissement_precedent', e.target.value)} /></div>
          )}
        </div>

        {/* Options */}
        <div style={{ ...card, gap: 8 }}>
          <div style={{ ...cardTitle, marginBottom: 6 }}>Options</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.transport} onChange={e => set('transport', e.target.checked)} style={{ accentColor: primary }} /> Transport scolaire
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.instruction_religieuse} onChange={e => set('instruction_religieuse', e.target.checked)} style={{ accentColor: primary }} /> Instruction religieuse
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.etude_garderie} onChange={e => set('etude_garderie', e.target.checked)} style={{ accentColor: primary }} /> Etude / garderie du soir
          </label>
        </div>

        {/* Sante */}
        <div style={card}>
          <div style={cardTitle}>Sante &amp; informations particulieres</div>
          <div>
            <label style={lbl}>Signes particuliers / allergies / traitements</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={form.signes_particuliers} onChange={e => set('signes_particuliers', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Medecin traitant</label><input style={inp} value={form.medecin_nom} onChange={e => set('medecin_nom', e.target.value)} /></div>
            <div><label style={lbl}>Telephone medecin</label><input style={inp} value={form.medecin_telephone} onChange={e => set('medecin_telephone', e.target.value)} /></div>
          </div>
        </div>

        {/* Urgences */}
        <div style={card}>
          <div style={cardTitle}>Personnes a prevenir en cas d&apos;urgence</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Contact 1</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Nom prenom</label><input style={inp} value={form.urgence_1_nom} onChange={e => set('urgence_1_nom', e.target.value)} /></div>
            <div><label style={lbl}>Telephone</label><input style={inp} value={form.urgence_1_tel} onChange={e => set('urgence_1_tel', e.target.value)} /></div>
            <div><label style={lbl}>Lien parente</label><input style={inp} value={form.urgence_1_lien} onChange={e => set('urgence_1_lien', e.target.value)} placeholder="Ex: Grand-mere" /></div>
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Contact 2 (optionnel)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Nom prenom</label><input style={inp} value={form.urgence_2_nom} onChange={e => set('urgence_2_nom', e.target.value)} /></div>
            <div><label style={lbl}>Telephone</label><input style={inp} value={form.urgence_2_tel} onChange={e => set('urgence_2_tel', e.target.value)} /></div>
            <div><label style={lbl}>Lien parente</label><input style={inp} value={form.urgence_2_lien} onChange={e => set('urgence_2_lien', e.target.value)} /></div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', color: '#DC2626', fontSize: 13 }}>
            {'⚠️'} {error}
          </div>
        )}

        <button onClick={soumettre} disabled={saving}
          style={{ background: primary, border: 'none', borderRadius: 10, padding: '14px 28px', color: '#fff', fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Envoi en cours...' : 'Envoyer ma demande d\'inscription'}
        </button>

        <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 2, marginBottom: 10 }}>
          Vos informations sont transmises de maniere securisee a l&apos;etablissement et ne servent qu&apos;au traitement de votre demande.
        </div>
      </div>
    </div>
  )
}
