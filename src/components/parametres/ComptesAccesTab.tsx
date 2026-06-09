'use client'

export default function ComptesAccesTab({ ecoleSlug }: { ecoleSlug: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: 0 }}>Comptes administrateurs & accès modules</h2>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>
          Inviter un administrateur, définir ses permissions par module (Administratif, Facturation, Pédagogie, etc.) ou révoquer un accès existant.
        </p>
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 13, color: '#1E40AF', fontWeight: 600, marginBottom: 6 }}>🔐 Page dédiée</div>
        <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px', lineHeight: 1.5 }}>
          La gestion fine des accès se fait sur une page dédiée pour des raisons de sécurité (formulaire d&apos;invitation, attribution granulaire des permissions, révocation).
        </p>
        <a href={`/${ecoleSlug}/parametres/comptes-acces`}
          style={{ display: 'inline-block', background: '#2563EB', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600 }}>
          Ouvrir Comptes & accès →
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {[
          { titre: 'Inviter un admin', desc: 'Envoyer un mail avec un lien de création de mot de passe.' },
          { titre: 'Modules', desc: 'Administratif, Facturation, Compta, Pédagogie, Professeurs, Messagerie, Documents...' },
          { titre: 'Niveaux d&apos;accès', desc: 'Aucun · Lecture · Écriture · Admin par module.' },
          { titre: 'Révocation', desc: 'Retire les droits sur l&apos;école sans supprimer le compte utilisateur.' },
        ].map(c => (
          <div key={c.titre} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: c.titre }} />
            <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: c.desc }} />
          </div>
        ))}
      </div>
    </div>
  )
}
