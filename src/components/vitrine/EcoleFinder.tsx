'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * aaaa2 — Bouton « Se connecter » des vitrines (talmidapp.fr et yeter.fr).
 * Style Jotform Enterprise : l'utilisateur tape le nom de son etablissement,
 * des suggestions arrivent de /api/recherche-ecole (ecoles actives uniquement,
 * nom/slug/ville, 8 max), et le clic l'emmene sur /<slug>/login. Depuis un
 * autre hote que talmidapp.fr (ex. yeter.fr), la redirection est ABSOLUE vers
 * https://talmidapp.fr pour que la session Supabase vive sur un seul domaine.
 * dddd5 (31/08/2026, bug mobile remonte par Avi) : sur petit ecran le panneau
 * 320px aligne a droite du bouton sortait de l'ecran a gauche -> en dessous de
 * 520px il passe en position:fixed pleine largeur (marges 12px), et le champ
 * passe a 16px pour empecher le zoom automatique d'iOS a la saisie.
 */
export default function EcoleFinder({ clair = false }: { clair?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [resultats, setResultats] = useState<{ nom: string; slug: string; ville: string | null }[]>([])
  const [chargement, setChargement] = useState(false)
  const [cherche, setCherche] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mobile, setMobile] = useState(false)
  const [topFixe, setTopFixe] = useState(0)

  // dddd5 : detection petit ecran (le rendu serveur suppose desktop, corrige au mount)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 520px)')
    const maj = () => setMobile(mq.matches)
    maj()
    mq.addEventListener('change', maj)
    return () => mq.removeEventListener('change', maj)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const terme = q.trim()
    if (terme.length < 2) { setResultats([]); setCherche(false); return }
    timerRef.current = setTimeout(async () => {
      setChargement(true)
      try {
        const res = await fetch('/api/recherche-ecole?q=' + encodeURIComponent(terme))
        const data = await res.json()
        setResultats(data.ecoles || [])
      } catch { setResultats([]) }
      setChargement(false)
      setCherche(true)
    }, 250)
  }, [q])

  function base() {
    const h = window.location.hostname
    return h.includes('talmidapp') || h === 'localhost' ? '' : 'https://talmidapp.fr'
  }

  const fond = clair ? '#FFFFFF' : '#0D1526'
  const bord = clair ? '#ECEAF4' : 'rgba(255,255,255,0.1)'
  const texte = clair ? '#1E1B2E' : '#F1F5F9'
  const secondaire = clair ? '#8A86A0' : 'rgba(255,255,255,0.45)'

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button onClick={() => {
        if (boxRef.current) setTopFixe(boxRef.current.getBoundingClientRect().bottom + 10)
        setOpen(o => !o)
      }}
        style={{
          background: 'transparent', border: '1px solid ' + (clair ? '#D8D4E8' : 'rgba(255,255,255,0.2)'),
          borderRadius: 10, padding: '9px 18px', color: texte, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        }}>
        Se connecter
      </button>
      {open && (
        <div style={{
          ...(mobile
            ? { position: 'fixed' as const, top: topFixe, insetInline: 12, width: 'auto' }
            : { position: 'absolute' as const, top: 'calc(100% + 10px)', insetInlineEnd: 0, width: 320 }),
          zIndex: 200,
          background: fond, border: '1px solid ' + bord, borderRadius: 14, padding: 14,
          boxShadow: clair ? '0 12px 40px rgba(30,27,46,0.14)' : '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: texte, marginBottom: 8 }}>Retrouvez votre établissement</div>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Nom de votre établissement…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, fontSize: mobile ? 16 : 13.5,
              background: clair ? '#FAFAFD' : 'rgba(255,255,255,0.06)', border: '1px solid ' + bord, color: texte, outline: 'none',
            }} />
          <div style={{ marginTop: 8, maxHeight: 240, overflowY: 'auto' }}>
            {chargement && <div style={{ fontSize: 12.5, color: secondaire, padding: '8px 4px' }}>Recherche…</div>}
            {!chargement && cherche && resultats.length === 0 && q.trim().length >= 2 && (
              <div style={{ fontSize: 12.5, color: secondaire, padding: '8px 4px', lineHeight: 1.5 }}>
                Aucun établissement trouvé. Vérifiez l&apos;orthographe, ou rapprochez-vous de votre établissement.
              </div>
            )}
            {resultats.map(e => (
              <a key={e.slug} href={base() + '/' + e.slug + '/login'}
                style={{ display: 'block', padding: '10px 10px', borderRadius: 9, textDecoration: 'none', color: texte }}
                onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = clair ? '#F4F2FA' : 'rgba(255,255,255,0.06)' }}
                onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'transparent' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.nom}</div>
                {e.ville && <div style={{ fontSize: 11.5, color: secondaire, marginTop: 1 }}>{e.ville}</div>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
