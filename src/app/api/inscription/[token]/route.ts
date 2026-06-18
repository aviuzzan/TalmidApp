import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * API publique de la demande d'inscription (acces par token, sans compte).
 * GET  : valide le token, renvoie les infos ecole + secteurs + classes + etat de la demande.
 * POST : enregistre les champs remplis par le parent, passe la demande en statut 'en_attente'.
 *
 * Utilise le client service-role : le prospect n'a pas de session Supabase.
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = params.token
    if (!token) return NextResponse.json({ error: 'Lien invalide' }, { status: 400 })

    const s = admin()
    const { data: demande } = await s
      .from('demandes_inscription')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (!demande) return NextResponse.json({ error: 'Lien invalide ou expire' }, { status: 404 })

    const { data: ecole } = await s
      .from('ecoles')
      .select('id, nom, slug, couleur_primaire, logo_url')
      .eq('id', demande.ecole_id)
      .single()

    const [{ data: secteurs }, { data: classes }] = await Promise.all([
      s.from('secteurs').select('id, nom').eq('ecole_id', demande.ecole_id).eq('actif', true).order('ordre'),
      s.from('classes').select('id, nom, secteur_id').eq('ecole_id', demande.ecole_id).order('nom'),
    ])

    return NextResponse.json({
      ecole: ecole || null,
      annee_scolaire: demande.annee_scolaire,
      statut: demande.statut,
      email_invite: demande.email_invite,
      dejaTraitee: demande.statut === 'accepte' || demande.statut === 'refuse',
      dejaSoumise: demande.statut === 'en_attente',
      secteurs: secteurs || [],
      classes: classes || [],
      // Pre-remplissage si le parent revient sur le formulaire avant traitement
      demande: {
        nom_famille: demande.nom_famille,
        situation_maritale: demande.situation_maritale,
        parent1_prenom: demande.parent1_prenom,
        parent1_nom: demande.parent1_nom,
        parent1_email: demande.parent1_email,
        parent1_telephone: demande.parent1_telephone,
        parent1_emploi: demande.parent1_emploi,
        parent1_adresse: demande.parent1_adresse,
        parent1_code_postal: demande.parent1_code_postal,
        parent1_ville: demande.parent1_ville,
        parent2_prenom: demande.parent2_prenom,
        parent2_nom: demande.parent2_nom,
        parent2_email: demande.parent2_email,
        parent2_telephone: demande.parent2_telephone,
        parent2_emploi: demande.parent2_emploi,
        parent2_adresse: demande.parent2_adresse,
        parent2_code_postal: demande.parent2_code_postal,
        parent2_ville: demande.parent2_ville,
        enfant_prenom: demande.enfant_prenom,
        enfant_deuxieme_prenom: demande.enfant_deuxieme_prenom,
        enfant_nom: demande.enfant_nom,
        enfant_genre: demande.enfant_genre,
        enfant_date_naissance: demande.enfant_date_naissance,
        enfant_lieu_naissance: demande.enfant_lieu_naissance,
        secteur_souhaite_id: demande.secteur_souhaite_id,
        classe_souhaitee: demande.classe_souhaitee,
        date_entree_souhaitee: demande.date_entree_souhaitee,
        deja_scolarise: demande.deja_scolarise,
        etablissement_precedent: demande.etablissement_precedent,
        transport: demande.transport,
        instruction_religieuse: demande.instruction_religieuse,
        etude_garderie: demande.etude_garderie,
        signes_particuliers: demande.signes_particuliers,
        medecin_nom: demande.medecin_nom,
        medecin_telephone: demande.medecin_telephone,
        urgence_1_nom: demande.urgence_1_nom,
        urgence_1_tel: demande.urgence_1_tel,
        urgence_1_lien: demande.urgence_1_lien,
        urgence_2_nom: demande.urgence_2_nom,
        urgence_2_tel: demande.urgence_2_tel,
        urgence_2_lien: demande.urgence_2_lien,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = params.token
    if (!token) return NextResponse.json({ error: 'Lien invalide' }, { status: 400 })

    const body = await req.json()
    const s = admin()

    const { data: demande } = await s
      .from('demandes_inscription')
      .select('id, statut')
      .eq('token', token)
      .maybeSingle()

    if (!demande) return NextResponse.json({ error: 'Lien invalide ou expire' }, { status: 404 })
    if (demande.statut === 'accepte' || demande.statut === 'refuse') {
      return NextResponse.json({ error: 'Cette demande a deja ete traitee par l\'etablissement.' }, { status: 409 })
    }

    // Validation minimale
    const req_fields = ['enfant_prenom', 'enfant_nom', 'enfant_date_naissance', 'enfant_genre', 'classe_souhaitee', 'parent1_prenom', 'parent1_nom', 'parent1_email']
    for (const f of req_fields) {
      if (!body[f] || String(body[f]).trim() === '') {
        return NextResponse.json({ error: 'Champ obligatoire manquant : ' + f }, { status: 400 })
      }
    }

    const str = (v: any) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim())
    const bool = (v: any) => v === true || v === 'true'

    const payload = {
      nom_famille: str(body.nom_famille) || str(body.parent1_nom),
      situation_maritale: str(body.situation_maritale),
      parent1_prenom: str(body.parent1_prenom),
      parent1_nom: str(body.parent1_nom),
      parent1_email: str(body.parent1_email),
      parent1_telephone: str(body.parent1_telephone),
      parent1_emploi: str(body.parent1_emploi),
      parent1_adresse: str(body.parent1_adresse),
      parent1_code_postal: str(body.parent1_code_postal),
      parent1_ville: str(body.parent1_ville),
      parent2_prenom: str(body.parent2_prenom),
      parent2_nom: str(body.parent2_nom),
      parent2_email: str(body.parent2_email),
      parent2_telephone: str(body.parent2_telephone),
      parent2_emploi: str(body.parent2_emploi),
      parent2_adresse: str(body.parent2_adresse),
      parent2_code_postal: str(body.parent2_code_postal),
      parent2_ville: str(body.parent2_ville),
      enfant_prenom: str(body.enfant_prenom),
      enfant_deuxieme_prenom: str(body.enfant_deuxieme_prenom),
      enfant_nom: str(body.enfant_nom),
      enfant_genre: str(body.enfant_genre),
      enfant_date_naissance: str(body.enfant_date_naissance),
      enfant_lieu_naissance: str(body.enfant_lieu_naissance),
      secteur_souhaite_id: str(body.secteur_souhaite_id),
      classe_souhaitee: str(body.classe_souhaitee),
      date_entree_souhaitee: str(body.date_entree_souhaitee),
      deja_scolarise: bool(body.deja_scolarise),
      etablissement_precedent: str(body.etablissement_precedent),
      transport: bool(body.transport),
      instruction_religieuse: bool(body.instruction_religieuse),
      etude_garderie: bool(body.etude_garderie),
      signes_particuliers: str(body.signes_particuliers),
      medecin_nom: str(body.medecin_nom),
      medecin_telephone: str(body.medecin_telephone),
      urgence_1_nom: str(body.urgence_1_nom),
      urgence_1_tel: str(body.urgence_1_tel),
      urgence_1_lien: str(body.urgence_1_lien),
      urgence_2_nom: str(body.urgence_2_nom),
      urgence_2_tel: str(body.urgence_2_tel),
      urgence_2_lien: str(body.urgence_2_lien),
      statut: 'en_attente',
      soumis_le: new Date().toISOString(),
    }

    const { error: updErr } = await s
      .from('demandes_inscription')
      .update(payload)
      .eq('id', demande.id)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // Notif admin (best-effort)
    try {
      const { data: dem } = await s.from('demandes_inscription').select('ecole_id').eq('id', demande.id).single()
      if (dem?.ecole_id) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
        await fetch(`${baseUrl}/api/notify-admin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ecole_id: dem.ecole_id,
            type: 'demande_inscription',
            info: {
              nom_famille: payload.nom_famille,
              parent1_prenom: payload.parent1_prenom,
              parent1_nom: payload.parent1_nom,
              enfant_prenom: payload.enfant_prenom,
              enfant_nom: payload.enfant_nom,
            },
          }),
        })
      }
    } catch {}

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
