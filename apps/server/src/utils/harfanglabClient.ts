// Client REST HarfangLab (Hurukai 5.11). LECTURE SEULE — aucune écriture, jamais. ⚠️ Ne JAMAIS
// appeler `POST /api/user/api_token/` : cette route RÉGÉNÈRE le jeton de l'utilisateur.

export type HarfanglabConfig = { url: string, jeton: string }

// Modes des moteurs, tels que l'API les rend : des entiers 0..3 dont la SÉMANTIQUE n'est
// documentée nulle part.
export type ModesMoteurs = {
  yara: number | null
  sigma: number | null
  ioc: number | null
  correlation: number | null
  driverblock: number | null
  driverblockStrategie: string | null
  rulesetYara: string | null
  rulesetSigma: string | null
  rulesetIoc: string | null
  rulesetCorrelation: string | null
}

export type HarfanglabAgent = {
  agentId: string
  hostname: string | null
  machineSerial: string | null
  hardwareAddress: string | null
  statut: string | null
  lastseen: string | null
  version: string | null
  ostype: string | null
  politiqueId: string | null
  politiqueNom: string | null
  /** `additional_info.additional_info1` : l'unité saisie dans HarfangLab. */
  entiteEdr: string | null
  infosAdditionnelles: Record<string, unknown> | null
  modes: ModesMoteurs
  revisions: Record<string, number | null>
}

function apiBase(url: string): string {
  const propre = url.trim().replace(/\/+$/, '')
  return propre.endsWith('/api') ? propre : `${propre}/api`
}

/**
 * Lien de page suivante, RÉSOLU contre l'origine de l\'instance. Le swagger déclare `next` en
 * `format: uri`, donc absolu.
 */
/**
 * `fetch` avec un message qui NOMME l'adresse en cause. « fetch() URL is invalid » sans
 * contexte est un message qui coûte une heure : il ne dit ni quel connecteur, ni quelle route,
 * ni quelle valeur.
 */
async function appeler(url: string, cfg: HarfanglabConfig, quoi: string): Promise<Response> {
  try {
    return await fetch(url, { headers: enTetes(cfg) })
  }
  catch (e) {
    const motif = e instanceof Error ? e.message : String(e)
    // La cause d'origine est rattachée : le message ajoute le contexte, il ne le remplace
    // pas. Sans elle, la pile d'origine disparaît et le diagnostic repart de zéro.
    throw new Error(`Appel HarfangLab impossible (${quoi}) — ${motif}. Adresse : ${url}`, { cause: e })
  }
}

function lienSuivant(next: unknown, base: string): string | null {
  if (typeof next !== 'string' || !next.trim()) return null
  try {
    const resolu = new URL(next, base)
    if (new URL(base).origin !== resolu.origin) {
      console.warn(`[harfanglab] lien de page suivante hors de l'instance (${resolu.origin}) : pagination interrompue.`)
      return null
    }
    return resolu.toString()
  }
  catch {
    console.warn(`[harfanglab] lien de page suivante illisible : ${next.slice(0, 120)}`)
    return null
  }
}

/**
 * Le jeton tel que l'en-tête l\'attend : sans préfixe de schéma, sans aucun blanc.
 */
export function normaliserJeton(brut: string | null | undefined): string {
  return (brut ?? '')
    .trim()
    .replace(/^authorization\s*:\s*/i, '')
    .replace(/^(token|bearer)\s+/i, '')
    .replace(/\s+/g, '')
}

function enTetes(cfg: HarfanglabConfig): Record<string, string> {
  return { 'Authorization': `Token ${normaliserJeton(cfg.jeton)}`, 'Accept': 'application/json' }
}

/**
 * Une redirection vers une autre origine fait perdre l'en-tête `Authorization` : `fetch` le
 * retire par sécurité, et l'outil répond « credentials were not provided » sans que le jeton
 * soit en cause.
 */
function origineChangee(depart: string, r: Response): string | null {
  if (!r.redirected) return null
  try {
    const a = new URL(depart).origin
    const b = new URL(r.url).origin
    return a === b ? null : `${a} → ${b}`
  }
  catch { return null }
}

