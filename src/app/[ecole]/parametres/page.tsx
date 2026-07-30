'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive } from '@/lib/exercice-context'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useAccesFinances } from '@/lib/acces-finances'
import TranchesTab from '@/components/parametres/TranchesTab'
import SecteursTab from '@/components/parametres/SecteursTab'
import ClassesTab from '@/components/parametres/ClassesTab'
import ConfigReductionTab from '@/components/parametres/ConfigReductionTab'
import ConfigPaiementTab from '@/components/parametres/ConfigPaiementTab'
import TarifsTab from '@/components/parametres/TarifsTab'
import ReductionsFNTab from '@/components/parametres/ReductionsFNTab'
import ModesReglementTab from '@/components/parametres/ModesReglementTab'
import CommissionTab from '@/components/parametres/CommissionTab'
import SEPATab from '@/components/parametres/SEPATab'
import NotificationsTab from '@/components/parametres/NotificationsTab'
import FraisInscriptionTab from '@/components/parametres/FraisInscriptionTab'
import DocumentsEcoleTab from '@/components/parametres/DocumentsEcoleTab'
import ServicesTab from '@/components/parametres/ServicesTab'
import ComptesAccesTab from '@/components/parametres/ComptesAccesTab'
import DocumentsInscriptionTab from '@/components/parametres/DocumentsInscriptionTab'
import OptionsEnfantTab from '@/components/parametres/OptionsEnfantTab'
import AssuranceTab from '@/components/parametres/AssuranceTab'
import ComptabiliteTab from '@/components/parametres/ComptabiliteTab'

type Tab = 'classes' | 'secteurs' | 'exercices' | 'tarifs' | 'tranches' | 'reductions_fn' | 'modes_reglement' | 'config_reduction' | 'config_paiement' | 'commission' | 'sepa' | 'notifications' | 'frais_inscription' | 'documents_ecole' | 'documents_inscription' | 'services' | 'comptes_acces' | 'integrations' | 'relances' | 'options_enfant' | 'assurance' | 'comptabilite'
type Cat = 'ecole' | 'inscriptions' | 'finances' | 'communication'

const CATEGORIES: { id: Cat; label: string; icon: string; couleur: string; bg: string }[] = [
  { id: 'ecole',         label: 'École',          icon: '🏫', couleur: '#2563EB', bg: '#EFF6FF' },
  { id: 'inscriptions',  label: 'Inscriptions',   icon: '📝', couleur: '#7C3AED', bg: '#F5F3FF' },
  { id: 'finances',      label: 'Finances',       icon: '💳', couleur: '#059669', bg: '#ECFDF5' },
  { id: 'communication', label: 'Communication',  icon: '📨', couleur: '#D97706', bg: '#FFFBEB' },
]

