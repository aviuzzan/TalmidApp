import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { ecoleId, dateEncaissement, anneeScolaire } = await req.json()

    // Vérifier que l'appelant est admin
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Récupérer les infos de l'école (ICS, créancier, IBAN école)
    const { data: ecole } = await supabase.from('ecoles').select('nom, ics_sepa, nom_creancier, iban_ecole, bic_ecole').eq('id', ecoleId).single()
    if (!ecole) return NextResponse.json({ error: 'École introuvable' }, { status: 404 })

    // Récupérer tous les chèques SEPA pour cette date
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const dateStr = `${year}-${month}-${String(dateEncaissement).padStart(2, '0')}`

    const { data: cheques } = await supabase
      .from('cheques_prevus')
      .select('*, familles(nom, parent1_prenom, parent1_nom)')
      .eq('ecole_id', ecoleId)
      .eq('date_echeance', dateStr)
      .eq('mode_paiement', 'sepa')
      .eq('statut', 'prevu')

    if (!cheques?.length) {
      return NextResponse.json({ error: 'Aucun prélèvement SEPA pour cette date' }, { status: 404 })
    }

    // Récupérer les mandats pour chaque famille
    const familleIds = [...new Set(cheques.map(c => c.famille_id))]
    const { data: mandats } = await supabase
      .from('mandats_sepa')
      .select('*')
      .in('famille_id', familleIds)
      .eq('ecole_id', ecoleId)
      .eq('actif', true)

    const mandatMap = new Map(mandats?.map(m => [m.famille_id, m]) || [])

    // Filtrer les chèques qui ont un mandat
    const chequesAvecMandat = cheques.filter(c => mandatMap.has(c.famille_id))

    if (!chequesAvecMandat.length) {
      return NextResponse.json({ error: 'Aucun mandat SEPA valide trouvé' }, { status: 404 })
    }

    const totalAmount = chequesAvecMandat.reduce((s, c) => s + parseFloat(c.montant), 0)
    const msgId = `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const creationDateTime = new Date().toISOString().slice(0, 19)
    const icsCreancier = ecole.ics_sepa || 'FR70ZZZ408187'
    const nomCreancier = ecole.nom_creancier || 'BETH LOUBAVITCH'
    const ibanCreancier = ecole.iban_ecole || ''
    const bicCreancier = ecole.bic_ecole || ''

    // Générer le XML PAIN.008.001.02
    const transactions = chequesAvecMandat.map(c => {
      const mandat = mandatMap.get(c.famille_id)!
      const nomDebiteur = c.familles?.nom || `${c.familles?.parent1_prenom || ''} ${c.familles?.parent1_nom || ''}`.trim()
      const e2eId = `E2E-${c.famille_id.slice(0, 8)}-${dateStr.replace(/-/g, '')}`
      return `      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(e2eId)}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${parseFloat(c.montant).toFixed(2)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapeXml(mandat.rum || 'MANDAT-INCONNU')}</MndtId>
            <DtOfSgntr>${mandat.date_signature || dateStr}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt>
          <FinInstnId>
            <BIC>${escapeXml(mandat.bic)}</BIC>
          </FinInstnId>
        </DbtrAgt>
        <Dbtr>
          <Nm>${escapeXml(mandat.titulaire_compte || nomDebiteur)}</Nm>
          <PstlAdr>
            <Ctry>FR</Ctry>
          </PstlAdr>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>${escapeXml(mandat.iban)}</IBAN>
          </Id>
        </DbtrAcct>
        <Purp>
          <Cd>EDUC</Cd>
        </Purp>
        <RmtInf>
          <Ustrd>SCOLARITE ${anneeScolaire || '2026-2027'} - ${escapeXml(nomDebiteur)}</Ustrd>
        </RmtInf>
      </DrctDbtTxInf>`
    }).join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${chequesAvecMandat.length}</NbOfTxs>
      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(nomCreancier)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMTINF-${dateStr.replace(/-/g, '')}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${chequesAvecMandat.length}</NbOfTxs>
      <CtrlSum>${totalAmount.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>CORE</Cd>
        </LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${dateStr}</ReqdColltnDt>
      <Cdtr>
        <Nm>${escapeXml(nomCreancier)}</Nm>
        <PstlAdr>
          <Ctry>FR</Ctry>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${escapeXml(ibanCreancier)}</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <BIC>${escapeXml(bicCreancier)}</BIC>
        </FinInstnId>
      </CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id>
          <PrvtId>
            <Othr>
              <Id>${escapeXml(icsCreancier)}</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </PrvtId>
        </Id>
      </CdtrSchmeId>
${transactions}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`

    // Marquer les chèques comme "en cours"
    await supabase.from('cheques_prevus')
      .update({ statut: 'exporte' })
      .in('id', chequesAvecMandat.map(c => c.id))

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="SEPA_${dateStr}_${Date.now()}.xml"`,
      },
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function escapeXml(str: string): string {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
