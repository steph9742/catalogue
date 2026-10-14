import { auth } from '@catalogue/auth'
import { db } from '@catalogue/database'
import { auditLog } from '@catalogue/database/tables'
import { notify } from './notify'
import { CATEGORIES } from './categories'

type InsertAudit = typeof auditLog.$inferInsert

// Instantané de l'état AVANT modification (posé par les handlers PATCH), pour
// calculer le diff champ→champ dans le hook onAfterResponse. Clé = l'objet Request.
export const beforeSnapshot = new WeakMap<Request, Record<string, unknown>>()

// Sur mutation (onAfterResponse) : journalise l'audit ET diffuse l'événement.
const SKIP = new Set(['auth', 'dashboard', 'alerts', 'audit', 'push'])

function parse(request: Request) {
  const method = request.method
  if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT' && method !== 'DELETE') return null
  const parts = new URL(request.url).pathname.split('/').filter(Boolean) // ['api','applications','id']
  if (parts[0] !== 'api') return null
  const entite = parts[1]
  if (!entite || SKIP.has(entite)) return null

  const isImport = parts[2] === 'import'
  // SOUS-COLLECTIONS — quand le segment 2 est un nom de collection et non un identifiant («
  // /api/rgpd/liens/:id », « /api/rgpd/exigences/:id/liens »), l'identifiant réel est le
  // segment 3.
  const SOUS_COLLECTIONS = new Set(['liens', 'exigences', 'notifications'])
  const idReel = SOUS_COLLECTIONS.has(parts[2] ?? '') ? (parts[3] ?? '') : (parts[2] ?? '')
  // ACTIONS GROUPÉES — « lot » n'est pas un identifiant de fiche. Sans ce cas particulier, le
  // journal enregistrait `entiteId = 'lot'` (un identifiant qui n'existe pas) et la
  // notification annonçait « applications · lot », ce qui ne renseigne sur rien.
  const isLot = parts[2] === 'lot'
  const isAnnulation = isLot && parts[3] === 'annuler'

  const action = isImport
    ? 'import'
    // Une annulation REMET DES VALEURS EN PLACE : c'est une modification, jamais une
    // création — même quand elle réinsère des lignes supprimées (la route est en POST).
    : isAnnulation
        ? 'update'
        : method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update'

  return {
    entite,
    action,
    entiteId: (isImport || isLot) ? '' : idReel,
    lot: isLot ? (isAnnulation ? 'annulation' as const : 'masse' as const) : null,
  }
}

/** Nombre de lignes touchées, lu dans la réponse de la route de lot. */
function lignesTouchees(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null
  const r = response as Record<string, unknown>
  for (const cle of ['modifiees', 'supprimees', 'restaurees']) {
    if (typeof r[cle] === 'number') return r[cle] as number
  }
  return null
}

// --- MISE EN FORME DES NOTIFICATIONS ---------------------------------------------------
// Une notification doit se lire d'un coup d'œil, sur un écran verrouillé.

