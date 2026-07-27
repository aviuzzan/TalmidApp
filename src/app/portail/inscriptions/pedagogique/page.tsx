'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { useI18n } from '@/lib/i18n'

/**
 * Fiche pédagogique = formulaire pour AJOUTER UN NOUVEL ENFANT à la famille.
 * Pour les enfants existants (réinscriptions), utiliser /portail/inscriptions/contrat.
 */
export default function PedagogiqueNouvelEnfantPage() {
  const { anneeInscription } = useAnneeInscription()
  const router = useRouter()
  const parent = useParentCtx()
  const { t } = useI18n()
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [docsConfig, setDocsConfig] = useState<any[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Form
  const [prenom, setPrenom] = useState('')
  const [deuxiemePrenom, setDeuxiemePrenom] = useState('')
  const [nom, setNom] = useState('')
  const [genre, setGenre] = useState<'M' | 'F' | ''>('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [lieuNaissance, setLieuNaissance] = useState('')

  const [secteurSouhaite, setSecteurSouhaite] = useState('')
  const [classeSouhaitee, setClasseSouhaitee] = useState('')
  const [dateEntreeSouhaitee, setDateEntreeSouhaitee] = useState('')

  const [dejaScolarise, setDejaScolarise] = useState(false)
  const [etablissementPrecedent, setEtablissementPrecedent] = useState('')

  const [transport, setTransport] = useState(false)
  const [instructionReligieuse, setInstructionReligieuse] = useState(true)
  const [etudeGarderie, setEtudeGarderie] = useState(false)
  const [optionsConfig, setOptionsConfig] = useState<any[]>([])
  const [optionsChoisies, setOptionsChoisies] = useState<Record<string, boolean>>({})

  const [signesParticuliers, setSignesParticuliers] = useState('')
  const [medecinNom, setMedecinNom] = useState('')
  const [medecinTelephone, setMedecinTelephone] = useState('')

  const [urgence1Nom, setUrgence1Nom] = useState('')
  const [urgence1Tel, setUrgence1Tel] = useState('')
  const [urgence1Lien, setUrgence1Lien] = useState('')
  const [urgence2Nom, setUrgence2Nom] = useState('')
  const [urgence2Tel, setUrgence2Tel] = useState('')
  const [urgence2Lien, setUrgence2Lien] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    setFamilleId(profile.famille_id); setEcoleId(profile.ecole_id)

    const [{ data: sec }, { data: cls }, { data: docs }, { data: opts }] = await Promise.all([
      s.from('secteurs').select('id, nom').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('classes').select('id, nom, secteur_id').eq('ecole_id', profile.ecole_id).order('nom'),
      s.from('inscription_documents_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).eq('actif', true).order('ordre'),
      s.from('options_enfant_config').select('id, code, label, ordre').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
    ])
    setSecteurs(sec ?? []); setClasses(cls ?? []); setDocsConfig(docs ?? [])
    setOptionsConfig(opts ?? [])
    // Initialiser les valeurs par défaut (par compat avec les anciens codes)
    const defaults: Record<string, boolean> = {}
    ;(opts ?? []).forEach((o: any) => { defaults[o.code] = o.code === 'instruction_religieuse' })
    setOptionsChoisies(defaults)
    setLoading(false)
  }

  async function soumettre() {
    setError(''); setSuccess('')
    if (!prenom || !nom || !dateNaissance || !genre) {
      setError(t('portail.peda.err.required_civil'))
      return
    }
    if (!classeSouhaitee) {
      setError(t('portail.peda.err.class_required'))
      return
    }
    const missingDoc = docsConfig.find(d => d.obligatoire && !selectedFiles[d.id])
    if (missingDoc) {
      setError(t('portail.peda.err.doc_required', { label: missingDoc.label }))
      return
    }
    setSaving(true)
    const s = createClient()

    // 0. Anti-doublon : verifier qu'aucun enfant identique n'existe deja dans la famille
    const { data: existants } = await s.from('enfants')
      .select('id, prenom, nom, date_naissance, statut_inscription')
      .eq('famille_id', familleId)
      .ilike('prenom', prenom.trim())
      .ilike('nom', nom.trim())
      .eq('date_naissance', dateNaissance)
    if (existants && existants.length > 0) {
      const e0 = existants[0] as any
      setError(t('portail.peda.err.duplicate', { prenom: e0.prenom, nom: e0.nom, date: e0.date_naissance, statut: e0.statut_inscription || 'en_attente' }))
      setSaving(false)
      return
    }

    // 1. Créer l'enfant
    const { data: nouvelEnfant, error: insErr } = await s
      .from('enfants')
      .insert({
        famille_id: familleId,
        prenom, deuxieme_prenom: deuxiemePrenom || null, nom,
        genre, date_naissance: dateNaissance, lieu_naissance: lieuNaissance || null,
        annee_scolaire: anneeInscription,
        statut_inscription: 'en_attente',
      })
      .select()
      .single()

    if (insErr || !nouvelEnfant) {
      setError(t('portail.peda.err.create_child', { msg: insErr?.message || t('portail.peda.err.unknown') }))
      setSaving(false)
      return
    }

    // 2. Créer la fiche pédagogique
    const classeChoisie = classes.find(c => c.id === classeSouhaitee)
    const { error: pedErr } = await s.from('inscriptions_pedagogiques').insert({
      ecole_id: ecoleId,
      famille_id: familleId,
      enfant_id: nouvelEnfant.id,
      annee_scolaire: anneeInscription,
      secteur_souhaite_id: secteurSouhaite || classeChoisie?.secteur_id || null,
      classe_souhaitee: classeChoisie?.nom || null,
      date_entree_souhaitee: dateEntreeSouhaitee || null,
      deja_scolarise: dejaScolarise,
      etablissement_precedent: etablissementPrecedent || null,
      transport, instruction_religieuse: instructionReligieuse, etude_garderie: etudeGarderie,
      options_choisies: optionsChoisies,
      signes_particuliers: signesParticuliers || null,
      medecin_nom: medecinNom || null,
      medecin_telephone: medecinTelephone || null,
      urgence_1_nom: urgence1Nom || null,
      urgence_1_tel: urgence1Tel || null,
      urgence_1_lien: urgence1Lien || null,
      urgence_2_nom: urgence2Nom || null,
      urgence_2_tel: urgence2Tel || null,
      urgence_2_lien: urgence2Lien || null,
      statut: 'soumis',
      soumis_le: new Date().toISOString(),
    })

    if (pedErr) {
      setSaving(false)
      setError(t('portail.peda.err.fiche', { msg: pedErr.message }))
      return
    }

    // 3. Upload des pièces justificatives (best-effort)
    const filesToUpload = Object.entries(selectedFiles)
    if (filesToUpload.length > 0) {
      const { data: { session: sess } } = await s.auth.getSession()
      for (const [configId, file] of filesToUpload) {
        const cfg = docsConfig.find(d => d.id === configId)
        const fd = new FormData()
        fd.append('file', file)
        fd.append('familleId', familleId)
        fd.append('enfantId', nouvelEnfant.id)
        fd.append('configId', configId)
        fd.append('label', cfg?.label || file.name)
        fd.append('target', 'inscription')
        try {
          await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${sess?.access_token}` }, body: fd })
        } catch { /* best-effort */ }
      }
    }

    // Notif admin (best-effort)
    try {
      // FIX secu 27/07 : notify-admin exige désormais un Bearer token
      const { data: { session } } = await s.auth.getSession()
      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({
          ecole_id: ecoleId,
          famille_id: familleId,
          type: 'fiche_pedagogique',
          info: { enfant_prenom: prenom, enfant_nom: nom },
        }),
      })
    } catch {}

    setSaving(false)
    setSuccess(t('portail.peda.success', { prenom, nom, annee: anneeInscription }))
    setTimeout(() => router.push('/portail/inscriptions'), 3500)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>{t('portail.common.loading_dots')}</div>

  if (!parent.estPrincipal) return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>{t('portail.peda.restricted.title')}</h2>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>{t('portail.peda.restricted.body', { annee: anneeInscription })}</p>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ marginTop: 18, background: '#2563EB', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('portail.peda.back')}</button>
      </div>
    </div>
  )

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }

  // Filtrer les classes selon le secteur si choisi
  const classesAffichees = secteurSouhaite ? classes.filter(c => c.secteur_id === secteurSouhaite) : classes

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter, sans-serif' }}>
      <button onClick={() => router.push('/portail/inscriptions')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, padding: 0, textAlign: 'left', width: 'fit-content' }}>
        {t('portail.peda.back')}
      </button>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('portail.peda.title')}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }} dangerouslySetInnerHTML={{ __html: t('portail.peda.intro') }} />
      </div>

      {success && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '14px 16px', color: '#059669', fontSize: 13 }}>
          {success}
        </div>
      )}

      {/* État civil */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.civil')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.peda.field.prenom')}</label><input style={inp} value={prenom} onChange={e => setPrenom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.nom')}</label><input style={inp} value={nom} onChange={e => setNom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.deuxieme_prenom')}</label><input style={inp} value={deuxiemePrenom} onChange={e => setDeuxiemePrenom(e.target.value)} /></div>
          <div>
            <label style={lbl}>{t('portail.peda.field.genre')}</label>
            <select style={inp} value={genre} onChange={e => setGenre(e.target.value as 'M' | 'F')}>
              <option value="">{t('portail.peda.choose')}</option>
              <option value="M">{t('portail.peda.genre.m')}</option>
              <option value="F">{t('portail.peda.genre.f')}</option>
            </select>
          </div>
          <div><label style={lbl}>{t('portail.peda.field.date_naissance')}</label><input style={inp} type="date" value={dateNaissance} onChange={e => setDateNaissance(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.lieu_naissance')}</label><input style={inp} value={lieuNaissance} onChange={e => setLieuNaissance(e.target.value)} /></div>
        </div>
      </div>

      {/* Scolarité demandée */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.scolarite')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>{t('portail.peda.field.secteur')}</label>
            <select style={inp} value={secteurSouhaite} onChange={e => { setSecteurSouhaite(e.target.value); setClasseSouhaitee('') }}>
              <option value="">{t('portail.peda.choose')}</option>
              {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>{t('portail.peda.field.classe')}</label>
            <select style={inp} value={classeSouhaitee} onChange={e => setClasseSouhaitee(e.target.value)}>
              <option value="">{t('portail.peda.choose')}</option>
              {classesAffichees.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div><label style={lbl}>{t('portail.peda.field.date_entree')}</label><input style={inp} type="date" value={dateEntreeSouhaitee} onChange={e => setDateEntreeSouhaitee(e.target.value)} /></div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={dejaScolarise} onChange={e => setDejaScolarise(e.target.checked)} style={{ accentColor: '#2563EB' }} />
          {t('portail.peda.deja_scolarise')}
        </label>
        {dejaScolarise && (
          <div><label style={lbl}>{t('portail.peda.field.etablissement_precedent')}</label><input style={inp} value={etablissementPrecedent} onChange={e => setEtablissementPrecedent(e.target.value)} /></div>
        )}
      </div>

      {/* Options */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10, marginBottom: 8 }}>{t('portail.peda.section.options')}</div>
        {optionsConfig.length === 0 && (
          <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>{t('portail.peda.options.none')}</div>
        )}
        {optionsConfig.map(o => {
          const checked = !!optionsChoisies[o.code]
          return (
            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={e => {
                const v = e.target.checked
                setOptionsChoisies(p => ({ ...p, [o.code]: v }))
                // Compat colonnes legacy
                if (o.code === 'transport') setTransport(v)
                if (o.code === 'instruction_religieuse') setInstructionReligieuse(v)
                if (o.code === 'etude_garderie') setEtudeGarderie(v)
              }} style={{ accentColor: '#2563EB' }} /> {o.label}
            </label>
          )
        })}
      </div>

      {/* Santé */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.sante')}</div>
        <div>
          <label style={lbl}>{t('portail.peda.field.signes')}</label>
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={signesParticuliers} onChange={e => setSignesParticuliers(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.peda.field.medecin')}</label><input style={inp} value={medecinNom} onChange={e => setMedecinNom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.medecin_tel')}</label><input style={inp} value={medecinTelephone} onChange={e => setMedecinTelephone(e.target.value)} /></div>
        </div>
      </div>

      {/* Urgences */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.urgences')}</div>
        <div style={{ fontSize: 12, color: '#64748B' }}>{t('portail.peda.contact1')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.peda.field.nom_prenom')}</label><input style={inp} value={urgence1Nom} onChange={e => setUrgence1Nom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.telephone')}</label><input style={inp} value={urgence1Tel} onChange={e => setUrgence1Tel(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.lien')}</label><input style={inp} value={urgence1Lien} onChange={e => setUrgence1Lien(e.target.value)} placeholder={t('portail.peda.placeholder.lien')} /></div>
        </div>
        <div style={{ fontSize: 12, color: '#64748B' }}>{t('portail.peda.contact2')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.peda.field.nom_prenom')}</label><input style={inp} value={urgence2Nom} onChange={e => setUrgence2Nom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.telephone')}</label><input style={inp} value={urgence2Tel} onChange={e => setUrgence2Tel(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.lien')}</label><input style={inp} value={urgence2Lien} onChange={e => setUrgence2Lien(e.target.value)} /></div>
        </div>
      </div>

      {/* Pièces justificatives */}
      {docsConfig.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.docs')}</div>
          <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{t('portail.peda.docs.help')}</p>
          {docsConfig.map((doc: any) => {
            const picked = selectedFiles[doc.id]
            return (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: picked ? 'rgba(16,185,129,0.06)' : '#F8FAFC', border: `1px solid ${picked ? 'rgba(16,185,129,0.3)' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{doc.label}{doc.obligatoire && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}</div>
                  {doc.description && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{doc.description}</div>}
                  {picked && <div style={{ fontSize: 11, color: '#10B981', marginTop: 3 }}>✓ {picked.name} ({Math.round(picked.size / 1024)} {t('portail.documents.size.kb')})</div>}
                </div>
                <input ref={(el: HTMLInputElement | null) => { fileRefs.current[doc.id] = el }} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFiles(p => ({ ...p, [doc.id]: f })) }} />
                <button type="button" onClick={() => fileRefs.current[doc.id]?.click()}
                  style={{ fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: picked ? 'rgba(16,185,129,0.1)' : '#2563EB', color: picked ? '#10B981' : '#fff', border: picked ? '1px solid rgba(16,185,129,0.3)' : 'none', whiteSpace: 'nowrap' }}>
                  {picked ? t('portail.peda.docs.replace') : t('portail.peda.docs.attach')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', color: '#DC2626', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={() => router.push('/portail/inscriptions')}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
          {t('portail.common.cancel')}
        </button>
        <button onClick={soumettre} disabled={saving}
          style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? t('portail.peda.saving') : t('portail.peda.submit')}
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>
        {t('portail.peda.fees_note')}
      </div>
    </div>
  )
}
