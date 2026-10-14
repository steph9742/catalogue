import { Elysia, t } from 'elysia'
import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { pushSubscription } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { managedCategories, eventCategory, accesDe } from '../utils/access'

// Abonnements Web Push : clé VAPID publique + (dé)souscription du navigateur.
export const pushRouter = new Elysia({ name: 'push', prefix: '/api/push' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Administration'] } })
  .get('/vapid', () => ({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    enabled: Boolean(process.env.VAPID_PUBLIC_KEY),
  }), { auth: ['user', 'admin', 'svc'] })
  // Envoi d'une notification de vérification à SES PROPRES abonnements. Sans cela, une
  // notification qui n'arrive pas est indiagnosticable pour l'utilisateur : il ne peut pas
  // savoir si le serveur n'a rien envoyé, si le service de push a refusé, ou si son système ne
  // l'affiche pas.
  .post('/test', async ({ user }) => {
    const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, user.id))
    if (!subs.length) {
      return { ok: false as const, envoyes: 0, message: "Aucun abonnement pour ce compte : activez les notifications sur ce navigateur d'abord." }
    }
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { ok: false as const, envoyes: 0, message: 'Notifications non configurées côté serveur (clés VAPID absentes).' }
    }

    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@localhost', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

    let envoyes = 0
    const echecs: string[] = []
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            event: 'test',
            title: 'Catalogue — test',
            body: 'Si vous lisez ceci, les notifications fonctionnent.',
          }),
        )
        envoyes++
      }
      catch (e) {
        const err = e as { statusCode?: number, body?: string, message?: string }
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.delete(pushSubscription).where(eq(pushSubscription.id, s.id))
          echecs.push('abonnement expiré (purgé) — réactivez les notifications')
        }
        else echecs.push(`${err.statusCode ?? '?'} ${(err.body ?? err.message ?? '').slice(0, 120)}`)
      }
    }

    return {
      ok: envoyes > 0,
      envoyes,
      message: envoyes
        ? `Envoyé à ${envoyes} navigateur(s). Si rien n'apparaît, l'envoi a été accepté mais votre système n'affiche pas la notification — vérifiez les autorisations du navigateur.`
        : `Échec de l'envoi : ${echecs.join(' ; ')}`,
    }
  }, { auth: ['user', 'admin'] })

  .get('/subscription', async ({ query }) => {
    if (!query.endpoint) return null
    const [row] = await db.select().from(pushSubscription)
      .where(eq(pushSubscription.endpoint, query.endpoint)).limit(1)
    return row ?? null
  }, { auth: ['user', 'admin'], query: t.Object({ endpoint: t.Optional(t.String()) }) })
  .post('/subscribe', async (ctx) => {
    const body = ctx.body
    // Utilisateur OU compte de service : voir `accesDe`.
    const user = accesDe(ctx)
    const isAdmin = user?.role === 'admin'
    const managed = await managedCategories(user)
    // Réservé aux gestionnaires (≥ 1 catégorie gérée) et aux admins.
    if (!isAdmin && managed.size === 0) return ctx.status(403, 'Réservé aux gestionnaires.')
    // On ne garde que les événements des catégories gérées (admin : tout).
    const events = (body.events ?? []).filter(e => isAdmin || managed.has(eventCategory(e) ?? ''))
    const values = {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      events,
      userId: user?.id ?? null,
    }
    const existing = await db.select().from(pushSubscription)
      .where(eq(pushSubscription.endpoint, body.endpoint)).limit(1)
    if (existing.length) {
      await db.update(pushSubscription).set(values).where(eq(pushSubscription.endpoint, body.endpoint))
    }
    else {
      await db.insert(pushSubscription).values(values)
    }
    return { ok: true }
  }, {
    auth: ['user', 'admin'],
    body: t.Object({
      endpoint: t.String(),
      keys: t.Object({ p256dh: t.String(), auth: t.String() }),
      events: t.Optional(t.Array(t.String())),
    }),
  })
  .post('/unsubscribe', async ({ body }) => {
    await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, body.endpoint))
    return { ok: true }
  }, { auth: ['user', 'admin'], body: t.Object({ endpoint: t.String() }) })
