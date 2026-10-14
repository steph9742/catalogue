import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lireListeDomaines } from './auditClient'

// TRANSFERT DE ZONE (AXFR) — par `dig`, installé dans l'image du serveur.

export const ALGORITHMES_TSIG = ['hmac-sha256', 'hmac-sha512', 'hmac-sha384', 'hmac-sha224', 'hmac-sha1', 'hmac-md5'] as const
export type Tsig = { nom: string, algorithme: string, secret: string }

const DELAI_MS = 120_000
const MOTIF_SERVEUR = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]*:[0-9a-f:]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?)$/i
const MOTIF_NOM_CLE = /^[a-z0-9](?:[a-z0-9._-]{0,250}[a-z0-9.])?$/i
const MOTIF_SECRET = /^[A-Za-z0-9+/]{8,}={0,2}$/

/** Le motif du refus, ou `null` si les paramètres sont sûrs à passer à `dig`. */
export function verifierParametres(domaine: string, serveur: string, tsig?: Tsig): string | null {
  if (lireListeDomaines([domaine]).valides[0] !== domaine) return `Nom de domaine invalide : ${domaine}.`
  if (!MOTIF_SERVEUR.test(serveur) || serveur.startsWith('-')) return `Serveur DNS invalide : « ${serveur} ». Saisir un nom d'hôte ou une adresse IP.`
  if (tsig) {
    if (!MOTIF_NOM_CLE.test(tsig.nom)) return `Nom de clé TSIG invalide : « ${tsig.nom} ».`
    if (!(ALGORITHMES_TSIG as readonly string[]).includes(tsig.algorithme)) return `Algorithme TSIG inconnu : « ${tsig.algorithme} ».`
    if (!MOTIF_SECRET.test(tsig.secret)) return 'Secret TSIG invalide : il doit être en base64.'
  }
  return null
}

export function fichierCle(t: Tsig): string {
  return `key "${t.nom}" {\n  algorithm ${t.algorithme};\n  secret "${t.secret}";\n};\n`
}

export function argumentsDig(domaine: string, serveur: string, cheminCle?: string): string[] {
  return ['AXFR', domaine, `@${serveur}`, '+time=10', '+tries=1', ...(cheminCle ? ['-k', cheminCle] : [])]
}

/**
 * Ce que dit l'échec d\'un transfert, ou `null` s\'il a abouti. Les trois échecs ne se règlent
 * pas avec les mêmes personnes : un refus est une configuration DNS, une clé refusée une
 * question de secret ou d'horloge, un serveur injoignable le réseau.
 */
export function diagnostic(sortie: string): string | null {
  if (/;\s*Transfer failed/i.test(sortie)) {
    return 'Le serveur DNS refuse le transfert de zone (« Transfer failed ») : l\'adresse du Catalogue doit y être autorisée (allow-transfer), ou une clé TSIG est attendue.'
  }
  if (/tsig/i.test(sortie) && /(fail|error|badkey|badsig|badtime)/i.test(sortie)) {
    return 'La clé TSIG a été refusée : nom, algorithme ou secret incorrects, ou horloges des deux serveurs désynchronisées.'
  }
  if (/communications error|timed out|connection refused|no servers could be reached|couldn't get address/i.test(sortie)) {
    return 'Serveur DNS injoignable pour le transfert (TCP 53).'
  }
  if (!/\sIN\s+SOA\s/i.test(sortie)) return 'Le transfert n\'a rendu aucune zone (pas d\'enregistrement SOA).'
  return null
}

/** La zone transférée, au format BIND. Lève avec le motif précis de l'échec. */
export async function transfererZone(domaine: string, serveur: string, tsig?: Tsig): Promise<string> {
  const refus = verifierParametres(domaine, serveur, tsig)
  if (refus) throw new Error(refus)

  const dossier = tsig ? await mkdtemp(join(tmpdir(), 'catalogue-tsig-')) : null
  try {
    let cheminCle: string | undefined
    if (tsig && dossier) {
      cheminCle = join(dossier, 'cle.conf')
      await writeFile(cheminCle, fichierCle(tsig), { mode: 0o600 })
    }
    let proc: ReturnType<typeof Bun.spawn>
    try {
      proc = Bun.spawn(['dig', ...argumentsDig(domaine, serveur, cheminCle)], { stdout: 'pipe', stderr: 'pipe' })
    }
    catch (e) {
      throw new Error(`« dig » est introuvable sur le serveur (paquet bind-tools) : ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
    const minuteur = setTimeout(() => proc.kill(), DELAI_MS)
    const [sortie, erreurs] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ])
    await proc.exited
    clearTimeout(minuteur)
    const motif = diagnostic(`${sortie}\n${erreurs}`)
    if (motif) throw new Error(`${motif} (${domaine} @${serveur})`)
    return sortie
  }
  finally {
    if (dossier) await rm(dossier, { recursive: true, force: true })
  }
}
