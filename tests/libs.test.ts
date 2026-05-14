import { describe, it, expect, beforeAll } from 'vitest'

/**
 * Tests unitaires des libs pures TalmidApp.
 * Couvre : crypto (chiffrement), brevo (téléphone/template), lsu (XML),
 * dsn (cotisations), education-nationale (CSV).
 */

// MASTER_ENCRYPTION_KEY de test (32 bytes hex) — défini avant tout import de crypto
beforeAll(() => {
  process.env.MASTER_ENCRYPTION_KEY = '0'.repeat(64)
})

// ============================================================
// lib/crypto.ts
// ============================================================
describe('crypto — AES-256-GCM', () => {
  it('encrypt puis decrypt restitue la valeur d\'origine', async () => {
    const { encrypt, decrypt } = await import('../src/lib/crypto')
    const secret = 'sk_live_abcdef1234567890'
    const cipher = encrypt(secret)
    expect(cipher).not.toBeNull()
    expect(cipher).not.toBe(secret)
    expect(cipher!.split(':').length).toBe(3) // iv:ciphertext:tag
    expect(decrypt(cipher)).toBe(secret)
  })

  it('encrypt produit un résultat différent à chaque appel (IV aléatoire)', async () => {
    const { encrypt } = await import('../src/lib/crypto')
    const a = encrypt('meme-valeur')
    const b = encrypt('meme-valeur')
    expect(a).not.toBe(b)
  })

  it('decrypt retourne null sur une entrée corrompue', async () => {
    const { decrypt } = await import('../src/lib/crypto')
    expect(decrypt('nimporte:quoi:invalide')).toBeNull()
    expect(decrypt(null)).toBeNull()
    expect(decrypt('')).toBeNull()
  })

  it('encrypt retourne null sur entrée vide', async () => {
    const { encrypt } = await import('../src/lib/crypto')
    expect(encrypt('')).toBeNull()
    expect(encrypt(null)).toBeNull()
  })

  it('lastChars retourne les n derniers caractères', async () => {
    const { lastChars } = await import('../src/lib/crypto')
    expect(lastChars('sk_live_XYZ9', 4)).toBe('XYZ9')
    expect(lastChars('ab', 4)).toBe('ab')
    expect(lastChars(null)).toBe('')
  })
})

// ============================================================
// lib/brevo.ts
// ============================================================
describe('brevo — normalizePhoneFR', () => {
  it('normalise un numéro français 0X en +33', async () => {
    const { normalizePhoneFR } = await import('../src/lib/brevo')
    expect(normalizePhoneFR('0612345678')).toBe('+33612345678')
    expect(normalizePhoneFR('06 12 34 56 78')).toBe('+33612345678')
    expect(normalizePhoneFR('06.12.34.56.78')).toBe('+33612345678')
  })

  it('garde un numéro déjà en +33', async () => {
    const { normalizePhoneFR } = await import('../src/lib/brevo')
    expect(normalizePhoneFR('+33612345678')).toBe('+33612345678')
  })

  it('convertit le préfixe 33 sans +', async () => {
    const { normalizePhoneFR } = await import('../src/lib/brevo')
    expect(normalizePhoneFR('33612345678')).toBe('+33612345678')
  })

  it('retourne null sur un numéro invalide', async () => {
    const { normalizePhoneFR } = await import('../src/lib/brevo')
    expect(normalizePhoneFR('123')).toBeNull()
    expect(normalizePhoneFR('')).toBeNull()
    expect(normalizePhoneFR('06123')).toBeNull()
  })
})

describe('brevo — fillTemplate', () => {
  it('remplace les variables {prenom} {nom}', async () => {
    const { fillTemplate } = await import('../src/lib/brevo')
    expect(fillTemplate('Bonjour {prenom} {nom}', { prenom: 'David', nom: 'Cohen' }))
      .toBe('Bonjour David Cohen')
  })

  it('remplace une variable absente par vide', async () => {
    const { fillTemplate } = await import('../src/lib/brevo')
    expect(fillTemplate('Salut {prenom}', {})).toBe('Salut ')
  })
})