const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Teste la connexion : une lecture minimale suffit à valider le jeton. */
export async function testerConnexionHarfanglab(cfg: HarfanglabConfig): Promise<{ ok: boolean, message: string }> {
  try {
    const adresse = `${apiBase(cfg.url)}/data/endpoint/Agent/?limit=1`
    const res = await fetch(adresse, { headers: enTetes(cfg) })
    if (res.ok) {
      const corps = await res.json() as { count?: number }
      return { ok: true, message: `Connexion à HarfangLab réussie — ${corps.count ?? '?'} agent(s) visible(s).` }
    }
    const saut = origineChangee(adresse, res)
    if (saut) {
      return { ok: false, message: `L'adresse redirige (${saut}) et le jeton est perdu en route. Saisissez directement l'adresse d'arrivée.` }
    }
    if (res.status === 401 || res.status === 403) {
      // LA RÉPONSE DE L'OUTIL, pas seulement le code : « Invalid token » (jeton faux ou
      // révoqué) et « should not contain spaces » (jeton mal collé) sont deux causes distinctes
      // derrière le même 401.
      const detail = (await res.text()).slice(0, 200)
      return { ok: false, message: `HarfangLab a refusé le jeton (HTTP ${res.status}) : ${detail || 'aucun détail'}. Vérifiez le jeton et les droits du compte (lecture des agents).` }
    }
    return { ok: false, message: `Réponse inattendue de HarfangLab (HTTP ${res.status}). Vérifiez l'URL — elle doit être l'origine, sans /api.` }
  }
  catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

type Enveloppe<T> = { count?: number, next?: string | null, results?: T[] }

/** Extrait les modes des moteurs de la politique embarquée dans l'agent. */
function modesDe(politique: Record<string, unknown> | null | undefined): ModesMoteurs {
  const p = politique ?? {}
  return {
    yara: nombre(p.yara_mode),
    sigma: nombre(p.sigma_mode),
    ioc: nombre(p.ioc_mode),
    correlation: nombre(p.correlation_mode),
    driverblock: nombre(p.driverblock_mode),
    driverblockStrategie: texte(p.driverblock_strategy),
    rulesetYara: texte(p.yara_ruleset),
    rulesetSigma: texte(p.sigma_ruleset),
    rulesetIoc: texte(p.ioc_ruleset),
    rulesetCorrelation: texte(p.correlation_ruleset),
  }
}

const CHAMPS_REVISION = [
  'effective_yara_revision', 'effective_sigma_revision', 'effective_ioc_revision',
  'effective_correlation_revision', 'effective_driver_blocklists_revision',
  'effective_whitelist_revision', 'effective_usb_device_control_revision',
] as const

/**
 * Parcourt TOUS les agents, page par page. `onLot` reçoit chaque lot pour un traitement en flux
 * — l'instance en compte plusieurs milliers.
 */
export async function parcourirAgents(
  cfg: HarfanglabConfig,
  onLot: (lot: HarfanglabAgent[]) => Promise<void>,
  opts: { taillePage?: number, maxPages?: number } = {},
): Promise<{ total: number, pages: number, tronque: boolean }> {
  const taillePage = opts.taillePage ?? 100
  // Garde-fou : une pagination qui ne se termine pas (lien `next` toujours renseigné)
  // ferait tourner la synchronisation indéfiniment. On plafonne, et on le DIT.
  const maxPages = opts.maxPages ?? 500

  let url: string | null = `${apiBase(cfg.url)}/data/endpoint/Agent/?limit=${taillePage}&offset=0`
  let total = 0
  let pages = 0

  while (url && pages < maxPages) {
    const res: Response = await appeler(url, cfg, 'agents')
    if (!res.ok) {
      throw new Error(`Lecture des agents HarfangLab a échoué (HTTP ${res.status}). Adresse : ${url}`)
    }
    const corps = await res.json() as Enveloppe<Record<string, unknown>>
    total = corps.count ?? total
    const lignes = corps.results ?? []
    // Page vide : fin du parcours, pas troncature. Voir `parcourirRessource`.
    if (!lignes.length) { url = null; break }

    await onLot(lignes.map((a) => {
      const politique = (a.policy ?? null) as Record<string, unknown> | null
      const revisions: Record<string, number | null> = {}
      for (const champ of CHAMPS_REVISION) revisions[champ.replace('effective_', '').replace('_revision', '')] = nombre(a[champ])
      return {
        agentId: String(a.id ?? ''),
        hostname: texte(a.hostname),
        machineSerial: texte(a.machine_serial),
        hardwareAddress: texte(a.hardware_address),
        statut: texte(a.status),
        lastseen: texte(a.lastseen),
        version: texte(a.version),
        ostype: texte(a.ostype),
        politiqueId: texte(politique?.id),
        politiqueNom: texte(politique?.name),
        entiteEdr: texte((a.additional_info as Record<string, unknown> | null | undefined)?.additional_info1),
        infosAdditionnelles: a.additional_info && typeof a.additional_info === 'object' ? a.additional_info as Record<string, unknown> : null,
        modes: modesDe(politique),
        revisions,
      }
    }).filter(a => a.agentId))

    pages++
    // Résolu contre l'origine : une instance derrière un proxy peut rendre `next` relatif.
    url = lienSuivant(corps.next, apiBase(cfg.url))
  }

  // Tronqué UNIQUEMENT au plafond, jamais sur une fin normale.
  return { total, pages, tronque: url !== null && pages >= maxPages }
}

/**
 * Révisions des jeux de règles d'une politique. `GET
 * /api/data/endpoint/Policy/{id}/engine_revision/` → 7 compteurs entiers.
 */
export async function lireRevisionsPolitique(cfg: HarfanglabConfig, politiqueId: string): Promise<Record<string, number> | null> {
  const res = await appeler(
    `${apiBase(cfg.url)}/data/endpoint/Policy/${encodeURIComponent(politiqueId)}/engine_revision/`,
    cfg, `révisions de la politique ${politiqueId}`,
  )
  // Une politique disparue n'est pas une panne : on rend null et le relevé continue.
  if (!res.ok) return null
  return await res.json() as Record<string, number>
}

// --- Listes blanches : PLUS LUES ICI ----------------------------------------------------
// `parcourirWhitelists` a été retiré. Le Catalogue n'appelle plus `GET
// /api/data/threat_intelligence/WhitelistRule/` : c'est SNIFF qui lit l'EDR et apparie les
// règles aux exclusions, y compris à la main, et le Catalogue lit son inventaire
// (`lireReglesHarfanglab` dans `slowpokeClient.ts`).

// --- Contenu des moteurs : jeux de règles et règles -----------------------------------
// ROUTES — relevées dans le swagger de l'instance (Hurukai 5.11), pas devinées : Ruleset GET
// /api/data/threat_intelligence/Ruleset/ YARA GET /api/data/threat_intelligence/YaraFile/ ←
// FICHIER, pas règle Sigma GET /api/data/threat_intelligence/SigmaRule/ IOC GET
// /api/data/threat_intelligence/IOCRule/…

export type MoteurEdr = 'yara' | 'sigma' | 'ioc' | 'correlation' | 'driverblock'

const CHEMIN_REGLES: Record<MoteurEdr, string> = {
  yara: 'YaraFile',
  sigma: 'SigmaRule',
  ioc: 'IOCRule',
  correlation: 'CorrelationRule',
  driverblock: 'DriverBlocklist',
}

export type RulesetHl = {
  rulesetId: string
  moteur: MoteurEdr
  nom: string
  description: string | null
  actif: boolean | null
  detectionPoste: boolean | null
  blocageAgent: boolean | null
  quarantaineAgent: boolean | null
  compteurs: Record<string, number>
  politiques: { id: string, nom: string | null }[]
  dateCreation: string | null
  dateMaj: string | null
}

export type RegleHl = {
  moteur: MoteurEdr
  harfanglabId: string
  nom: string | null
  description: string | null
  contenu: string | null
  typeIndicateur: string | null
  valeur: string | null
  actif: boolean | null
  etat: string | null
  etatEffectif: string | null
  sourceId: string | null
  sourceNom: string | null
  fourniParEditeur: boolean | null
  rulesets: { id: string, nom: string | null }[]
  brut: unknown
  dateCreation: string | null
  dateMaj: string | null
}

const booleen = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

// Premier champ non vide parmi plusieurs noms possibles.
function premier(o: Record<string, unknown>, noms: string[]): string | null {
  for (const n of noms) {
    const v = texte(o[n])
    if (v) return v
  }
  return null
}

function refs(v: unknown): { id: string, nom: string | null }[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => {
    if (typeof x === 'string') return { id: x, nom: null }
    const o = x as Record<string, unknown>
    return { id: String(o.id ?? ''), nom: texte(o.name) }
  }).filter(r => r.id)
}

