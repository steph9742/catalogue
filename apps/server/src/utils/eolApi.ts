// Récupération des dates de fin de support depuis endoflife.date (source publique).

const BASE = 'https://endoflife.date/api'
const DELAI_MS = 12000

export type CycleEol = {
  cycle: string
  eol: string | null // date de fin de support, ou null si aucune n'est publiée
  etendu: string | null
  /**
   * L'éditeur déclare EXPLICITEMENT que le support court toujours (`eol: false` dans la
   * source), par opposition à une absence totale d'information.
   */
  supporteSansDate: boolean
  /**
   * La dernière version publiée SUR CE CYCLE — « 1.41.9 » pour le cycle « 1.41 ».
   */
  latest: string | null
}

// Correspondance « chaîne d'OS du parc » → produit endoflife.date. L'ordre compte :
// windows-server avant windows, sinon « Server 2019 » tomberait dans le produit « windows ».
const PRODUITS: { motif: RegExp, produit: string }[] = [
  { motif: /windows.*server|server.*windows/i, produit: 'windows-server' },
  { motif: /windows/i, produit: 'windows' },
  { motif: /debian/i, produit: 'debian' },
  { motif: /ubuntu/i, produit: 'ubuntu' },
  { motif: /linux\s*mint/i, produit: 'linuxmint' },
  { motif: /fedora/i, produit: 'fedora' },
  { motif: /rocky/i, produit: 'rocky-linux' },
  { motif: /alma/i, produit: 'almalinux' },
  { motif: /centos/i, produit: 'centos' },
  { motif: /rhel|red\s*hat/i, produit: 'rhel' },
  { motif: /opensuse/i, produit: 'opensuse' },
  { motif: /mac\s*os|macos|os\s*x/i, produit: 'macos' },
  { motif: /esxi|vsphere/i, produit: 'esxi' },
  { motif: /proxmox/i, produit: 'proxmox-ve' },
  { motif: /android/i, produit: 'android' },
  { motif: /ipados|ios/i, produit: 'ios' },

  // --- Produits applicatifs, détectés par le scan des services exposés -----------------
  // La même table sert aux OS du parc et aux technologies web : un seul endroit où la
  // correspondance vers endoflife.date est écrite, donc un seul endroit où la corriger.
  { motif: /tomcat/i, produit: 'apache-tomcat' },
  { motif: /apache/i, produit: 'apache-http-server' },
  { motif: /nginx/i, produit: 'nginx' },
  { motif: /\biis\b|internet\s*information/i, produit: 'iis' },
  { motif: /wordpress/i, produit: 'wordpress' },
  { motif: /drupal/i, produit: 'drupal' },
  { motif: /joomla/i, produit: 'joomla' },
  { motif: /typo3/i, produit: 'typo3' },
  { motif: /mediawiki/i, produit: 'mediawiki' },
  { motif: /\bphp\b/i, produit: 'php' },
  { motif: /symfony/i, produit: 'symfony' },
  { motif: /next\.?js/i, produit: 'nextjs' },
  { motif: /node\.?js/i, produit: 'nodejs' },

  // --- Produits ajoutés avec les 28 signatures du scanner CMS ---------------------------
  // Un produit qu'endoflife.date ne connaît pas ne casse rien : la ligne de référentiel est
  // créée sans dates, et l'absence de date se lit « inconnu ».
  { motif: /nextcloud/i, produit: 'nextcloud' },
  { motif: /moodle/i, produit: 'moodle' },
  { motif: /dokuwiki/i, produit: 'dokuwiki' },
  { motif: /roundcube/i, produit: 'roundcube' },
  { motif: /zimbra|carbonio/i, produit: 'zimbra' },
  { motif: /spip/i, produit: 'spip' },
  { motif: /xwiki/i, produit: 'xwiki' },
  { motif: /confluence/i, produit: 'confluence' },
  { motif: /bookstack/i, produit: 'bookstack' },
  { motif: /ghost/i, produit: 'ghost' },
  { motif: /prestashop/i, produit: 'prestashop' },
  { motif: /magento/i, produit: 'magento' },
]

