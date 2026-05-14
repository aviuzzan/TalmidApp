'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { CATEGORIES, loadPermissions, Niveau, Categorie } from '@/lib/permissions'

type ModuleInfo = {
  code: string
  nom: string
  description: string
  icone: string
  href: string
}

// Détail des modules accessibles dans chaque catégorie (avec leurs métadonnées).
// IMPORTANT : doit matcher exactement MODULES_BY_CATEGORY dans EcoleSidebar.tsx
const MODULES_PAR_CATEGORIE: Record<string, ModuleInfo[]> = {
  administration: [
    { code: 'administratif', nom: 'Familles', description: 'Liste, fiche détaillée, contacts', icone: '👨‍👩‍👧', href: 'familles' },
    { code: 'administratif', nom: 'Élèves', description: 'Liste, fiches, classes', icone: '🎓', href: 'enfants' },
    { code: 'administratif', nom: 'Comptes parents', description: 'Création et gestion des accès parents', icone: '👥', href: 'comptes-parents' },
    { code: 'inscriptions', nom: 'Inscriptions N+1', description: 'Dossiers DDR, contrats, validations', icone: '📝', href: 'inscriptions' },
  ],
  finances: [
    { code: 'facturation', nom: 'Tableau de bord', description: 'Vue d\'ensemble : KPI, encaissements, impayés', icone: '📊', href: 'finances/dashboard' },
    { code: 'facturation', nom: 'Factures', description: 'Liste, création et suivi des factures', icone: '📄', href: 'finances' },
    { code: 'facturation', nom: 'Relances impayés', description: 'Rappels, relances et mises en demeure', icone: '🔔', href: 'finances/relances' },
    { code: 'facturation', nom: 'Bordereau chèques', description: 'Préparer une remise de chèques à la banque', icone: '🧾', href: 'finances/bordereau' },
    { code: 'compta', nom: 'Compta analytique', description: 'Ventilation par centre de coût', icone: '📈', href: 'finances/analytique' },
    { code: 'compta', nom: 'Export SEPA', description: 'Générer un fichier de prélèvement bancaire', icone: '🏦', href: 'inscriptions/sepa' },
    { code: 'paye', nom: 'Paie enseignants', description: 'Bulletins de paie + déclaration DSN mensuelle', icone: '💵', href: 'paie' },
  ],
  pedagogie: [
    { code: 'pedagogie', nom: 'Programmes', description: 'Matières, cursus, objectifs', icone: '📚', href: 'pedagogie' },
    { code: 'professeurs', nom: 'Professeurs', description: 'Liste, fiches, assignations', icone: '👨‍🏫', href: 'professeurs' },
    { code: 'emplois_du_temps', nom: 'Emplois du temps', description: 'Grille hebdomadaire, conflits', icone: '📅', href: 'emplois-du-temps' },
    { code: 'pedagogie', nom: 'Devoirs', description: 'Cahier de textes : créer et publier les devoirs', icone: '✏️', href: 'devoirs' },
    { code: 'pedagogie', nom: 'Bulletins', description: 'Génération auto trimestrielle + impression PDF', icone: '📋', href: 'bulletins' },
    { code: 'pedagogie', nom: 'Conseils de classe', description: 'Moyennes auto + rang + appréciations trimestrielles', icone: '⚖️', href: 'conseils-de-classe' },
    { code: 'pedagogie', nom: 'Notes & évaluations', description: 'Saisie des notes, contrôles, évaluations', icone: '📝', href: 'notes' },
    { code: 'pedagogie', nom: 'LSU', description: 'Livret Scolaire Unique XML pour BOEN', icone: '📑', href: 'lsu' },
    { code: 'pedagogie', nom: 'Connecteurs EN', description: 'ONDE / SIECLE / Parcoursup — exports conformes', icone: '🏛️', href: 'connecteurs-en' },
  ],
  vie_scolaire: [
    { code: 'pedagogie', nom: 'Présences / absences', description: 'Suivi quotidien, justificatifs', icone: '✅', href: 'presences' },
    { code: 'pedagogie', nom: 'Sanctions / discipline', description: 'Avertissements, conseils de discipline', icone: '⚠️', href: 'sanctions' },
    { code: 'transport', nom: 'Transport', description: 'Bus, navettes, abonnements', icone: '🚌', href: 'transport' },
    { code: 'cantine', nom: 'Cantine', description: 'Repas, paniers, allergies', icone: '🍽️', href: 'cantine' },
    { code: 'administratif', nom: 'Casiers', description: 'Attribution et suivi des casiers élèves', icone: '🔐', href: 'casiers' },
    { code: 'administratif', nom: 'Prêts de matériel', description: 'Manuels, livres, instruments, tablettes', icone: '📚', href: 'prets' },
  ],
  communication: [
    { code: 'messagerie', nom: 'Messagerie', description: 'Conversations avec les familles', icone: '💬', href: 'messages' },
    { code: 'documents', nom: 'Documents école', description: 'Bibliothèque partagée', icone: '📂', href: 'documents' },
    { code: 'messagerie', nom: 'SMS', description: 'Envoi de SMS unitaires ou en masse', icone: '📱', href: 'sms' },
    { code: 'messagerie', nom: 'Notifications push', description: 'Alertes instantanées sur les appareils', icone: '🔔', href: 'notifications-push' },
    { code: 'parametres', nom: 'Notifications', description: 'Envoi de mails groupés', icone: '📧', href: 'notifications' },
  ],
  configuration: [
    { code: 'parametres', nom: 'Paramètres école', description: 'Classes, tarifs, SEPA, etc.', icone: '⚙️', href: 'parametres' },
    { code: 'parametres', nom: 'Infos & identifiants', description: 'Coordonnées, SIREN, code UAI/RNE, académie', icone: '🏫', href: 'parametres/ecole-infos' },
    { code: 'parametres', nom: 'Intégrations', description: 'Stripe, GoCardless, Brevo SMS, YouSign', icone: '🔌', href: 'parametres/integrations' },
    { code: 'parametres', nom: 'Comptes & accès', description: 'Permissions des admins (admin principal)', icone: '🔐', href: 'parametres/comptes-acces' },
    { code: 'parametres', nom: 'Exports CSV', description: 'Exporter familles, élèves, factures', icone: '📤', href: 'exports' },
  ],
}

