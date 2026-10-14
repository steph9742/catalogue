import { Elysia, t } from 'elysia'
import { eq, asc } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { risqueActif, actifSmsi, risqueMesure, mesureSmsi } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'

// Relation N-N risque ⇄ actif SMSI : un risque peut concerner plusieurs actifs
// (au-delà de l'actif principal `risqueSmsi.actifSmsiId`). RBAC : catégorie « risques-smsi ».
export const risquesRouter = new Elysia({ name: 'risques' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })

  // Actifs concernés par un risque (avec la vulnérabilité exploitée sur chacun).
  .get('/api/risques-smsi/:id/actifs', async ({ params }) =>
    db
      .select({ id: risqueActif.id, actifSmsiId: actifSmsi.id, nom: actifSmsi.nom, categorie: actifSmsi.categorie, vulnerabilite: risqueActif.vulnerabilite })
      .from(risqueActif)
      .leftJoin(actifSmsi, eq(risqueActif.actifSmsiId, actifSmsi.id))
      .where(eq(risqueActif.risqueSmsiId, params.id))
      .orderBy(asc(actifSmsi.nom)),
  { can: { category: 'risques-smsi', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Rattache un actif au risque (idempotent), avec vulnérabilité optionnelle.
  .post('/api/risques-smsi/:id/actifs', async ({ params, body }) => {
    if (!body.actifSmsiId) return { ok: false as const }
    await db
      .insert(risqueActif)
      .values({ risqueSmsiId: params.id, actifSmsiId: body.actifSmsiId, vulnerabilite: body.vulnerabilite || null })
      .onConflictDoNothing()
    return { ok: true as const }
  }, {
    can: { category: 'risques-smsi', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ actifSmsiId: t.String(), vulnerabilite: t.Optional(t.String()) }),
  })

  // Met à jour la vulnérabilité d'un actif concerné.
  .patch('/api/risque-actif/:linkId', async ({ params, body }) => {
    await db.update(risqueActif).set({ vulnerabilite: body.vulnerabilite || null }).where(eq(risqueActif.id, params.linkId))
    return { ok: true as const }
  }, { can: { category: 'risques-smsi', level: 'write' }, params: t.Object({ linkId: t.String() }), body: t.Object({ vulnerabilite: t.Optional(t.String()) }) })

  // Détache un actif du risque.
  .delete('/api/risque-actif/:linkId', async ({ params }) => {
    await db.delete(risqueActif).where(eq(risqueActif.id, params.linkId))
    return { ok: true as const }
  }, { can: { category: 'risques-smsi', level: 'write' }, params: t.Object({ linkId: t.String() }) })

  // Plan de traitement : mesures de l'Annexe A traitant le risque (couverture).
  .get('/api/risques-smsi/:id/mesures', async ({ params }) =>
    db
      .select({ id: risqueMesure.id, mesureSmsiId: mesureSmsi.id, reference: mesureSmsi.reference, intitule: mesureSmsi.intitule })
      .from(risqueMesure)
      .leftJoin(mesureSmsi, eq(risqueMesure.mesureSmsiId, mesureSmsi.id))
      .where(eq(risqueMesure.risqueSmsiId, params.id))
      .orderBy(asc(mesureSmsi.reference)),
  { can: { category: 'risques-smsi', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Rattache une mesure au risque (idempotent).
  .post('/api/risques-smsi/:id/mesures', async ({ params, body }) => {
    if (!body.mesureSmsiId) return { ok: false as const }
    await db
      .insert(risqueMesure)
      .values({ risqueSmsiId: params.id, mesureSmsiId: body.mesureSmsiId })
      .onConflictDoNothing()
    return { ok: true as const }
  }, {
    can: { category: 'risques-smsi', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ mesureSmsiId: t.String() }),
  })

  // Détache une mesure du risque.
  .delete('/api/risque-mesure/:linkId', async ({ params }) => {
    await db.delete(risqueMesure).where(eq(risqueMesure.id, params.linkId))
    return { ok: true as const }
  }, { can: { category: 'risques-smsi', level: 'write' }, params: t.Object({ linkId: t.String() }) })