const TABS: { id: Tab; label: string; icon: string; cat: Cat }[] = [
  // ── École ──
  { id: 'classes',           label: 'Classes',              icon: '🏫', cat: 'ecole' },
  { id: 'secteurs',          label: 'Secteurs',             icon: '🗂️', cat: 'ecole' },
  { id: 'exercices',         label: 'Exercices',            icon: '📅', cat: 'ecole' },
  { id: 'comptes_acces',     label: 'Comptes & accès',      icon: '🔐', cat: 'ecole' },
  { id: 'options_enfant',    label: 'Options fiche enfant', icon: '🎒', cat: 'ecole' },
  // ── Inscriptions ──
  { id: 'tarifs',            label: 'Tarifs',               icon: '💶', cat: 'inscriptions' },
  { id: 'tranches',          label: 'Tranches de facturation', icon: '🪜', cat: 'inscriptions' },
  { id: 'frais_inscription', label: 'Frais inscription',    icon: '🧾', cat: 'inscriptions' },
  { id: 'reductions_fn',     label: 'Réd. famille',         icon: '👨‍👩‍👧', cat: 'inscriptions' },
  { id: 'config_reduction',  label: 'Dossier réduction',    icon: '📋', cat: 'inscriptions' },
  { id: 'commission',        label: 'Commission',           icon: '⚖️', cat: 'inscriptions' },
  { id: 'documents_ecole',   label: 'Documents N+1',        icon: '📂', cat: 'inscriptions' },
  { id: 'documents_inscription', label: 'Docs inscription',  icon: '📎', cat: 'inscriptions' },
  { id: 'assurance',         label: 'Assurance scolaire',   icon: '🛡️', cat: 'inscriptions' },
  // ── Finances ──
  { id: 'modes_reglement',   label: 'Modes de règlement',   icon: '💳', cat: 'finances' },
  { id: 'comptabilite',      label: 'Comptabilité',         icon: '📒', cat: 'finances' },
  { id: 'config_paiement',   label: 'Config paiement',      icon: '⏰', cat: 'finances' },
  { id: 'sepa',              label: 'SEPA / Banque',        icon: '🏦', cat: 'finances' },
  { id: 'integrations',      label: 'Intégrations',         icon: '🔌', cat: 'finances' },
  { id: 'relances',          label: 'Relances impayés',     icon: '🔔', cat: 'finances' },
  // ── Communication ──
  { id: 'notifications',     label: 'Notifications',        icon: '🔔', cat: 'communication' },
  { id: 'services',          label: 'Services / Messagerie',icon: '💬', cat: 'communication' },
]

function catOfTab(t: Tab): Cat {
  return TABS.find(x => x.id === t)?.cat ?? 'ecole'
}

