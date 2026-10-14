// DÉCOUVERTE PAR CERTIFICATE TRANSPARENCY — lecture de la réponse de crt.sh.

const MOTIF_HOTE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export type NomCt = { hote: string, emetteurs: string[], finValidite: string | null, certificats: number }

/** « C=US, O=Let's Encrypt, CN=R11 » → « Let\'s Encrypt ». */
function organisation(emetteur: string): string {
  const o = emetteur.match(/(?:^|,\s*)O=("?)([^,"]+)\1/)?.[2] ?? emetteur
  return o.trim().slice(0, 100)
}

export function nomsDuReleve(entrees: readonly unknown[], domaine: string): NomCt[] {
  const d = domaine.trim().toLowerCase().replace(/\.$/, '')
  const noms = new Map<string, { emetteurs: Set<string>, fin: string | null, certificats: number }>()
  for (const e of entrees) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const valeurs = [o.name_value, o.common_name]
      .filter((v): v is string => typeof v === 'string')
      .flatMap(v => v.split(/\s+/))
    const emetteur = typeof o.issuer_name === 'string' ? organisation(o.issuer_name) : null
    const fin = typeof o.not_after === 'string' ? o.not_after.slice(0, 10) : null
    for (const brut of new Set(valeurs)) {
      const h = brut.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
      if (h.includes('@') || !MOTIF_HOTE.test(h)) continue
      if (h !== d && !h.endsWith(`.${d}`)) continue
      const x = noms.get(h) ?? { emetteurs: new Set<string>(), fin: null, certificats: 0 }
      if (emetteur) x.emetteurs.add(emetteur)
      if (fin && (!x.fin || fin > x.fin)) x.fin = fin
      x.certificats++
      noms.set(h, x)
    }
  }
  return [...noms]
    .map(([hote, x]) => ({ hote, emetteurs: [...x.emetteurs].sort(), finValidite: x.fin, certificats: x.certificats }))
    .sort((a, b) => a.hote.localeCompare(b.hote))
}

/**
 * Une adresse privée n'est pas joignable depuis Internet. Un nom public qui y résout est un nom
 * interne publié dans un certificat : il se signale, il ne s'exclut pas.
 */
export function adressePrivee(ip: string): boolean {
  const a = ip.toLowerCase()
  if (a.includes(':')) return a === '::1' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a)
  const [x, y] = a.split('.').map(Number)
  return x === 10 || x === 127 || (x === 172 && y! >= 16 && y! <= 31) || (x === 192 && y === 168)
    || (x === 169 && y === 254) || (x === 100 && y! >= 64 && y! <= 127)
}

/**
 * LE NOM NE RÉPOND-IL QUE PAR LE JOKER DNS ? Un nom qui résout vers EXACTEMENT les adresses du
 * joker n'apprend donc rien : on ne peut pas dire qu\'il existe.
 */
export function resoutParJoker(adresses: readonly string[], joker: readonly string[] | null): boolean {
  if (!joker?.length || !adresses.length) return false
  const j = new Set(joker)
  return adresses.every(a => j.has(a))
}

/** Le dernier certificat connu du nom a-t-il expiré ? `finValidite` au format `YYYY-MM-DD`. */
export function certificatExpire(finValidite: string | null, aujourdhui: string): boolean {
  return !!finValidite && finValidite < aujourdhui
}
