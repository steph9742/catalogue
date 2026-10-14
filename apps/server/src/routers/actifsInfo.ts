import { Elysia, t } from 'elysia'
import { eq, asc } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { actifInformationApplication, application } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'

// Pont RGPD : applications qui traitent un actif informationnel (N-N). Le registre RGPD =
// applications avec donneesPersonnelles ; on remonte le flag pour l'afficher.
export const actifsInfoRouter = new Elysia({ name: 'actifs-info' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })

  .get('/api/actifs-informationnels/:id/applications', async ({ params }) =>
    db
      .select({ id: actifInformationApplication.id, applicationId: application.id, nom: application.nom, donneesPersonnelles: application.donneesPersonnelles })
      .from(actifInformationApplication)
      .leftJoin(application, eq(actifInformationApplication.applicationId, application.id))
      .where(eq(actifInformationApplication.actifInformationnelId, params.id))
      .orderBy(asc(application.nom)),
  { can: { category: 'actifs-informationnels', level: 'read' }, params: t.Object({ id: t.String() }) })

  .post('/api/actifs-informationnels/:id/applications', async ({ params, body }) => {
    if (!body.applicationId) return { ok: false as const }
    await db
      .insert(actifInformationApplication)
      .values({ actifInformationnelId: params.id, applicationId: body.applicationId })
      .onConflictDoNothing()
    return { ok: true as const }
  }, {
    can: { category: 'actifs-informationnels', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ applicationId: t.String() }),
  })

  .delete('/api/actif-information-application/:linkId', async ({ params }) => {
    await db.delete(actifInformationApplication).where(eq(actifInformationApplication.id, params.linkId))
    return { ok: true as const }
  }, { can: { category: 'actifs-informationnels', level: 'write' }, params: t.Object({ linkId: t.String() }) })