/** Nom lisible d'une fiche, cherché dans les champs qui font office de titre. */
function nomLisible(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  // `prenom + nom` d'abord : sur une personne, « Dupont » seul est ambigu.
  if (typeof r.prenom === 'string' && typeof r.nom === 'string') return `${r.prenom} ${r.nom}`.trim()
  for (const cle of ['nom', 'hostname', 'intitule', 'titre', 'reference', 'libelle', 'email']) {
    const v = r[cle]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Libellé humain d'un catalogue : `applications` → « applications ». */
function libelleEntite(entite: string, pluriel = true): string {
  const trouve = CATEGORIES.find(c => c.key === entite)?.label
  const base = (trouve ?? entite.replace(/-/g, ' ')).toLowerCase()
  return pluriel ? base : base.replace(/s$/, '')
}

// Champs dont le nom technique ne se devine pas : on les nomme comme dans l'interface.
const CHAMPS: Record<string, string> = {
  criticite: 'criticité', categorie: 'catégorie', environnement: 'environnement',
  statut: 'statut', composanteId: 'composante', serviceId: 'service',
  departementId: 'département', lieuId: 'lieu', responsableId: 'responsable',
  finDeVie: 'fin de vie', finDeVieEtendue: 'fin de support étendu',
  niveauAcces: 'niveau d\'accès', sourceGlpi: 'origine GLPI', conformite: 'conformité',
  osVersion: 'version du système', os: 'système', notes: 'notes',
  'rgpd.aipdStatut': "statut de l'analyse d'impact", 'rgpd.aipdMotif': "motif de l'analyse d'impact",
  'rgpd.aipdMotifPrecision': 'précision du motif', 'rgpd.aipdConclusion': "conclusion de l'analyse d'impact",
  'rgpd.aipdConclusionDetail': 'détail de la conclusion', 'rgpd.aipdDate': "date de l'analyse d'impact",
  'rgpd.aipdRevueDate': "réexamen de l'analyse d'impact", 'rgpd.notes': 'notes RGPD',
  rgpdExigences: 'exigences RGPD évaluées', rgpd: 'volet RGPD',
}
const libelleChamp = (f: string) =>
  CHAMPS[f] ?? f.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase()

/** Première lettre en majuscule, le reste inchangé (« criticité » → « Criticité »). */
const capitale = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t)

const isScalar = (v: unknown) => v === null || v === undefined || ['string', 'number', 'boolean'].includes(typeof v)
const norm = (v: unknown) => (v === null || v === undefined || v === '') ? '' : String(v)

// Clés de pure mécanique, sans valeur de preuve : les comparer ferait crier le diff sur
// chaque enregistrement (updatedAt change toujours), le rendant illisible.
const CLES_TECHNIQUES = new Set(['id', 'createdAt', 'updatedAt', 'applicationId'])

/**
 * Forme canonique d'une valeur, pour comparer un instantané de base à une charge utile : clés
 * techniques et valeurs vides retirées, clés triées, tableaux insensibles à l'ordre.
 */
function canonique(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v.map(canonique).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)
  }
  if (v && typeof v === 'object') {
    const nettoye: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      if (CLES_TECHNIQUES.has(k)) continue
      const sv = (v as Record<string, unknown>)[k]
      if (sv === null || sv === undefined || sv === '') continue
      nettoye[k] = canonique(sv)
    }
    return nettoye
  }
  return v
}

// Champs modifiés (from → to), scalaires ET relations. Les valeurs non scalaires étaient
// ignorées : le journal disait « modification » sans jamais dire CE QUI avait changé dans le
// volet RGPD, les déploiements ou les responsables.
export function computeChanges(before: Record<string, unknown>, body: Record<string, unknown>) {
  const changes: { field: string, from: unknown, to: unknown }[] = []
  for (const [field, to] of Object.entries(body)) {
    const from = before[field]

    if (Array.isArray(to) || Array.isArray(from)) {
      const avant = canonique(from ?? [])
      const apres = canonique(to ?? [])
      if (JSON.stringify(avant) !== JSON.stringify(apres)) changes.push({ field, from: avant, to: apres })
      continue
    }

    if (to && typeof to === 'object') {
      const objAvant = (from && typeof from === 'object' ? from : {}) as Record<string, unknown>
      for (const [sousChamp, sv] of Object.entries(to as Record<string, unknown>)) {
        if (!isScalar(sv) || CLES_TECHNIQUES.has(sousChamp)) continue
        const av = objAvant[sousChamp]
        if (norm(av) === norm(sv)) continue
        changes.push({ field: `${field}.${sousChamp}`, from: av ?? null, to: sv ?? null })
      }
      continue
    }

    // `null` posé sur une relation objet : c'est un effacement (case RGPD décochée, par
    // exemple), et l'état effacé mérite d'être conservé.
    if (to === null && from && typeof from === 'object') {
      changes.push({ field, from: canonique(from), to: null })
      continue
    }

    if (!isScalar(to)) continue
    if (norm(from) === norm(to)) continue
    changes.push({ field, from: from ?? null, to: to ?? null })
  }
  return changes
}

