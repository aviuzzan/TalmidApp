'use client'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type ResultType = 'famille' | 'eleve' | 'facture' | 'professeur'

type Result = {
  id: string
  type: ResultType
  title: string
  subtitle: string
  href: string
}

const TYPE_META: Record<ResultType, { icon: string; label: string; bg: string; fg: string }> = {
  famille: { icon: '👨‍👩‍👧', label: 'Famille', bg: '#EFF6FF', fg: '#1E40AF' },
  eleve: { icon: '🎓', label: 'Élève', bg: '#ECFDF5', fg: '#065F46' },
  facture: { icon: '💰', label: 'Facture', bg: '#FEF3C7', fg: '#92400E' },
  professeur: { icon: '👨‍🏫', label: 'Professeur', bg: '#F3E8FF', fg: '#6B21A8' },
}

export default function GlobalSearch() {
  const router = useRouter()
  const ecole = useEcole()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<any>(null)

  const supabase = useMemo(() => createClient(), [])

  // Open with Ctrl+K / Cmd+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  const search = useCallback(async (q: string) => {
    if (!q.trim() || !ecole?.id) { setResults([]); return }
    setLoading(true)
    const term = `%${q.trim()}%`

    const [{ data: fams }, { data: enfs }, { data: facts }, { data: profs }] = await Promise.all([
      supabase.from('familles')
        .select('id, nom, numero, parent1_email, parent1_nom, parent1_prenom')
        .eq('ecole_id', ecole.id)
        .or(`nom.ilike.${term},numero.ilike.${term},parent1_nom.ilike.${term},parent1_email.ilike.${term}`)
        .limit(8),
      supabase.from('enfants')
        .select('id, prenom, nom, classes(nom), familles(nom)')
        .eq('ecole_id', ecole.id)
        .or(`prenom.ilike.${term},nom.ilike.${term}`)
        .limit(8),
      supabase.from('factures_solde')
        .select('id, numero, statut, total_facture, solde_restant, familles(nom)')
        .ilike('numero', term)
        .limit(5),
      supabase.from('professeurs')
        .select('id, prenom, nom, matiere')
        .eq('ecole_id', ecole.id)
        .or(`prenom.ilike.${term},nom.ilike.${term}`)
        .limit(5),
    ])

    const res: Result[] = []
    for (const f of fams || []) {
      res.push({
        id: f.id,
        type: 'famille',
        title: `Famille ${f.nom}`,
        subtitle: `${f.numero || ''} · ${(f as any).parent1_prenom || ''} ${(f as any).parent1_nom || ''}`.trim(),
        href: `/${ecole.slug}/familles/${f.id}`,
      })
    }
    for (const e of enfs || []) {
      res.push({
        id: e.id,
        type: 'eleve',
        title: `${e.prenom || ''} ${e.nom || ''}`.trim(),
        subtitle: `Famille ${(e as any).familles?.nom || '—'} · Classe ${(e as any).classes?.nom || '—'}`,
        href: `/${ecole.slug}/enfants/${e.id}`,
      })
    }
    for (const f of facts || []) {
      res.push({
        id: f.id,
        type: 'facture',
        title: f.numero,
        subtitle: `${(f as any).familles?.nom || '—'} · Total ${Number(f.total_facture || 0).toFixed(0)}€ · Solde ${Number(f.solde_restant || 0).toFixed(0)}€`,
        href: `/${ecole.slug}/finances`,
      })
    }
    for (const p of profs || []) {
      res.push({
        id: p.id,
        type: 'professeur',
        title: `${p.prenom || ''} ${p.nom || ''}`.trim(),
        subtitle: p.matiere || '—',
        href: `/${ecole.slug}/professeurs`,
      })
    }
    setResults(res)
    setHighlight(0)
    setLoading(false)
  }, [ecole?.id, ecole?.slug, supabase])

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => search(query), 200)
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [query, search])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
      else if (e.key === 'Enter' && results[highlight]) {
        e.preventDefault()
        router.push(results[highlight].href)
        setOpen(false); setQuery(''); setResults([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, highlight, router])

  if (!open) return null

  return (
    <div onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          width: '100%', maxWidth: 600, maxHeight: '70vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #E2E8F0' }}>
          <span style={{ fontSize: 18, color: '#94A3B8' }}>🔍</span>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher une famille, un élève, une facture…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent' }} />
          <span style={{ fontSize: 10, color: '#94A3B8', background: '#F1F5F9', padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace' }}>ESC</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {!query.trim() ? (
            <div style={{ padding: '40px 18px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔎</div>
              <div>Tapez pour rechercher dans toute l&apos;école</div>
              <div style={{ fontSize: 11, marginTop: 8 }}>Familles · Élèves · Factures · Professeurs</div>
              <div style={{ fontSize: 11, marginTop: 16, color: '#64748B' }}>
                Raccourci : <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>Ctrl+K</span> ou <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>⌘+K</span>
              </div>
            </div>
          ) : loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Recherche…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              Aucun résultat pour <strong>« {query} »</strong>
            </div>
          ) : (
            results.map((r, i) => {
              const m = TYPE_META[r.type]
              const sel = i === highlight
              return (
                <div key={`${r.type}-${r.id}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => { router.push(r.href); setOpen(false); setQuery('') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 18px', cursor: 'pointer',
                    background: sel ? '#EFF6FF' : 'transparent',
                    borderLeft: sel ? '3px solid #2563EB' : '3px solid transparent',
                  }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: m.bg, color: m.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {m.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subtitle}</div>
                  </div>
                  <div style={{ fontSize: 10, color: m.fg, background: m.bg, padding: '3px 8px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>{m.label}</div>
                </div>
              )
            })
          )}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#94A3B8' }}>
          <div>
            <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '2px 6px', borderRadius: 3 }}>↑↓</span> naviguer ·{' '}
            <span style={{ fontFamily: 'monospace', background: '#F1F5F9', padding: '2px 6px', borderRadius: 3 }}>↵</span> ouvrir
          </div>
          <div>{results.length} résultat{results.length > 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>
  )
}
