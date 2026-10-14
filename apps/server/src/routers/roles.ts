import { Elysia, t } from 'elysia'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { account, auditLog, user, userCategoryRole } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { CATEGORIES } from '../utils/categories'

// Permissions de l'utilisateur courant + gestion des rôles par catégorie (admin).
export const rolesRouter = new Elysia({ name: 'roles' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Administration'] } })
  // Permissions effectives de l'utilisateur connecté (pour piloter l'UI).
  .get('/api/me', async ({ user: u }) => {
    const rows = await db.select().from(userCategoryRole).where(eq(userCategoryRole.userId, u.id))
    const roles: Record<string, string> = {}
    for (const r of rows) roles[r.category] = r.role
    return { id: u.id, email: u.email, name: u.name, admin: u.role === 'admin', roles }
  }, { auth: ['user', 'admin'] })

  .get('/api/categories', () => CATEGORIES, { auth: ['user', 'admin'] })

  // Trace d'une connexion de secours (contournement du SSO). La route exige une session : elle
  // n'est donc appelable qu'APRÈS une authentification réussie, et pas par un visiteur anonyme
  // qui voudrait polluer le journal.
  .post('/api/secours/trace', async ({ user: u, request }) => {
    await db.insert(auditLog).values({
      entite: 'authentification',
      entiteId: u.id,
      action: 'update',
      userId: u.id,
      diff: {
        type: 'connexion_secours',
        email: u.email,
        agent: request.headers.get('user-agent')?.slice(0, 160) ?? null,
      },
    } as never)
    console.warn(`🔑 Connexion de SECOURS (hors SSO) : ${u.email}`)
    return { ok: true as const }
  }, { auth: ['user', 'admin'] })

  // Liste des utilisateurs + leurs rôles par catégorie (admin).
  .get('/api/roles', async () => {
    const users = await db.select({
      id: user.id, email: user.email, name: user.name, role: user.role,
      // `annuaire` par défaut : un compte jamais modifié à la main suit le groupe `admins`.
      roleOrigine: user.roleOrigine,
    }).from(user)
    const crs = await db.select().from(userCategoryRole)
    const byUser: Record<string, Record<string, string>> = {}
    for (const c of crs) {
      (byUser[c.userId] ??= {})[c.category] = c.role
    }
    return users.map(u => ({
      ...u,
      roleOrigine: u.roleOrigine ?? 'annuaire',
      categoryRoles: byUser[u.id] ?? {},
    }))
  }, { auth: ['admin'] })

  // Attribue / retire le rôle global admin d'un utilisateur (admin). Un admin ne peut pas
  // retirer son propre rôle admin (évite de se verrouiller dehors).
  .put('/api/roles/:userId/admin', async ({ params, body, user: me, status }) => {
    if (params.userId === me.id && !body.admin) {
      return status(400, 'Vous ne pouvez pas retirer votre propre rôle administrateur.')
    }
    const origine = body.origine === 'annuaire' ? 'annuaire' : 'manuel'
    await db.update(user)
      .set({ role: body.admin ? 'admin' : 'user', roleOrigine: origine, updatedAt: new Date() })
      .where(eq(user.id, params.userId))

    const [lien] = await db.select({ id: account.id }).from(account)
      .where(and(eq(account.userId, params.userId), ne(account.providerId, 'credential'))).limit(1)

    return {
      ok: true,
      origine,
      // Dans les deux sens, on DIT ce qui se passera à la prochaine connexion plutôt que
      // de laisser la découverte au hasard.
      ...(lien
        ? {
            avertissement: origine === 'manuel'
              ? 'Ce rôle est désormais posé à la main : l\'annuaire ne le modifiera plus, y compris si '
                + 'la personne quitte le groupe « admins ». À revoir périodiquement.'
              : 'Ce rôle est rendu à l\'annuaire : il sera réévalué d\'après le groupe « admins » à la '
                + 'prochaine connexion de cette personne.',
          }
        : {}),
    }
  }, {
    auth: ['admin'],
    params: t.Object({ userId: t.String() }),
    body: t.Object({
      admin: t.Boolean(),
      // Absent = `manuel` : une modification faite ici est une décision, et elle tient.
      origine: t.Optional(t.Union([t.Literal('manuel'), t.Literal('annuaire')])),
    }),
  })

  // Applique (ou retire) un rôle sur TOUTES les catégories d'un utilisateur (admin).
  .put('/api/roles/:userId/all', async ({ params, body }) => {
    await db.delete(userCategoryRole).where(eq(userCategoryRole.userId, params.userId))
    if (body.role) {
      await db.insert(userCategoryRole).values(CATEGORIES.map(c => ({ userId: params.userId, category: c.key, role: body.role! })))
    }
    return { ok: true }
  }, {
    auth: ['admin'],
    params: t.Object({ userId: t.String() }),
    body: t.Object({
      role: t.Union([t.Literal('lecteur'), t.Literal('contributeur'), t.Literal('gestionnaire'), t.Null()]),
    }),
  })

  // Attribue / retire le rôle d'un utilisateur sur une catégorie (admin).
  .put('/api/roles/:userId', async ({ params, body }) => {
    const { category, role } = body
    if (!role) {
      await db.delete(userCategoryRole)
        .where(and(eq(userCategoryRole.userId, params.userId), eq(userCategoryRole.category, category)))
      return { ok: true }
    }
    const [existing] = await db.select().from(userCategoryRole)
      .where(and(eq(userCategoryRole.userId, params.userId), eq(userCategoryRole.category, category)))
      .limit(1)
    if (existing) {
      await db.update(userCategoryRole).set({ role }).where(eq(userCategoryRole.id, existing.id))
    }
    else {
      await db.insert(userCategoryRole).values({ userId: params.userId, category, role })
    }
    return { ok: true }
  }, {
    auth: ['admin'],
    params: t.Object({ userId: t.String() }),
    body: t.Object({
      category: t.String(),
      role: t.Union([
        t.Literal('lecteur'),
        t.Literal('contributeur'),
        t.Literal('gestionnaire'),
        t.Null(),
      ]),
    }),
  })
