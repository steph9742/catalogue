import { Elysia, t } from 'elysia'
import { and, asc, desc, eq, getTableColumns, inArray, or, sql, type Column, type SQL } from 'drizzle-orm'
import { type PgTable } from 'drizzle-orm/pg-core'
import { createInsertSchema } from 'drizzle-typebox'
import { db } from '@catalogue/database'
import { pieceJointe } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { makeImport } from './importHelper'
import type { ReferenceResolver } from './importRefs'
import { beforeSnapshot } from '../utils/audit'
import { lotRoutes } from './lot'
import { CATEGORIES } from '../utils/categories'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'
import { resumeGenerique } from '../utils/resumeGenerique'

// Fabrique de routeur CRUD générique pour un catalogue. - validation d'entrée: dérivée de la
// table (drizzle-typebox), donc toujours à jour - lecture: ouverte à user/admin/svc ; écriture:
// réservée à user/admin (RBAC de base) Le typage générique de Drizzle ne se propage pas à
// travers un wrapper : on…
export function crudRouter<T extends PgTable, const P extends string>(config: {
  name: string
  prefix: P
  table: T
  naturalKey?: string
  category?: string
  references?: ReferenceResolver[]
  // Enrichissement des LECTURES (liste et fiche) par des champs calculés — par exemple le
  // statut de fin de support d'une machine.
  decorate?: (rows: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>
  /**
   * FILTRE SUR UN CHAMP CALCULÉ, quand ce champ est exprimable en SQL. `critereDe` ne connaît
   * que les colonnes de la table : un champ calculé lui est invisible, et un filtre portant
   * dessus serait silencieusement ignoré — le catalogue entier reviendrait avec un total exact,
   * réponse plausible et fausse…
   */
  filtreCalcule?: {
    param: string
    valeurs: readonly string[]
    where: (valeur: string) => SQL
  }
  /**
   * OPT-OUT du résumé générique, quand une route DÉDIÉE occupe déjà `<prefix>/resume`.
   */
  sansResumeGenerique?: boolean
  /**
   * OPT-OUT de l'import générique, quand la clé fonctionnelle est COMPOSITE.
   */
  sansImportGenerique?: boolean
}) {
  const { name, prefix, table, naturalKey, decorate, filtreCalcule, sansResumeGenerique, sansImportGenerique } = config

  // Critères de la LISTE. Le greffon d'actions groupées applique la MÊME logique de son
  // côté : « tous les résultats du filtre » porte exactement sur ce qui est affiché filtré.
  const critereDe = (query: Record<string, unknown>) => {
    const cols = getTableColumns(table) as Record<string, Column>
    // Le paramètre du filtre calculé est RÉSERVÉ : sans cela, il serait cherché parmi les
    // colonnes, introuvable, et écarté en silence.
    const reserved = new Set(['page', 'pageSize', 'q', 'sort', 'dir',
      ...(filtreCalcule ? [filtreCalcule.param] : [])])
    const conds = []

    const term = String(query.q ?? '').trim()
    if (term) {
      const textCols = Object.values(cols).filter(c => c.dataType === 'string')
      const like = `%${term}%`
      // Cast en texte pour couvrir aussi les colonnes enum (ILIKE direct impossible).
      const ors = textCols.map(c => sql`cast(${c} as text) ilike ${like}`)
      if (ors.length) conds.push(or(...ors))
    }

    for (const [k, raw] of Object.entries(query)) {
      if (reserved.has(k) || raw == null || !cols[k]) continue
      const col = cols[k]!
      const values = String(raw).split(',').map((v) => {
        if (col.dataType === 'boolean') return v === 'true' || v === '1'
        if (col.dataType === 'number') return Number(v)
        return v
      })
      conds.push(inArray(col, values as never[]))
    }
    return conds.length ? and(...conds) : undefined
  }
  const category = config.category ?? name
  const read = { can: { category, level: 'read' as const } }
  const write = { can: { category, level: 'write' as const } }

  // Libellé humain du catalogue, pour que la documentation d'API se lise. Sans lui, les
  // 611 opérations s'affichaient sans titre ni groupe : illisible, donc inutilisée.
  const libelle = CATEGORIES.find(c => c.key === category)?.label ?? name
  const doc = (summary: string, description?: string) => ({
    detail: { tags: ['Catalogues'], summary: `${libelle} — ${summary}`, ...(description ? { description } : {}) },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any
  const insert = createInsertSchema(table)
  const body = t.Omit(insert as never, ['id', 'createdAt', 'updatedAt'])
  const idCol = (table as never as { id: never }).id
  const imp = makeImport(table, naturalKey ?? 'nom', config.references)

  return new Elysia({ name, prefix })
    .use(betterAuth)
    .use(sansImportGenerique
      // Pas montée du tout : une route montée qui refuserait masquerait une éventuelle route
      // dédiée sur le même chemin, comme le résumé générique l'a fait pour
      // `/api/competences/resume`.
      ? new Elysia({ name: `${name}-sans-import` })
      : new Elysia({ name: `${name}-import` }).use(betterAuth).post('/import', imp.handler, {
      ...write,
      body: imp.bodySchema,
      detail: {
        tags: ['Import'],
        summary: `${libelle} — importer un fichier`,
        description: 'Rapprochement par clé naturelle. `dryRun: true` (défaut) annonce ce qui serait écrit sans rien écrire.',
      },
    }))
    // RÉSUMÉ PAR AXE DE FILTRE, dérivé des colonnes de la table. Monté AVANT '/:id', sinon «
    // resume » serait capté par le paramètre dynamique et le serveur chercherait une fiche dont
    // l'identifiant serait « resume ».
    .use(sansResumeGenerique
      // PAS MONTÉE DU TOUT, et non montée avec un refus. Une route montée qui rendrait 404
      // gagnerait sur la route dédiée exactement comme le résumé générique la masquait : on
      // remplacerait une réponse fausse par une réponse absente, ce qui est pire.
      ? new Elysia({ name: `${name}-sans-resume` })
      : new Elysia({ name: `${name}-resume` }).use(betterAuth).get('/resume', () => resumeGenerique(table), {
      ...read,
      detail: {
        summary: `${libelle} — décomptes par axe de filtre.`,
        description: 'Dérivé des COLONNES de la table : chaque énumération donne une partition '
          + '(vocabulaire fermé, la somme fait `total`), chaque clé étrangère vers un référentiel connu '
          + 'donne une ventilation (axe dynamique, `sansRattachement` complète la somme). `axes` énumère '
          + 'ce que cette table porte — un axe absent de la liste signifie que la table ne le porte PAS, '
          + 'ce qui n\'est pas la même chose qu\'un axe sans valeur. Ajouter une colonne fait apparaître '
          + 'son compteur sans intervention.',
      },
    }))

    // Liste. Pagination + recherche + filtres OPT-IN pour tenir les gros catalogues (serveurs,
    // postes… jusqu'à ~9000 machines) sans tout charger en mémoire : ?page & ?pageSize →
    // renvoie { rows, total, page, pageSize } au lieu du tableau ?q=<texte> → ILIKE sur toutes
    // les colonnes texte/enum…
    .get('/', async ({ query, status }) => {
      // La valeur est REFUSÉE si elle n'est pas du vocabulaire, jamais ignorée.
      const demande = filtreCalcule ? (query as Record<string, string>)[filtreCalcule.param] : undefined
      if (filtreCalcule && demande !== undefined && !filtreCalcule.valeurs.includes(demande)) {
        return status(422, `${filtreCalcule.param} inconnu : « ${demande} ». `
          + `Valeurs : ${filtreCalcule.valeurs.join(', ')}.`)
      }
      const calcule = filtreCalcule && demande !== undefined ? filtreCalcule.where(demande) : undefined
      const base = critereDe(query)
      const where = calcule ? and(base, calcule) : base
      const cols = getTableColumns(table) as Record<string, Column>
      const orderCol = (query.sort && cols[query.sort]) || cols[naturalKey ?? 'id'] || idCol
      const orderBy = query.dir === 'desc' ? desc(orderCol) : asc(orderCol)

      if (!pagineDemandee(query)) {
        const rows = await anyDb.select().from(table).where(where).orderBy(orderBy)
        return decorate ? decorate(rows) : rows
      }

      // Les bornes et la forme de l'enveloppe viennent de `utils/pagination` : ce fichier en
      // gardait sa propre copie, et c'est cette duplication qui a laissé onze routes écrites à
      // la main diverger sans que rien ne le signale.
      const b = bornes(query)
      const [rows, [{ n }]] = await Promise.all([
        anyDb.select().from(table).where(where).orderBy(orderBy).limit(b.limit).offset(b.offset),
        // Le total est compté par la base, sur le MÊME `where` que la page.
        anyDb.select({ n: sql<number>`count(*)::int` }).from(table).where(where),
      ])
      return enveloppe(decorate ? await decorate(rows) : rows, Number(n), b)
    }, {
      ...read,
      ...doc('lister', 'Sans `page`/`pageSize`, renvoie le tableau complet. Avec, renvoie `{ rows, total, page, pageSize }`.'),
      query: t.Object({
        ...SCHEMA_PAGINATION,
        ...(filtreCalcule ? { [filtreCalcule.param]: t.Optional(t.String()) } : {}),
        q: t.Optional(t.String()),
        sort: t.Optional(t.String()),
        dir: t.Optional(t.String()),
      }, { additionalProperties: true }),
    })
    // Actions groupées (modification/suppression en masse, annulation) — greffon partagé avec
    // les routeurs dédiés.
    .use(lotRoutes({ name, prefix, table, category }))
    .get(
      '/:id',
      async ({ params, status }) => {
        const rows = await anyDb
          .select()
          .from(table)
          .where(eq(idCol, params.id))
          .limit(1)
        if (!rows[0]) return status(404)
        return decorate ? (await decorate(rows))[0] : rows[0]
      },
      { ...read, ...doc('consulter une fiche'), params: t.Object({ id: t.String() }) },
    )
    .post(
      '/',
      async ({ body: input }) => {
        const rows = await anyDb.insert(table).values(input).returning()
        return rows[0]
      },
      { ...write, ...doc('créer'), body },
    )
    .patch(
      '/:id',
      async ({ params, body: input, status, request }) => {
        const [before] = await anyDb.select().from(table).where(eq(idCol, params.id))
        if (before) beforeSnapshot.set(request, before)
        const rows = await anyDb
          .update(table)
          .set(input)
          .where(eq(idCol, params.id))
          .returning()
        return rows[0] ?? status(404)
      },
      {
        ...write,
        ...doc('modifier', "Un rôle `contributeur` ne modifie pas directement : la requête devient une demande de validation (réponse `202`)."),
        params: t.Object({ id: t.String() }),
        body: t.Partial(body as never),
      },
    )
    .delete(
      '/:id',
      async ({ params, request }) => {
        // Photo AVANT suppression : sans elle, la notification et le journal ne pourraient
        // annoncer qu'un identifiant — « suppression de a3f9b2c1 » ne dit rien à personne.
        const [before] = await anyDb.select().from(table).where(eq(idCol, params.id))
        if (before) beforeSnapshot.set(request, before)
        await anyDb.delete(table).where(eq(idCol, params.id))
        // Les pièces jointes sont rattachées de façon POLYMORPHE (typeSource+sourceId), donc
        // sans clé étrangère : aucun ON DELETE CASCADE ne peut jouer.
        await db
          .delete(pieceJointe)
          .where(and(eq(pieceJointe.typeSource, category), eq(pieceJointe.sourceId, params.id)))
        return { ok: true }
      },
      { ...write, ...doc('supprimer', 'Les pièces jointes rattachées sont supprimées également.'), params: t.Object({ id: t.String() }) },
    )
}
