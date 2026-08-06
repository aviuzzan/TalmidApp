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

    const { ecoleId, dateEncaissement, anneeScolaire, dateStr: dateStrBody } = await req.json()

    // Vérifier que l'appelant est admin
    // FIX secu 27/07 : le select inclut ecole_id pour le check tenant
    const { data: profile } = await supabase.from('profiles').select('role, ecole_id, acces_finances').eq('id', user.id).single()
    if (!['admin', 'super_admin', 'agent'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    // FIX secu 27/07 : check tenant — un admin ne peut générer le SEPA que pour sa propre école
    if (profile?.role !== 'super_admin' && profile?.ecole_id !== ecoleId) {
      return NextResponse.json({ error: 'Accès refusé à cette école' }, { status: 403 })
    }
    // llll2 : le verrou finances vaut aussi cote API (pas juste dans l'UI)
    if (profile?.role !== 'super_admin' && profile?.acces_finances === false) {
      return NextResponse.json({ error: 'Accès finances non accordé' }, { status: 403 })
    }

    // Récupérer les infos de l'école (ICS, créancier, IBAN école)
    const { data: ecole } = await supabase.from('ecoles').select('nom, ics_sepa, nom_creancier, iban_ecole, bic_ecole').eq('id', ecoleId).single()
    if (!ecole) return NextResponse.json({ error: 'École introuvable' }, { status: 404 })

    // Récupérer tous les chèques SEPA pour cette date.
    //
    // AUDIT P1 (06/08/2026) : cette route reconstruisait la date à partir du MOIS
    // COURANT du serveur + le jour reçu, en ignorant le `dateStr` que l'écran
    // envoyait déjà. Exporter un mois futur (ou passé) depuis l'écran générait donc
    // le fichier du mois courant — mauvaises échéances marquées « exporté », fichier
    // bancaire faux. La date exacte choisie à l'écran est désormais la référence.
    let dateStr: string
    if (typeof dateStrBody === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStrBody)) {
      dateStr = dateStrBody
    } else if (dateEncaissement != null) {
      // Compat ancien client : jour seul → mois courant (comportement historique).
      const today = new Date()
      dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(dateEncaissement).padStart(2, '0')}`
    } else {
      return NextResponse.json({ error: 'Date de prélèvement manquante ou invalide' }, { status: 400 })
    }

    const { data: cheques, error: chequesErr } = await supabase
      .from('cheques_prevus')
      .select('*, familles(nom, parent1_prenom, parent1_nom)')
      .eq('ecole_id', ecoleId)
      .eq('date_echeance', dateStr)
      .eq('mode_paiement', 'sepa')
      .eq('statut', 'prevu')

    // FIX audit RLS 29/07/2026 : ne pas transformer une lecture refusee en
    // « aucun prelevement » (message trompeur pour l'utilisateur).
    if (chequesErr) {
      console.error('[sepa] lecture cheques_prevus failed:', chequesErr.message)
      return NextResponse.json({ error: 'Lecture des échéances impossible : ' + chequesErr.message }, { status: 500 })
    }

    if (!cheques?.length) {
      return NextResponse.json({ error: 'Aucun prélèvement SEPA pour cette date' }, { status: 404 })
    }

    // Récupérer les mandats pour chaque famille
    const familleIds = Array.from(new Set(cheques.map(c => c.famille_id)))
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
    const icsCreancier = ecole.ics_sepa || ''
    const nomCreancier = ecole.nom_creancier || ecole.nom || 'ECOLE'
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
    //
    // FIX audit RLS 29/07/2026 : ce marquage n'etait pas verifie alors que le
    // fichier SEPA partait quand meme au client. Si le marquage echoue, les
    // memes echeances restent au statut 'prevu' et repartent au prochain export
    // → DOUBLE PRELEVEMENT chez les familles. On ne renvoie donc le XML que si
    // le marquage est confirme ligne par ligne (le .select() renvoie les lignes
    // reellement modifiees : une policy qui filtre silencieusement est detectee).
    const idsAMarquer = chequesAvecMandat.map(c => c.id)
    // Le filtre `.eq('statut', 'prevu')` rend le marquage atomique vis-a-vis d'un
    // export concurrent : deux exports simultanes lisent les memes echeances, mais
    // un seul reussit a les faire passer de 'prevu' a 'exporte'. Le second ne
    // recupere alors pas toutes les lignes attendues et est rejete par le controle
    // ci-dessous (sinon : deux fichiers XML avec les memes transactions).
    const { data: marques, error: marqueErr } = await supabase.from('cheques_prevus')
      .update({ statut: 'exporte' })
      .in('id', idsAMarquer)
      .eq('statut', 'prevu')
      .select('id')

    if (marqueErr) {
      console.error('[sepa] marquage exporte failed:', marqueErr.message)
      return NextResponse.json({
        error: 'Fichier NON généré : les échéances n\'ont pas pu être marquées comme exportées (' + marqueErr.message + '). Sans ce marquage elles repartiraient au prochain export (risque de double prélèvement).',
      }, { status: 500 })
    }
    if ((marques?.length || 0) !== idsAMarquer.length) {
      console.error(`[sepa] marquage partiel : ${marques?.length || 0}/${idsAMarquer.length} échéances marquées`)
      // Remise a 'prevu' des lignes effectivement marquees : le fichier n'etant
      // pas envoye, les laisser en 'exporte' ferait sauter ces prelevements.
      let annule = true
      const idsMarques = (marques || []).map((m: any) => m.id)
      if (idsMarques.length > 0) {
        const { error: revertErr } = await supabase.from('cheques_prevus')
          .update({ statut: 'prevu' })
          .in('id', idsMarques)
        if (revertErr) {
          annule = false
          console.error('[sepa] rollback marquage failed:', revertErr.message)
        }
      }
      return NextResponse.json({
        error: `Fichier NON généré : seules ${marques?.length || 0} échéance(s) sur ${idsAMarquer.length} ont pu être marquées comme exportées.` +
          (annule
            ? ' Le marquage partiel a été annulé, aucune échéance n\'a bougé. Corriger les droits puis relancer.'
            : ` ATTENTION : l'annulation du marquage partiel a échoué — ${idsMarques.length} échéance(s) sont restées au statut « exporté » sans fichier. Les repasser manuellement en « prévu ».`),
      }, { status: 500 })
    }

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
