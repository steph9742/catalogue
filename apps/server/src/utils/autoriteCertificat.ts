// L'AUTORITÉ D'UN CERTIFICAT — tri calculé, jamais stocké. Un certificat HARICA (GÉANT TCS) est
// la voie de l'établissement ; Let's Encrypt est toléré mais signale souvent un service monté
// hors procédure ; une autre autorité commerciale pose la question « pourquoi pas HARICA » ;
// une autorité INCONNUE…

export const AUTORITES = ['harica', 'lets_encrypt', 'autre_commerciale', 'auto_signe', 'expire', 'chaine_invalide', 'autorite_inattendue'] as const
export type Autorite = typeof AUTORITES[number]

// GÉANT TCS est délivré par HARICA depuis 2025, par Sectigo auparavant sous le nom
// « GEANT OV ». Les deux sont la voie normale de l'établissement.
const HARICA = /harica|hellenic academic|\bgeant\b|géant/i
const LETS_ENCRYPT = /let'?s ?encrypt|\bISRG\b/i
// Autorités publiques reconnues. Une autorité absente de cette liste n'est pas « interdite »,
// elle est INATTENDUE : c'est précisément ce qu'on veut voir.
const COMMERCIALES = /digicert|sectigo|comodo|globalsign|entrust|go ?daddy|starfield|certigna|buypass|zerossl|amazon|google trust|\bgts\b|microsoft|thawte|geotrust|rapidssl|actalis|ssl\.com|certum|quovadis|swisssign|telesec|d-trust|identrust|trustwave|network solutions|gandi/i

export type CertificatLu = {
  emetteur: string | null
  autoSigne: boolean | null
  chaineValide: boolean | null
  dateFin: Date | string | null
}

/** L'autorité, ou `null` si le certificat n\'a jamais été lu : on ne classe pas ce qu\'on n\'a pas vu. */
export function autoriteDe(c: CertificatLu, maintenant = new Date()): Autorite | null {
  if (!c.emetteur && !c.dateFin) return null
  const fin = c.dateFin ? new Date(c.dateFin) : null
  if (fin && !Number.isNaN(fin.getTime()) && fin.getTime() < maintenant.getTime()) return 'expire'
  if (c.autoSigne) return 'auto_signe'
  if (c.chaineValide === false) return 'chaine_invalide'
  const e = c.emetteur ?? ''
  if (HARICA.test(e)) return 'harica'
  if (LETS_ENCRYPT.test(e)) return 'lets_encrypt'
  if (COMMERCIALES.test(e)) return 'autre_commerciale'
  return 'autorite_inattendue'
}

/** L'hôte appartient-il à l\'un des domaines déclarés de l\'établissement ? */
export function surNosDomaines(hote: string, domaines: readonly string[]): boolean {
  const h = hote.toLowerCase().replace(/\.$/, '')
  return domaines.some(d => h === d || h.endsWith(`.${d}`))
}

/**
 * La gravité d'alerte d\'une autorité, ou `null` si elle n\'appelle pas d\'alerte.
 */
export function graviteAutorite(autorite: Autorite | null, hote: string, domaines: readonly string[]): 'critical' | 'warning' | null {
  if (autorite === 'autorite_inattendue') return surNosDomaines(hote, domaines) ? 'critical' : 'warning'
  if (autorite === 'autre_commerciale') return 'warning'
  return null
}
