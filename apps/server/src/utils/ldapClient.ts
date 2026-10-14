import { Client } from 'ldapts'

// CLIENT LDAPS — LECTURE SEULE. Aucune opération d'écriture n'est exposée : ni `add`, ni
// `modify`, ni `del`.

/** Une entrée d'annuaire, attributs bruts. Multivalué partout : LDAP l\'est. */
export type EntreeLdap = Record<string, string[]>

export type ConfigLdap = {
  url: string
  bindDn: string
  motDePasse: string
  baseDn: string
  filtre: string
}

const DELAI_MS = 30_000

/**
 * NORMALISE L'ADRESSE DU SERVEUR. Le champ attend `ldaps://hôte`, mais on y saisit
 * naturellement un nom d'hôte nu, ou une adresse copiée depuis un navigateur avec `https://`
 * devant.
 */
export function normaliserUrlLdap(brut: string): { url: string, avertissement: string | null } {
  const v = brut.trim().replace(/\/+$/, '')
  if (!v) throw new Error('Adresse du serveur vide.')
  if (/^ldaps:\/\//i.test(v)) return { url: v, avertissement: null }
  if (/^ldap:\/\//i.test(v)) {
    return {
      url: v,
      // Accepté, mais dit : `ldap://` transporte le mot de passe du compte de service en
      // clair sur le réseau. C'est un choix, pas un défaut — il doit être conscient.
      avertissement: 'Connexion NON chiffrée (ldap://) : le mot de passe du compte de service circule en clair. Préférez ldaps://.',
    }
  }
  const schema = v.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]
  if (schema) {
    throw new Error(`« ${schema}:// » n'est pas un protocole d'annuaire. Attendu : ldaps://${v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')}`)
  }
  // Nom d'hôte nu, éventuellement avec un port : une seule lecture possible.
  return { url: `ldaps://${v}`, avertissement: null }
}

/**
 * LA TAILLE DE PAGE, et pourquoi elle n'est pas facultative. Un annuaire d\'établissement
 * dépasse la limite de résultats par défaut du serveur.
 */
const TAILLE_PAGE = 500

/** Normalise une valeur d'attribut en tableau de chaînes. */
function valeurs(v: unknown): string[] {
  if (v == null) return []
  const liste = Array.isArray(v) ? v : [v]
  return liste
    .map(x => (Buffer.isBuffer(x) ? x.toString('utf8') : String(x)))
    .filter(x => x.length > 0)
}

async function connecter(cfg: ConfigLdap): Promise<Client> {
  const { url } = normaliserUrlLdap(cfg.url)
  const client = new Client({ url, timeout: DELAI_MS, connectTimeout: DELAI_MS })
  await client.bind(cfg.bindDn, cfg.motDePasse)
  return client
}

/**
 * Vérifie que l'annuaire répond et que le compte se lie. Ne lit aucune personne.
 */
export async function testerLdap(cfg: ConfigLdap): Promise<{ ok: boolean, message: string }> {
  let client: Client | null = null
  try {
    const { url, avertissement } = normaliserUrlLdap(cfg.url)
    client = await connecter(cfg)
    // Une recherche à portée `base` sur le DN de base : la moins coûteuse qui prouve
    // à la fois la liaison ET l'existence du conteneur.
    const { searchEntries } = await client.search(cfg.baseDn, { scope: 'base', attributes: ['objectClass'] })
    const base = searchEntries.length
      ? `Connexion établie sur ${url}, ${cfg.baseDn} atteint.`
      : `Connexion établie sur ${url}, mais ${cfg.baseDn} ne rend aucune entrée : vérifiez le DN de base.`
    return { ok: true, message: avertissement ? `${base} ⚠ ${avertissement}` : base }
  }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `Connexion refusée : ${m}` }
  }
  finally {
    // Une liaison laissée ouverte consomme un descripteur côté annuaire jusqu'au délai
    // d'expiration. Sur une synchronisation horaire, cela finit par se voir.
    await client?.unbind().catch(() => {})
  }
}

/**
 * Parcourt les personnes, page par page, et remet chaque lot à l'appelant.
 */
export async function parcourirPersonnes(
  cfg: ConfigLdap,
  attributs: readonly string[],
  surLot: (lot: EntreeLdap[]) => Promise<void>,
): Promise<{ total: number }> {
  let client: Client | null = null
  let total = 0
  try {
    client = await connecter(cfg)
    const { searchEntries } = await client.search(cfg.baseDn, {
      scope: 'sub',
      filter: cfg.filtre,
      attributes: [...attributs],
      paged: { pageSize: TAILLE_PAGE },
      // `sizeLimit: 0` = pas de limite CÔTÉ CLIENT. Le serveur garde la sienne, et c'est
      // la pagination qui la contourne — pas ce réglage.
      sizeLimit: 0,
    })
    const lot: EntreeLdap[] = []
    for (const e of searchEntries) {
      const brut: EntreeLdap = {}
      for (const [cle, v] of Object.entries(e)) {
        if (cle === 'dn') continue
        brut[cle] = valeurs(v)
      }
      lot.push(brut)
      total++
      if (lot.length >= TAILLE_PAGE) {
        await surLot(lot.splice(0, lot.length))
      }
    }
    if (lot.length) await surLot(lot)
    return { total }
  }
  finally {
    await client?.unbind().catch(() => {})
  }
}

/** La première valeur d'un attribut, ou `null`. Jamais une chaîne vide. */
export function une(e: EntreeLdap, attr: string): string | null {
  return e[attr]?.[0]?.trim() || null
}

/** Toutes les valeurs d'un attribut. Tableau vide si absent. */
export function toutes(e: EntreeLdap, attr: string): string[] {
  return (e[attr] ?? []).map(v => v.trim()).filter(Boolean)
}

/**
 * Un booléen d'annuaire. LDAP écrit « TRUE » / « FALSE » en majuscules.
 */
export function booleen(e: EntreeLdap, attr: string): boolean | null {
  const v = une(e, attr)
  if (v === null) return null
  if (/^true$/i.test(v)) return true
  if (/^false$/i.test(v)) return false
  return null
}

/**
 * Une date d'annuaire au format généralisé : `aaaammjj000000Z`. `null` sur une valeur qui ne se
 * lit pas — inventer une date ferait expirer ou survivre un compte au mauvais moment.
 */
export function date(e: EntreeLdap, attr: string): Date | null {
  const v = une(e, attr)
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) ? null : d
}
