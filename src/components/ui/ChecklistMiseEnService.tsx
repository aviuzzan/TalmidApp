'use client'
// onboarding kkkk2 : checklist "Mise en service" affichée en tête du dashboard.
// Audit 27/07 : une école neuve est une coquille vide (pas de mode de règlement,
// pas de secteur/classe/tarif, exercice non défini) -> le parcours parent casse
// silencieusement. Cette carte rend l'état de configuration VISIBLE et guide
// l'admin vers l'onglet Paramètres concerné pour chaque item manquant.
// 5 items bloquants + 2 items avancés (non bloquants). Quand tout est vert,
// la carte se replie en un badge discret mémorisé en localStorage.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { detectCodeExerciceCourant } from '@/lib/exercice'

type Item = {
  code: string
  label: string
  ok: boolean
  href: string       // page de config pour corriger
  bloquant: boolean
}

export default function ChecklistMiseEnService() {
  const ecole = useEcole()
  const router = useRouter()
  const [items, setItems] = useState<Item[] | null>(null)
  const [dismissed, setDismissed] = useState(true) // true par défaut pour éviter un flash

  useEffect(() => {
    if (!ecole?.id) return
    try {
      setDismissed(localStorage.getItem(`talmid_miseenservice_done_${ecole.id}`) === '1')
    } catch { setDismissed(false) }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id])

  async function load() {
    const s = createClient()
    const annee = detectCodeExerciceCourant()
    try {
      // Une requête count/head par item, toutes scopées ecole_id, toutes best-effort.
      const [ecoleR, sectR, clsR, tarR, modR, srvR, tplR] = await Promise.all([
        s.from('ecoles').select('exercice_courant_id').eq('id', ecole.id).maybeSingle(),
        s.from('secteurs').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id),
        s.from('classes').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id),
        s.from('tarifs_secteur').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('annee_scolaire', annee),
        s.from('modes_reglement_ecole').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('actif', true),
        s.from('services').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('actif', true),
        // Template "Bienvenue parent" : celui de l'école OU le modèle global (ecole_id NULL)
        s.from('email_templates').select('*', { count: 'exact', head: true })
          .eq('nom', 'Bienvenue parent').eq('actif', true)
          .or(`ecole_id.eq.${ecole.id},ecole_id.is.null`),
      ])
      if (ecoleR.error) { setItems(null); return } // best-effort : pas d'accès -> pas de carte

      const base = `/${ecole.slug}/parametres`
      setItems([
        { code: 'exercice', label: 'Exercice courant défini', ok: !!ecoleR.data?.exercice_courant_id, href: `${base}/exercices`, bloquant: true },
        { code: 'secteurs', label: 'Au moins un secteur', ok: (sectR.count ?? 0) > 0, href: `${base}?tab=secteurs`, bloquant: true },
        { code: 'classes', label: 'Au moins une classe', ok: (clsR.count ?? 0) > 0, href: `${base}?tab=classes`, bloquant: true },
        { code: 'tarifs', label: `Tarifs ${annee} renseignés`, ok: (tarR.count ?? 0) > 0, href: `${base}?tab=tarifs`, bloquant: true },
        { code: 'modes', label: 'Un mode de règlement actif', ok: (modR.count ?? 0) > 0, href: `${base}?tab=modes_reglement`, bloquant: true },
        { code: 'services', label: 'Un service messagerie', ok: (srvR.count ?? 0) > 0, href: `${base}?tab=services`, bloquant: false },
        { code: 'template', label: 'Template « Bienvenue parent »', ok: (tplR.count ?? 0) > 0, href: `/${ecole.slug}/notifications`, bloquant: false },
      ])
    } catch {
      setItems(null) // best-effort : jamais de crash du dashboard
    }
  }

  function masquer() {
    try { localStorage.setItem(`talmid_miseenservice_done_${ecole.id}`, '1') } catch {}
    setDismissed(true)
  }

  if (!items) return null
  const bloquants = items.filter(i => i.bloquant)
  const okCount = bloquants.filter(i => i.ok).length
  const allOk = okCount === bloquants.length

  // Tout est vert + déjà replié -> rien du tout
  if (allOk && dismissed) return null

  // Tout est vert, pas encore replié -> badge discret + bouton pour replier
  if (allOk) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#059669', fontWeight: 600 }}>
        <span>✅ École opérationnelle — configuration de base complète</span>
        <button onClick={masquer}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#059669', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
          Masquer
        </button>
      </div>
    )
  }

  // Carte de mise en service : items manquants avec lien direct vers la config
  return (
    <div style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20 }}>🚀</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>
          Mise en service : {okCount}/{bloquants.length}
        </span>
        <span style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '2px 10px', fontWeight: 600 }}>
          Configuration requise avant d'accueillir les familles
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
        {items.map(item => (
          <div key={item.code}
            onClick={item.ok ? undefined : () => router.push(item.href)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 8, fontSize: 13,
              background: item.ok ? '#F8FAFC' : '#FEF2F2',
              border: `1px solid ${item.ok ? '#E2E8F0' : '#FECACA'}`,
              cursor: item.ok ? 'default' : 'pointer',
              opacity: item.bloquant ? 1 : 0.85,
            }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: item.ok ? '#059669' : '#DC2626' }}>
              {item.ok ? '✓' : '○'}
            </span>
            <span style={{ color: item.ok ? '#475569' : '#991B1B', fontWeight: item.ok ? 400 : 600 }}>
              {item.label}
              {!item.bloquant && <span style={{ color: '#94A3B8', fontWeight: 400 }}> (optionnel)</span>}
            </span>
            {!item.ok && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#2563EB', fontWeight: 600 }}>Configurer →</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
