// Client Slowpoke (« Sniff ») — LECTURE SEULE des incidents. Auth : un COMPTE DE SERVICE
// Slowpoke (clé passée en en-tête `x-service-key`).

export type SlowpokeConfig = { url: string, cleService: string }

// Incident tel que renvoyé par Slowpoke. Pas de champ « nom » : le libellé se dérive du type +
// date (voir `libelleIncident`).
export type SlowpokeIncident = {
  id: string
  type: string
  severity: string
  status: string
  resolution: string | null
  description: string | null
  source: string | null
  knowledgeAt?: string | null
  knowledgeEstimated?: boolean | null
  createdAt: string
  updatedAt: string
}

// Détail de l'incident, dont la forme dépend du type. Seul `detectedAt` nous intéresse.
type DetailDate = { detectedAt?: string | null } | null | undefined

export type SlowpokeIncidentDetaille = SlowpokeIncident & {
  malwareDetails?: DetailDate
  phishingDetails?: DetailDate
  ransomwareDetails?: DetailDate
  dataBreachDetails?: DetailDate
  ddosDetails?: DetailDate
  intrusionDetails?: DetailDate
}

/** La plus ANCIENNE date de constat parmi les détails — la plus prudente. */
export function dateConstatDuDetail(d: SlowpokeIncidentDetaille): Date | null {
  const dates = [d.malwareDetails, d.phishingDetails, d.ransomwareDetails,
    d.dataBreachDetails, d.ddosDetails, d.intrusionDetails]
    .map(x => x?.detectedAt)
    .filter((s): s is string => !!s)
    .map(s => new Date(s))
    .filter(x => !Number.isNaN(x.getTime()))
  if (!dates.length) return null
  return new Date(Math.min(...dates.map(x => x.getTime())))
}

function origine(url: string): string {
  try { return new URL(url).origin }
  catch { return url.trim().replace(/\/+$/, '') }
}

// `Record<string, string>` et non `HeadersInit` : ce dernier est un type DOM, absent du
// contexte de compilation du paquet `eden` qui compile pourtant ces fichiers.
function enTetes(cfg: SlowpokeConfig): Record<string, string> {
  return { 'x-service-key': cfg.cleService, 'Accept': 'application/json' }
}

// Teste la clé de service : une lecture minimale (1 incident) suffit à valider l'accès.
export async function testerConnexionSlowpoke(cfg: SlowpokeConfig): Promise<{ ok: boolean, message: string }> {
  try {
    const base = origine(cfg.url)
    const res = await fetch(`${base}/api/incidents?pageSize=1`, { headers: enTetes(cfg) })
    if (res.ok) return { ok: true, message: 'Connexion à Slowpoke réussie (compte de service).' }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Slowpoke a refusé la clé de service (HTTP ${res.status}). Vérifiez la clé et que le compte de service a l'accès en lecture aux incidents.` }
    }
    return { ok: false, message: `Réponse inattendue de Slowpoke (HTTP ${res.status}). Vérifiez l'URL.` }
  }
  catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

// Détail d'un incident. Appelé UNIQUEMENT quand `knowledgeAt` manque : la liste ne renvoie
// aucune relation, et interroger le détail de chaque incident coûterait une requête par
// incident sans rien apporter dans le cas normal.
export async function lireIncident(cfg: SlowpokeConfig, id: string): Promise<SlowpokeIncidentDetaille | null> {
  try {
    const base = origine(cfg.url)
    const res = await fetch(`${base}/api/incidents/${encodeURIComponent(id)}?with=details`, { headers: enTetes(cfg) })
    if (!res.ok) return null
    return await res.json() as SlowpokeIncidentDetaille
  }
  catch { return null }
}

export async function lireIncidents(cfg: SlowpokeConfig, opts: { pageSize?: number, status?: string } = {}): Promise<SlowpokeIncident[]> {
  const base = origine(cfg.url)
  const p = new URLSearchParams()
  p.set('pageSize', String(opts.pageSize ?? 50))
  p.set('order', 'desc')
  if (opts.status) p.set('status', opts.status)
  const res = await fetch(`${base}/api/incidents?${p.toString()}`, { headers: enTetes(cfg) })
  if (!res.ok) {
    throw new Error(`Lecture des incidents Slowpoke a échoué (HTTP ${res.status}).`)
  }
  return await res.json() as SlowpokeIncident[]
}