/** Parcours générique d'une ressource paginée `threat_intelligence`. */
/**
 * Parcours générique d'une ressource paginée `threat_intelligence`. ⚠️ « TRONQUÉ » NE VEUT DIRE
 * QU'UNE SEULE CHOSE : le plafond de pages a été atteint et il reste des lignes à lire.
 */
async function parcourirRessource(
  cfg: HarfanglabConfig,
  chemin: string,
  taillePage: number,
  maxPages: number,
): Promise<{ lignes: Record<string, unknown>[], tronque: boolean, pages: number }> {
  let url: string | null = `${apiBase(cfg.url)}/data/threat_intelligence/${chemin}/?limit=${taillePage}&offset=0`
  const lignes: Record<string, unknown>[] = []
  let pages = 0

  while (url && pages < maxPages) {
    const res: Response = await appeler(url, cfg, chemin)
    if (!res.ok) throw new Error(`Lecture de ${chemin} a échoué (HTTP ${res.status}). Adresse : ${url}`)
    const corps = await res.json() as Enveloppe<Record<string, unknown>>
    const lot = corps.results ?? []
    // Page vide : c'est la FIN du parcours, pas une troncature. Certaines instances
    // rendent encore un `next` sur la dernière page.
    if (!lot.length) { url = null; break }
    lignes.push(...lot)
    pages++
    url = lienSuivant(corps.next, apiBase(cfg.url))
  }

  // Tronqué UNIQUEMENT si on s'est arrêté au plafond alors qu'un lien restait à suivre.
  const tronque = url !== null && pages >= maxPages
  if (tronque) {
    console.warn(`[harfanglab] ${chemin} : plafond de ${maxPages} pages atteint, ${lignes.length} ligne(s) lues — le relevé est PARTIEL.`)
  }
  return { lignes, tronque, pages }
}