/**
 * Distributions à publication continue : elles n'ont pas de version figée, donc pas de date de
 * fin de support — elles sont à jour tant qu'on les met à jour.
 */
const CONTINUES = /arch\s*linux|endeavour|cachy|manjaro|gentoo|nixos|void\s*linux|tumbleweed/i

export function estContinue(os: string | null | undefined): boolean {
  return CONTINUES.test((os ?? '').trim())
}

export function produitDe(os: string | null | undefined): string | null {
  const s = (os ?? '').trim()
  if (!s) return null
  return PRODUITS.find(p => p.motif.test(s))?.produit ?? null
}

/**
 * Version à apparier, lue dans le nom de l'OS puis, à défaut, dans le champ VERSION de
 * l'inventaire.
 */
export function versionDe(os: string | null | undefined, osVersion?: string | null): string | null {
  const motif = /(\d+\.\d+(?:\.\d+)?|\d{1,4})/
  const dansOs = (os ?? '').match(motif)
  const dansVersion = (osVersion ?? '').match(motif)
  return dansOs?.[1] ?? dansVersion?.[1] ?? null
}

/** Récupère les cycles d'un produit. `null` si l\'API est injoignable ou le produit inconnu. */
export async function cyclesDuProduit(produit: string): Promise<CycleEol[] | null> {
  const ctrl = new AbortController()
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS)
  try {
    const res = await fetch(`${BASE}/${produit}.json`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>[]
    return data.map(c => ({
      cycle: String(c.cycle ?? ''),
      eol: typeof c.eol === 'string' ? c.eol : null,
      supporteSansDate: c.eol === false,
      latest: typeof c.latest === 'string' ? c.latest : null,
      etendu: typeof c.extendedSupport === 'string'
        ? c.extendedSupport
        : (typeof c.support === 'string' && typeof c.eol === 'string' && c.support > c.eol ? c.support : null),
    }))
  }
  catch { return null }
  finally { clearTimeout(minuteur) }
}

/**
 * Cycles candidats pour un système Windows de bureau. Les cycles de l'API combinent la version
 * majeure, la RELEASE et l'ÉDITION : « 10-22h2 », « 11-24h2-e », « 10-21h2-iot-lts ».
 */
function candidatsWindows(os: string, osVersion?: string | null): string[] {
  const majeure = /windows\s*11/i.test(os) ? '11' : /windows\s*10/i.test(os) ? '10' : null
  if (!majeure) return []

  // La release (22H2, 21H2, 1809…) est cherchée d'abord dans le NOM — la clé de référentiel l'y
  // a intégrée et fait foi — puis dans le champ version de l'inventaire.
  const sansMajeure = os.replace(/windows\s*1[01]/i, '')
  const toutes = [...sansMajeure.matchAll(/\b(\d{2}H\d|\d{4})\b/gi)].map(m => m[1]!)
  // `.at(-1)` n'est pas disponible avec la cible TypeScript du projet.
  const dansNom = toutes.length ? toutes[toutes.length - 1] : undefined
  const release = (dansNom ?? (osVersion ?? '').match(/\b(\d{2}H\d|\d{4})\b/i)?.[1])?.toLowerCase()

  const iot = /\biot\b/i.test(os)
  const lts = /ltsc|ltsb/i.test(os)
  const entreprise = /entreprise|enterprise|éducation|education/i.test(os)

  const suffixes: string[] = []
  if (iot && lts) suffixes.push('-iot-lts')
  if (lts) suffixes.push('-e-lts', '-lts')
  suffixes.push(entreprise ? '-e' : '-w', entreprise ? '-w' : '-e', '')

  // Sans release connue, on ne devine PAS. Retomber sur « la première release trouvée pour
  // cette majeure » donnerait à un poste resté en 1909 les dates du 22H2 — soit plusieurs
  // années de support qu'il n'a pas.
  if (!release) return []
  return suffixes.map(s => `${majeure}-${release}${s}`)
}