// Incidents rattachés à une MACHINE, par son identifiant GLPI. Sniff et le Catalogue
// synchronisent le même inventaire : `incident_machine.glpi_id` là-bas et `glpi_machine.glpiId`
// ici désignent la même machine.
export async function lireIncidentsMachine(cfg: SlowpokeConfig, glpiId: string, opts: { limite?: number } = {}): Promise<SlowpokeIncident[]> {
  const base = origine(cfg.url)
  const p = new URLSearchParams()
  p.set('limit', String(opts.limite ?? 20))
  const res = await fetch(`${base}/api/machines/${encodeURIComponent(glpiId)}/incidents?${p.toString()}`, { headers: enTetes(cfg) })
  if (!res.ok) {
    // Le 404 mérite son propre message : il signale une instance Sniff ANTÉRIEURE à l'ajout de
    // cette route, pas une machine sans incident.
    if (res.status === 404) {
      throw new Error('Sniff ne connaît pas la route des incidents par machine (instance à mettre à jour).')
    }
    throw new Error(`Lecture des incidents de la machine a échoué (HTTP ${res.status}).`)
  }
  return await res.json() as SlowpokeIncident[]
}

/** Machines rattachées à un incident (identifiants GLPI compris quand ils existent). */
export async function lireMachinesIncident(cfg: SlowpokeConfig, id: string): Promise<{ nom: string, glpiId: string | null }[]> {
  const base = origine(cfg.url)
  const res = await fetch(`${base}/api/incidents/${encodeURIComponent(id)}/machines`, { headers: enTetes(cfg) })
  if (!res.ok) throw new Error(`Lecture des machines de l'incident a échoué (HTTP ${res.status}).`)
  return await res.json() as { nom: string, glpiId: string | null }[]
}

/**
 * Exclusions (listes blanches) déclarées dans Sniff. Route ouverte aux comptes de service en
 * lecture — rien à ajouter côté Sniff.
 */
export type ExclusionSlowpoke = {
  id: string
  incidentId: string
  tool: string
  toolOther: string | null
  scope: string
  scopeDetails: Record<string, string> | null
  reason: string
  createdAt: string
  reviewDate: string | null
  outilRef: string | null
  state: string
}

export async function lireExclusions(cfg: SlowpokeConfig): Promise<ExclusionSlowpoke[]> {
  const base = origine(cfg.url)
  const res = await fetch(`${base}/api/exclusions/`, { headers: enTetes(cfg) })
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Sniff ne connaît pas la route des exclusions (instance à mettre à jour).')
    }
    throw new Error(`Lecture des exclusions Sniff a échoué (HTTP ${res.status}).`)
  }
  return await res.json() as ExclusionSlowpoke[]
}

// --- Inventaire des règles HarfangLab, lu chez Sniff ------------------------------------
// POURQUOI PASSER PAR SNIFF PLUTÔT QUE D'APPELER L'EDR. Le rapprochement règle ↔ exclusion est
// un JUGEMENT, y compris manuel depuis que Sniff permet d'apparier à la main.

export type RegleHarfanglabSniff = {
  ref: string
  libelle: string | null
  /** ⚠️ Porte la MÊME valeur que `libelle` : dans HarfangLab, le commentaire tient lieu de nom. */
  commentaire: string | null
  criteres: string[] | null
  cible: string | null
  active: boolean
  fourniParEditeur: boolean
  creeeLe: string | null
  presente: boolean
  tags: string[] | null
  champTags: string | null
  /** Au plus UN objet : Sniff garantit une seule exclusion ACTIVE par règle. */
  exclusion: {
    id: string
    incidentId: string
    motif: string | null
    reviewDate: string | null
    state: string
  } | null
}

export type EtatSyncSniff = {
  cle: string
  dernierSucces: string | null
  dernierEssai: string | null
  dernierOk: boolean
  derniereErreur: string | null
  echecsConsecutifs: number
  dernierBilan: string | null
}

/**
 * Parcourt l'inventaire complet. Le témoin d\'activité (`etat`) est rendu avec : sans lui, un
 * inventaire vide et un connecteur en panne se ressemblent.
 */
