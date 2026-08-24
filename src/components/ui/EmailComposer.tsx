'use client'
import { useEffect, useRef, useState } from 'react'
import { appPrompt } from '@/components/ui/ConfirmDialog'

/**
 * wwww1 — Editeur d'email visuel pour les admins (module Notifications).
 *
 * Constat d'Avi (24/08) : les secretaires ne savent pas ecrire du HTML, la zone
 * « Contenu HTML » brute etait inutilisable pour eux. Cet editeur offre :
 *  - un mode VISUEL type Word (gras, titres, listes, liens) sur contentEditable,
 *    qui produit du HTML propre sans que l'admin n'en voie une ligne ;
 *  - l'insertion des variables ({{nom_famille}}, {{lien_magique}}...) en un clic ;
 *  - un APERCU du rendu avec des donnees d'exemple substituees ;
 *  - un mode HTML conserve pour les utilisateurs avances (l'existant).
 * Le HTML produit/colle reste stocke tel quel dans contenu_html : aucun
 * changement cote envoi (/api/emails) ni cote templates.
 */

const VARIABLES = [
  { v: '{{prenom_parent1}}', l: 'Prenom parent 1' },
  { v: '{{nom_famille}}', l: 'Nom de la famille' },
  { v: '{{solde_restant}}', l: 'Solde restant' },
  { v: '{{total_facture}}', l: 'Total facture' },
  { v: '{{annee_scolaire}}', l: 'Annee scolaire' },
  { v: '{{lien_magique}}', l: 'Lien de connexion (24h)' },
]

const EXEMPLES: Record<string, string> = {
  '{{nom_famille}}': 'DUPONT',
  '{{prenom_parent1}}': 'Sarah',
  '{{nom_parent1}}': 'DUPONT',
  '{{prenom_parent2}}': 'David',
  '{{solde_restant}}': '1 250 €',
  '{{total_facture}}': '4 500 €',
  '{{total_regle}}': '3 250 €',
  '{{nb_enfants}}': '3',
  '{{annee_scolaire}}': '2026-2027',
  '{{lien_magique}}': 'https://talmidapp.fr/connexion-exemple',
}

type Mode = 'visuel' | 'html' | 'apercu'

