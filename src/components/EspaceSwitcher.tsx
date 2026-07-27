'use client'
/**
 * EspaceSwitcher — sélecteur "Changer d'espace" (multi-écoles gggg2).
 * Affiché uniquement si le compte a PLUSIEURS rattachements (école × rôle).
 * Ex : parent à Eschel + admin à Beth Hanna → bascule en un clic.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Contexte = {
  id: string
  role: string
  ecole_nom: string
  ecole_slug: string
  famille_nom: string | null
  actuel: boolean
}

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parent', admin: 'Administration', agent: 'Agent',
  teacher: 'Professeur', prof: 'Professeur', super_admin: 'Super admin',
}

export default function EspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const [contextes, setContextes] = useState<Contexte[]>([])
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const s = createClient()
        const { data: { session } } = await s.auth.getSession()
        if (!session) return
        const res = await fetch('/api/auth/contextes', {
          headers: { Authorization: 'Bearer ' + session.access_token },
        })
        const json = await res.json()
        if (json?.ok && Array.isArray(json.contextes)) setContextes(json.contextes)
      } catch { /* silencieux : le switcher est optionnel */ }
    })()
  }, [])

  if (contextes.length <= 1) return null

  async function basculer(id: string) {
    if (switching) return
    setSwitching(true)
    try {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) return
      const res = await fetch('/api/auth/activer-contexte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ rattachementId: id }),
      })
      const json = await res.json()
      if (json?.ok) {
        // Redirection selon le rôle du nouveau contexte
        if (json.role === 'parent') window.location.href = '/portail'
        else if (json.role === 'teacher' || json.role === 'prof') window.location.href = '/portail/prof'
        else window.location.href = `/${json.ecole?.slug || ''}/dashboard`
      } else {
        setSwitching(false)
      }
    } catch {
      setSwitching(false)
    }
  }

  const actuel = contextes.find(c => c.actuel)

  return (
    <select
      value={actuel?.id || ''}
      onChange={e => { if (e.target.value && e.target.value !== actuel?.id) basculer(e.target.value) }}
      disabled={switching}
      title="Changer d'espace"
      style={{
        background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8,
        padding: compact ? '5px 8px' : '7px 10px', fontSize: compact ? 12 : 13,
        color: '#1E293B', cursor: 'pointer', maxWidth: 220,
      }}>
      {!actuel && <option value="">Changer d&apos;espace…</option>}
      {contextes.map(c => (
        <option key={c.id} value={c.id}>
          {c.ecole_nom} — {ROLE_LABEL[c.role] || c.role}
        </option>
      ))}
    </select>
  )
}
