/**
 * Export FEC (Fichier d'Échanges Comptables) — réglementation France BOFIP-BIC-DECLA-30-10-20-40.
 * Format : 18 colonnes séparées par tabulation, encodage UTF-8.
 *
 * Génère les écritures comptables à partir des factures + règlements + avoirs sur la période demandée.
 *
 * GET /api/compta/fec?ecole_id=...&debut=2025-09-01&fin=2026-08-31
 */
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Plan comptable simplifié
const COMPTE = {
  CLIENT: '411',          // Clients
  SCOLARITE: '706',       // Prestations de services - scolarité
  TVA_COLLECTEE: '4457',  // TVA collectée (école normalement non assujettie, à 0)
  BANQUE: '512',          // Banque
  CAISSE: '530',          // Caisse
  AVOIR_CLIENT: '4191',   // Avoirs clients
  CONTREPARTIE_ANNULE: '658',  // Charges diverses (annulations)
}

function formatDate(d: string): string {
  return d.replace(/-/g, '')
}
function formatMontant(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
function escape(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/[\t\n\r]/g, ' ')
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const ecole_id = url.searchParams.get('ecole_id')
    const debut = url.searchParams.get('debut')
    const fin = url.searchParams.get('fin')

    if (!ecole_id || !debut || !fin) {
      return NextResponse.json({ error: 'ecole_id, debut, fin requis (YYYY-MM-DD)' }, { status: 400 })
    }

    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérif droits
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await supa.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: profile } = await supa.from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Récupération données
    // FIX audit 24/07/2026 :
    //  - filtre ecole_id sur les 3 requetes (service-role bypasse la RLS : sans
    //    filtre, le FEC contenait les ecritures de TOUTES les ecoles)
    //  - mode_paiement (colonne reelle) au lieu de mode (inexistante)
    //  - exclusion des reglements mode_paiement='avoir' des flux BQ (imputations
    //    d'avoir, deja comptabilisees via l'ecriture OD de l'avoir : les inclure
    //    ferait un double comptage)
    //  - exclusion des avoirs annules
    const [{ data: ecole }, { data: factures }, { data: reglements }, { data: avoirs }] = await Promise.all([
      supa.from('ecoles').select('nom, siret').eq('id', ecole_id).single(),
      supa.from('factures')
        .select('id, numero, date_emission, statut, famille_id, familles!inner(nom, numero, parent1_nom, parent1_prenom, ecole_id), facture_lignes(montant, description)')
        .eq('familles.ecole_id', ecole_id)
        .gte('date_emission', debut).lte('date_emission', fin),
      supa.from('reglements')
        .select('id, date_reglement, montant, mode_paiement, reference, factures!inner(numero, famille_id, familles!inner(nom, numero, ecole_id))')
        .eq('factures.familles.ecole_id', ecole_id)
        .neq('mode_paiement', 'avoir')
        .gte('date_reglement', debut).lte('date_reglement', fin),
      supa.from('avoirs')
        .select('id, numero, date_emission, montant, motif, statut, famille_id, familles!inner(nom, numero, ecole_id)')
        .eq('familles.ecole_id', ecole_id)
        .neq('statut', 'annule')
        .gte('date_emission', debut).lte('date_emission', fin),
    ])

    const lines: string[] = []
    // En-tête (18 colonnes)
    lines.push([
      'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
      'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
      'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
      'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
    ].join('\t'))

    let ecritureNum = 1

    // 1. Écritures de facturation (VE - ventes)
    for (const f of (factures || []) as any[]) {
      if (f.statut === 'annule') continue
      const total = (f.facture_lignes || []).reduce((s: number, l: any) => s + Number(l.montant), 0)
      if (total <= 0) continue
      const date = formatDate(f.date_emission || debut)
      const aux = `F-${(f.familles?.numero || f.famille_id || '').toString().substring(0, 20)}`
      const auxLib = `${f.familles?.parent1_nom || ''} ${f.familles?.parent1_prenom || ''}`.trim() || f.familles?.nom || ''
      const ref = f.numero || ''
      const lib = `Facture ${ref} - ${auxLib}`
      const num = String(ecritureNum++).padStart(6, '0')

      // Débit client 411
      lines.push([
        'VE', 'Ventes', num, date,
        COMPTE.CLIENT, 'Clients', aux, escape(auxLib),
        escape(ref), date, escape(lib), formatMontant(total), '0,00',
        '', '', date, '0,00', 'EUR',
      ].join('\t'))
      // Crédit 706 scolarité
      lines.push([
        'VE', 'Ventes', num, date,
        COMPTE.SCOLARITE, 'Scolarité - Prestations', '', '',
        escape(ref), date, escape(lib), '0,00', formatMontant(total),
        '', '', date, '0,00', 'EUR',
      ].join('\t'))
    }

    // 2. Écritures de règlement (BQ - banque)
    // Les règlements mode_paiement='avoir' sont exclus en amont (imputations, pas des flux).
    for (const r of (reglements || []) as any[]) {
      const date = formatDate(r.date_reglement || debut)
      const num = String(ecritureNum++).padStart(6, '0')
      const aux = `F-${(r.factures?.familles?.numero || r.factures?.famille_id || '').toString().substring(0, 20)}`
      const auxLib = r.factures?.familles?.nom || ''
      const ref = r.reference || r.factures?.numero || `R-${r.id.substring(0, 8)}`
      const modePaiement = String(r.mode_paiement || '').toLowerCase()
      const lib = `Règlement ${modePaiement || ''} - ${r.factures?.numero || ''}`
      const compteEncaiss = modePaiement === 'especes' ? COMPTE.CAISSE : COMPTE.BANQUE
      const m = Number(r.montant)

      lines.push([
        'BQ', 'Banque', num, date,
        compteEncaiss, modePaiement === 'especes' ? 'Caisse' : 'Banque', '', '',
        escape(ref), date, escape(lib), formatMontant(m), '0,00',
        '', '', date, '0,00', 'EUR',
      ].join('\t'))
      lines.push([
        'BQ', 'Banque', num, date,
        COMPTE.CLIENT, 'Clients', aux, escape(auxLib),
        escape(ref), date, escape(lib), '0,00', formatMontant(m),
        '', '', date, '0,00', 'EUR',
      ].join('\t'))
    }

    // 3. Avoirs (OD - opérations diverses)
    for (const a of (avoirs || []) as any[]) {
      const date = formatDate(a.date_emission || debut)
      const num = String(ecritureNum++).padStart(6, '0')
      const aux = `F-${(a.familles?.numero || a.famille_id || '').toString().substring(0, 20)}`
      const auxLib = a.familles?.nom || ''
      const ref = a.numero || ''
      const lib = `Avoir ${ref} - ${a.motif || ''}`
      const m = Number(a.montant)
      lines.push([
        'OD', 'Opérations diverses', num, date,
        COMPTE.AVOIR_CLIENT, 'Avoirs clients', aux, escape(auxLib),
        escape(ref), date, escape(lib), '0,00', formatMontant(m),
        '', '', date, '0,00', 'EUR',
      ].join('\t'))
      lines.push([
        'OD', 'Opérations diverses', num, date,
        COMPTE.SCOLARITE, 'Scolarité - Prestations', '', '',
        escape(ref), date, escape(lib), formatMontant(m), '0,00',
        '', '', date, '0,00', 'EUR',
      ].join('\t'))
    }

    // Filename FEC standard : SIREN_FECYYYYMMDD.txt
    const siret = (ecole?.siret || '').replace(/\s/g, '') || '000000000'
    const siren = siret.substring(0, 9) || '000000000'
    const finStr = fin.replace(/-/g, '')
    const filename = `${siren}FEC${finStr}.txt`

    const content = lines.join('\r\n') + '\r\n'

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}
