import { Elysia, t } from 'elysia'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { entiteResponsable, personne } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'

// Gouvernance d'une entité : président, vice-présidents, cabinet, DGS, DGA.
// RBAC rattaché à la catégorie « entites ».
export const entiteResponsablesRouter = new Elysia({ name: 'entite-responsables' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })

  // Tous les membres de gouvernance (pour l'organigramme), enrichis. Volume borné en pratique —
  // quelques responsables par entité — mais un tableau nu ne se compte pas, et un appelant à
  // qui l'on interdit de compter les lignes reçues ne peut rien en dire.
  .get('/api/entite-responsables', async ({ query }) => {
    const base = db.select({
      id: entiteResponsable.id, entiteId: entiteResponsable.entiteId, role: entiteResponsable.role, ordre: entiteResponsable.ordre,
      personneId: personne.id, nom: personne.nom, prenom: personne.prenom, fonction: personne.fonction,
    })
      .from(entiteResponsable)
      .leftJoin(personne, eq(entiteResponsable.personneId, personne.id))
      .orderBy(asc(entiteResponsable.role), asc(entiteResponsable.ordre))

    if (!pagineDemandee(query)) return base
    const b = bornes(query)
    const [rows, [compte]] = await Promise.all([
      base.limit(b.limit).offset(b.offset),
      db.select({ n: sql<number>`count(*)::int` }).from(entiteResponsable),
    ])
    return enveloppe(rows, compte?.n ?? 0, b)
  }, { can: { category: 'entites', level: 'read' }, query: t.Object({ ...SCHEMA_PAGINATION }) })

  // Membres d'une entité.
  .get('/api/entites/:id/responsables', async ({ params }) =>
    db.select({
      id: entiteResponsable.id, role: entiteResponsable.role, ordre: entiteResponsable.ordre,
      personneId: personne.id, nom: personne.nom, prenom: personne.prenom,
    })
      .from(entiteResponsable)
      .leftJoin(personne, eq(entiteResponsable.personneId, personne.id))
      .where(eq(entiteResponsable.entiteId, params.id))
      .orderBy(asc(entiteResponsable.role), asc(entiteResponsable.ordre)),
  { can: { category: 'entites', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Ajout d'un membre (idempotent sur (entite, personne, role)).
  .post('/api/entites/:id/responsables', async ({ params, body, status }) => {
    const ROLES = ['president', 'vice_president', 'chef_cabinet', 'secretaire_cabinet', 'dgs', 'dga'] as const
    if (!(ROLES as readonly string[]).includes(body.role)) return status(400, 'Rôle invalide')
    await db.insert(entiteResponsable)
      .values({ entiteId: params.id, personneId: body.personneId, role: body.role as (typeof ROLES)[number], ordre: body.ordre ?? null })
      .onConflictDoNothing()
    return { ok: true as const }
  }, {
    can: { category: 'entites', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ personneId: t.String(), role: t.String(), ordre: t.Optional(t.Number()) }),
  })

  // Suppression d'un membre.
  .delete('/api/entite-responsables/:refId', async ({ params }) => {
    await db.delete(entiteResponsable).where(eq(entiteResponsable.id, params.refId))
    return { ok: true as const }
  }, { can: { category: 'entites', level: 'write' }, params: t.Object({ refId: t.String() }) })
