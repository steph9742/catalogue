import { Elysia, t } from 'elysia'
import { eq, desc } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { changeRequest, user } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { managedCategories } from '../utils/access'
import { INTERNAL_TOKEN, getApp } from '../utils/internal'
import { SCHEMA_PAGINATION, paginerEnMemoire } from '../utils/pagination'

// File de validation : consultation + approbation (rejeu) / rejet par un
// gestionnaire de la catégorie (ou un admin).
export const changeRequestsRouter = new Elysia({ name: 'change-requests' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Administration'] } })

  // Mes propres demandes (tout statut) — pour que le contributeur suive ses contributions.
  .get('/api/change-requests/mine', async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as { id: string }
    return db
      .select({
        id: changeRequest.id,
        category: changeRequest.category,
        action: changeRequest.action,
        entityId: changeRequest.entityId,
        payload: changeRequest.payload,
        status: changeRequest.status,
        createdAt: changeRequest.createdAt,
      })
      .from(changeRequest)
      .where(eq(changeRequest.requestedBy, me.id))
      .orderBy(desc(changeRequest.createdAt))
      .limit(50)
  }, { auth: ['user', 'admin'] })

  .get('/api/change-requests', async (ctx) => {
    const query = ctx.query as { page?: string, pageSize?: string }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as { id: string, role?: string | null }
    const managed = await managedCategories(me)
    // Une portée vide rend une LISTE VIDE, pas une enveloppe vide, quand la pagination
    // n'est pas demandée : la forme historique est conservée dans les deux branches.
    if (managed.size === 0) return paginerEnMemoire(query, [])
    const rows = await db
      .select({
        id: changeRequest.id,
        category: changeRequest.category,
        action: changeRequest.action,
        entityId: changeRequest.entityId,
        payload: changeRequest.payload,
        status: changeRequest.status,
        createdAt: changeRequest.createdAt,
        requesterEmail: user.email,
      })
      .from(changeRequest)
      .leftJoin(user, eq(changeRequest.requestedBy, user.id))
      .where(eq(changeRequest.status, 'pending'))
      .orderBy(desc(changeRequest.createdAt))
    // PAGINATION EN MÉMOIRE, et non en SQL. Le filtre par catégorie gérée s'applique APRÈS la
    // requête : un `limit`/`offset` en base porterait sur les lignes AVANT filtrage, et
    // rendrait des pages de tailles arbitraires — parfois vides — avec un total faux.
    return paginerEnMemoire(query, rows.filter(r => managed.has(r.category)))
  }, {
    auth: ['user', 'admin'],
    query: t.Object({ ...SCHEMA_PAGINATION }),
    detail: {
      description: '`page`/`pageSize` rendent `{ rows, total, page, pageSize }` ; sans eux, le tableau '
        + 'complet. Le total est celui des demandes VISIBLES par l\'appelant, après filtrage par sa portée.',
    },
  })

  .post('/api/change-requests/:id/approve', async (ctx) => {
    const { params, status } = ctx
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as { id: string, role?: string | null }
    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, params.id)).limit(1)
    if (!cr || cr.status !== 'pending') return status(404, 'Demande introuvable')
    const managed = await managedCategories(me)
    if (!managed.has(cr.category)) return status(403, 'Catégorie non gérée')

    const app = getApp()
    if (!app) return status(500, 'Application indisponible')
    const base = `http://localhost:${process.env.PORT ?? 4000}`
    const req = new Request(base + cr.path, {
      method: cr.method,
      headers: { 'content-type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
      body: cr.method === 'DELETE' ? undefined : JSON.stringify(cr.payload ?? {}),
    })
    const res = await app.handle(req)
    if (!res.ok) {
      const msg = await res.text().catch(() => '')
      return status(422, `Échec de l'application : ${msg || res.status}`)
    }

    await db.update(changeRequest)
      .set({ status: 'approved', reviewedBy: me.id, reviewedAt: new Date() })
      .where(eq(changeRequest.id, cr.id))
    return { ok: true }
  }, { auth: ['user', 'admin'], params: t.Object({ id: t.String() }) })

  .post('/api/change-requests/:id/reject', async (ctx) => {
    const { params, body, status } = ctx
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as { id: string, role?: string | null }
    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, params.id)).limit(1)
    if (!cr || cr.status !== 'pending') return status(404, 'Demande introuvable')
    const managed = await managedCategories(me)
    if (!managed.has(cr.category)) return status(403, 'Catégorie non gérée')

    await db.update(changeRequest)
      .set({ status: 'rejected', reviewedBy: me.id, reviewedAt: new Date(), comment: body.comment ?? null })
      .where(eq(changeRequest.id, cr.id))
    return { ok: true }
  }, { auth: ['user', 'admin'], params: t.Object({ id: t.String() }), body: t.Object({ comment: t.Optional(t.String()) }) })
