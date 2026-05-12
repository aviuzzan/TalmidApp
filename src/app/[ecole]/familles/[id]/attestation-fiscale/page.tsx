'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Reglement = {
  id: string
  montant: number
  date_reglement: string
  mode: string | null
  reference: string | null
  numero_facture?: string
}

export default function AttestationFiscalePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const ecole = useEcole()
  const familleId = params.id as string
  const anneeParam = parseInt(searchParams.get('annee') || String(new Date().getFullYear()))

  const [loading, setLoading] = useState(true)
  const [annee, setAnnee] = useState(anneeParam)
  const [famille, setFamille] = useState<any>(null)
  const [parents, setParents] = useState<any[]>([])
  const [enfants, setEnfants] = useState<any[]>([])
  const [reglements, setReglements] = useState<Reglement[]>([])
  const [ecoleInfo, setEcoleInfo] = useState<any>(null)

  useEffect(() => { if (familleId && ecole?.id) load() }, [familleId, ecole?.id, annee])

  async function load() {
    setLoading(true)
    const s = createClient()

    const { data: e } = await s.from('ecoles').select('*').eq('id', ecole.id).single()
    setEcoleInfo(e)

    const { data: f } = await s.from('familles').select('*').eq('id', familleId).single()
    setFamille(f)

    const { data: p } = await s.from('profiles')
      .select('prenom, nom, email')
      .eq('famille_id', familleId)
      .eq('role', 'parent')
    setParents(p || [])

    const { data: ef } = await s.from('enfants')
      .select('prenom, nom')
      .eq('famille_id', familleId)
    setEnfants(ef || [])

    const debut = `${annee}-01-01`
    const fin = `${annee}-12-31`
    const { data: regs } = await s.from('reglements')
      .select('id, montant, date_reglement, mode, reference, facture_id, factures(numero)')
      .eq('famille_id', familleId)
      .gte('date_reglement', debut)
      .lte('date_reglement', fin)
      .order('date_reglement', { ascending: true })

    setReglements((regs || []).map((r: any) => ({
      ...r,
      numero_facture: r.factures?.numero,
    })))

    setLoading(false)
  }

  function print() { window.print() }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  const total = reglements.reduce((s, r) => s + Number(r.montant), 0)
  const familleNom = famille?.nom_famille || parents[0]?.nom || '-'
  const parentNoms = parents.map(p => `${p.prenom || ''} ${p.nom || ''}`.trim()).filter(Boolean).join(' et ')
  const enfantsListe = enfants.map(e => `${e.prenom || ''} ${e.nom || ''}`.trim()).filter(Boolean).join(', ')

  return (
    <div>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: #fff !important; }
          .print-page { padding: 30mm 20mm !important; max-width: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Attestation fiscale</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '2px 0 0' }}>{familleNom}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#475569' }}>Annee :</label>
          <select value={annee} onChange={e => setAnnee(parseInt(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #E2E8F0', fontSize: 13 }}>
            {[0, 1, 2, 3, 4].map(n => {
              const y = new Date().getFullYear() - n
              return <option key={y} value={y}>{y}</option>
            })}
          </select>
          <button onClick={print}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Imprimer / PDF
          </button>
        </div>
      </div>

      <div className="print-page" style={{ background: '#fff', maxWidth: 720, margin: '0 auto', padding: 28, border: '1px solid #E2E8F0', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 30, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{ecoleInfo?.nom}</div>
            {ecoleInfo?.adresse && <div style={{ fontSize: 12, color: '#475569' }}>{ecoleInfo.adresse}</div>}
            {ecoleInfo?.code_postal && <div style={{ fontSize: 12, color: '#475569' }}>{ecoleInfo.code_postal} {ecoleInfo.ville || ''}</div>}
            {ecoleInfo?.siret && <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>SIRET : {ecoleInfo.siret}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#64748B' }}>
            <div>Edite le {new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', textAlign: 'center', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Attestation de paiement - Annee {annee}
        </h2>

        <p style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.7, marginBottom: 12 }}>
          Je soussigne(e), representant(e) de <strong>{ecoleInfo?.nom}</strong>, atteste que :
        </p>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, marginBottom: 18, fontSize: 13, lineHeight: 1.7 }}>
          {parentNoms && <div><strong>Famille :</strong> {parentNoms}</div>}
          <div><strong>Nom de famille :</strong> {familleNom}</div>
          {enfantsListe && <div><strong>Enfant(s) scolarise(s) :</strong> {enfantsListe}</div>}
        </div>

        <p style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.7, marginBottom: 12 }}>
          a verse au cours de l'annee civile <strong>{annee}</strong> a notre etablissement la somme totale de :
        </p>

        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 18, textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1E40AF' }}>{total.toFixed(2)} EUR</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
            (en lettres : {montantEnLettres(total)})
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.7, marginBottom: 18 }}>
          au titre des frais de scolarite et services annexes.
        </p>

        {reglements.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 8 }}>Detail des paiements :</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 18 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #1E293B' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Facture</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Mode</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {reglements.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '6px 8px' }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '6px 8px' }}>{r.numero_facture || '-'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.mode || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{Number(r.montant).toFixed(2)} EUR</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #1E293B', fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: '8px', textAlign: 'right' }}>TOTAL :</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{total.toFixed(2)} EUR</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: 30 }}>
          La presente attestation est delivree pour servir et faire valoir ce que de droit, notamment dans le cadre de la
          declaration fiscale du foyer.
        </p>

        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#1E293B' }}>Fait a {ecoleInfo?.ville || ''}, le {new Date().toLocaleDateString('fr-FR')}</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>Cachet et signature</div>
            <div style={{ width: 200, height: 70, marginTop: 8 }}></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function montantEnLettres(n: number): string {
  const entier = Math.floor(n)
  const centimes = Math.round((n - entier) * 100)
  let s = numEnLettres(entier) + ' euros'
  if (centimes > 0) s += ' et ' + numEnLettres(centimes) + ' centimes'
  return s
}

function numEnLettres(n: number): string {
  if (n === 0) return 'zero'
  const u = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
  const d = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']
  if (n < 17) return u[n]
  if (n < 20) return 'dix-' + u[n - 10]
  if (n < 100) {
    const diz = Math.floor(n / 10)
    const uni = n % 10
    if (diz === 7 || diz === 9) return d[diz - 1] + '-' + numEnLettres(10 + uni)
    if (uni === 0) return d[diz]
    if (uni === 1 && diz < 8) return d[diz] + '-et-un'
    return d[diz] + '-' + u[uni]
  }
  if (n < 1000) {
    const cent = Math.floor(n / 100)
    const r = n % 100
    let s = cent === 1 ? 'cent' : u[cent] + ' cent' + (r === 0 ? 's' : '')
    if (r > 0) s += ' ' + numEnLettres(r)
    return s
  }
  if (n < 1000000) {
    const mille = Math.floor(n / 1000)
    const r = n % 1000
    let s = mille === 1 ? 'mille' : numEnLettres(mille) + ' mille'
    if (r > 0) s += ' ' + numEnLettres(r)
    return s
  }
  return String(n)
}
page.tsx