export default function EmailComposer({ value, onChange, height = 280 }: {
  value: string
  onChange: (html: string) => void
  height?: number
}) {
  const [mode, setMode] = useState<Mode>('visuel')
  const [showVars, setShowVars] = useState(false)
  const divRef = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string>('')

  // Synchronise le contentEditable quand la valeur change de l'EXTERIEUR
  // (chargement d'un template, reset) — jamais pendant la frappe (caret).
  useEffect(() => {
    if (mode !== 'visuel') return
    const div = divRef.current
    if (div && value !== lastEmitted.current) {
      div.innerHTML = value || ''
      lastEmitted.current = value || ''
    }
  }, [value, mode])

  function emit() {
    const div = divRef.current
    if (!div) return
    lastEmitted.current = div.innerHTML
    onChange(div.innerHTML)
  }

  function cmd(command: string, arg?: string) {
    divRef.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  async function insererLien() {
    const url = await appPrompt('Adresse du lien (https://...)', 'https://')
    if (!url || url === 'https://') return
    cmd('createLink', url)
  }

  function insererVariable(v: string) {
    setShowVars(false)
    divRef.current?.focus()
    document.execCommand('insertText', false, v)
    emit()
  }

  function apercuHtml(): string {
    let html = value || ''
    for (const [k, ex] of Object.entries(EXEMPLES)) html = html.split(k).join(ex)
    return html
  }

  const tbBtn: React.CSSProperties = {
    border: '1px solid #E2E8F0', background: '#fff', borderRadius: 7, cursor: 'pointer',
    padding: '5px 10px', fontSize: 12.5, color: '#334155', minWidth: 32,
  }
  const modeBtn = (m: Mode, label: string) => (
    <button type="button" key={m} onClick={() => setMode(m)}
      style={{
        border: 'none', borderRadius: 7, cursor: 'pointer', padding: '5px 12px', fontSize: 12, fontWeight: 600,
        background: mode === m ? '#1E293B' : 'transparent', color: mode === m ? '#fff' : '#64748B',
      }}>{label}</button>
  )

  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {/* Barre de modes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {modeBtn('visuel', '✏️ Éditeur simple')}
          {modeBtn('apercu', '👁 Aperçu')}
          {modeBtn('html', '</> HTML avancé')}
        </div>
        {mode === 'visuel' && (
          <span style={{ fontSize: 11, color: '#94A3B8' }}>Écrivez comme dans Word — aucun code nécessaire</span>
        )}
      </div>

      {/* Barre d'outils (mode visuel) */}
      {mode === 'visuel' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 10px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', position: 'relative' }}>
          <button type="button" style={{ ...tbBtn, fontWeight: 800 }} title="Gras" onClick={() => cmd('bold')}>G</button>
          <button type="button" style={{ ...tbBtn, fontStyle: 'italic' }} title="Italique" onClick={() => cmd('italic')}>I</button>
          <button type="button" style={{ ...tbBtn, textDecoration: 'underline' }} title="Souligné" onClick={() => cmd('underline')}>S</button>
          <span style={{ width: 1, height: 20, background: '#E2E8F0' }} />
          <button type="button" style={tbBtn} title="Grand titre" onClick={() => cmd('formatBlock', '<h2>')}>Titre</button>
          <button type="button" style={tbBtn} title="Texte normal" onClick={() => cmd('formatBlock', '<p>')}>Texte</button>
          <button type="button" style={tbBtn} title="Liste à puces" onClick={() => cmd('insertUnorderedList')}>• Liste</button>
          <button type="button" style={tbBtn} title="Insérer un lien" onClick={insererLien}>🔗 Lien</button>
          <button type="button" style={tbBtn} title="Effacer la mise en forme" onClick={() => cmd('removeFormat')}>🧹</button>
          <span style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setShowVars(s => !s)}
              style={{ ...tbBtn, background: '#EFF6FF', borderColor: '#BFDBFE', color: '#2563EB', fontWeight: 700 }}>
              ⚡ Insérer une variable ▾
            </button>
            {showVars && (
              <div style={{ position: 'absolute', top: '110%', insetInlineEnd: 0, zIndex: 30, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)', minWidth: 240, padding: 6 }}>
                {VARIABLES.map(x => (
                  <button type="button" key={x.v} onClick={() => insererVariable(x.v)}
                    style={{ display: 'block', width: '100%', textAlign: 'start', border: 'none', background: 'transparent', cursor: 'pointer', padding: '7px 10px', borderRadius: 7, fontSize: 12 }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#F1F5F9')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                    <span style={{ fontFamily: 'monospace', color: '#2563EB' }}>{x.v}</span>
                    <span style={{ color: '#64748B', marginInlineStart: 8 }}>{x.l}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zone d'edition */}
      {mode === 'visuel' && (
        <div
          ref={divRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          style={{ minHeight: height, padding: '14px 16px', fontSize: 14, lineHeight: 1.65, color: '#1E293B', outline: 'none' }}
        />
      )}

      {mode === 'html' && (
        <textarea
          value={value}
          onChange={e => { lastEmitted.current = e.target.value; onChange(e.target.value) }}
          placeholder="<h2>Bonjour {{prenom_parent1}},</h2>..."
          style={{ width: '100%', minHeight: height, padding: '12px 14px', border: 'none', outline: 'none', resize: 'vertical', fontFamily: 'monospace', fontSize: 12, boxSizing: 'border-box', color: '#1E293B' }}
        />
      )}

      {mode === 'apercu' && (
        <div style={{ background: '#F1F5F9', padding: 18, minHeight: height }}>
          <div style={{ maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '22px 26px', fontSize: 14, lineHeight: 1.65, color: '#1E293B' }}
            dangerouslySetInnerHTML={{ __html: apercuHtml() || '<p style=\'color:#94A3B8\'>Rien à afficher — écrivez votre message dans l\'éditeur.</p>' }} />
          <div style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 10 }}>
            Aperçu avec des données d'exemple (famille DUPONT) — chaque famille recevra ses propres informations.
          </div>
        </div>
      )}
    </div>
  )
}
