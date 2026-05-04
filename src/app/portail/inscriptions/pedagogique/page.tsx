'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ANNEE_COURANTE } from '@/lib/inscriptions'

export default function FichePedagogiquePage() {
  const router = useRouter()
  const [enfants, setEnfants] = useState<any[]>([])
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [fiches, setFiches] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) return
    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) return
    setFamilleId(profile.famille_id); setEcoleId(profile.ecole_id)

    const [{ data: enf }, { data: sec }, { data: existants }] = await Promise.all([
      s.from('enfants').select('*').eq('famille_id', profile.famille_id),
      s.from('secteurs').select('*, classes(id, nom)').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('inscriptions_pedagogiques').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE),
    ])
    setEnfants(enf ?? []); setSecteurs(sec ?? [])
    const map: Record<string, any> = {}
    existants?.forEach(e => { map[e.enfant_id] = e })
    setFiches(map)
  }

  function setFiche(enfantId: string, key: string, val: any) {
    setFiches(p => ({ ...p, [enfantId]: { ...(p[enfantId] || {}), enfant_id: enfantId, [key]: val } }))
  }

  async function soumettre(enfantId: string) {
    const fiche = fiches[enfantId]
    if (!fiche?.secteur_souhaite_id) { alert('Veuillez choisir un secteur'); return }
    setSaving(true)
    const s = createClient()
    const payload = { ...fiche, famille_id: familleId, ecole_id: ecoleId, annee_scolaire: ANNEE_COURANTE, statut: 'soumis', soumis_le: new Date().toISOString() }

    if (fiche.id) await s.from('inscriptions_pedagogiques').update(payload).eq('id', fiche.id)
    else {
      const { data } = await s.from('inscriptions_pedagogiques').insert(payload).select().single()
      if (data) setFiche(enfantId, 'id', data.id)
    }
    setSuccess('Fiche soumise avec succès !')
    setSaving(false)
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, sans-serif' }}>
      <button onClick={() => router.push('/portail/inscriptions')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        ← Retour aux inscriptions
      </button>

      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>Fiche d'inscription pédagogique</h1>
      <p style={{ color: '#64748B', fontSize: 13, marginBottom: 28 }}>À remplir pour chaque nouvel élève — une seule fois.</p>

      {success && (
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', color: '#059669', fontSize: 13, marginBottom: 20 }}>
          {success}
        </div>
      )}

      {enfants.map(enfant => {
        const fiche = fiches[enfant.id] || {}
        const soumis = fiche.statut === 'soumis' || fiche.statut === 'accepte'
        return (
          <div key={enfant.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12, background: soumis ? 'rgba(16,185,129,0.04)' : '#F8FAFC' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                {enfant.prenom[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                {soumis && <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>✓ Fiche soumise</div>}
              </div>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, opacity: soumis ? 0.7 : 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={lbl}>Secteur souhaité *</label>
                  <select style={inp} value={fiche.secteur_souhaite_id || ''} disabled={soumis}
                    onChange={e => setFiche(enfant.id, 'secteur_souhaite_id', e.target.value)}>
                    <option value="">Choisir un secteur</option>
                    {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Classe souhaitée</label>
                  <select style={inp} value={fiche.classe_souhaitee || ''} disabled={soumis}
                    onChange={e => setFiche(enfant.id, 'classe_souhaitee', e.target.value)}>
                    <option value="">—</option>
                    {secteurs.find(s => s.id === fiche.secteur_souhaite_id)?.classes?.map((c: any) => (
                      <option key={c.id} value={c.nom}>{c.nom}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {[
                  { key: 'transport', label: 'Transport' },
                  { key: 'instruction_religieuse', label: 'Instruction religieuse' },
                  { key: 'etude_garderie', label: 'Étude / Garderie' },
                ].map(opt => (
                  <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: soumis ? 'default' : 'pointer', background: '#F8FAFC', borderRadius: 8, padding: '10px 12px', border: '1px solid #E2E8F0', fontSize: 13, color: '#1E293B' }}>
                    <input type="checkbox" checked={!!fiche[opt.key]} disabled={soumis}
                      onChange={e => setFiche(enfant.id, opt.key, e.target.checked)} />
                    {opt.label}
                  </label>
                ))}
              </div>

              <div>
                <label style={lbl}>Déjà scolarisé ?</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#1E293B' }}>
                    <input type="radio" name={`scol_${enfant.id}`} checked={!fiche.deja_scolarise} disabled={soumis}
                      onChange={() => setFiche(enfant.id, 'deja_scolarise', false)} /> Non
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#1E293B' }}>
                    <input type="radio" name={`scol_${enfant.id}`} checked={!!fiche.deja_scolarise} disabled={soumis}
                      onChange={() => setFiche(enfant.id, 'deja_scolarise', true)} /> Oui
                  </label>
                </div>
                {fiche.deja_scolarise && (
                  <input style={{ ...inp, marginTop: 8 }} placeholder="Nom de l'établissement précédent" value={fiche.etablissement_precedent || ''} disabled={soumis}
                    onChange={e => setFiche(enfant.id, 'etablissement_precedent', e.target.value)} />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Médecin (nom)</label>
                  <input style={inp} value={fiche.medecin_nom || ''} disabled={soumis}
                    onChange={e => setFiche(enfant.id, 'medecin_nom', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Médecin (téléphone)</label>
                  <input style={inp} value={fiche.medecin_telephone || ''} disabled={soumis}
                    onChange={e => setFiche(enfant.id, 'medecin_telephone', e.target.value)} />
                </div>
              </div>

              <div>
                <label style={lbl}>Signes particuliers / Pathologie</label>
                <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={fiche.signes_particuliers || ''} disabled={soumis}
                  onChange={e => setFiche(enfant.id, 'signes_particuliers', e.target.value)} />
              </div>

              {/* Contacts urgence */}
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 12 }}>PERSONNES À CONTACTER EN CAS D'URGENCE</div>
                {[1, 2].map(n => (
                  <div key={n} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <input style={inp} placeholder={`Nom personne ${n}`} value={fiche[`urgence_${n}_nom`] || ''} disabled={soumis}
                      onChange={e => setFiche(enfant.id, `urgence_${n}_nom`, e.target.value)} />
                    <input style={inp} placeholder="Téléphone" value={fiche[`urgence_${n}_tel`] || ''} disabled={soumis}
                      onChange={e => setFiche(enfant.id, `urgence_${n}_tel`, e.target.value)} />
                    <input style={inp} placeholder="Lien de parenté" value={fiche[`urgence_${n}_lien`] || ''} disabled={soumis}
                      onChange={e => setFiche(enfant.id, `urgence_${n}_lien`, e.target.value)} />
                  </div>
                ))}
              </div>

              {!soumis && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
                  <button onClick={() => soumettre(enfant.id)} disabled={saving}
                    style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Envoi...' : '📋 Soumettre la fiche'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
