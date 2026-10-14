import { normaliserJeton } from './harfanglabClient'

// CLIENT DU MOTEUR D'AUDIT EXTERNE — le Catalogue appelle, le moteur répond.

/**
 * `dialecte` — à qui l'on parle. `contrat` : le moteur porte /perimetre, /resultats, /sante, et
 * s'authentifie en Bearer.
 */
export type Dialecte = 'contrat' | 'artemis'
export type AuditConfig = { url: string, jeton: string, dialecte?: Dialecte }
export type ActifPerimetre = {
  hote: string
  port: number
  url: string | null
  /** `null` : non classé. Ce n'est pas « standard ». */
  classement: 'paiement' | 'sensible' | 'standard' | null
  /** Pages cibles déclarées : relevées en plus de la racine, avec l'inventaire de leurs scripts. */
  pages: string[]
}
export type Perimetre = {
  version: 1
  genere_le: string
  domaines: string[]
  plages: string[]
  actifs: ActifPerimetre[]
}

const DELAI_MS = 60_000

const ADRESSE_PRIVEE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

export function adresseMoteur(url: string): { ok: true, base: string } | { ok: false, message: string } {
  let u: URL
  try { u = new URL(url.trim()) }
  catch { return { ok: false, message: `Adresse du moteur illisible : « ${url} ».` } }
  const locale = u.hostname === 'localhost' || u.hostname === 'host.docker.internal' || u.hostname === '[::1]'
    || ADRESSE_PRIVEE.test(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && locale)) {
    return {
      ok: false,
      message: 'Le moteur doit être joint en https:// : en clair, le jeton et le périmètre circuleraient lisibles. '
        + 'Le http n\'est admis que sur une adresse locale ou privée (phase de test sur le portail).',
    }
  }
  return { ok: true, base: `${u.origin}${u.pathname}`.replace(/\/+$/, '') }
}

// UNE SEULE REDIRECTION EST SUIVIE : celle qui AJOUTE LA BARRE OBLIQUE FINALE, sur la même
// origine et le même chemin.
function cibleToleree(url: string, lieu: string | null): string | null {
  if (!lieu) return null
  let cible: URL
  try { cible = new URL(lieu, url) }
  catch { return null }
  const depart = new URL(url)
  if (cible.origin !== depart.origin) return null
  if (cible.pathname !== `${depart.pathname}/`) return null
  // La requête d'origine porte le curseur : une redirection qui le perd le fait revenir.
  if (!cible.search) cible.search = depart.search
  return cible.toString()
}

async function appeler(cfg: AuditConfig, chemin: string, init: { method: string, body?: string, json?: boolean }): Promise<Response> {
  const a = adresseMoteur(cfg.url)
  if (!a.ok) throw new Error(a.message)
  // Artemis sert son API sous /api : l'adresse se saisit à la racine, et un `/api` déjà
  // présent n'est pas doublé — personne ne doit avoir à deviner lequel des deux on attend.
  const base = cfg.dialecte === 'artemis' ? a.base.replace(/\/api$/, '') : a.base
  const url = `${base}${chemin}`
  const jeton = normaliserJeton(cfg.jeton)
  const headers: Record<string, string> = cfg.dialecte === 'artemis'
    ? { 'x-api-token': jeton, 'Accept': 'application/json' }
    : { Authorization: `Bearer ${jeton}`, Accept: 'application/json' }
  if (init.json) headers['Content-Type'] = 'application/json'
  const envoyer = (cible: string) => fetch(cible, {
    method: init.method, body: init.body, headers,
    // `manual` et non `error` : il faut LIRE la redirection pour pouvoir la juger.
    redirect: 'manual', signal: AbortSignal.timeout(DELAI_MS),
  })
  try {
    const r = await envoyer(url)
    if (r.status < 300 || r.status > 399) return r
    const lieu = r.headers.get('location')
    const toleree = cibleToleree(url, lieu)
    if (!toleree) {
      throw new Error(`Le moteur a répondu une redirection (HTTP ${r.status}) vers « ${lieu ?? 'une adresse non indiquée'} », `
        + 'qui n\'est pas suivie : le jeton partirait avec. Une redirection vers une page de connexion signale un '
        + 'moteur qui n\'expose pas encore le contrat ; vers un autre hôte, une adresse de moteur erronée.')
    }
    const suite = await envoyer(toleree)
    if (suite.status >= 300 && suite.status <= 399) {
      throw new Error(`Le moteur redirige en boucle : « ${url} » puis « ${toleree} ». Une seule redirection est suivie.`)
    }
    return suite
  }
  catch (e) {
    const motif = e instanceof Error ? e.message : String(e)
    throw new Error(`Moteur d'audit injoignable (${init.method} ${chemin}) — ${motif}. Adresse : ${url}`, { cause: e })
  }
}

async function refus(r: Response, quoi: string): Promise<Error> {
  const corps = (await r.text().catch(() => '')).slice(0, 200)
  return new Error(`Le moteur a refusé ${quoi} (HTTP ${r.status})${corps ? ` : ${corps}` : ''}.`)
}

