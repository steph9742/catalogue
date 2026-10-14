import { Elysia, t } from 'elysia'
import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { edrRegle, edrRuleset } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'

// CONTENU DES MOTEURS DE DÉTECTION — ce que l'EDR applique réellement. Ni échéance ni revue
// ici, contrairement aux listes blanches : une règle de détection n'est pas une dérogation
// qu'on ouvre pour un temps.

const MOTEURS = ['yara', 'sigma', 'ioc', 'correlation', 'driverblock'] as const
type Moteur = typeof MOTEURS[number]

const estMoteur = (v: string): v is Moteur => (MOTEURS as readonly string[]).includes(v)

// Tri par défaut, DOCUMENTÉ : nom puis identifiant. L'identifiant en second rend l'ordre STABLE
// — deux règles homonymes ne peuvent pas permuter d'une page à l'autre, ce qui ferait
// disparaître des lignes à la pagination.
const TRI = [asc(edrRegle.nom), asc(edrRegle.harfanglabId)]

export const edrReglesRouter = new Elysia({ name: 'edr-regles', prefix: '/api/edr' })
  .use(betterAuth)
  .guard({ detail: { tags: ['EDR'] } })

  /**
   * Règles d'un moteur de détection (YARA, Sigma, IOC, corrélation, driver blocklist), avec
   * leur contenu.
   */
  .get('/regles/:moteur', async ({ params, query, status }) => {
    if (!estMoteur(params.moteur)) return status(404, { message: 'Moteur inconnu.' })
    const moteur = params.moteur

    const conditions = [eq(edrRegle.moteur, moteur)]
    if (query.actif === 'true') conditions.push(eq(edrRegle.actif, true))
    if (query.actif === 'false') conditions.push(eq(edrRegle.actif, false))
    if (query.origine === 'etablissement') conditions.push(sql`coalesce(${edrRegle.fourniParEditeur}, false) = false`)
    if (query.origine === 'editeur') conditions.push(eq(edrRegle.fourniParEditeur, true))
    if (query.ruleset) conditions.push(sql`${edrRegle.rulesets}::text ilike ${'%' + query.ruleset + '%'}`)
    if (query.q) {
      const motif = `%${query.q}%`
      const rech = or(
        ilike(edrRegle.nom, motif),
        ilike(edrRegle.valeur, motif),
        ilike(edrRegle.description, motif),
        // Le contenu est cherché lui aussi : trouver « quelle règle mentionne mimikatz »
        // est exactement l'usage qui justifie d'avoir centralisé les corps de règles.
        ilike(edrRegle.contenu, motif),
      )
      if (rech) conditions.push(rech)
    }
    const where = and(...conditions)

    const limite = Math.min(500, Math.max(1, Number(query.limite) || 100))
    const depart = Math.max(0, Number(query.depart) || 0)

    // Le TOTAL est compté par la base, séparément de la page rendue. Un appelant qui
    // annonce « 42 règles » ne doit jamais avoir eu à compter les lignes reçues.
    const total = (await db.select({ total: count() }).from(edrRegle).where(where))[0]?.total ?? 0
    const resultats = await db.select().from(edrRegle).where(where).orderBy(...TRI).limit(limite).offset(depart)

    return { total, depart, limite, tri: 'nom, puis identifiant HarfangLab', resultats }
  }, {
    can: { category: 'edr-regles', level: 'read' },
    params: t.Object({ moteur: t.String() }),
    query: t.Object({
      q: t.Optional(t.String()),
      actif: t.Optional(t.String()),
      origine: t.Optional(t.String()),
      ruleset: t.Optional(t.String()),
      limite: t.Optional(t.String()),
      depart: t.Optional(t.String()),
    }),
    detail: { summary: 'Règles d\'un moteur de détection de l\'EDR, avec leur contenu.' },
  })

  /** Une règle et son enregistrement brut. */
  .get('/regles/:moteur/:id', async ({ params, status }) => {
    if (!estMoteur(params.moteur)) return status(404, { message: 'Moteur inconnu.' })
    const [row] = await db.select().from(edrRegle)
      .where(and(eq(edrRegle.moteur, params.moteur), eq(edrRegle.id, params.id))).limit(1)
    if (!row) return status(404, { message: 'Règle inconnue.' })
    return row
  }, {
    can: { category: 'edr-regles', level: 'read' },
    params: t.Object({ moteur: t.String(), id: t.String() }),
    detail: { summary: 'Détail d\'une règle de détection, enregistrement brut compris.' },
  })

  /** Compteurs par moteur — de quoi peupler cinq onglets en un appel. */
  .get('/resume', async () => {
    const parMoteur = await db.select({
      moteur: edrRegle.moteur,
      total: count(),
      actives: sql<number>`count(*) filter (where ${edrRegle.actif} is true)::int`,
      inactives: sql<number>`count(*) filter (where ${edrRegle.actif} is false)::int`,
      etablissement: sql<number>`count(*) filter (where coalesce(${edrRegle.fourniParEditeur}, false) = false)::int`,
      avecContenu: sql<number>`count(*) filter (where coalesce(trim(${edrRegle.contenu}), '') <> '')::int`,
    }).from(edrRegle).groupBy(edrRegle.moteur)

    const rulesets = (await db.select({ rulesets: count() }).from(edrRuleset))[0]?.rulesets ?? 0
    // Un jeu de règles rattaché à AUCUNE politique est du travail qui ne protège
    // personne. C'est le compteur le plus utile de cette page.
    const orphelins = (await db.select({
      orphelins: sql<number>`count(*) filter (where coalesce(jsonb_array_length(${edrRuleset.politiques}), 0) = 0)::int`,
    }).from(edrRuleset))[0]?.orphelins ?? 0

    return { parMoteur, rulesets, rulesetsSansPolitique: orphelins }
  }, { can: { category: 'edr-regles', level: 'read' }, detail: { summary: 'Compteurs de règles par moteur de détection.' } })

  /** Un jeu de règles à l'unité, par son identifiant EDR. */
  .get('/rulesets/:rulesetId', async ({ params, status }) => {
    const [row] = await db.select().from(edrRuleset)
      .where(eq(edrRuleset.rulesetId, params.rulesetId)).limit(1)
    if (!row) return status(404, { message: 'Jeu de règles inconnu.' })
    // Les règles qu'il contient, sans leur corps : la liste sert à situer, pas à lire.
    const regles = await db.select({
      id: edrRegle.id, harfanglabId: edrRegle.harfanglabId, moteur: edrRegle.moteur,
      nom: edrRegle.nom, valeur: edrRegle.valeur, actif: edrRegle.actif,
      etatEffectif: edrRegle.etatEffectif, fourniParEditeur: edrRegle.fourniParEditeur,
    })
      .from(edrRegle)
      .where(sql`${edrRegle.rulesets}::text ilike ${'%' + params.rulesetId + '%'}`)
      .orderBy(asc(edrRegle.nom))
      .limit(500)
    return {
      ...row,
      // Un jeu rattaché à aucune politique n'est appliqué sur aucun poste.
      appliqueSurUnePolitique: !!(row.politiques ?? []).length,
      regles,
      reglesRendues: regles.length,
      modification: 'HarfangLab, console de l\'éditeur. Le Catalogue tient un inventaire en lecture et n\'écrit pas dans l\'EDR.',
    }
  }, {
    can: { category: 'edr-regles', level: 'read' },
    params: t.Object({ rulesetId: t.String() }),
    detail: {
      summary: 'Un jeu de règles : composition, politiques rattachées, et règles qu\'il contient.',
      description: 'Les compteurs par état (`alert`, `block`, `quarantine`, `disabled`) décrivent la '
        + 'composition du jeu. `appliqueSurUnePolitique: false` signale un jeu rattaché à aucune '
        + 'politique, donc appliqué sur aucun poste. La liste `regles` est plafonnée à 500 entrées et '
        + 'ne comporte pas le corps des règles : utiliser `/api/edr/regles/{moteur}` pour le contenu.',
    },
  })

  /** Jeux de règles, tous moteurs. */
  .get('/rulesets', async ({ query }) => {
    const conditions = []
    if (query.moteur && estMoteur(query.moteur)) conditions.push(eq(edrRuleset.moteur, query.moteur))
    if (query.sansPolitique === 'true') {
      conditions.push(sql`coalesce(jsonb_array_length(${edrRuleset.politiques}), 0) = 0`)
    }
    const where = conditions.length ? and(...conditions) : undefined
    const total = (await db.select({ total: count() }).from(edrRuleset).where(where))[0]?.total ?? 0
    const resultats = await db.select().from(edrRuleset).where(where)
      .orderBy(asc(edrRuleset.moteur), asc(edrRuleset.nom))
    return { total, tri: 'moteur, puis nom', resultats }
  }, {
    can: { category: 'edr-regles', level: 'read' },
    query: t.Object({ moteur: t.Optional(t.String()), sansPolitique: t.Optional(t.String()) }),
    detail: { summary: 'Jeux de règles de l\'EDR et politiques auxquelles ils sont rattachés.' },
  })
