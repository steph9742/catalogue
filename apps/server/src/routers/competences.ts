import { Elysia, t } from 'elysia'
import { eq, asc, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { personneCompetence, competence, personne } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'

// Matrice des compétences (ISO 27001 clause 7.2) : personne × compétence × niveau.
// RBAC : catégorie « competences ».
export const competencesRouter = new Elysia({ name: 'competences' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })

  // Matrice complète (pour la vue d'ensemble). PAGINATION.
  .get('/api/matrice-competences', async ({ query }) => {
    const base = db
      .select({
        id: personneCompetence.id,
        personneId: personne.id,
        nom: personne.nom,
        prenom: personne.prenom,
        competenceId: competence.id,
        competence: competence.nom,
        domaine: competence.domaine,
        niveauRequis: competence.niveauRequis,
        niveau: personneCompetence.niveau,
        dateEvaluation: personneCompetence.dateEvaluation,
      })
      .from(personneCompetence)
      .leftJoin(personne, eq(personneCompetence.personneId, personne.id))
      .leftJoin(competence, eq(personneCompetence.competenceId, competence.id))
      .orderBy(asc(personne.nom), asc(competence.nom))

    if (!pagineDemandee(query)) return base

    const b = bornes(query)
    const [rows, [compte]] = await Promise.all([
      base.limit(b.limit).offset(b.offset),
      db.select({ n: sql<number>`count(*)::int` }).from(personneCompetence),
    ])
    return enveloppe(rows, compte?.n ?? 0, b)
  }, {
    can: { category: 'competences', level: 'read' },
    query: t.Object({ ...SCHEMA_PAGINATION }),
    detail: {
      summary: 'Matrice des compétences : personne × compétence × niveau.',
      description: 'Une compétence que PERSONNE ne détient n\'apparaît pas ici — cette route part des '
        + 'personnes. Pour savoir ce qui manque, utiliser /api/competences/resume, qui part du référentiel. '
        + '`page`/`pageSize` (l\'un des deux suffit) rendent `{ rows, total, page, pageSize }`.',
    },
  })

  // Compétences d'une personne.
  .get('/api/personnes/:id/competences', async ({ params }) =>
    db
      .select({ id: personneCompetence.id, competenceId: competence.id, nom: competence.nom, domaine: competence.domaine, niveau: personneCompetence.niveau, dateEvaluation: personneCompetence.dateEvaluation })
      .from(personneCompetence)
      .leftJoin(competence, eq(personneCompetence.competenceId, competence.id))
      .where(eq(personneCompetence.personneId, params.id))
      .orderBy(asc(competence.nom)),
  { can: { category: 'competences', level: 'read' }, params: t.Object({ id: t.String() }) })

  // Attribue / met à jour une compétence pour une personne.
  .post('/api/personnes/:id/competences', async ({ params, body }) => {
    if (!body.competenceId) return { ok: false as const }
    await db
      .insert(personneCompetence)
      .values({ personneId: params.id, competenceId: body.competenceId, niveau: (body.niveau as never) ?? null, dateEvaluation: body.dateEvaluation || null })
      .onConflictDoUpdate({
        target: [personneCompetence.personneId, personneCompetence.competenceId],
        set: { niveau: (body.niveau as never) ?? null, dateEvaluation: body.dateEvaluation || null },
      })
    return { ok: true as const }
  }, {
    can: { category: 'competences', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ competenceId: t.String(), niveau: t.Optional(t.String()), dateEvaluation: t.Optional(t.String()) }),
  })

  .delete('/api/personne-competence/:linkId', async ({ params }) => {
    await db.delete(personneCompetence).where(eq(personneCompetence.id, params.linkId))
    return { ok: true as const }
  }, { can: { category: 'competences', level: 'write' }, params: t.Object({ linkId: t.String() }) })
