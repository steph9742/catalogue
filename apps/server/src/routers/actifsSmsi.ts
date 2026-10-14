import { Elysia, t } from 'elysia'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { actifSmsi, actifDependance } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'

// Promotion d'un actif EXISTANT (serveur, application, donnée…) dans le périmètre SMSI,
// sans ressaisie : on crée (ou retrouve) l'entrée du registre `actif_smsi` liée à la
// source par (typeSource, sourceId). Idempotent. RBAC : catégorie « actifs-smsi ».
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cols = actifSmsi as any

// Catégorie ISO 27005 déduite du type source : donnée / processus = primaire, sinon support.
const categorieDe = (typeSource: string): 'primaire' | 'support' =>
  typeSource === 'actif-informationnel' || typeSource === 'processus' ? 'primaire' : 'support'

export const actifsSmsiRouter = new Elysia({ name: 'actifs-smsi-promotion' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })

  // Actif SMSI éventuel rattaché à une source (null si hors périmètre).
  .get('/api/actifs-smsi/source/:typeSource/:sourceId', async ({ params }) => {
    const rows = await db
      .select()
      .from(actifSmsi)
      .where(and(eq(cols.typeSource, params.typeSource), eq(actifSmsi.sourceId, params.sourceId)))
      .limit(1)
    return rows[0] ?? null
  }, { can: { category: 'actifs-smsi', level: 'read' }, params: t.Object({ typeSource: t.String(), sourceId: t.String() }) })

  // Promeut la source dans le périmètre (idempotent). Renvoie l'actif SMSI.
  .post('/api/actifs-smsi/promote', async ({ body }) => {
    const existing = await db
      .select()
      .from(actifSmsi)
      .where(and(eq(cols.typeSource, body.typeSource), eq(actifSmsi.sourceId, body.sourceId)))
      .limit(1)
    if (existing[0]) return existing[0]
    const nom = (body.nom ?? '').trim() || 'Actif'
    const categorie = categorieDe(body.typeSource)
    try {
      const [row] = await db.insert(actifSmsi).values({ nom, typeSource: body.typeSource as never, categorie: categorie as never, sourceId: body.sourceId, perimetreSmsi: true }).returning()
      return row
    }
    catch {
      // Collision de nom (unique) : suffixe par le type source.
      const [row] = await db.insert(actifSmsi).values({ nom: `${nom} (${body.typeSource})`, typeSource: body.typeSource as never, categorie: categorie as never, sourceId: body.sourceId, perimetreSmsi: true }).returning()
      return row
    }
  }, { can: { category: 'actifs-smsi', level: 'write' }, body: t.Object({ typeSource: t.String(), sourceId: t.String(), nom: t.Optional(t.String()) }) })

  // Retire la source du périmètre (supprime l'entrée de registre liée).
  .delete('/api/actifs-smsi/source/:typeSource/:sourceId', async ({ params }) => {
    await db.delete(actifSmsi).where(and(eq(cols.typeSource, params.typeSource), eq(actifSmsi.sourceId, params.sourceId)))
    return { ok: true as const }
  }, { can: { category: 'actifs-smsi', level: 'write' }, params: t.Object({ typeSource: t.String(), sourceId: t.String() }) })

  // Dépendances : biens supports dont dépend cet actif (« supporté par »).
  .get('/api/actifs-smsi/:id/supports', async ({ params }) =>
    db
      .select({ id: actifDependance.id, supportId: actifSmsi.id, nom: actifSmsi.nom, categorie: actifSmsi.categorie })
      .from(actifDependance)
      .leftJoin(actifSmsi, eq(actifDependance.supportId, actifSmsi.id))
      .where(eq(actifDependance.actifId, params.id))
      .orderBy(asc(actifSmsi.nom)),
  { can: { category: 'actifs-smsi', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Dépendances inverses : actifs qui dépendent de celui-ci (« supporte »).
  .get('/api/actifs-smsi/:id/supportes', async ({ params }) =>
    db
      .select({ id: actifDependance.id, actifId: actifSmsi.id, nom: actifSmsi.nom, categorie: actifSmsi.categorie })
      .from(actifDependance)
      .leftJoin(actifSmsi, eq(actifDependance.actifId, actifSmsi.id))
      .where(eq(actifDependance.supportId, params.id))
      .orderBy(asc(actifSmsi.nom)),
  { can: { category: 'actifs-smsi', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Toutes les dépendances (arêtes du graphe) — pour la vue graphe / propagation d'impact.
  // Arêtes du graphe de dépendances : le volume croît avec le carré du nombre d'actifs.
  .get('/api/actif-dependances', async ({ query }) => {
    const base = db.select({ id: actifDependance.id, actifId: actifDependance.actifId, supportId: actifDependance.supportId }).from(actifDependance)
    if (!pagineDemandee(query)) return base
    const b = bornes(query)
    const [rows, [compte]] = await Promise.all([
      base.limit(b.limit).offset(b.offset),
      db.select({ n: sql<number>`count(*)::int` }).from(actifDependance),
    ])
    return enveloppe(rows, compte?.n ?? 0, b)
  }, { can: { category: 'actifs-smsi', level: 'read' }, query: t.Object({ ...SCHEMA_PAGINATION }) })

  // Ajoute une dépendance : cet actif est supporté par supportId (idempotent, pas de boucle).
  .post('/api/actifs-smsi/:id/supports', async ({ params, body }) => {
    if (!body.supportId || body.supportId === params.id) return { ok: false as const }
    await db
      .insert(actifDependance)
      .values({ actifId: params.id, supportId: body.supportId })
      .onConflictDoNothing()
    return { ok: true as const }
  }, {
    can: { category: 'actifs-smsi', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ supportId: t.String() }),
  })

  // Supprime une dépendance.
  .delete('/api/actif-dependance/:linkId', async ({ params }) => {
    await db.delete(actifDependance).where(eq(actifDependance.id, params.linkId))
    return { ok: true as const }
  }, { can: { category: 'actifs-smsi', level: 'write' }, params: t.Object({ linkId: t.String() }) })