/**
 * Cycles candidats pour Windows Server : l'année, éventuellement suivie de « r2 ».
 */
function candidatsWindowsServer(os: string): string[] {
  const annee = os.match(/\b(19|20)\d{2}\b/)?.[0]
  if (!annee) return []
  return /\bR2\b/i.test(os) ? [`${annee}-r2`, annee] : [annee]
}

/**
 * Choisit le cycle correspondant à un système. Appariement du plus SPÉCIFIQUE au plus général :
 * « 24.04.4 » doit trouver « 24.04 », et « 14.5 » trouver « 14 ».
 */
export function cyclePourOs(
  cycles: CycleEol[],
  produit: string,
  os: string,
  osVersion?: string | null,
): CycleEol | null {
  const parCle = new Map(cycles.map(c => [c.cycle.toLowerCase(), c]))

  // Familles Windows : la correspondance passe par l'édition et la release, pas par un
  // simple numéro.
  const specifiques = produit === 'windows'
    ? candidatsWindows(os, osVersion)
    : produit === 'windows-server' ? candidatsWindowsServer(os) : []

  // Famille Windows de bureau reconnue mais release inconnue : on s'arrête là plutôt que
  // de laisser le repli générique attraper une release au hasard.
  if (produit === 'windows' && !specifiques.length && /windows\s*1[01]/i.test(os)) return null
  for (const c of specifiques) {
    const cle = c.toLowerCase()
    const trouve = parCle.get(cle)
    if (trouve) return trouve
    // Correspondance par PRÉFIXE : l'API nomme certains cycles avec un niveau de service-pack
    // (« 2008-r2-sp1 » et non « 2008-r2 »).
    const parPrefixe = cycles.find(x => x.cycle.toLowerCase().startsWith(cle + '-'))
    if (parPrefixe) return parPrefixe
  }
  if (specifiques.length) return null // famille Windows identifiée mais cycle absent

  // Cas général : on dégrade du plus précis au plus large (14.5.1 → 14.5 → 14).
  const version = versionDe(os, osVersion)
  if (!version) return null
  const candidats = [version]
  const parts = version.split('.')
  for (let i = parts.length - 1; i > 0; i--) candidats.push(parts.slice(0, i).join('.'))
  for (const c of candidats) {
    const trouve = parCle.get(c.toLowerCase())
    if (trouve) return trouve
  }
  return cycles.find(x => x.cycle.startsWith(version + '-') || x.cycle.startsWith(version + '.')) ?? null
}

/**
 * Clé d'identité d\'un système dans le référentiel de fin de vie. Par défaut, c\'est la chaîne
 * d'OS exacte remontée par l\'inventaire — elle porte déjà la version (« Debian GNU/Linux 12 »,
 * « Windows Server 2019 ») et suffit à distinguer les situations de support.
 */
export function cleTechnologie(os: string | null | undefined, osVersion?: string | null): string {
  const nom = (os ?? '').trim()
  if (!nom) return nom
  const v = (osVersion ?? '').trim()

  // WINDOWS DE BUREAU — le nom porte bien un numéro (10, 11) mais ce n'est PAS lui qui
  // détermine le support : c'est la release.
  if (/windows\s*1[01]/i.test(nom) && !/server/i.test(nom)) {
    const release = v.match(/\b(\d{2}H\d|\d{4})\b/i)?.[1]?.toUpperCase()
    return release ? `${nom} ${release}` : nom
  }

  // Le nom porte déjà sa version et elle est discriminante : on n'y touche pas.
  if (/\d/.test(nom)) return nom

  // Nom SANS version (« macOS » couvre 36 versions du parc) : on adjoint la majeure.
  const m = v.match(/^(\d+)(?:\.(\d+))?/)
  if (!m) return nom
  const majeure = m[1]!
  return majeure === '10' && m[2] ? `${nom} ${majeure}.${m[2]}` : `${nom} ${majeure}`
}
