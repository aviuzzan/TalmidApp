'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Page "Levy - Assistant virtuel" : configurer activation + ton + FAQ.
 *
 * La FAQ est saisie en SECTIONS STRUCTUREES (calendrier, horaires, contacts, etc.).
 * Compile en Markdown au save dans chatbot_faq.contenu_markdown.
 * Parse au load les "## " comme delimiteurs de sections.
 */

type Section = { id: string; emoji: string; titre: string; contenu: string }

// Sections par defaut, pre-creees et vides. L'admin remplit ce qu'il veut.
const SECTIONS_DEFAUT: { emoji: string; titre: string; placeholder: string }[] = [
  {
    emoji: '📅', titre: 'Calendrier scolaire',
    placeholder: '- Rentrée : 1er septembre 2026\n- Vacances de fin d\'année : 19 décembre → 4 janvier\n- Vacances de printemps : ...\n- Fin d\'année scolaire : 30 juin',
  },
  {
    emoji: '🕐', titre: 'Horaires',
    placeholder: '- Lundi - Jeudi : 8h30 - 17h\n- Vendredi : 8h30 - 13h\n- Secrétariat : 8h - 18h',
  },
  {
    emoji: '📞', titre: 'Contacts',
    placeholder: '- Secrétariat : secretariat@example.com / 01 23 45 67 89\n- Comptabilité : compta@example.com\n- Direction : direction@example.com',
  },
  {
    emoji: '🍽️', titre: 'Cantine',
    placeholder: '- Tarif repas : ...\n- Modalités d\'inscription : ...\n- Régimes alimentaires possibles : ...',
  },
  {
    emoji: '🚌', titre: 'Transport',
    placeholder: '- Lignes desservies : ...\n- Tarifs / abonnement : ...\n- Inscription : ...',
  },
  {
    emoji: '📋', titre: 'Règlement intérieur',
    placeholder: '- Tenue / uniforme : ...\n- Téléphone portable : ...\n- Absences et retards : ...',
  },
  {
    emoji: '🎉', titre: 'Évènements à venir',
    placeholder: '- Réunion parents-professeurs : ...\n- Spectacle de fin d\'année : ...',
  },
  {
    emoji: '🏥', titre: 'Santé / urgences',
    placeholder: '- Médecin scolaire : ...\n- En cas d\'urgence : ...\n- Allergies / PAI : ...',
  },
  {
    emoji: '💰', titre: 'Tarifs spéciaux',
    placeholder: '- Réductions famille nombreuse : ...\n- Frais d\'inscription : ...\n- Modes de paiement : ...',
  },
  {
    emoji: '📚', titre: 'Programmes spécifiques',
    placeholder: '- Études religieuses : ...\n- Hébreu : ...\n- Activités extra-scolaires : ...',
  },
  {
    emoji: '📝', titre: 'Autre (libre)',
    placeholder: 'Toute autre information que Levy doit connaître.',
  },
]

/** Parse un Markdown en sections, en se basant sur les "## emoji titre".
 *  Fusionne avec les SECTIONS_DEFAUT pour que toutes les sections potentielles soient visibles.
 */
