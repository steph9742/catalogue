// CONSTATS DU MOTEUR D'AUDIT — lecture de ce qu'il envoie, et cycle de vie.

export const CATEGORIES_CONSTAT = [
  'certificat', 'tls', 'entete', 'fichier_expose', 'outil_expose', 'version',
  'vulnerabilite', 'dns', 'reputation', 'integrite_script', 'compromission',
  'classement', 'decouverte', 'port',
] as const
export type CategorieConstat = typeof CATEGORIES_CONSTAT[number]
export const GRAVITES_CONSTAT = ['critique', 'elevee', 'moyenne', 'faible', 'info'] as const
export type GraviteConstat = typeof GRAVITES_CONSTAT[number]
export const STATUTS_CONSTAT = ['ouvert', 'accepte', 'corrige', 'reteste'] as const
export type StatutConstat = typeof STATUTS_CONSTAT[number]

export type ConstatRecu = {
  cleStable: string
  actif: { hote: string, port: number | null, url: string | null }
  releveLe: Date
  categorie: CategorieConstat
  gravite: GraviteConstat
  titre: string
  detail: string | null
  preuve: string | null
  reference: string | null
}

export type ActifReleve = { hote: string, port: number | null, releveLe: Date }

// Bornes de longueur : un titre de 2 Mo n'est pas un titre, c'est une charge.
const BORNES = { cle: 200, titre: 300, detail: 4000, preuve: 2000, reference: 300, url: 2000 } as const
const MOTIF_HOTE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/
// Un relevé daté de plus d'un jour dans le futur n'est pas un relevé : horloge fausse ou
// donnée fabriquée, et il bloquerait le curseur au-delà de tous les relevés à venir.
const TOLERANCE_FUTUR_MS = 24 * 60 * 60 * 1000

const texte = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

const hoteDe = (v: unknown): string | null => {
  const h = texte(v, 253)?.toLowerCase().replace(/\.$/, '') ?? null
  return h && MOTIF_HOTE.test(h) ? h : null
}

const portDe = (v: unknown): number | null | undefined => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined
}

const dateDe = (v: unknown): Date | null => {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function lireConstat(brut: unknown, maintenant = new Date()): { ok: true, constat: ConstatRecu } | { ok: false, motif: string } {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, motif: 'constat illisible (pas un objet)' }
  const o = brut as Record<string, unknown>

  const cleStable = texte(o.cle_stable, BORNES.cle)
  if (!cleStable) return { ok: false, motif: 'cle_stable absente' }

  const a = (o.actif && typeof o.actif === 'object' ? o.actif : {}) as Record<string, unknown>
  const hote = hoteDe(a.hote)
  if (!hote) return { ok: false, motif: `actif.hote invalide (${cleStable})` }
  const port = portDe(a.port)
  if (port === undefined) return { ok: false, motif: `actif.port invalide (${cleStable})` }
  const urlBrute = texte(a.url, BORNES.url)
  // Une URL qui n'est pas http(s) n'est pas gardée : elle finirait en lien cliquable.
  const url = urlBrute && /^https?:\/\//i.test(urlBrute) ? urlBrute : null

  const releveLe = dateDe(o.releve_le)
  if (!releveLe) return { ok: false, motif: `releve_le illisible (${cleStable})` }
  if (releveLe.getTime() > maintenant.getTime() + TOLERANCE_FUTUR_MS) return { ok: false, motif: `releve_le dans le futur (${cleStable})` }

  const categorie = CATEGORIES_CONSTAT.find(c => c === o.categorie)
  if (!categorie) return { ok: false, motif: `catégorie inconnue « ${String(o.categorie).slice(0, 40)} » (${cleStable})` }
  const gravite = GRAVITES_CONSTAT.find(g => g === o.gravite)
  if (!gravite) return { ok: false, motif: `gravité inconnue « ${String(o.gravite).slice(0, 40)} » (${cleStable})` }

  const titre = texte(o.titre, BORNES.titre)
  if (!titre) return { ok: false, motif: `titre absent (${cleStable})` }

  return {
    ok: true,
    constat: {
      cleStable, actif: { hote, port, url }, releveLe, categorie, gravite, titre,
      detail: texte(o.detail, BORNES.detail),
      preuve: texte(o.preuve, BORNES.preuve),
      reference: texte(o.reference, BORNES.reference),
    },
  }
}

