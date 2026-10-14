import { Elysia, t } from 'elysia'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { pieceJointe, user } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { readableCategories, managedCategories } from '../utils/access'

// Pièces jointes (preuves SMSI / NIS 2). Le stockage est polymorphe : `typeSource` est la clé
// du catalogue et `sourceId` l'entité concernée.

export const TAILLE_MAX = 20 * 1024 * 1024 // 20 Mo, aligné sur client_max_body_size (nginx)

type Me = { id: string, role?: string | null }

// Métadonnées seules : ne JAMAIS ramener `contenu` dans une liste (des Mo par ligne).
const meta = {
  id: pieceJointe.id,
  typeSource: pieceJointe.typeSource,
  sourceId: pieceJointe.sourceId,
  nom: pieceJointe.nom,
  mimeType: pieceJointe.mimeType,
  taille: pieceJointe.taille,
  description: pieceJointe.description,
  createdAt: pieceJointe.createdAt,
  deposePar: user.email,
}

export const piecesJointesRouter = new Elysia({ name: 'pieces-jointes', prefix: '/api/pieces-jointes' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Catalogues'] } })

  // Liste des pièces jointes d'une entité (métadonnées uniquement).
  .get('/source/:typeSource/:sourceId', async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as Me
    const { typeSource, sourceId } = ctx.params
    if (me.role !== 'admin' && !(await readableCategories(me)).has(typeSource)) {
      return ctx.status(403, 'Catégorie non accessible')
    }
    return db
      .select(meta)
      .from(pieceJointe)
      .leftJoin(user, eq(user.id, pieceJointe.uploadedBy))
      .where(and(eq(pieceJointe.typeSource, typeSource), eq(pieceJointe.sourceId, sourceId)))
      .orderBy(desc(pieceJointe.createdAt))
  }, {
    auth: ['user', 'admin'],
    params: t.Object({ typeSource: t.String(), sourceId: t.String() }),
  })

  // Dépôt d'un fichier (multipart). Écriture ⇒ il faut gérer la catégorie source.
  .post('/source/:typeSource/:sourceId', async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as Me
    const { typeSource, sourceId } = ctx.params
    if (me.role !== 'admin' && !(await managedCategories(me)).has(typeSource)) {
      return ctx.status(403, 'Droit insuffisant sur cette catégorie')
    }

    const fichier = ctx.body.fichier
    if (fichier.size > TAILLE_MAX) {
      return ctx.status(413, `Fichier trop volumineux (max ${Math.round(TAILLE_MAX / 1024 / 1024)} Mo)`)
    }
    if (fichier.size === 0) return ctx.status(422, 'Fichier vide')

    const contenu = Buffer.from(await fichier.arrayBuffer())
    const [row] = await db
      .insert(pieceJointe)
      .values({
        typeSource,
        sourceId,
        nom: fichier.name || 'fichier',
        mimeType: fichier.type || null,
        taille: contenu.byteLength,
        contenu,
        description: ctx.body.description?.trim() || null,
        uploadedBy: me.id,
      })
      .returning({ id: pieceJointe.id, nom: pieceJointe.nom, taille: pieceJointe.taille })
    return row
  }, {
    auth: ['user', 'admin'],
    params: t.Object({ typeSource: t.String(), sourceId: t.String() }),
    body: t.Object({ fichier: t.File(), description: t.Optional(t.String()) }),
  })

  // Téléchargement. `attachment` force l'enregistrement plutôt que l'affichage inline :
  // un fichier déposé par un tiers ne doit pas s'exécuter dans l'origine de l'app.
  .get('/:id/contenu', async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as Me
    const [row] = await db.select().from(pieceJointe).where(eq(pieceJointe.id, ctx.params.id)).limit(1)
    if (!row) return ctx.status(404, 'Pièce jointe introuvable')
    if (me.role !== 'admin' && !(await readableCategories(me)).has(row.typeSource)) {
      return ctx.status(403, 'Catégorie non accessible')
    }
    return new Response(new Uint8Array(row.contenu), {
      headers: {
        'Content-Type': row.mimeType || 'application/octet-stream',
        'Content-Length': String(row.taille),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.nom)}`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }, { auth: ['user', 'admin'], params: t.Object({ id: t.String() }) })

  .delete('/:id', async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (ctx as any).user as Me
    const [row] = await db
      .select({ typeSource: pieceJointe.typeSource })
      .from(pieceJointe)
      .where(eq(pieceJointe.id, ctx.params.id))
      .limit(1)
    if (!row) return ctx.status(404, 'Pièce jointe introuvable')
    if (me.role !== 'admin' && !(await managedCategories(me)).has(row.typeSource)) {
      return ctx.status(403, 'Droit insuffisant sur cette catégorie')
    }
    await db.delete(pieceJointe).where(eq(pieceJointe.id, ctx.params.id))
    return { ok: true as const }
  }, { auth: ['user', 'admin'], params: t.Object({ id: t.String() }) })
