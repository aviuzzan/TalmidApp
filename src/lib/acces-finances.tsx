'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Verrou financier transversal (Option A).
 *
 * Chaque profile a un champ `acces_finances bool` (default true). Quand false,
 * l'utilisateur ne doit voir AUCUN élément financier dans l'app : montants,
 * soldes, IBAN, KPIs finance, blocs facture, etc.
 *
 * Usage :
 *  - Wrap les pages admin dans <AccesFinancesProvider>...</AccesFinancesProvider>
 *  - Wrap chaque morceau financier dans <FinanceOnly>...</FinanceOnly>
 *  - Ou utilise le hook useAccesFinances() pour des cas plus complexes
 *
 * Règles :
 *  - super_admin : TOUJOURS accès financier (sécurité)
 *  - admin / autres rôles : selon profile.acces_finances
 *  - parent : pas concerné (le portail famille montre TOUJOURS leurs finances)
 */
interface AccesFinancesCtx {
  acces: boolean
  loading: boolean
}

const Ctx = createContext<AccesFinancesCtx>({ acces: true, loading: true })

export function AccesFinancesProvider({ children }: { children: ReactNode }) {
  const [acces, setAcces] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) { setLoading(false); return }
      const { data: p } = await s
        .from('profiles')
        .select('role, acces_finances')
        .eq('id', session.user.id)
        .single()
      // super_admin = toujours OK (sécurité). Sinon on respecte la valeur du profile.
      if (p?.role === 'super_admin') setAcces(true)
      else setAcces(p?.acces_finances !== false)
      setLoading(false)
    }
    check()
  }, [])

  return <Ctx.Provider value={{ acces, loading }}>{children}</Ctx.Provider>
}

export function useAccesFinances(): AccesFinancesCtx {
  return useContext(Ctx)
}

/**
 * Composant wrapper : ne rend ses enfants que si le user a accès aux finances.
 * Optionnel : `fallback` peut être affiché à la place (ex: "—").
 */
export function FinanceOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { acces, loading } = useAccesFinances()
  if (loading) return null
  if (!acces) return <>{fallback}</>
  return <>{children}</>
}