/** L'enveloppe de `GET /resultats`. Voir l'avertissement en tête de fichier. */
export function lireResultats(corps: unknown): { constats: unknown[], actifsReleves: ActifReleve[] | null, jusquA: Date | null, pagesBrutes: unknown[] | null } {
  if (Array.isArray(corps)) return { constats: corps, actifsReleves: null, jusquA: null, pagesBrutes: null }
  if (!corps || typeof corps !== 'object') {
    throw new Error('Réponse du moteur illisible : ni liste de constats, ni objet { constats }.')
  }
  const o = corps as Record<string, unknown>
  if (!Array.isArray(o.constats)) throw new Error('Réponse du moteur sans champ « constats ».')

  const actifsReleves = Array.isArray(o.actifs)
    ? o.actifs.flatMap((x) => {
        const a = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
        const hote = hoteDe(a.hote)
        const port = portDe(a.port)
        const releveLe = dateDe(a.releve_le)
        return hote && port !== undefined && releveLe ? [{ hote, port, releveLe }] : []
      })
    : null
  // Les pages cibles relevées, lues par `lirePage` (integriteScripts.ts). Même réserve que
  // l'enveloppe : forme supposée `pages: [{ url, releve_le, csp, scripts: [{ src, sha256, integrity }] }]`.
  return { constats: o.constats, actifsReleves, jusquA: dateDe(o.jusqu_a), pagesBrutes: Array.isArray(o.pages) ? o.pages : null }
}

export type EtatConstat = {
  statut: StatutConstat
  dernierReleveLe: Date
  corrigeLe: Date | null
  retesteLe: Date | null
  /** `YYYY-MM-DD` */
  acceptationEcheance: string | null
  observations: number
}

export type Integration =
  | { action: 'ignorer' }
  | { action: 'mettre_a_jour', patch: Record<string, unknown>, reouvert: boolean }

/**
 * Ce que devient un constat CONNU quand le moteur le rend à nouveau. IDEMPOTENT : un relevé qui
 * n'est pas postérieur au dernier intégré est ignoré.
 */
export function integrer(e: EtatConstat, r: ConstatRecu, aujourdhui: string): Integration {
  if (r.releveLe.getTime() <= e.dernierReleveLe.getTime()) return { action: 'ignorer' }

  const patch: Record<string, unknown> = {
    dernierReleveLe: r.releveLe,
    observations: e.observations + 1,
    // Le moteur peut réévaluer : une gravité relevée, une preuve plus précise.
    gravite: r.gravite, titre: r.titre, detail: r.detail, preuve: r.preuve, reference: r.reference,
    actifUrl: r.actif.url,
  }
  const apres = (d: Date | null) => !d || r.releveLe.getTime() > d.getTime()
  const reouvert = (e.statut === 'corrige' && apres(e.corrigeLe))
    || (e.statut === 'reteste' && apres(e.retesteLe))
    || (e.statut === 'accepte' && !!e.acceptationEcheance && e.acceptationEcheance < aujourdhui)
  if (reouvert) {
    patch.statut = 'ouvert'
    patch.reouvertLe = r.releveLe
  }
  return { action: 'mettre_a_jour', patch, reouvert }
}

/**
 * La date à laquelle un constat CORRIGÉ se trouve confirmé — ou `null`. L'ABSENCE D'UN CONSTAT
 * DANS UNE RÉPONSE NE PROUVE RIEN À ELLE SEULE : le moteur a pu ne pas relever l'actif.
 */
export function dateDeRetest(
  c: { statut: StatutConstat, corrigeLe: Date | null, actifHote: string, actifPort: number | null, cleStable: string },
  actifs: readonly ActifReleve[] | null,
  clesVues: ReadonlySet<string>,
): Date | null {
  if (c.statut !== 'corrige' || !c.corrigeLe || !actifs || clesVues.has(c.cleStable)) return null
  const corrigeLe = c.corrigeLe.getTime()
  const passages = actifs
    .filter(a => a.hote === c.actifHote
      // Un actif relevé sans port couvre l'hôte entier.
      && (a.port === null || c.actifPort === null || a.port === c.actifPort)
      && a.releveLe.getTime() > corrigeLe)
    .sort((x, y) => y.releveLe.getTime() - x.releveLe.getTime())
  return passages[0]?.releveLe ?? null
}

export type ActionConstat = 'accepter' | 'corriger' | 'verifier' | 'rouvrir'

const TRANSITIONS: Record<ActionConstat, { depuis: readonly StatutConstat[], vers: StatutConstat }> = {
  accepter: { depuis: ['ouvert'], vers: 'accepte' },
  corriger: { depuis: ['ouvert', 'accepte'], vers: 'corrige' },
  // Vérifié à la main : l'équivalent humain du re-test du moteur.
  verifier: { depuis: ['corrige'], vers: 'reteste' },
  rouvrir: { depuis: ['accepte', 'corrige', 'reteste'], vers: 'ouvert' },
}

/** Le statut après une décision humaine, ou `null` si elle n'a pas de sens depuis ce statut. */
export function transition(statut: StatutConstat, action: ActionConstat): StatutConstat | null {
  const t = TRANSITIONS[action]
  return t.depuis.includes(statut) ? t.vers : null
}
