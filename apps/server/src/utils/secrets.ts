import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// SECRETS DE CONNECTEUR STOCKÉS EN BASE. Jetons GLPI, clé de service Sniff, jeton HarfangLab :
// ces secrets sont RÉUTILISÉS pour s'authentifier ailleurs. ⚠️ `.secrets/` doit être sauvegardé
// comme le reste.

const PREFIXE = 'enc.v1.'
const CHEMIN_CLE = process.env.SETTINGS_KEY_FILE || '/app/.secrets/settings.key'

let cleEnCache: Buffer | null = null

function cle(): Buffer {
  if (cleEnCache) return cleEnCache
  // Fournie explicitement : elle prime, et rien n'est écrit sur disque.
  const fournie = process.env.SETTINGS_ENCRYPTION_KEY?.trim()
  const secret = fournie || lireOuEngendrer()
  // Sel fixe : il n'y a qu'une clé à dériver, et un sel aléatoire devrait être stocké quelque
  // part — ce qui déplacerait le problème sans rien résoudre.
  cleEnCache = Buffer.from(hkdfSync('sha256', secret, 'catalogue.connecteur', 'chiffrement-des-reglages', 32))
  return cleEnCache
}

/** Lit la clé du volume des secrets, ou en engendre une au premier besoin. */
function lireOuEngendrer(): string {
  try {
    const existante = readFileSync(CHEMIN_CLE, 'utf-8').trim()
    if (existante) return existante
  }
  catch { /* absente : on l'engendre juste en dessous */ }

  const engendree = randomBytes(32).toString('base64')
  try {
    mkdirSync(dirname(CHEMIN_CLE), { recursive: true })
    writeFileSync(CHEMIN_CLE, engendree + '\n', { mode: 0o600 })
    console.log(`🔑 Connecteurs : clé de chiffrement engendrée dans ${CHEMIN_CLE}. À sauvegarder avec la base.`)
    return engendree
  }
  catch (e) {
    // Volume non inscriptible : mieux vaut refuser que chiffrer avec une clé qui
    // disparaîtra au prochain redémarrage, rendant les jetons illisibles sans prévenir.
    throw new Error(
      `Impossible d'écrire la clé de chiffrement dans ${CHEMIN_CLE}. Vérifiez que .secrets est monté et inscriptible `
      + '(sous Linux : sudo chown 1001:1001 .secrets), ou fournissez SETTINGS_ENCRYPTION_KEY.',
      { cause: e },
    )
  }
}

/** Chiffre une valeur. Le résultat porte son préfixe de version, pour rester reconnaissable. */
export function chiffrer(valeur: string): string {
  const iv = randomBytes(12)
  const chiffreur = createCipheriv('aes-256-gcm', cle(), iv)
  const corps = Buffer.concat([chiffreur.update(valeur, 'utf-8'), chiffreur.final()])
  return PREFIXE + Buffer.concat([iv, chiffreur.getAuthTag(), corps]).toString('base64')
}

export function estChiffre(valeur: string | null | undefined): boolean {
  return typeof valeur === 'string' && valeur.startsWith(PREFIXE)
}

/**
 * Déchiffre une valeur, ou la rend telle quelle si elle n'est pas chiffrée.
 */
export function dechiffrer(valeur: string | null | undefined): string | null {
  if (valeur === null || valeur === undefined || valeur === '') return null
  if (!estChiffre(valeur)) return valeur

  try {
    const brut = Buffer.from(valeur.slice(PREFIXE.length), 'base64')
    const iv = brut.subarray(0, 12)
    const tag = brut.subarray(12, 28)
    const corps = brut.subarray(28)
    const dechiffreur = createDecipheriv('aes-256-gcm', cle(), iv)
    dechiffreur.setAuthTag(tag)
    return Buffer.concat([dechiffreur.update(corps), dechiffreur.final()]).toString('utf-8')
  }
  catch {
    // Ni le contenu ni la clé ne doivent apparaître dans les journaux.
    console.error('❌ Connecteurs : déchiffrement impossible (la clé de .secrets/ a-t-elle changé ?). Ressaisissez le secret concerné.')
    return null
  }
}
