'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { CATEGORIES, MODULE_HREF, NIVEAU_LABEL, NIVEAU_COLOR, loadPermissions, hasAtLeast, Niveau, Categorie } from '@/lib/permissions'

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
    { code: 'parametres', nom: 'Intégrations', description: 'Stripe, GoCardless, Brevo SMS', icone: '🔌', href: 'parametres/integrations' },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <button onClick={() => router.push('/' + ecole.slug + '/dashboard')}
          style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
          ← Retour tableau de bord
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 13,
            background: cat.couleur.bg, color: cat.couleur.fg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>{cat.icone}</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>{cat.nom}</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: '2px 0 0' }}>
              {cat.description} · {accessibleCount}/{modules.length} module{modules.length > 1 ? 's' : ''} accessible{accessibleCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 260px))', gap: 14, justifyContent: 'center' }}>
        {modules.map((m, i) => {
          const { ok, niveau } = moduleAccessible(m)
          const onClick = ok ? () => router.push('/' + ecole.slug + '/' + m.href) : undefined
          const couleur = ok ? NIVEAU_COLOR[niveau] : NIVEAU_COLOR.aucun

          return (
            <div key={m.code + '-' + i} onClick={onClick}
              style={{
                background: ok ? '#fff' : '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 12, padding: 18,
                cursor: ok ? 'pointer' : 'not-allowed',
                opacity: ok ? 1 : 0.55,
                minHeight: 130,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => { if (ok) { (e.currentTarget as HTMLElement).style.borderColor = cat!.couleur.border; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}>
              <div>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{m.icone}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: ok ? '#1E293B' : '#64748B' }}>{m.nom}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{m.description}</div>
              </div>
              <div style={{ marginTop: 10 }}>
                {ok ? (
                  niveau !== 'aucun' && niveau !== 'admin' ? (
                    <span style={{
                      display: 'inline-block',
                      background: couleur.bg, color: couleur.fg,
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                    }}>{NIVEAU_LABEL[niveau]}</span>
                  ) : null
                ) : (
                  <span style={{ color: '#94A3B8', fontSize: 11, fontStyle: 'italic' }}>🔒 Accès non accordé</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
