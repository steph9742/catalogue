import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { entiteNis2 } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'

// Statut de l'entité NIS 2 — SINGLETON. Une seule ligne d'identifiant fixe : on ne
// crée jamais de doublon, on met à jour la ligne existante (upsert par PK constante).
const SINGLETON_ID = 'entite-nis2-singleton'
const category = 'exigences-nis2' as const // même droit que le reste du module NIS 2

async function getOrInit() {
  const [row] = await db.select().from(entiteNis2).where(eq(entiteNis2.id, SINGLETON_ID)).limit(1)
  if (row) return row
  const [created] = await db.insert(entiteNis2).values({ id: SINGLETON_ID }).onConflictDoNothing().returning()
  if (created) return created
  // Course concurrente : la ligne vient d'être créée ailleurs, on la relit.
  const [again] = await db.select().from(entiteNis2).where(eq(entiteNis2.id, SINGLETON_ID)).limit(1)
  return again
}

export const entiteNis2Router = new Elysia({ name: 'entite-nis2' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Conformité'] } })

  .get('/api/entite-nis2', () => getOrInit(),
    { can: { category, level: 'read' } })

  .put('/api/entite-nis2', async ({ body }) => {
    // Cohérence : « autre » secteur → on garde la précision, sinon on la vide.
    const secteurAutre = body.secteur === 'autre' ? (body.secteurAutre?.trim() || null) : null
    const valeurs = {
      id: SINGLETON_ID,
      statut: body.statut,
      secteur: body.secteur ?? null,
      secteurAutre,
      enregistreAnssi: body.enregistreAnssi ?? false,
      identifiantAnssi: body.identifiantAnssi?.trim() || null,
      dateEnregistrement: body.dateEnregistrement || null,
      referentId: body.referentId || null,
      justificationStatut: body.justificationStatut?.trim() || null,
      notes: body.notes?.trim() || null,
    }
    const [row] = await db
      .insert(entiteNis2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(valeurs as any)
      .onConflictDoUpdate({
        target: entiteNis2.id,
        set: {
          statut: body.statut as never,
          secteur: (body.secteur ?? null) as never,
          secteurAutre,
          enregistreAnssi: body.enregistreAnssi ?? false,
          identifiantAnssi: body.identifiantAnssi?.trim() || null,
          dateEnregistrement: body.dateEnregistrement || null,
          referentId: body.referentId || null,
          justificationStatut: body.justificationStatut?.trim() || null,
          notes: body.notes?.trim() || null,
          updatedAt: new Date(),
        },
      })
      .returning()
    return row
  }, {
    can: { category, level: 'write' },
    body: t.Object({
      statut: t.Union([t.Literal('essentielle'), t.Literal('importante'), t.Literal('non_assujettie'), t.Literal('a_determiner')]),
      secteur: t.Optional(t.Union([t.Null(), t.String()])),
      secteurAutre: t.Optional(t.Union([t.Null(), t.String()])),
      enregistreAnssi: t.Optional(t.Boolean()),
      identifiantAnssi: t.Optional(t.Union([t.Null(), t.String()])),
      dateEnregistrement: t.Optional(t.Union([t.Null(), t.String()])),
      referentId: t.Optional(t.Union([t.Null(), t.String()])),
      justificationStatut: t.Optional(t.Union([t.Null(), t.String()])),
      notes: t.Optional(t.Union([t.Null(), t.String()])),
    }),
  })
