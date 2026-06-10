'use client'
import { useEffect, useState } from 'react'

/**
 * Tour de bienvenue pour les nouveaux administrateurs.
 *
 * Affiche une succession de modales d'introduction au 1er login admin.
 * Stocké dans localStorage (clé 'talmidapp_onboarding_done').
 *
 * Le composant ne fait rien si le flag est déjà présent ou si l'utilisateur
 * n'est pas en rôle admin (le wrapper s'occupe de cette condition).
 *
 * Utilisation : monter une seule fois dans le layout admin, ou laisser
 * la prop `force` à true depuis un bouton "Relancer le tour".
 */

const STORAGE_KEY = 'talmidapp_onboarding_done'

interface Step {
  emoji: string
  title: string
  content: string
}

const STEPS: Step[] = [
  {
    emoji: '👋',
    title: 'Bienvenue sur TalmidApp',
    content: "Voici un petit tour des fonctionnalités principales pour vous aider à démarrer. Vous pouvez le passer à tout moment et le relancer plus tard depuis votre compte.",
  },
  {
    emoji: '🗂️',
    title: 'La sidebar à gauche',
    content: "Tous les outils sont regroupés par catégorie : École, Inscriptions, Finances, Communication, Vie scolaire, Paramètres. Cliquez sur une catégorie pour la déplier.",
  },
  {
    emoji: '📅',
    title: 'Le sélecteur d\'exercice',
    content: "En haut de chaque page, vous pouvez basculer entre les exercices comptables (ex : 2025-2026 / 2026-2027). Tout ce que vous voyez (factures, élèves, contrats) est filtré pour l'exercice sélectionné.",
  },
  {
    emoji: '👨‍👩‍👧',
    title: 'Créer une famille',
    content: "Allez dans École > Familles, cliquez sur « + Nouvelle famille ». Vous pouvez aussi inviter une famille par lien via Inscriptions > Demandes d'inscription, et la famille remplit elle-même son dossier en ligne.",
  },
  {
    emoji: '📊',
    title: 'Tableau de bord direction',
    content: "Dans la catégorie Administration, le « Tableau de bord direction » affiche les chiffres clés de l'école : effectifs, total facturé, taux de recouvrement, etc. Exportable en CSV pour vos réunions.",
  },
  {
    emoji: '🛡️',
    title: "Journal d'audit",
    content: "Toutes les actions sensibles (validation de contrat, annulation de facture, anonymisation RGPD...) sont tracées dans Paramètres > Journal d'audit. Indispensable en cas de contrôle.",
  },
]

interface Props {
  /** Si true, force l'affichage même si le flag localStorage est positionné */
  force?: boolean
  /** Callback quand le tour est terminé ou skippé */
  onClose?: () => void
}

export default function OnboardingTour({ force = false, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (force) {
      setOpen(true)
      return
    }
    const done = localStorage.getItem(STORAGE_KEY)
    if (!done) {
      // Petit délai pour laisser la page se charger
      const t = setTimeout(() => setOpen(true), 800)
      return () => clearTimeout(t)
    }
  }, [force])

  function close() {
    setOpen(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    }
    if (onClose) onClose()
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1)
    else close()
  }

  function prev() {
    if (step > 0) setStep(step - 1)
  }

  if (!open) return null

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, maxWidth: 520, width: '100%',
          padding: 32, boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          fontFamily: 'Inter, -apple-system, sans-serif',
        }}
      >
        {/* Étapes */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i <= step ? '#2563EB' : '#E2E8F0',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {/* Contenu */}
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 16 }}>{current.emoji}</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: '0 0 12px' }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#475569', margin: '0 0 28px' }}>
          {current.content}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button
            onClick={close}
            style={{
              background: 'transparent', border: 'none', color: '#94A3B8',
              fontSize: 13, cursor: 'pointer', padding: '8px 4px',
            }}
          >
            Passer le tour
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            {!isFirst && (
              <button
                onClick={prev}
                style={{
                  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
                  padding: '10px 18px', fontSize: 14, fontWeight: 600,
                  color: '#475569', cursor: 'pointer',
                }}
              >
                ← Précédent
              </button>
            )}
            <button
              onClick={next}
              style={{
                background: '#2563EB', border: 'none', borderRadius: 10,
                padding: '10px 22px', fontSize: 14, fontWeight: 600,
                color: '#fff', cursor: 'pointer',
              }}
            >
              {isLast ? 'Terminer' : 'Suivant →'}
            </button>
          </div>
        </div>

        {/* Compteur */}
        <div style={{ marginTop: 18, fontSize: 11, color: '#CBD5E1', textAlign: 'center' }}>
          {step + 1} / {STEPS.length}
        </div>
      </div>
    </div>
  )
}

/** Utilitaire : reset du flag pour relancer le tour */
export function resetOnboarding() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
}
