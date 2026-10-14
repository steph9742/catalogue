import { cleTechnologie } from './eolApi'
import { meta, PRODUITS, type Indice } from './scanProduits'

// SCAN APPLICATIF PASSIF — ce qu'un service annonce de lui-même. UNE SEULE REQUÊTE `GET /` par
// service.

export type Certitude = 'certain' | 'probable' | 'absente'
export type SourceDetection = 'entete_server' | 'entete_powered_by' | 'meta_generator' | 'chemin_actif' | 'sonde_produit'

export type Detection = {
  produit: string
  version: string | null
  certitude: Certitude
  source: SourceDetection
  /** Clé de rapprochement, NULLE tant que la version est inconnue. */
  technologieCle: string | null
}

export type ResultatScan = {
  ok: boolean
  codeHttp: number | null
  message: string | null
  detections: Detection[]
  enTetes: { hsts: boolean, csp: boolean, xFrameOptions: boolean, referrerPolicy: boolean } | null
}

/**
 * Extrait « produit » et « version » d'une chaîne d\'en-tête. `Apache/2.4.58 (Debian)` → {
 * Apache, 2.4.58 }.
 */
function decouper(valeur: string): { produit: string, version: string | null } | null {
  const brut = valeur.trim().split(/[\s,;(]/)[0]
  if (!brut) return null
  const [produit, version] = brut.split('/')
  if (!produit) return null
  return { produit, version: version && /\d/.test(version) ? version : null }
}

/**
 * La clé de rapprochement n'existe QUE si la version est connue. Rapprocher « WordPress » sans
 * version donnerait à tout le produit la date d'une release précise — c\'est exactement le
 * défaut corrigé sur « Windows 11 sans release », qui attribuait à des milliers de postes la
 * fin de support de la 21H2.
 */
function cleDe(produit: string, version: string | null): string | null {
  return version ? cleTechnologie(produit, version) : null
}

/** Les marqueurs de produit dans les chemins d'actifs. Le produit, jamais la version. */
/**
 * Cadriciels reconnus au chemin d'actif. Les PRODUITS (CMS, wikis, messageries) sont déclarés
 * dans `scanProduits.ts` avec leurs deux niveaux de preuve ; il ne reste ici que ce qui ne
 * s'annonce jamais autrement.
 */
const CHEMINS: Array<{ motif: RegExp, produit: string }> = [
  { motif: /\/_next\/static\//i, produit: 'Next.js' },
  { motif: /\/bundles\/[a-z]+\/|\/build\/runtime\./i, produit: 'Symfony' },
]

/**
 * RETIRE CE QUI POINTE AILLEURS, avant toute recherche de motif large. Nos motifs de chemins
 * tournaient sur le corps BRUT.
 */
export function sansLiensExternes(corps: string): string {
  return corps
    .replace(/<a\b[^>]*\bhref\s*=\s*["']https?:\/\/[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, ' ')
    .replace(/https?:\/\/[^\s"'<>]+/g, ' ')
}

/**
 * UNE VERSION EST UNE SUITE DE NOMBRES, pas n'importe quelle suite de chiffres et de points.
 */
function versionPlausible(v: string | undefined): string | null {
  const t = (v ?? '').trim()
  if (!t) return null
  if (/^\d+(\.\d+)*$/.test(t)) return t
  if (/^\d{4}-\d{2}-\d{2}[a-z]?$/i.test(t)) return t
  return null
}

/** La première version plausible capturée par une liste de motifs. */
function premiereVersion(corps: string, motifs: readonly RegExp[] | undefined): string | null {
  for (const m of motifs ?? []) {
    const v = versionPlausible(corps.match(m)?.[1])
    if (v) return v
  }
  return null
}

/** Analyse une réponse HTTP. Séparée de l'appel réseau pour être éprouvable sans réseau. */
export function analyser(
  enTetes: Record<string, string>,
  corps: string,
  codeHttp: number,
): ResultatScan {
  const detections: Detection[] = []
  const vu = new Set<string>()
  const ajouter = (d: Detection) => {
    // Une même technologie peut être annoncée deux fois — en-tête ET generator. On garde
    // la PREMIÈRE, et l'ordre d'appel va du plus fiable au moins fiable.
    if (vu.has(d.produit.toLowerCase())) return
    vu.add(d.produit.toLowerCase())
    detections.push(d)
  }

  const bas = Object.fromEntries(Object.entries(enTetes).map(([k, v]) => [k.toLowerCase(), v]))

  // 1. `Server:` — le plus fiable quand il porte une version.
  const serveur = bas.server ? decouper(bas.server) : null
  if (serveur) {
    ajouter({
      produit: serveur.produit,
      version: serveur.version,
      certitude: serveur.version ? 'certain' : 'absente',
      source: 'entete_server',
      technologieCle: cleDe(serveur.produit, serveur.version),
    })
  }

  // 2. `X-Powered-By:` — le langage, souvent PHP.
  const moteur = bas['x-powered-by'] ? decouper(bas['x-powered-by']) : null
  if (moteur) {
    ajouter({
      produit: moteur.produit,
      version: moteur.version,
      certitude: moteur.version ? 'certain' : 'absente',
      source: 'entete_powered_by',
      technologieCle: cleDe(moteur.produit, moteur.version),
    })
  }

  // 3. `<meta name="generator">` — c'est le CMS qui se nomme lui-même.
  const gen = corps.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)
    ?? corps.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i)
  if (gen?.[1]) {
    const texte = gen[1].trim()
    // « WordPress 6.4.2 » : le produit est tout ce qui précède le premier nombre.
    const m = texte.match(/^(.+?)\s+v?(\d[\d.]*)\b/)
    const produit = (m?.[1] ?? texte).trim()
    const version = m?.[2] ?? null
    ajouter({
      produit,
      version,
      certitude: version ? 'certain' : 'absente',
      source: 'meta_generator',
      technologieCle: cleDe(produit, version),
    })
  }

  // 4. LES PRODUITS DÉCLARÉS — vingt-neuf signatures, deux niveaux de preuve.
  {
    const propre = sansLiensExternes(corps)
    const teste = (i: Indice): boolean => {
      if (i.ou === 'meta') return i.motif.test(meta(corps, i.champ) ?? '')
      if (i.ou === 'entete') return i.motif.test(bas[i.nom] ?? '')
      return i.motif.test(propre)
    }
    const famillesPrises = new Set<string>()
    for (const p of PRODUITS) {
      if (p.famille && famillesPrises.has(p.famille)) continue
      const certain = p.certains.some(teste)
      const probable = !certain && (p.probables ?? []).some(teste)
      if (!certain && !probable) continue
      if (p.famille) famillesPrises.add(p.famille)

      // La version se cherche sur le corps BRUT : elle vit dans une balise `generator` ou un
      // objet JSON embarqué, pas dans un lien sortant.
      const version = premiereVersion(corps, p.version) ?? premiereVersion(corps, p.versionActif)
      ajouter({
        produit: p.produit,
        version,
        // UN INDICE DE STRUCTURE NE NOMME PAS UN PRODUIT AVEC CERTITUDE. Un chemin
        // d'actif peut survivre à une migration, un mot peut venir d'un texte.
        certitude: certain ? 'certain' : 'probable',
        source: certain ? 'meta_generator' : 'chemin_actif',
        technologieCle: certain ? cleDe(p.produit, version) : null,
      })
    }
  }

  // 5. Chemins d'actifs génériques — cadriciels et serveurs, hors catalogue de produits.
  const propre = sansLiensExternes(corps)
  for (const c of CHEMINS) {
    if (c.motif.test(propre)) {
      ajouter({ produit: c.produit, version: null, certitude: 'probable', source: 'chemin_actif', technologieCle: null })
    }
  }

  return {
    ok: true,
    codeHttp,
    message: null,
    detections,
    // Binaires et factuels : présents ou absents, sans interprétation. Aucun faux positif
    // possible, ce qui en fait le meilleur rapport valeur sur risque du scan.
    enTetes: {
      hsts: 'strict-transport-security' in bas,
      csp: 'content-security-policy' in bas,
      xFrameOptions: 'x-frame-options' in bas,
      referrerPolicy: 'referrer-policy' in bas,
    },
  }
}

/**
 * Interroge un service. Une requête, un délai court, aucune redirection suivie au-delà de deux
 * sauts — un service qui redirige en boucle ne doit pas immobiliser le scan.
 */
/** Nombre maximal de sondes par service. Un inventaire ne martèle pas ce qu'il inventorie. */
const SONDES_MAX = 6

/**
 * LE SONDAGE ACTIF DE VERSION — ce que la page ne dit pas, le produit le dit ailleurs.
 */
export async function sonder(base: string, detections: Detection[]): Promise<Detection[]> {
  const parProduit = new Map(detections.map(d => [d.produit, d]))
  const resultat = [...detections]
  let budget = SONDES_MAX

  for (const p of PRODUITS) {
    if (!p.sondes?.length) continue
    const deja = parProduit.get(p.produit)
    // On ne sonde que ce qu'on a des raisons de croire présent — ou ce qui ne ment jamais.
    const aSonder = deja ? !deja.version : p.sondes.some(x => x.toujours)
    if (!aSonder) continue

    for (const sonde of p.sondes) {
      if (budget <= 0) return resultat
      if (!deja && !sonde.toujours) continue
      budget--
      const texte = await lire(new URL(sonde.chemin, base).toString())
      if (texte === null) continue

      const confirme = sonde.confirme?.(texte) ?? false
      const version = sonde.version(texte)
      if (!confirme && !version) continue

      const courant = parProduit.get(p.produit)
      if (courant) {
        // La sonde ÉLÈVE la preuve : un chemin d'actif soupçonnait, le point d'entrée
        // officiel affirme. Et elle apporte la version, donc la clé de rapprochement.
        if (confirme) courant.certitude = 'certain'
        if (version) {
          courant.version = version
          courant.source = 'sonde_produit'
          if (courant.certitude === 'certain') courant.technologieCle = cleDe(p.produit, version)
        }
      }
      else if (confirme) {
        // Un produit que la page n'annonçait pas. Nextcloud derrière son portail de
        // connexion ne se voit que là.
        const d: Detection = {
          produit: p.produit,
          version,
          certitude: 'certain',
          source: 'sonde_produit',
          technologieCle: cleDe(p.produit, version),
        }
        resultat.push(d)
        parProduit.set(p.produit, d)
      }
      if (parProduit.get(p.produit)?.version) break
    }
  }
  return resultat
}

/** Lit une ressource, ou `null`. Jamais d'exception : une sonde qui échoue n\'apprend rien. */
async function lire(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
      headers: { 'user-agent': UA },
    })
    if (!r.ok) return null
    // 256 Ko : un CHANGELOG entier n'apporte rien de plus que ses premières lignes.
    return (await r.text()).slice(0, 256 * 1024)
  }
  catch { return null }
}

const UA = 'Catalogue-DSI/1.0 (inventaire interne)'

export async function scanner(hote: string, port: number): Promise<ResultatScan> {
  const schema = port === 80 || port === 8080 ? 'http' : 'https'
  const url = `${schema}://${hote}${(port === 443 || port === 80) ? '' : `:${port}`}/`
  const demander = (verifier: boolean) => fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
    headers: { 'user-agent': UA },
    // Extension Bun : le typage standard de fetch ne la connaît pas.
    tls: verifier ? undefined : { rejectUnauthorized: false },
  })

  let noteTls: string | null = null
  try {
    let reponse: Response
    try {
      reponse = await demander(true)
    }
    catch (e) {
      // REPLI TLS. « Certificat invalide » et « hôte injoignable » demandent deux corrections
      // différentes : sans ce second essai, un site parfaitement en ligne derrière un
      // certificat auto-signé se lisait « injoignable », et on cherchait un problème de réseau.
      if (!/certificat|certificate|self.signed|tls|ssl|unable to verify/i.test(e instanceof Error ? e.message : '')) throw e
      reponse = await demander(false)
      noteTls = 'Répond, mais le certificat n\'a pas pu être vérifié.'
    }

    const enTetes: Record<string, string> = {}
    reponse.headers.forEach((v, k) => { enTetes[k] = v })
    // 512 Ko suffisent : `generator` et les chemins d'actifs sont dans l'en-tête du
    // document. Lire une page entière exposerait le scan à un corps volontairement énorme.
    const corps = (await reponse.text()).slice(0, 512 * 1024)
    const r = analyser(enTetes, corps, reponse.status)
    return { ...r, message: noteTls, detections: await sonder(reponse.url || url, r.detections) }
  }
  catch (e) {
    // ÉCHEC ≠ ABSENCE DE TECHNOLOGIE. Le service garde ses détections précédentes, et le
    // message dit pourquoi le relevé n'a pas abouti.
    return {
      ok: false,
      codeHttp: null,
      message: e instanceof Error ? e.message : 'échec du relevé',
      detections: [],
      enTetes: null,
    }
  }
}