export async function lireReglesHarfanglab(
  cfg: SlowpokeConfig,
  opts: { taillePage?: number, maxPages?: number } = {},
): Promise<{ regles: RegleHarfanglabSniff[], etat: EtatSyncSniff | null, total: number, tronque: boolean }> {
  const base = origine(cfg.url)
  // 1000 est le plafond annoncé par Sniff : 5 appels pour l'inventaire actuel.
  const taille = Math.min(1000, opts.taillePage ?? 1000)
  const maxPages = opts.maxPages ?? 50

  const regles: RegleHarfanglabSniff[] = []
  let etat: EtatSyncSniff | null = null
  let total = 0
  let pages = 0

  while (pages < maxPages) {
    const p = new URLSearchParams({ limit: String(taille), offset: String(pages * taille) })
    const res = await fetch(`${base}/api/harfanglab/regles?${p.toString()}`, { headers: enTetes(cfg) })
    if (!res.ok) {
      // Le 404 mérite son propre message : il désigne une instance Sniff antérieure à cette
      // route, pas un inventaire vide.
      if (res.status === 404) {
        throw new Error('Sniff ne connaît pas la route de l\'inventaire des règles HarfangLab (instance à mettre à jour, migration 0035 comprise).')
      }
      throw new Error(`Lecture des règles HarfangLab chez Sniff a échoué (HTTP ${res.status}).`)
    }
    const corps = await res.json() as { total?: number, etat?: EtatSyncSniff, resultats?: RegleHarfanglabSniff[] }
    etat = corps.etat ?? etat
    total = corps.total ?? total
    const lot = corps.resultats ?? []
    regles.push(...lot)
    pages++
    // On s'arrête sur une page incomplète OU sur le total annoncé : les deux se vérifient,
    // et un écart entre eux vaut mieux que d'être découvert par une boucle sans fin.
    if (lot.length < taille || regles.length >= total) break
  }

  return { regles, etat, total, tronque: regles.length < total }
}

// --- Compteurs réglementaires, lus chez Sniff -------------------------------------------
// `GET /api/echeances` — préfixe neuf, et c'est délibéré : `/api/incidents/:id/echeances`
// existe déjà chez eux, et une route en lot sous ce préfixe aurait été capturée par le
// paramètre dynamique.

export type EcheanceSniff = {
  cle: string
  nom: string | null
  delaiHeures: number | null
  depart: string | null
  /** Texte qui CHANGE selon les réglages de Sniff. À afficher tel quel, jamais à analyser. */
  condition: string | null
  porteur: string | null
  /** Ce que la grille prévoit avant toute décision : applicable | a_evaluer | non_applicable. */
  defaut: string | null
  /** La décision prise, ou `null` si personne n'a tranché. */
  applicable: boolean | null
  decidePar: string | null
  decideLe: string | null
  /** Applicable ET rien de déposé. LE champ qui dit s'il faut surveiller. Jamais recalculé. */
  court: boolean
  echeance: string | null
  heuresRestantes: number | null
  deposeLe: string | null
  reference: string | null
  deposePar: string | null
}

export type IncidentEcheancesSniff = {
  incidentId: string
  type: string | null
  severity: string | null
  niveau: string | null
  statut: string | null
  knowledgeAt: string | null
  knowledgeEstimated: boolean | null
  echeances: EcheanceSniff[]
}