export default function ParametresPage() {
  const ecole = useEcole()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  // llll2 (fix revue Fable) : accepter TOUT onglet valide passe en ?tab= (avant :
  // ?tab=documents_ecole tombait sur 'classes'). 'inscriptions' = alias historique -> tarifs.
  const initTab: Tab = tabParam === 'inscriptions' ? 'tarifs'
    : (tabParam && TABS.some(t => t.id === tabParam)) ? (tabParam as Tab)
    : 'classes'
  const [tab, setTab] = useState<Tab>(initTab)
  const [cat, setCat] = useState<Cat>(catOfTab(initTab))
  // ────────────────────────────────────────────────────────────────────────
  // tttt2 : cet écran écrivait sur la MAUVAISE ANNÉE.
  //
  // Il s'initialisait sur ANNEE_COURANTE, calculée à partir de la DATE DU JOUR
  // (règle septembre-août). En juin comme en juillet 2026, cette règle renvoie
  // « 2025-2026 » — alors que l'année qu'on prépare est 2026-2027. Le sélecteur
  // n'était relié à rien et se réinitialisait à chaque ouverture de la page.
  //
  // Conséquence constatée en production : les 14 questions du dossier de
  // réduction, les 5 documents à fournir, les 5 barèmes famille nombreuse et
  // un tarif de tranche sont partis sur 2025-2026 sans le moindre
  // avertissement. La réduction famille nombreuse n'a donc été appliquée à
  // personne, et cinq familles ont été surfacturées de 960 EUR.
  //
  // On suit désormais l'exercice choisi dans le bandeau du haut, comme tous
  // les autres écrans (useAnneeScolaireActive). Un choix manuel dans le
  // sélecteur local reste possible et n'est plus écrasé par le contexte.
  // ────────────────────────────────────────────────────────────────────────
  const anneeActive = useAnneeScolaireActive()
  const [annee, setAnnee] = useState(anneeActive)
  const choixManuel = useRef(false)
  useEffect(() => {
    if (!choixManuel.current) setAnnee(anneeActive)
  }, [anneeActive])
  const [anneesDispo, setAnneesDispo] = useState<string[]>([])
  // ssss2-C : l'onglet Comptabilité touche à l'argent, il suit le verrou financier
  // transversal comme les autres écrans finance (cf. src/lib/acces-finances.tsx).
  const { acces: accesFinances } = useAccesFinances()

  useEffect(() => {
    if (!ecole?.id) return
    const s = createClient()
    s.from('exercices').select('code').eq('ecole_id', ecole.id).order('code').then(({ data }) => {
      const codes = Array.from(new Set((data || []).map((r: any) => r.code).filter(Boolean))) as string[]
      if (codes.length) setAnneesDispo(codes)
    })
  }, [ecole?.id])

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  const sousOnglets = TABS.filter(t => t.cat === cat && (t.id !== 'comptabilite' || accesFinances))
  const catActive = CATEGORIES.find(c => c.id === cat)!

  // Onglets qui sont en réalité des pages séparées (route dédiée)
  const EXTERNAL_PAGES: Partial<Record<Tab, string>> = {
    exercices: 'exercices',
    integrations: 'integrations',
    relances: 'relances',
  }

  function chooseCat(newCat: Cat) {
    setCat(newCat)
    const first = TABS.find(t => t.cat === newCat)
    if (first) {
      if (EXTERNAL_PAGES[first.id]) { router.push(`/${ecole.slug}/parametres/${EXTERNAL_PAGES[first.id]}`); return }
      setTab(first.id)
    }
  }

  function chooseTab(t: Tab) {
    if (EXTERNAL_PAGES[t]) { router.push(`/${ecole.slug}/parametres/${EXTERNAL_PAGES[t]}`); return }
    setTab(t)
    setCat(catOfTab(t))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Paramètres</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{ecole.nom}</p>
        </div>
        {['tarifs', 'reductions_fn', 'config_reduction', 'config_paiement', 'frais_inscription', 'documents_ecole', 'documents_inscription'].includes(tab) && (
          <div style={{ textAlign: 'right' }}>
            <label style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 4, fontWeight: 600 }}>
              Vous configurez l&apos;année
            </label>
            <select
              value={annee}
              onChange={e => { choixManuel.current = true; setAnnee(e.target.value) }}
              style={{
                ...inp, width: 'auto', fontWeight: 700,
                // Année différente de l'exercice sélectionné : on le montre.
                color: annee === anneeActive ? '#1E293B' : '#B45309',
                borderColor: annee === anneeActive ? '#E2E8F0' : '#F59E0B',
                background: annee === anneeActive ? '#F8FAFC' : '#FFFBEB',
              }}>
              {(() => {
                const list = anneesDispo.length > 0 ? anneesDispo : [annee]
                const withCurrent = annee && !list.includes(annee) ? [...list, annee] : list
                return withCurrent.map(code => <option key={code} value={code}>{code}</option>)
              })()}
            </select>
          </div>
        )}
      </div>

      {/* tttt2 : avertissement quand on écrit sur une autre année que l'exercice
          sélectionné en haut de l'application. C'est exactement le scénario qui a
          fait partir toute la configuration sur 2025-2026 sans que personne le voie. */}
      {['tarifs', 'reductions_fn', 'config_reduction', 'config_paiement', 'frais_inscription', 'documents_ecole', 'documents_inscription'].includes(tab)
        && annee !== anneeActive && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10,
          padding: '12px 14px', fontSize: 13, color: '#92400E', lineHeight: 1.5,
        }}>
          <strong>Attention : vous modifiez la configuration de {annee}</strong>, alors que
          l&apos;exercice sélectionné dans l&apos;application est {anneeActive}. Tout ce que vous
          enregistrez ici ne s&apos;appliquera pas à {anneeActive}.
          <button
            onClick={() => { choixManuel.current = false; setAnnee(anneeActive) }}
            style={{
              marginLeft: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid #B45309', background: '#fff', color: '#B45309',
              fontSize: 12, fontWeight: 600,
            }}>
            Revenir à {anneeActive}
          </button>
        </div>
      )}

      {/* ── Niveau 1 : grandes catégories ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {CATEGORIES.map(c => {
          const actif = c.id === cat
          return (
            <button key={c.id} onClick={() => chooseCat(c.id)}
              style={{
                background: actif ? c.bg : '#fff',
                border: `1px solid ${actif ? c.couleur : '#E2E8F0'}`,
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all 0.15s',
                boxShadow: actif ? `0 2px 8px ${c.couleur}1A` : 'none',
              }}>
              <span style={{ fontSize: 22 }}>{c.icon}</span>
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: actif ? c.couleur : '#1E293B',
              }}>{c.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Niveau 2 : sous-onglets de la catégorie active ── */}
      <div style={{
        display: 'flex', gap: 2,
        borderBottom: `2px solid ${catActive.bg}`,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {sousOnglets.map(t => {
          const actif = tab === t.id
          return (
            <button key={t.id} onClick={() => chooseTab(t.id)}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: actif ? 600 : 500,
                color: actif ? catActive.couleur : '#64748B',
                borderBottom: actif ? `2px solid ${catActive.couleur}` : '2px solid transparent',
                marginBottom: -2,
                whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}>
              <span style={{ fontSize: 15 }}>{t.icon}</span> {t.label}
            </button>
          )
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, minHeight: 300 }}>
        {tab === 'secteurs' && <SecteursTab ecoleId={ecole.id} />}
        {tab === 'tarifs' && <TarifsTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'tranches' && <TranchesTab ecoleId={ecole.id} />}
        {tab === 'reductions_fn' && <ReductionsFNTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'comptabilite' && (accesFinances
          ? <ComptabiliteTab ecoleId={ecole.id} />
          : <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Accès finances non accordé. Le paramétrage comptable est réservé aux comptes disposant de l&apos;accès aux finances.</div>)}
        {tab === 'modes_reglement' && <ModesReglementTab ecoleId={ecole.id} />}
        {tab === 'classes' && <ClassesTab ecoleId={ecole.id} />}
        {tab === 'config_reduction' && <ConfigReductionTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'options_enfant' && <OptionsEnfantTab ecoleId={ecole.id} />}
        {tab === 'assurance' && <AssuranceTab ecoleId={ecole.id} />}
        {tab === 'config_paiement' && <ConfigPaiementTab ecoleId={ecole.id} />}
        {tab === 'commission' && <CommissionTab ecoleId={ecole.id} />}
        {tab === 'sepa' && <SEPATab ecoleId={ecole.id} />}
        {tab === 'frais_inscription' && <FraisInscriptionTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'documents_ecole' && <DocumentsEcoleTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'documents_inscription' && <DocumentsInscriptionTab ecoleId={ecole.id} annee={annee} />}
        {tab === 'services' && <ServicesTab ecoleId={ecole.id} />}
        {tab === 'notifications' && <NotificationsTab ecoleId={ecole.id} />}
        {tab === 'comptes_acces' && <ComptesAccesTab ecoleSlug={ecole.slug} />}
      </div>
    </div>
  )
}

// ── CONFIG DOSSIER RÉDUCTION ──

// ── CONFIG PAIEMENT ──

// ── SECTEURS (établissements / secteurs : nom, code, préfixe de facture) ──

// ── TARIFS (inchangé) ──
// ── TRANCHES DE FACTURATION ──

// ── RÉDUCTIONS FAMILLE NOMBREUSE ──

// ── MODES RÈGLEMENT ──

// ── CLASSES ──

// ── COMMISSION ──

// ── SEPA / BANQUE ──

// ── NOTIFICATIONS ──

// ── FRAIS INSCRIPTION / RÉINSCRIPTION ──

// ── DOCUMENTS ÉCOLE PUBLICS (circulaire, liste affaires, etc.) ──
// ── SERVICES & MESSAGERIE ──

// ── COMPTES & ACCÈS ──

// ── DOCUMENTS À FOURNIR (INSCRIPTION NOUVEL ENFANT) ──