export default function CategoryHub({ code }: { code: string }) {
  const router = useRouter()
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('')
  const [perms, setPerms] = useState<Record<string, Niveau>>({})
  const [isAdminPrincipal, setIsAdminPrincipal] = useState(false)

  const cat: Categorie | undefined = CATEGORIES.find(c => c.code === code)
  const modules = MODULES_PAR_CATEGORIE[code] || []

  useEffect(() => {
    (async () => {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session || !ecole?.id) { setLoading(false); return }
      const { data: profile } = await s.from('profiles').select('role').eq('id', session.user.id).single()
      setRole(profile?.role || '')
      const p = await loadPermissions(s, session.user.id, ecole.id)
      setPerms(p.perms)
      setIsAdminPrincipal(p.isAdminPrincipal)
      setLoading(false)
    })()
  }, [ecole?.id])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!cat) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Catégorie inconnue</div>

  // Bypass total pour super_admin/admin/admin principal
  const bypass = role === 'super_admin' || role === 'admin' || isAdminPrincipal

  function moduleAccessible(m: ModuleInfo): { ok: boolean; niveau: Niveau } {
    if (m.code === 'parametres' && m.href.includes('comptes-acces')) {
      // Accès Comptes & accès = admin principal uniquement
      return { ok: isAdminPrincipal || role === 'super_admin', niveau: isAdminPrincipal ? 'admin' : 'aucun' }
    }
    if (bypass) return { ok: true, niveau: 'admin' }
    const n = perms[m.code] || 'aucun'
    return { ok: n !== 'aucun', niveau: n }
  }

  const accessibleCount = modules.filter(m => moduleAccessible(m).ok).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Bouton retour — pilule lisible */}
      <button onClick={() => router.push('/' + ecole.slug + '/dashboard')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
          padding: '8px 14px', fontSize: 13, color: '#1E293B', cursor: 'pointer',
          fontWeight: 500, transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
        <span style={{ fontSize: 15 }}>←</span> Tableau de bord
      </button>

      {/* Bandeau catégorie — couleur pleine de la catégorie */}
      <div style={{
        background: cat.couleur.border,
        borderRadius: 14, padding: '18px 22px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12, flexShrink: 0,
          background: 'rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>{cat.icone}</div>
        <div>
          <h1 style={{ fontSize: 23, fontWeight: 800, color: '#fff', margin: 0 }}>{cat.nom}</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '3px 0 0' }}>
            {cat.description} · {accessibleCount}/{modules.length} module{modules.length > 1 ? 's' : ''} accessible{accessibleCount > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Grille de cards — largeur égale, remplit la ligne */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {modules.map((m, i) => {
          const { ok, niveau } = moduleAccessible(m)
          const onClick = ok ? () => router.push('/' + ecole.slug + '/' + m.href) : undefined

          return (
            <div key={m.code + '-' + i} onClick={onClick}
              style={{
                background: ok ? '#fff' : '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 14, padding: 18,
                cursor: ok ? 'pointer' : 'not-allowed',
                opacity: ok ? 1 : 0.6,
                minHeight: 138,
                display: 'flex', flexDirection: 'column', gap: 10,
                transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                if (ok) {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = cat!.couleur.border
                  el.style.transform = 'translateY(-2px)'
                  el.style.boxShadow = `0 6px 16px ${cat!.couleur.border}22`
                }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = '#E2E8F0'
                el.style.transform = 'translateY(0)'
                el.style.boxShadow = 'none'
              }}>
              {/* Pastille icône */}
              <div style={{
                width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                background: ok ? cat.couleur.border : '#E2E8F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 21,
              }}>{ok ? m.icone : '🔒'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: ok ? '#1E293B' : '#64748B' }}>{m.nom}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 1.45 }}>{m.description}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {ok ? (
                  <span style={{ color: cat.couleur.border }}>Ouvrir →</span>
                ) : (
                  <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>🔒 Accès non accordé</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
