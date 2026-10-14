import { Elysia, t } from 'elysia'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { auditLog, user } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { readableCategories } from '../utils/access'
import { SCHEMA_PAGINATION, bornes, enveloppe } from '../utils/pagination'

const enriched = {
  id: auditLog.id,
  entite: auditLog.entite,
  entiteId: auditLog.entiteId,
  action: auditLog.action,
  diff: auditLog.diff,
  createdAt: auditLog.createdAt,
  userEmail: user.email,
  userName: user.name,
}

// Journal d'audit : global (admin) + chronologie par entité (lisible si accès à la catégorie).
export const auditRouter = new Elysia({ name: 'audit', prefix: '/api/audit' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Administration'] } })
  // LE PLAFOND MUET, corrigé. Cette route rendait 200 lignes sans le dire et sans total.
  .get('/', async ({ query }) => {
    const base = db
      .select(enriched)
      .from(auditLog)
      .leftJoin(user, eq(auditLog.userId, user.id))
      .orderBy(desc(auditLog.createdAt))

    const b = bornes(query)
    const [rows, [compte]] = await Promise.all([
      base.limit(b.limit).offset(b.offset),
      db.select({ n: sql<number>`count(*)::int` }).from(auditLog),
    ])
    // L'enveloppe est rendue MÊME sans paramètre : ici il n'y a pas de forme historique à
    // préserver — le tableau nu était déjà tronqué, donc déjà faux.
    return enveloppe(rows, compte?.n ?? 0, b)
  }, { auth: ['admin'], query: t.Object({ ...SCHEMA_PAGINATION }) })

  // Chronologie des modifications d'une entité précise (pour la fiche détail).
  .get('/:entite/:entiteId', async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as { id: string, role?: string | null }
    const { entite, entiteId } = ctx.params
    const readable = await readableCategories(me)
    if (!readable.has(entite)) return ctx.status(403, 'Catégorie non accessible')
    return db
      .select(enriched)
      .from(auditLog)
      .leftJoin(user, eq(auditLog.userId, user.id))
      .where(and(eq(auditLog.entite, entite), eq(auditLog.entiteId, entiteId)))
      .orderBy(desc(auditLog.createdAt))
      .limit(50)
  }, { auth: ['user', 'admin'], params: t.Object({ entite: t.String(), entiteId: t.String() }) })
