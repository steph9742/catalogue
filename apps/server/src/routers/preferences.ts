import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { preferenceUtilisateur } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'

// Préférences de navigation de l'utilisateur COURANT. Chacun ne lit et n'écrit que les
// siennes : l'identité vient de la session, jamais du corps de la requête.

const VIDE = { epingles: [] as string[], ordreSections: [] as string[], vuesCatalogues: {} as Record<string, unknown> }

export const preferencesRouter = new Elysia({ name: 'preferences' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Administration'] } })

  .get('/api/preferences', async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (ctx as any).user as { id: string } | undefined
    if (!user?.id) return VIDE
    const [row] = await db.select().from(preferenceUtilisateur).where(eq(preferenceUtilisateur.userId, user.id)).limit(1)
    return { epingles: row?.epingles ?? [], ordreSections: row?.ordreSections ?? [], vuesCatalogues: row?.vuesCatalogues ?? {} }
  }, { auth: ['user', 'admin'] })

  .put('/api/preferences', async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (ctx as any).user as { id: string } | undefined
    if (!user?.id) return VIDE
    const body = ctx.body

    const [existant] = await db.select().from(preferenceUtilisateur).where(eq(preferenceUtilisateur.userId, user.id)).limit(1)
    // Mise à jour PARTIELLE : n'écrase que ce qui est fourni (on peut changer les épingles
    // sans renvoyer l'ordre des sections, et inversement).
    const valeurs = {
      ...(body.vuesCatalogues !== undefined ? { vuesCatalogues: body.vuesCatalogues } : {}),
      epingles: body.epingles ?? existant?.epingles ?? [],
      ordreSections: body.ordreSections ?? existant?.ordreSections ?? [],
      updatedAt: new Date(),
    }

    if (existant) {
      await db.update(preferenceUtilisateur).set(valeurs).where(eq(preferenceUtilisateur.userId, user.id))
    }
    else {
      await db.insert(preferenceUtilisateur).values({ userId: user.id, ...valeurs })
    }
    return { epingles: valeurs.epingles, ordreSections: valeurs.ordreSections, vuesCatalogues: valeurs.vuesCatalogues ?? null }
  }, {
    auth: ['user', 'admin'],
    body: t.Object({
      epingles: t.Optional(t.Array(t.String())),
      ordreSections: t.Optional(t.Array(t.String())),
      // Réglages d'affichage par catalogue (mode + colonnes visibles).
      vuesCatalogues: t.Optional(t.Record(t.String(), t.Object({
        mode: t.Optional(t.String()),
        colonnes: t.Optional(t.Array(t.String())),
      }))),
    }),
  })