function parseMarkdown(md: string): Section[] {
  const trouvees: Map<string, Section> = new Map()

  if (md && md.trim().length > 0) {
    // Split sur '## ' en debut de ligne. Le premier morceau (avant le premier ##) est ignore
    // (preambule, titre H1, etc.).
    const blocs = md.split(/^##\s+/m)
    // On ignore blocs[0] (preambule). Si y a aucun ## du tout, c est qu il n y a qu un preambule.
    for (let i = 1; i < blocs.length; i++) {
      const bloc = blocs[i]
      if (!bloc.trim()) continue
      const lignes = bloc.split('\n')
      const premiere = lignes[0].trim()
      let emoji = '📝'
      let titre = premiere
      const espace = premiere.indexOf(' ')
      if (espace > 0 && espace <= 10) {
        const debut = premiere.substring(0, espace)
        const premier = debut.charCodeAt(0)
        const estLettre = (premier >= 65 && premier <= 90) || (premier >= 97 && premier <= 122)
        const estChiffre = premier >= 48 && premier <= 57
        // On exclut aussi les caracteres typographiques qui ne sont pas des vrais emojis
        const estCaractereSimple = ['#', '*', '-', '_', '=', '~'].includes(debut)
        if (!estLettre && !estChiffre && !estCaractereSimple) {
          emoji = debut
          titre = premiere.substring(espace + 1) || premiere
        }
      }
      const contenu = lignes.slice(1).join('\n').trim()
      trouvees.set(titre.toLowerCase(), { id: 's' + i, emoji, titre, contenu })
    }
  }

  // Fusionne avec SECTIONS_DEFAUT : si une section par defaut existe deja, on la garde,
  // sinon on l ajoute vide. Resultat ordonne par SECTIONS_DEFAUT, puis les sections custom restantes.
  const resultat: Section[] = []
  const utilisees = new Set<string>()
  for (let i = 0; i < SECTIONS_DEFAUT.length; i++) {
    const d = SECTIONS_DEFAUT[i]
    const cle = d.titre.toLowerCase()
    const existante = trouvees.get(cle)
    if (existante) {
      resultat.push({ ...existante, emoji: d.emoji, id: 'def' + i })
      utilisees.add(cle)
    } else {
      resultat.push({ id: 'def' + i, emoji: d.emoji, titre: d.titre, contenu: '' })
    }
  }
  // Ajoute les sections custom non-defaut a la fin
  for (const [cle, sec] of trouvees) {
    if (!utilisees.has(cle)) resultat.push(sec)
  }
  return resultat
}

/** Compile les sections en Markdown structure. */
function compileMarkdown(sections: Section[]): string {
  return sections
    .filter(s => s.contenu.trim().length > 0)
    .map(s => `## ${s.emoji} ${s.titre}\n${s.contenu.trim()}\n`)
    .join('\n')
}

export default function LevyConfigPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [active, setActive] = useState(false)
  const [ton, setTon] = useState('professionnel_chaleureux')
  const [limite, setLimite] = useState(30)
  const [sections, setSections] = useState<Section[]>([])

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id])

  async function load() {
    const s = createClient()
    const [{ data: cfg }, { data: f }] = await Promise.all([
      s.from('chatbot_config_ecole').select('*').eq('ecole_id', ecole.id).maybeSingle(),
      s.from('chatbot_faq').select('contenu_markdown').eq('ecole_id', ecole.id).maybeSingle(),
    ])
    if (cfg) {
      setActive(cfg.active === true)
      setTon(cfg.ton || 'professionnel_chaleureux')
      setLimite(cfg.limite_parent_par_jour || 30)
    }
    setSections(parseMarkdown(f?.contenu_markdown || ''))
    setLoading(false)
  }

  async function sauvegarder() {
    setSaving(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const md = compileMarkdown(sections)
    const { error: e1 } = await s.from('chatbot_config_ecole').upsert({
      ecole_id: ecole.id, active, ton, limite_parent_par_jour: limite, updated_at: new Date().toISOString(),
    })
    const { error: e2 } = await s.from('chatbot_faq').upsert({
      ecole_id: ecole.id, contenu_markdown: md,
      updated_by: session?.user.id, updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (e1 || e2) setMsg('❌ ' + (e1?.message || e2?.message))
    else setMsg('✓ Configuration enregistrée — Levy connaît maintenant ces informations')
    setTimeout(() => setMsg(''), 4000)
  }

  function updateSection(id: string, field: 'titre' | 'contenu', valeur: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, [field]: valeur } : s))
  }

  function ajouterSection() {
    const id = 's' + Date.now()
    setSections(prev => [...prev, { id, emoji: '📝', titre: 'Nouvelle section', contenu: '' }])
  }

  function supprimerSection(id: string) {
    if (!confirm('Supprimer cette section et son contenu ?')) return
    setSections(prev => prev.filter(s => s.id !== id))
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', background: '#fff' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 920, margin: '0 auto', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button onClick={() => router.push(`/${ecole.slug}/parametres`)}
            style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#475569', cursor: 'pointer', marginBottom: 8 }}>← Paramètres</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>👨‍🎓 Levy — Assistant virtuel</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            Levy aide vos parents et admins. Activez-le, choisissez son ton, et remplissez les informations qu&apos;il doit connaître.
          </p>
        </div>
        <button onClick={sauvegarder} disabled={saving}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>{msg}</div>
      )}

      {/* Activation */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Activation</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <div onClick={() => setActive(!active)}
            style={{ width: 44, height: 26, borderRadius: 13, background: active ? '#10B981' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 3, left: active ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{active ? 'Levy activé' : 'Levy désactivé'}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Quand activé, le bouton &quot;Demandez à Levy&quot; apparaît sur le portail parent et la console admin.</div>
          </div>
        </label>
      </div>

      {/* Réglages */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Réglages</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={lbl}>Ton de Levy</label>
            <select value={ton} onChange={e => setTon(e.target.value)} style={inp}>
              <option value="professionnel_chaleureux">Professionnel &amp; chaleureux</option>
              <option value="formel">Formel</option>
              <option value="familier">Familier</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Limite questions / jour (parent)</label>
            <input type="number" min="5" max="200" value={limite} onChange={e => setLimite(parseInt(e.target.value) || 30)} style={inp} />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Les admins n&apos;ont pas de limite.</div>
          </div>
        </div>
      </div>

      {/* Sections "Alimenter Levy" */}
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>Alimenter Levy en informations</h2>
          <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
            Levy connaît déjà vos données (familles, factures, élèves) et l&apos;app TalmidApp. Ajoutez ici les infos
            spécifiques à votre école : calendrier, horaires, contacts, règles, etc. Plus vous remplissez, plus Levy est utile.
          </p>
        </div>

        {sections.map(sec => {
          const sectionDefaut = SECTIONS_DEFAUT.find(d => d.titre === sec.titre)
          const placeholder = sectionDefaut?.placeholder || 'Tapez les informations que Levy doit connaître…'
          return (
            <div key={sec.id} style={{ marginBottom: 16, border: '1px solid #F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ background: '#F8FAFC', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #F1F5F9' }}>
                <input value={sec.emoji} onChange={e => updateSection(sec.id, 'titre', sec.titre)}
                  onBlur={e => {/* readonly emoji */}}
                  style={{ width: 36, fontSize: 18, textAlign: 'center', border: 'none', background: 'transparent', outline: 'none' }}
                  readOnly title="Emoji" />
                <input value={sec.titre}
                  onChange={e => updateSection(sec.id, 'titre', e.target.value)}
                  style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1E293B', border: 'none', background: 'transparent', outline: 'none' }} />
                <button type="button" onClick={() => supprimerSection(sec.id)}
                  title="Supprimer cette section"
                  style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 16, cursor: 'pointer', padding: '4px 8px' }}>🗑</button>
              </div>
              <textarea value={sec.contenu}
                onChange={e => updateSection(sec.id, 'contenu', e.target.value)}
                placeholder={placeholder}
                rows={Math.max(4, sec.contenu.split('\n').length + 1)}
                style={{ width: '100%', padding: 14, border: 'none', fontSize: 13, lineHeight: 1.55, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', minHeight: 90, background: '#fff' }}
              />
            </div>
          )
        })}

        <button type="button" onClick={ajouterSection}
          style={{ background: '#EFF6FF', color: '#2563EB', border: '1px dashed #BFDBFE', borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
          + Ajouter une section
        </button>
      </div>

      {/* Pied : test rapide */}
      <div style={{ ...card, background: '#F8FAFC', border: '1px dashed #CBD5E1' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>💡 Tester Levy</h3>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 10px' }}>
          Après avoir enregistré, cliquez sur le bouton bleu &quot;Demandez à Levy&quot; en bas à droite de l&apos;écran et posez-lui une question
          sur les informations que vous venez d&apos;ajouter pour vérifier qu&apos;il les utilise correctement.
        </p>
      </div>
    </div>
  )
}