export async function lireEcheancesSniff(
  cfg: SlowpokeConfig,
  opts: { depuis?: string, taillePage?: number, maxPages?: number } = {},
): Promise<{
  incidents: IncidentEcheancesSniff[]
  total: number
  /** `incidentsSansDecision` distingue « rien à signaler » de « personne n'a tranché ». */
  etat: { derniereDecision: string | null, incidentsSansDecision: number } | null
  tronque: boolean
}> {
  const base = origine(cfg.url)
  const taille = Math.min(1000, opts.taillePage ?? 200)
  const maxPages = opts.maxPages ?? 100

  const incidents: IncidentEcheancesSniff[] = []
  let etat: { derniereDecision: string | null, incidentsSansDecision: number } | null = null
  let total = 0
  let pages = 0

  while (pages < maxPages) {
    const p = new URLSearchParams({ limit: String(taille), offset: String(pages * taille) })
    if (opts.depuis) p.set('depuis', opts.depuis)
    const res = await fetch(`${base}/api/echeances?${p.toString()}`, { headers: enTetes(cfg) })
    if (!res.ok) {
      // Le 404 désigne une instance Sniff antérieure à cette route, pas une absence de
      // compteurs.
      if (res.status === 404) {
        throw new Error('Sniff ne connaît pas la route des compteurs réglementaires (instance à mettre à jour, migrations 0035 et 0036 comprises).')
      }
      throw new Error(`Lecture des compteurs réglementaires chez Sniff a échoué (HTTP ${res.status}).`)
    }
    const corps = await res.json() as {
      total?: number
      etat?: { derniereDecision: string | null, incidentsSansDecision: number }
      resultats?: IncidentEcheancesSniff[]
    }
    etat = corps.etat ?? etat
    total = corps.total ?? total
    const lot = corps.resultats ?? []
    incidents.push(...lot)
    pages++
    if (lot.length < taille || incidents.length >= total) break
  }

  return { incidents, total, etat, tronque: incidents.length < total }
}

// --- REVUES DE LISTES BLANCHES, lues chez Sniff ------------------------------------------
// Depuis Sniff 1fae1c7, le registre a deux moitiés : les exclusions nées d'un incident, et les
// REVUES ISOLÉES — règles de l'EDR posées hors incident, avec leur motif et leur échéance.

export type RevueListeBlancheSniff = {
  id: string
  tool: string | null
  regleRef: string
  libelle: string | null
  motif: string | null
  echeance: string | null
  etat: string
  creeLe: string | null
  remplaceeLe: string | null
  remplaceeParExclusion: string | null
  leveeLe: string | null
  motifLevee: string | null
}

/**
 * Les revues isolées de Sniff, par référence de règle. `null` — et NON une liste vide — quand
 * l'instance Sniff ne connaît pas encore cette route : « pas de revue » et « je ne sais pas »
 * ne se ressemblent pas.
 */
export async function lireRevuesListesBlanches(
  cfg: SlowpokeConfig,
  etat: 'active' | 'remplacee' | 'levee' = 'active',
): Promise<Map<string, RevueListeBlancheSniff> | null> {
  const res = await fetch(`${origine(cfg.url)}/api/exclusions/revues?etat=${etat}`, { headers: enTetes(cfg) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Lecture des revues de listes blanches chez Sniff a échoué (HTTP ${res.status}).`)
  const corps = await res.json() as RevueListeBlancheSniff[] | { resultats?: RevueListeBlancheSniff[] }
  const liste = Array.isArray(corps) ? corps : corps.resultats ?? []
  const parRegle = new Map<string, RevueListeBlancheSniff>()
  for (const r of liste) if (r?.regleRef) parRegle.set(r.regleRef, r)
  return parRegle
}

/**
 * LE MOTIF BRUT DE CLÔTURE DU SOC, quand la fiche le porte. Depuis la mise à jour du
 * vocabulaire de Sniff, une fiche close pour `no_security_risk` ou `no_longer_applicable` a
 * `resolution: null` : Sniff ne déduit plus de résolution d'un motif de clôture.
 */
export function motifClotureSoc(incident: unknown): string | null {
  const i = (incident ?? {}) as Record<string, unknown>
  const meta = (i.metadata ?? i.metadonnees ?? {}) as Record<string, unknown>
  for (const v of [i.motifClotureSoc, i.motif_cloture_soc, meta.motifClotureSoc, meta.motif_cloture_soc]) {
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 200)
  }
  return null
}

/**
 * LES MISES EN GARDE DE SNIFF, relayées telles quelles. Le Catalogue transmet des champs dont
 * la définition vit chez Sniff — `resolution` en premier.
 */
export async function lireLecturesSniff(cfg: SlowpokeConfig): Promise<unknown | null> {
  const res = await fetch(`${origine(cfg.url)}/api/lectures`, {
    headers: enTetes(cfg),
    signal: AbortSignal.timeout(5000),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Lecture des mises en garde de Sniff a échoué (HTTP ${res.status}).`)
  return await res.json() as unknown
}