export async function envoyerPerimetre(cfg: AuditConfig, p: Perimetre): Promise<void> {
  if (cfg.dialecte === 'artemis') {
    // Artemis ne connaît qu'une LISTE DE CIBLES : ni classement, ni pages, ni plages.
    const cibles = [...new Set([...p.domaines, ...p.actifs.map(a => a.hote)])].filter(Boolean)
    if (!cibles.length) return
    const r = await appeler(cfg, '/api/add', { method: 'POST', body: JSON.stringify({ targets: cibles }), json: true })
    if (!r.ok) throw await refus(r, 'la déclaration des cibles')
    return
  }
  const r = await appeler(cfg, '/perimetre', { method: 'POST', body: JSON.stringify(p), json: true })
  if (!r.ok) throw await refus(r, 'le périmètre')
}

/** Plafond de lecture Artemis : au-delà, la réponse est tronquée et le relevé le DIT. */
export const MAX_RESULTATS_ARTEMIS = 5000

export async function recupererResultats(cfg: AuditConfig, depuis: Date | null): Promise<unknown> {
  if (cfg.dialecte === 'artemis') {
    // Le filtrage se fait donc à la lecture (utils/artemis.ts). `limit` est envoyé au cas où il
    // soit honoré : s'il l'est, la réponse est plus légère ; sinon elle est seulement plus
    // longue.
    const r = await appeler(cfg, `/api/task-results?limit=${MAX_RESULTATS_ARTEMIS}`, { method: 'GET' })
    if (!r.ok) throw await refus(r, 'la lecture des résultats')
    try { return await r.json() }
    catch { throw new Error('Artemis a rendu une réponse qui n\'est pas du JSON.') }
  }
  const q = depuis ? `?depuis=${encodeURIComponent(depuis.toISOString())}` : ''
  const r = await appeler(cfg, `/resultats${q}`, { method: 'GET' })
  if (!r.ok) throw await refus(r, 'la lecture des résultats')
  try { return await r.json() }
  catch { throw new Error('Le moteur a rendu une réponse qui n\'est pas du JSON.') }
}

/** Joint le moteur sans rien écrire : une lecture des résultats à partir de maintenant. */
export async function testerConnexionAudit(cfg: AuditConfig): Promise<{ ok: boolean, message: string }> {
  try {
    const corps = await recupererResultats(cfg, new Date())
    const liste = Array.isArray(corps)
    const lisible = liste || (!!corps && typeof corps === 'object' && Array.isArray((corps as { constats?: unknown }).constats))
    if (cfg.dialecte === 'artemis') {
      return liste
        ? { ok: true, message: `Artemis joint, jeton accepté, ${(corps as unknown[]).length} résultat(s) lisibles.` }
        : { ok: false, message: 'Artemis joint et jeton accepté, mais /api/task-results n\'a pas rendu une liste.' }
    }
    return lisible
      ? { ok: true, message: 'Moteur joint, jeton accepté, réponse au format attendu.' }
      : { ok: false, message: 'Moteur joint et jeton accepté, mais la réponse n\'a pas la forme attendue (liste de constats, ou objet { constats }).' }
  }
  catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

// --- Validation du périmètre déclaré -------------------------------------------------

const MOTIF_DOMAINE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const MOTIF_CIDR4 = new RegExp(`^${OCTET}(\\.${OCTET}){3}/(3[0-2]|[12]?\\d)$`)
const MOTIF_CIDR6 = /^[0-9a-f:]{2,39}\/(12[0-8]|1[01]\d|[1-9]?\d)$/i
const PLAGE_PRIVEE = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^(fc|fd|fe80|::1)/i

/** Les domaines saisis : normalisés, dédoublonnés, et les refus nommés. */
export function lireListeDomaines(brut: readonly string[]): { valides: string[], rejets: string[] } {
  const valides = new Set<string>()
  const rejets: string[] = []
  for (const x of brut) {
    const d = x.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
    if (!d) continue
    if (MOTIF_DOMAINE.test(d)) valides.add(d)
    else rejets.push(x.trim())
  }
  return { valides: [...valides], rejets }
}

/**
 * Les plages saisies. UNE PLAGE PRIVÉE EST REFUSÉE : invisible depuis Internet, elle n'a rien à
 * faire dans un relevé externe — et pendant la phase de test sur le portail, l'envoyer ferait
 * balayer le réseau interne de l'établissement depuis l\'intérieur.
 */
export function lireListePlages(brut: readonly string[]): { valides: string[], rejets: string[] } {
  const valides = new Set<string>()
  const rejets: string[] = []
  for (const x of brut) {
    const p = x.trim().toLowerCase()
    if (!p) continue
    if ((MOTIF_CIDR4.test(p) || MOTIF_CIDR6.test(p)) && !PLAGE_PRIVEE.test(p)) valides.add(p)
    else rejets.push(x.trim())
  }
  return { valides: [...valides], rejets }
}
