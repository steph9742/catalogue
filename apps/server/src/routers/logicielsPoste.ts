import { Elysia, t } from 'elysia'
import { eq, desc } from 'drizzle-orm'
import { createInsertSchema } from 'drizzle-typebox'
import { db } from '@catalogue/database'
import { logicielPoste, logicielPostePopulation } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { makeImport } from './importHelper'
import { beforeSnapshot } from '../utils/audit'

const logicielImport = makeImport(logicielPoste, 'nom')

// Catalogue des applications autorisées sur les postes de travail.
// Les populations autorisées sont gérées en ligne via `populationIds`.
const insertLogiciel = createInsertSchema(logicielPoste)
const baseBody = t.Omit(insertLogiciel, ['id', 'createdAt', 'updatedAt'])
const createBody = t.Composite([
  baseBody,
  t.Object({ populationIds: t.Optional(t.Array(t.String())) }),
])
const patchBody = t.Composite([
  t.Partial(baseBody),
  t.Object({ populationIds: t.Optional(t.Array(t.String())) }),
])

type InsertLogiciel = typeof logicielPoste.$inferInsert

async function populationIdsOf(logicielId: string) {
  const rows = await db
    .select({ populationId: logicielPostePopulation.populationId })
    .from(logicielPostePopulation)
    .where(eq(logicielPostePopulation.logicielPosteId, logicielId))
  return rows.map(r => r.populationId)
}

async function setPopulations(logicielId: string, ids: string[]) {
  await db
    .delete(logicielPostePopulation)
    .where(eq(logicielPostePopulation.logicielPosteId, logicielId))
  if (ids.length) {
    await db
      .insert(logicielPostePopulation)
      .values(ids.map(pid => ({ logicielPosteId: logicielId, populationId: pid })))
  }
}

export const logicielsPosteRouter = new Elysia({
  name: 'logiciels-poste',
  prefix: '/api/postes',
})
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })
  .post('/import', logicielImport.handler, {
    can: { category: 'postes', level: 'write' },
    body: logicielImport.bodySchema,
  })
  .get(
    '/',
    () => db.select().from(logicielPoste).orderBy(desc(logicielPoste.createdAt)),
    { can: { category: 'postes', level: 'read' } },
  )
  .get(
    '/:id',
    async ({ params, status }) => {
      const [row] = await db
        .select()
        .from(logicielPoste)
        .where(eq(logicielPoste.id, params.id))
        .limit(1)
      if (!row) return status(404, 'Logiciel introuvable')
      return { ...row, populationIds: await populationIdsOf(row.id) }
    },
    { can: { category: 'postes', level: 'read' }, params: t.Object({ id: t.String() }) },
  )
  .post(
    '/',
    async ({ body }) => {
      const { populationIds, ...data } = body
      const [row] = await db
        .insert(logicielPoste)
        .values(data as InsertLogiciel)
        .returning()
      await setPopulations(row!.id, populationIds ?? [])
      return { ...row!, populationIds: populationIds ?? [] }
    },
    { can: { category: 'postes', level: 'write' }, body: createBody },
  )
  .patch(
    '/:id',
    async ({ params, body, status, request }) => {
      const { populationIds, ...data } = body
      const [before] = await db.select().from(logicielPoste).where(eq(logicielPoste.id, params.id)).limit(1)
      if (before) beforeSnapshot.set(request, before)
      const [row] = await db
        .update(logicielPoste)
        .set(data as Partial<InsertLogiciel>)
        .where(eq(logicielPoste.id, params.id))
        .returning()
      if (!row) return status(404, 'Logiciel introuvable')
      if (populationIds) await setPopulations(row.id, populationIds)
      return { ...row, populationIds: await populationIdsOf(row.id) }
    },
    {
      can: { category: 'postes', level: 'write' },
      params: t.Object({ id: t.String() }),
      body: patchBody,
    },
  )
  .delete(
    '/:id',
    async ({ params }) => {
      await db.delete(logicielPoste).where(eq(logicielPoste.id, params.id))
      return { ok: true }
    },
    { can: { category: 'postes', level: 'write' }, params: t.Object({ id: t.String() }) },
  )
