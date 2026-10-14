import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { technologie } from '@catalogue/database/tables'
import { cyclePourOs, cyclesDuProduit, produitDe } from './eolApi'
import { PRODUITS } from './scanProduits'

// ENRICHISSEMENT CIBLÉ D'UNE TECHNOLOGIE, après détection. POURQUOI SÉPARÉ DE
// `/api/eol/enrichir`.

/** Une journée. Au-delà, on réinterroge ; en deçà, la valeur en base fait foi. */
const FRAICHEUR_MS = 24 * 3600 * 1000

/**
 * Crée la ligne de référentiel si elle manque, puis complète ses dates et ses versions.
 */
export async function enrichirTechnologie(
  cle: string,
  produitBrut: string,
  version: string | null,
  categorie: 'serveur_web' | 'langage' | 'framework' | 'autre',
): Promise<string | null> {
  const [existante] = await db.select().from(technologie).where(eq(technologie.nom, cle)).limit(1)

  // Fraîche et déjà renseignée : rien à refaire. Interroger la source à chaque relevé
  // d'un service la solliciterait autant de fois qu'on a de sites sous WordPress.
  if (existante?.derniereVersionReleveeLe
    && Date.now() - existante.derniereVersionReleveeLe.getTime() < FRAICHEUR_MS) {
    return existante.id
  }
  // La décision humaine ne se réécrit pas.
  if (existante?.sourceEol === 'manuel') return existante.id

  const produit = produitDe(produitBrut)
  if (!produit) {
    // Produit inconnu de la source : on crée quand même la ligne, sans dates.
    if (existante) return existante.id
    const [creee] = await db.insert(technologie)
      .values({ nom: cle, categorie })
      .onConflictDoNothing()
      .returning({ id: technologie.id })
    return creee?.id
      ?? (await db.select({ id: technologie.id }).from(technologie).where(eq(technologie.nom, cle)).limit(1))[0]?.id
      ?? null
  }

  const cycles = await cyclesDuProduit(produit)
  if (!cycles) {
    // Source injoignable : on ne touche à RIEN. Écrire des dates nulles effacerait ce
    // qu'on savait, et une panne réseau ferait disparaître un « hors support » connu.
    return existante?.id ?? null
  }

  const cycle = cyclePourOs(cycles, produit, produitBrut, version)
  // La DERNIÈRE version du produit, tous cycles confondus : c'est le premier cycle rendu
  // par la source, qui les ordonne du plus récent au plus ancien.
  const generale = cycles[0]?.latest ?? null

  const patch: Record<string, unknown> = {
    sourceEol: 'api',
    derniereVersionGenerale: generale,
    derniereVersionReleveeLe: new Date(),
    updatedAt: new Date(),
  }
  if (cycle) {
    if (cycle.eol) patch.finDeVie = cycle.eol
    if (cycle.etendu) patch.finDeVieEtendue = cycle.etendu
    patch.derniereVersionBranche = cycle.latest
    // `brancheMaintenue` : la fin de support de CE cycle est-elle future ? `supporteSansDate`
    // signifie que l'éditeur déclare le support en cours sans annoncer de date — donc oui.
    patch.brancheMaintenue = cycle.supporteSansDate
      ? true
      : cycle.eol
        ? cycle.eol > new Date().toISOString().slice(0, 10)
        : null
  }

  if (existante) {
    await db.update(technologie).set(patch).where(eq(technologie.id, existante.id))
    return existante.id
  }
  const [creee] = await db.insert(technologie)
    .values({ nom: cle, categorie, ...patch } as never)
    .onConflictDoNothing()
    .returning({ id: technologie.id })
  return creee?.id
    ?? (await db.select({ id: technologie.id }).from(technologie).where(eq(technologie.nom, cle)).limit(1))[0]?.id
    ?? null
}

// LES PRODUITS APPLICATIFS SONT CEUX QUE LE SCAN DÉCLARE. La liste recopiée ici en expression
// régulière ne connaissait que sept CMS : Magento, Moodle, Zimbra ou Nextcloud tombaient en «
// autre », rangé APRÈS le serveur web, et la fiche d'une boutique Magento annonçait « Apache »
// comme technologie…
const APPLICATIFS = new Set(PRODUITS.map(p => p.produit.toLowerCase()))

/**
 * La catégorie de référentiel d'un produit détecté. Le référentiel n\'a pas de catégorie « cms »
 * : un produit applicatif s'y range en `framework`, ce qui le place avant le langage et le
 * serveur web dans `principale()`.
 */
export function categorieDe(produit: string): 'serveur_web' | 'langage' | 'framework' | 'autre' {
  const s = produit.toLowerCase()
  if (APPLICATIFS.has(s)) return 'framework'
  if (/apache|nginx|iis|tomcat|caddy|lighttpd/.test(s)) return 'serveur_web'
  if (/php|python|node|ruby|perl/.test(s)) return 'langage'
  if (/symfony|next|laravel/.test(s)) return 'framework'
  return 'autre'
}