// ============================================================
// lib/lsu.ts
// ============================================================
describe('lsu — genererLsuXml', () => {
  it('génère un XML valide structurellement', async () => {
    const { genererLsuXml } = await import('../src/lib/lsu')
    const xml = genererLsuXml({
      ecole_nom: 'Heder Test',
      code_uai: '0750123A',
      annee_scolaire: '2026-2027',
      periode: 1,
      eleves: [{
        nom: 'Cohen', prenom: 'David', date_naissance: '2015-04-12',
        classe_nom: 'CE2', moyenne_generale: 15.5, appreciation_generale: 'Bon trimestre',
        matieres: [{ nom: 'Français', moyenne: 16, appreciation: 'Très bien' }],
      }],
    })
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<livret_scolaire_unique')
    expect(xml).toContain('code_uai="0750123A"')
    expect(xml).toContain('nom_naissance="Cohen"')
    expect(xml).toContain('positionnement="A"') // moyenne 16 → A
    expect(xml).toContain('</livret_scolaire_unique>')
  })

  it('échappe les caractères spéciaux XML', async () => {
    const { genererLsuXml } = await import('../src/lib/lsu')
    const xml = genererLsuXml({
      ecole_nom: 'École & Cie <test>',
      code_uai: '', annee_scolaire: '2026-2027', periode: 1,
      eleves: [],
    })
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&lt;')
    expect(xml).not.toContain('École & Cie <test>')
  })
})

// ============================================================
// lib/dsn.ts
// ============================================================
describe('dsn — calculerCotisationsApprox', () => {
  it('calcule des cotisations cohérentes', async () => {
    const { calculerCotisationsApprox } = await import('../src/lib/dsn')
    const r = calculerCotisationsApprox(2000)
    expect(r.cotisations_salariales).toBeCloseTo(440, 0)   // 22%
    expect(r.cotisations_patronales).toBeCloseTo(840, 0)   // 42%
    expect(r.salaire_net).toBeCloseTo(1560, 0)             // brut - sal
    expect(r.salaire_net).toBeLessThan(2000)
    expect(r.net_imposable).toBeGreaterThan(r.salaire_net)
  })
})

describe('dsn — genererDsnFichier', () => {
  it('génère un fichier DSN avec les rubriques NEODES', async () => {
    const { genererDsnFichier } = await import('../src/lib/dsn')
    const f = genererDsnFichier({
      siren: '123456789', raison_sociale: 'Heder Test',
      adresse: '1 rue Test', code_postal: '75001', commune: 'Paris',
      mois: '2026-05', numero_ordre: 1,
      salaries: [{
        nir: '180057512345678', nom: 'Levy', prenoms: 'Sarah',
        date_naissance: '1980-05-01', sexe: 'F',
        salaire_brut: 2000, salaire_net: 1560,
        cotisations_salariales: 440, cotisations_patronales: 840,
        csg_crds: 195, heures: 151.67,
      }],
    })
    expect(f).toContain('S10.G00.00.001')   // version norme
    expect(f).toContain('123456789')        // siren
    expect(f).toContain('S21.G00.30.001')   // NIR salarié
    expect(f).toContain('S90.G00.90.001')   // fin
  })
})

// ============================================================
// lib/education-nationale.ts
// ============================================================
describe('education-nationale — parseCsv', () => {
  it('parse un CSV avec séparateur point-virgule', async () => {
    const { parseCsv } = await import('../src/lib/education-nationale')
    const csv = 'Nom;Prenom;Classe\nCohen;David;CE2\nLevy;Sarah;CM1'
    const { headers, rows } = parseCsv(csv)
    expect(headers).toEqual(['Nom', 'Prenom', 'Classe'])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ Nom: 'Cohen', Prenom: 'David', Classe: 'CE2' })
  })

  it('gère les valeurs entre guillemets avec séparateur interne', async () => {
    const { parseCsv } = await import('../src/lib/education-nationale')
    const csv = 'Nom;Adresse\nCohen;"12 rue; bis"'
    const { rows } = parseCsv(csv)
    expect(rows[0].Adresse).toBe('12 rue; bis')
  })
})

describe('education-nationale — genererOndeCsv', () => {
  it('génère un CSV ONDE avec en-têtes', async () => {
    const { genererOndeCsv } = await import('../src/lib/education-nationale')
    const csv = genererOndeCsv([{
      ine: '1234567890AB', nom: 'Cohen', prenoms: 'David',
      date_naissance: '2015-04-12', sexe: 'M', classe_nom: 'CE2',
      responsables: [{ lien: 'parent', nom: 'Cohen', prenom: 'Yossef' }],
    }])
    expect(csv).toContain('INE;Nom;NomUsage')
    expect(csv).toContain('Cohen')
    expect(csv).toContain('1234567890AB')
  })
})
