'use client'

export default function PortailDocumentsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>Documents</h1>
        <p style={{ color: '#64748B', fontSize: 13 }}>Vos documents et justificatifs</p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ color: '#475569', fontSize: 14, marginBottom: 8 }}>Module documents bientôt disponible</div>
        <div style={{ color: '#94A3B8', fontSize: 13 }}>Vous pourrez bientôt envoyer vos justificatifs directement ici</div>
      </div>
    </div>
  )
}