export async function parcourirRulesets(
  cfg: HarfanglabConfig,
  opts: { taillePage?: number, maxPages?: number } = {},
): Promise<RulesetHl[]> {
  const { lignes } = await parcourirRessource(cfg, 'Ruleset', opts.taillePage ?? 200, opts.maxPages ?? 50)
  const MOTEURS: MoteurEdr[] = ['yara', 'sigma', 'ioc', 'correlation']
  return lignes.map((r) => {
    const moteur = texte(r.engine) as MoteurEdr | null
    const compteurs: Record<string, number> = {}
    for (const [k, v] of Object.entries(r)) {
      if (k.endsWith('_rule_count') && typeof v === 'number') compteurs[k.replace('_rule_count', '')] = v
    }
    return {
      rulesetId: String(r.id ?? ''),
      // Un moteur inconnu n'est pas rangé au hasard : sans correspondance, la ligne est
      // écartée plutôt que rattachée à un moteur qu'elle ne concerne pas.
      moteur: moteur && MOTEURS.includes(moteur) ? moteur : ('' as MoteurEdr),
      nom: texte(r.name) ?? '(sans nom)',
      description: texte(r.description),
      actif: booleen(r.enabled),
      detectionPoste: booleen(r.endpoint_detection),
      blocageAgent: booleen(r.block_on_agent),
      quarantaineAgent: booleen(r.quarantine_on_agent),
      compteurs,
      politiques: refs(r.agent_policies),
      dateCreation: texte(r.creation_date),
      dateMaj: texte(r.last_update),
    }
  }).filter(r => r.rulesetId && r.moteur)
}

export async function parcourirRegles(
  cfg: HarfanglabConfig,
  moteur: MoteurEdr,
  opts: { taillePage?: number, maxPages?: number } = {},
): Promise<{ regles: RegleHl[], tronque: boolean }> {
  const { lignes, tronque } = await parcourirRessource(
    cfg, CHEMIN_REGLES[moteur], opts.taillePage ?? 200, opts.maxPages ?? 500,
  )
  const regles = lignes.map((r) => {
    const source = (r.source ?? null) as Record<string, unknown> | null
    return {
      moteur,
      harfanglabId: String(r.id ?? ''),
      nom: premier(r, ['name', 'rule_name', 'title']),
      description: premier(r, ['description', 'comment']),
      // Corps de la règle. `content` couvre le fichier YARA ; les moteurs à règles
      // structurées exposent leur définition sous des noms voisins.
      contenu: premier(r, ['content', 'rule', 'rule_content', 'raw', 'definition', 'body']),
      typeIndicateur: premier(r, ['type', 'ioc_type', 'indicator_type']),
      valeur: premier(r, ['value', 'indicator', 'hash']),
      actif: booleen(r.enabled),
      etat: premier(r, ['state', 'global_state', 'hl_status']),
      // L'API expose `state`, `global_state` ET `effective_state` sans dire lequel prime.
      // On garde l'« effectif » à part : c'est le seul dont le nom affirme quelque chose.
      etatEffectif: premier(r, ['effective_state']),
      sourceId: texte(r.source_id) ?? texte(source?.id),
      sourceNom: texte(source?.name) ?? texte(r.source_name),
      fourniParEditeur: booleen(r.provided_by_hlab),
      rulesets: refs(r.rulesets ?? r.ruleset_list),
      brut: r,
      dateCreation: premier(r, ['creation_date', 'created_at']),
      dateMaj: premier(r, ['last_update', 'updated_at']),
    }
  }).filter(r => r.harfanglabId)
  return { regles, tronque }
}