export async function afterMutation(ctx: {
  request: Request
  body?: unknown
  response?: unknown
  set?: { status?: number | string }
}) {
  const request = ctx.request
  const p = parse(request)
  const snapshot = beforeSnapshot.get(request)
  beforeSnapshot.delete(request)
  if (!p) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = ctx.response as any

  // ÉCHEC DE LA REQUÊTE — on ne journalise ni ne notifie rien. Le hook s'exécute après TOUTE
  // réponse, y compris les erreurs.
  const statut = Number(ctx.set?.status ?? 200)
  const enErreur = (Number.isFinite(statut) && (statut < 200 || statut >= 300))
    || (response && typeof response === 'object' && (response.type === 'validation' || typeof response.summary === 'string'))
  if (enErreur) return

  // Ne pas auditer les écritures mises en file (contributeur) — auditées au rejeu/approbation.
  if (response && typeof response === 'object' && response.queued) return

  let userId: string | null = null
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    userId = session?.user?.id ?? null
  }
  catch { /* action système/anonyme */ }

  // Id de l'entité : présent dans l'URL (update/delete) ou dans la réponse (création).
  let entiteId = p.entiteId
  if (p.action === 'create' && response && typeof response === 'object' && response.id) {
    entiteId = String(response.id)
  }

  // Diff : champs modifiés (si on a l'instantané avant) ; création/suppression sans détail.
  let diff: unknown = null
  if (p.action === 'update' && snapshot && ctx.body && typeof ctx.body === 'object') {
    const changes = computeChanges(snapshot, ctx.body as Record<string, unknown>)
    if (changes.length) diff = { changes }
  }

  try {
    await db.insert(auditLog).values({ entite: p.entite, entiteId, action: p.action, userId, diff } as InsertAudit)
  }
  catch { /* audit best-effort */ }

  // La clé d'événement reste `entite:action` : un abonné aux modifications d'un catalogue
  // doit être prévenu qu'elles viennent d'une fiche ou d'une action groupée.
  const eventKey = `${p.entite}:${p.action}`

  const ACTIONS: Record<string, string> = {
    create: 'Création', update: 'Modification', delete: 'Suppression', import: 'Import',
  }
  const n = p.lot ? lignesTouchees(response) : null

  // TITRE — toujours l'action, en clair.
  const titre = p.lot === 'annulation'
    ? 'Annulation'
    : p.lot
      ? `${ACTIONS[p.action] ?? capitale(p.action)} groupée`
      : (ACTIONS[p.action] ?? capitale(p.action))

  // CORPS — plusieurs lignes : le nombre suivi du type. Une seule : son nom, et pour une
  // modification les champs touchés (au-delà de trois, leur nombre : une notification qui
  // déborde n'est plus lue).
  let corps: string
  if (p.lot) {
    corps = `${n ?? '?'} ${libelleEntite(p.entite, (n ?? 0) > 1)}`
  }
  else {
    // Le nom vient de la réponse (création, modification) ou de l'instantané pris avant
    // l'opération (suppression, où la fiche n'existe plus).
    const nom = nomLisible(response) ?? nomLisible(snapshot) ?? null
    const champs = (diff as { changes?: { field: string }[] } | null)?.changes ?? []
    const details = p.action === 'update' && champs.length
      ? (champs.length <= 3
          ? ` — ${champs.map(c => libelleChamp(c.field)).map(capitale).join(', ')}`
          : ` — ${champs.length} champs modifiés`)
      : ''
    // À défaut de nom, on nomme le type au singulier — jamais l'identifiant technique,
    // qui n'apprend rien à qui lit la notification.
    corps = nom
      ? `${nom}${details}`
      : `${capitale(libelleEntite(p.entite, false))}${details}`
  }

  await notify(eventKey, {
    event: eventKey,
    kind: 'mutation',
    entite: p.entite,
    action: p.action,
    entiteId,
    lot: p.lot ?? undefined,
    lignes: n ?? undefined,
    at: new Date().toISOString(),
    title: titre,
    body: corps,
  }).catch(() => {})
}
